import { NextRequest, NextResponse } from "next/server";
import { Database } from "@/utils/supabase/types";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    console.log("Processing leave-room request");
    
    // Parse the request body
    let playerId: string;
    let userId: string;
    let forceDelete = false;
    
    try {
      const body = await request.json();
      playerId = body.playerId;
      userId = body.userId;
      forceDelete = !!body.forceDelete;
      
      console.log(`Leave room request for playerId: ${playerId}, userId: ${userId}, forceDelete: ${forceDelete}`);
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return NextResponse.json({ 
        success: false, 
        error: "Invalid request body" 
      }, { status: 400 });
    }
    
    if (!playerId || !userId) {
      console.log("Invalid leave request: Missing playerId or userId");
      return NextResponse.json({ 
        success: false, 
        error: "Missing playerId or userId" 
      }, { status: 400 });
    }
    
    // Create Supabase admin client
    let supabase;
    try {
      supabase = createAdminClient();
    } catch (clientError) {
      console.error("Failed to create Supabase client:", clientError);
      return NextResponse.json({
        success: false,
        error: 'Server configuration error: ' + (clientError instanceof Error ? clientError.message : String(clientError))
      }, { status: 500 });
    }
    
    // Get player details (to check if host and get room ID)
    console.log(`Getting player details for player ${playerId}`);
    const { data: player, error: playerError } = await supabase
      .from("game_players")
      .select("*, game_rooms!inner(*)")
      .eq("id", playerId)
      .eq("user_id", userId)
      .maybeSingle();
    
    if (playerError) {
      console.error("Error fetching player details:", playerError);
      // Silently succeed if player record can't be found - might be already removed
      console.log("Player record not found or already removed");
      return NextResponse.json({ 
        success: true,
        message: "Player already removed" 
      });
    }
    
    if (!player) {
      console.log("Player record not found");
      return NextResponse.json({ 
        success: true,
        message: "Player not found or already removed" 
      });
    }
    
    const roomId = player.room_id;
    console.log(`Player ${playerId} is in room ${roomId}`);
    
    // If player is host, try to transfer host status to another player
    if (player.is_host === true && !forceDelete) {
      console.log("Current player is host, attempting to transfer host status");
      
      // Find another online player in the room
      console.log("Finding another online player to transfer host status...");
      const { data: otherPlayers, error: otherPlayersError } = await supabase
        .from("game_players")
        .select("*")
        .eq("room_id", roomId)
        .eq("is_online", true)
        .neq("id", playerId)
        .order("joined_at", { ascending: true })
        .limit(1);
      
      if (otherPlayersError) {
        console.error("Error finding other players:", otherPlayersError);
      }
      
      // If found another player, transfer host status
      if (otherPlayers && otherPlayers.length > 0) {
        const newHostPlayer = otherPlayers[0];
        console.log(`Transferring host to player ${newHostPlayer.id}`);
        
        try {
          // Update the new host player
          const { error: updateHostError } = await supabase
            .from("game_players")
            .update({ is_host: true })
            .eq("id", newHostPlayer.id);
            
          if (updateHostError) {
            console.error("Error updating new host status:", updateHostError);
          } else {
            console.log(`Successfully updated player ${newHostPlayer.id} as new host`);
            
            // Update the room host_id
            const { error: updateRoomError } = await supabase
              .from("game_rooms")
              .update({ host_id: newHostPlayer.user_id })
              .eq("id", roomId);
              
            if (updateRoomError) {
              console.error("Error updating room host_id:", updateRoomError);
            } else {
              console.log(`Successfully updated room ${roomId} with new host ${newHostPlayer.user_id}`);
            }
          }
        } catch (transferError) {
          console.error("Error during host transfer:", transferError);
        }
      } else {
        console.log("No other online players found to transfer host status");
      }
    }
    
    // Update the player to offline or delete completely
    if (forceDelete) {
      console.log(`Force deleting player ${playerId}`);
      const { error: deleteError } = await supabase
        .from("game_players")
        .delete()
        .eq("id", playerId);
        
      if (deleteError) {
        console.error("Player delete error:", deleteError);
        return NextResponse.json({ 
          success: false, 
          error: "Failed to delete player" 
        }, { status: 500 });
      }
      
      console.log(`Successfully deleted player ${playerId}`);
    } else {
      // For unintentional disconnects, just mark the player as offline
      // This keeps their place in the game in case they reconnect
      console.log(`Marking player ${playerId} as offline`);
      const { error: updateError } = await supabase
        .from("game_players")
        .update({ 
          is_online: false,
          last_seen: new Date().toISOString() 
        })
        .eq("id", playerId);
        
      if (updateError) {
        console.error("Player update error:", updateError);
        return NextResponse.json({ 
          success: false, 
          error: "Failed to update player status" 
        }, { status: 500 });
      }
      
      console.log(`Successfully marked player ${playerId} as offline`);
    }
    
    // Check if the room is now empty and should be cleaned up
    try {
      console.log(`Checking if room ${roomId} is now empty...`);
      // Count online players in the room
      const { count, error: countError } = await supabase
        .from("game_players")
        .select("*", {
          count: "exact",
          head: true
        })
        .eq("room_id", roomId)
        .eq("is_online", true);
        
      if (countError) {
        console.error("Error counting online players:", countError);
      } else {
        console.log(`Room ${roomId} has ${count} online players remaining`);
        
        if (count === 0) {
          console.log(`Room ${roomId} is now empty, marking for cleanup`);
          // Just mark the room as completed instead of deleting it right away
          const { error: updateRoomError } = await supabase
            .from("game_rooms")
            .update({
              status: "completed",
              completed_at: new Date().toISOString()
            })
            .eq("id", roomId);
            
          if (updateRoomError) {
            console.error("Error marking room as completed:", updateRoomError);
          } else {
            console.log(`Successfully marked room ${roomId} as completed`);
          }
        }
      }
    } catch (cleanupError) {
      console.error("Error checking if room is empty:", cleanupError);
      // Don't fail the request just because cleanup check failed
    }
    
    console.log(`Successfully processed leave request for player ${playerId}`);
    return NextResponse.json({ success: true });
    
  } catch (error: unknown) {
    console.error("Error in leave-room API:", error);
    // Return success anyway - this is a "best effort" cleanup
    return NextResponse.json({ 
      success: true,
      warning: "Error processing request, but client proceeded with logout",
      errorDetails: error instanceof Error ? error.message : String(error)
    });
  }
} 
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "@/utils/supabase/types";

export async function POST(req: NextRequest) {
  try {
    // Parse request data
    const { roomId, currentHostId, newHostId } = await req.json();
    
    // Validate inputs
    if (!roomId) {
      return NextResponse.json({
        success: false,
        message: "Room ID is required"
      }, { status: 400 });
    }
    
    if (!currentHostId) {
      return NextResponse.json({
        success: false,
        message: "Current host ID is required"
      }, { status: 400 });
    }
    
    if (!newHostId) {
      return NextResponse.json({
        success: false,
        message: "New host ID is required"
      }, { status: 400 });
    }
    
    console.log(`Processing host transfer from ${currentHostId} to ${newHostId} in room ${roomId}`);
    
    // Create Supabase client with admin privileges
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? '';
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    
    // 1. Verify the room exists
    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .select("host_id")
      .eq("id", roomId)
      .single();
      
    if (roomError) {
      console.error("Room error:", roomError);
      return NextResponse.json({
        success: false,
        message: "Room not found"
      }, { status: 404 });
    }
    
    // 2. Verify the current user is actually the host
    // First check room.host_id (this is faster)
    if (room.host_id !== currentHostId) {
      // Double check with player record in case room.host_id is out of sync
      const { data: hostCheck, error: hostCheckError } = await supabase
        .from("game_players")
        .select("is_host")
        .eq("user_id", currentHostId)
        .eq("room_id", roomId)
        .eq("is_host", true)
        .maybeSingle();
        
      if (hostCheckError || !hostCheck) {
        console.error("Host verification error:", hostCheckError);
        return NextResponse.json({
          success: false,
          message: "Only the current host can transfer host status"
        }, { status: 403 });
      }
    }
    
    // 3. Verify the new host exists in the room
    const { data: newHostPlayer, error: newHostCheckError } = await supabase
      .from("game_players")
      .select("id, user_id")
      .eq("id", newHostId)
      .eq("room_id", roomId)
      .eq("is_online", true)
      .single();
      
    if (newHostCheckError || !newHostPlayer) {
      console.error("New host check error:", newHostCheckError);
      return NextResponse.json({
        success: false,
        message: "The selected player is not in this room or not online"
      }, { status: 400 });
    }
    
    // 4. Start transactions to change host status
    // First, find the current host player
    const { data: currentHostPlayer, error: currentHostPlayerError } = await supabase
      .from("game_players")
      .select("id")
      .eq("user_id", currentHostId)
      .eq("room_id", roomId)
      .eq("is_host", true)
      .single();
      
    if (currentHostPlayerError) {
      console.error("Error finding current host player:", currentHostPlayerError);
      return NextResponse.json({
        success: false,
        message: "Failed to find current host player record"
      }, { status: 500 });
    }
    
    // 4.1 Remove host status from the current host
    const { error: removeHostError } = await supabase
      .from("game_players")
      .update({
        is_host: false
      })
      .eq("id", currentHostPlayer.id);
      
    if (removeHostError) {
      console.error("Remove host error:", removeHostError);
      return NextResponse.json({
        success: false,
        message: "Failed to remove host status from current host"
      }, { status: 500 });
    }
    
    // 4.2 Assign host status to the new host
    const { error: assignHostError } = await supabase
      .from("game_players")
      .update({
        is_host: true
      })
      .eq("id", newHostId);
      
    if (assignHostError) {
      console.error("Assign host error:", assignHostError);
      // If this fails, try to revert the current host's status
      try {
        await supabase
          .from("game_players")
          .update({
            is_host: true
          })
          .eq("id", currentHostPlayer.id);
      } catch (revertError) {
        console.error("Failed to revert host status:", revertError);
      }
      
      return NextResponse.json({
        success: false,
        message: "Failed to assign host status to new host"
      }, { status: 500 });
    }
    
    // 4.3 Update the host_id in the room table for consistency
    const { error: updateRoomError } = await supabase
      .from("game_rooms")
      .update({
        host_id: newHostPlayer.user_id,
        updated_at: new Date().toISOString()
      })
      .eq("id", roomId);
      
    if (updateRoomError) {
      console.error("Update room error:", updateRoomError);
      // Instead of failing the whole operation, log the error but continue
      // since the player's is_host flag is the primary indicator
      console.warn("Failed to update room host_id, but host transfer completed successfully in game_players table");
      
      // Return success anyway since the critical part (player host status) was updated
      return NextResponse.json({
        success: true,
        message: "Host status transferred successfully (room table not updated)",
        warning: "Room host_id could not be updated, but player host status was changed",
        newHostId: newHostId,
        newHostUserId: newHostPlayer.user_id
      });
    }
    
    console.log(`Successfully transferred host from ${currentHostId} to ${newHostPlayer.user_id} in room ${roomId}`);
    
    return NextResponse.json({
      success: true,
      message: "Host status transferred successfully",
      newHostId: newHostId,
      newHostUserId: newHostPlayer.user_id
    });
    
  } catch (error: unknown) {
    console.error("Error in transfer-host:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    return NextResponse.json({
      success: false,
      message: "Error transferring host",
      error: errorMessage
    }, { status: 500 });
  }
} 
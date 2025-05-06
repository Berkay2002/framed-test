import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "@/utils/supabase/types";

export async function POST(req: NextRequest) {
  try {
    const { roomId, hostId } = await req.json();
    
    if (!roomId) {
      return NextResponse.json({
        success: false,
        message: "Missing required field: roomId"
      }, { status: 400 });
    }
    
    console.log(`Processing room deletion for room ${roomId}`);
    
    // Create Supabase client with admin privileges
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? '';
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    
    // Check if room exists and get host
    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .select("host_id, status")
      .eq("id", roomId)
      .single();
      
    if (roomError) {
      console.log("Room not found or already deleted");
      return NextResponse.json({
        success: true,
        message: "Room already deleted"
      });
    }
    
    // Verify host if provided
    if (hostId && room.host_id !== hostId) {
      console.log("Host has changed, not deleting room");
      return NextResponse.json({
        success: false,
        message: "Host has changed, deletion cancelled"
      }, { status: 403 });
    }
    
    // Check if room is empty
    const { count, error: countError } = await supabase
      .from("game_players")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("room_id", roomId)
      .eq("is_online", true);
      
    if (countError) {
      console.error("Error counting players:", countError);
      return NextResponse.json({
        success: false,
        message: "Error checking if room is empty",
        error: countError.message
      }, { status: 500 });
    }
    
    if (count && count > 0) {
      console.log(`Room ${roomId} is not empty (${count} players), cancelling deletion`);
      return NextResponse.json({
        success: false,
        message: "Room is not empty, deletion cancelled"
      });
    }
    
    console.log(`Deleting empty room ${roomId}`);
    
    // Find all rounds for this room
    const { data: rounds, error: roundsError } = await supabase
      .from("game_rounds")
      .select("id")
      .eq("room_id", roomId);
      
    if (roundsError) {
      console.error("Error fetching rounds for deletion:", roundsError);
    }
    
    const roundIds = rounds?.map((r) => r.id) || [];
    console.log(`Found ${roundIds.length} rounds to clean up`);
    
    // Delete all captions for each round
    if (roundIds.length > 0) {
      for (const roundId of roundIds) {
        try {
          const { error: captionsError } = await supabase
            .from("player_captions")
            .delete()
            .eq("round_id", roundId);
            
          if (captionsError) {
            console.error(`Error deleting captions for round ${roundId}:`, captionsError);
          }
        } catch (err) {
          console.error(`Error in caption deletion for round ${roundId}:`, err);
        }
      }
    }
    
    // Delete all votes
    try {
      const { error: votesError } = await supabase
        .from("player_votes")
        .delete()
        .eq("room_id", roomId);
        
      if (votesError) {
        console.error("Error deleting votes:", votesError);
      } else {
        console.log("Successfully deleted votes");
      }
    } catch (err) {
      console.error("Error in votes deletion:", err);
    }
    
    // Delete all players
    try {
      const { error: playersError } = await supabase
        .from("game_players")
        .delete()
        .eq("room_id", roomId);
        
      if (playersError) {
        console.error("Error deleting players:", playersError);
      } else {
        console.log("Successfully deleted players");
      }
    } catch (err) {
      console.error("Error in player deletion:", err);
    }
    
    // Delete all rounds
    try {
      const { error: roundsDeleteError } = await supabase
        .from("game_rounds")
        .delete()
        .eq("room_id", roomId);
        
      if (roundsDeleteError) {
        console.error("Error deleting rounds:", roundsDeleteError);
      } else {
        console.log("Successfully deleted rounds");
      }
    } catch (err) {
      console.error("Error in rounds deletion:", err);
    }
    
    // Finally delete the room itself
    try {
      const { error: roomDeleteError } = await supabase
        .from("game_rooms")
        .delete()
        .eq("id", roomId);
        
      if (roomDeleteError) {
        console.error("Error deleting room:", roomDeleteError);
        
        // If we can't delete, mark as completed
        try {
          await supabase
            .from("game_rooms")
            .update({
              status: "completed"
            })
            .eq("id", roomId);
            
          return NextResponse.json({
            success: true,
            message: "Room marked as completed (deletion failed)"
          });
        } catch (updateError) {
          console.error("Failed to mark room as completed:", updateError);
          return NextResponse.json({
            success: false,
            message: "Failed to delete or mark room as completed"
          }, { status: 500 });
        }
      } else {
        console.log(`Successfully deleted room ${roomId}`);
        return NextResponse.json({
          success: true,
          message: "Room successfully deleted"
        });
      }
    } catch (err) {
      console.error("Error in room deletion:", err);
      return NextResponse.json({
        success: false,
        message: "Error deleting room",
        error: err instanceof Error ? err.message : "Unknown error"
      }, { status: 500 });
    }
  } catch (error: unknown) {
    console.error("Error processing room deletion:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    
    return NextResponse.json({
      success: false,
      message: "Error processing room deletion",
      error: errorMessage
    }, { status: 500 });
  }
} 
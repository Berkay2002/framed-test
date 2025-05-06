import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "@/utils/supabase/types";

// Function to delete room and all associated data
async function cleanupRoom(supabase: SupabaseClient<Database>, roomId: string) {
  try {
    // Delete related data first (cascade doesn't work for all relations)
    await supabase.from("game_rounds").delete().eq("room_id", roomId);
    await supabase.from("player_votes").delete().eq("room_id", roomId);
    await supabase.from("player_captions").delete().eq("room_id", roomId);
    await supabase.from("game_players").delete().eq("room_id", roomId);
    
    // Then delete the room
    await supabase.from("game_rooms").delete().eq("id", roomId);
    console.log(`Successfully deleted room ${roomId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting room ${roomId}:`, error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Create a Supabase client with the project URL and service_role key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? '';
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    
    // Parse request to get cleaning options
    let olderThanHours = 24; // Default: clean rooms older than 24 hours
    let includeEmptyRooms = true; // Default: also clean empty rooms regardless of age
    
    try {
      const body = await req.json();
      if (body.olderThanHours !== undefined) {
        olderThanHours = parseInt(body.olderThanHours);
      }
      if (body.includeEmptyRooms !== undefined) {
        includeEmptyRooms = body.includeEmptyRooms;
      }
    } catch (e) {
      // If unable to parse body, just use defaults
      console.log("Using default cleanup parameters");
    }
    
    // Track statistics for the response
    const stats = {
      staleRoomsRemoved: 0,
      emptyRoomsRemoved: 0,
      errors: 0
    };
    
    // PART 1: Clean up stale rooms (older than the specified hours)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);
    const cutoffISOString = cutoffTime.toISOString();
    
    // Get stale room IDs
    const { data: staleRooms, error: queryError } = await supabase
      .from("game_rooms")
      .select("id")
      .lt("created_at", cutoffISOString);
      
    if (queryError) {
      console.error("Error finding stale rooms:", queryError);
    } else if (staleRooms && staleRooms.length > 0) {
      console.log(`Found ${staleRooms.length} stale rooms to clean up`);
      
      // Process each stale room
      for (const room of staleRooms) {
        const success = await cleanupRoom(supabase, room.id);
        if (success) {
          stats.staleRoomsRemoved++;
        } else {
          stats.errors++;
        }
      }
    }
    
    // PART 2: Clean up empty rooms if requested
    if (includeEmptyRooms) {
      // First get all non-stale, active rooms
      const { data: activeRooms, error: activeRoomsError } = await supabase
        .from("game_rooms")
        .select("id")
        .gte("created_at", cutoffISOString)
        .eq("status", "lobby");
        
      if (activeRoomsError) {
        console.error("Error finding active rooms:", activeRoomsError);
      } else if (activeRooms && activeRooms.length > 0) {
        console.log(`Checking ${activeRooms.length} active rooms for empty ones`);
        
        // Check each room for players
        for (const room of activeRooms) {
          const { count, error: countError } = await supabase
            .from("game_players")
            .select("*", {
              count: "exact",
              head: true
            })
            .eq("room_id", room.id);
            
          if (countError) {
            console.error(`Error counting players for room ${room.id}:`, countError);
            continue;
          }
          
          // If room has no players, clean it up
          if (count === 0) {
            console.log(`Room ${room.id} is empty, cleaning up`);
            const success = await cleanupRoom(supabase, room.id);
            if (success) {
              stats.emptyRoomsRemoved++;
            } else {
              stats.errors++;
            }
          }
        }
      }
    }
    
    // Return success with statistics
    return NextResponse.json({
      success: true,
      message: "Room cleanup completed",
      stats
    });
    
  } catch (error: unknown) {
    // Return error response
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred"
    }, { status: 500 });
  }
} 
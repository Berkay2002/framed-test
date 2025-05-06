import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { Database } from "@/utils/supabase/types";

// Interval in hours to consider a room inactive
const INACTIVE_HOURS = 1;

// Max number of rooms to process in a single run to avoid timeouts
const MAX_ROOMS_TO_PROCESS = 50;

export async function GET(request: NextRequest) {
  try {
    console.log("Processing room heartbeat check");
    
    // Get optional parameters from request
    const searchParams = request.nextUrl.searchParams;
    const hoursParam = searchParams.get('hours');
    const maxRoomsParam = searchParams.get('maxRooms');
    
    // Override defaults with query parameters if provided
    const inactiveHours = hoursParam ? parseInt(hoursParam, 10) : INACTIVE_HOURS;
    const maxRooms = maxRoomsParam ? parseInt(maxRoomsParam, 10) : MAX_ROOMS_TO_PROCESS;
    
    // Create Supabase admin client
    const supabase = createAdminClient();
    
    // Calculate cutoff time for inactive rooms
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - inactiveHours);
    const cutoffISOString = cutoffTime.toISOString();
    
    console.log(`Looking for rooms inactive since ${cutoffISOString} (${inactiveHours} hours ago)`);
    
    // Find rooms that haven't had a heartbeat in the specified time period
    // Or rooms with null last_heartbeat (never had a heartbeat)
    const { data: inactiveRooms, error: roomsError } = await supabase
      .from("game_rooms")
      .select("id, code, status, last_heartbeat")
      .or(`last_heartbeat.lt.${cutoffISOString},last_heartbeat.is.null`)
      .or(`status.eq.lobby,status.eq.in_progress`) // Only check active rooms
      .limit(maxRooms); // Limit to avoid timeouts
    
    if (roomsError) {
      console.error("Error fetching inactive rooms:", roomsError);
      return NextResponse.json({
        success: false,
        error: "Failed to fetch inactive rooms"
      }, { status: 500 });
    }
    
    console.log(`Found ${inactiveRooms?.length || 0} potentially inactive rooms (limited to ${maxRooms})`);
    
    // Track results
    const results = {
      checked: inactiveRooms?.length || 0,
      emptied: 0,
      marked_completed: 0,
      errors: 0,
      skipped: 0
    };
    
    // Process each inactive room
    if (inactiveRooms && inactiveRooms.length > 0) {
      for (const room of inactiveRooms) {
        try {
          // Skip rooms that don't have an ID (shouldn't happen, but just in case)
          if (!room.id) {
            console.warn("Skipping room with missing ID");
            results.skipped++;
            continue;
          }
          
          // Check if the room has any online players
          const { count, error: countError } = await supabase
            .from("game_players")
            .select("*", { count: "exact", head: true })
            .eq("room_id", room.id)
            .eq("is_online", true);
          
          if (countError) {
            console.error(`Error counting players for room ${room.id}:`, countError);
            results.errors++;
            continue;
          }
          
          // If room has no online players, clean it up
          if (count === 0) {
            console.log(`Room ${room.id} (${room.code || 'unknown code'}) is empty, cleaning up`);
            
            // Delete player records first
            try {
              await supabase
                .from("game_players")
                .delete()
                .eq("room_id", room.id);
                
              console.log(`Deleted offline players from room ${room.id}`);
            } catch (playerDeleteError) {
              console.error(`Error deleting players for room ${room.id}:`, playerDeleteError);
            }
            
            // Check if the room was in a game
            if (room.status === "in_progress") {
              // Clean up game-related data
              try {
                // Delete rounds and related data
                const { data: rounds } = await supabase
                  .from("game_rounds")
                  .select("id")
                  .eq("room_id", room.id);
                  
                if (rounds && rounds.length > 0) {
                  // Delete captions for each round
                  for (const round of rounds) {
                    await supabase
                      .from("player_captions")
                      .delete()
                      .eq("round_id", round.id);
                  }
                }
                
                // Delete votes
                await supabase
                  .from("player_votes")
                  .delete()
                  .eq("room_id", room.id);
                  
                // Delete rounds
                await supabase
                  .from("game_rounds")
                  .delete()
                  .eq("room_id", room.id);
              } catch (gameDataError) {
                console.error(`Error cleaning game data for room ${room.id}:`, gameDataError);
              }
            }
            
            // Finally delete the room itself
            const { error: deleteError } = await supabase
              .from("game_rooms")
              .delete()
              .eq("id", room.id);
              
            if (deleteError) {
              console.error(`Error deleting room ${room.id}:`, deleteError);
              
              // If we can't delete, mark as completed
              const { error: updateError } = await supabase
                .from("game_rooms")
                .update({
                  status: "completed",
                  completed_at: new Date().toISOString()
                })
                .eq("id", room.id);
                
              if (updateError) {
                console.error(`Error marking room ${room.id} as completed:`, updateError);
                results.errors++;
              } else {
                console.log(`Marked room ${room.id} as completed`);
                results.marked_completed++;
              }
            } else {
              console.log(`Successfully deleted empty room ${room.id}`);
              results.emptied++;
            }
          } else {
            // Room has players, update the heartbeat
            console.log(`Room ${room.id} has ${count} online players, updating heartbeat`);
            await supabase
              .from("game_rooms")
              .update({
                last_heartbeat: new Date().toISOString()
              })
              .eq("id", room.id);
          }
        } catch (roomError) {
          console.error(`Error processing room ${room.id}:`, roomError);
          results.errors++;
        }
      }
    }
    
    // Return results
    return NextResponse.json({
      success: true,
      results,
      parameters: {
        inactiveHours,
        maxRooms,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: unknown) {
    console.error("Error in room heartbeat:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 
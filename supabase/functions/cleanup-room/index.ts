import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Function to delete room and all associated data
async function cleanupRoom(supabase, roomId) {
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
// The main function that will handle scheduled and manual invocations
serve(async (req)=>{
  try {
    // Create a Supabase client with the project URL and service_role key
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Parse request to get cleaning options
    let olderThanHours = 24; // Default: clean rooms older than 24 hours
    let includeEmptyRooms = true; // Default: also clean empty rooms regardless of age
    try {
      if (req.method === 'POST') {
        const body = await req.json();
        if (body.olderThanHours !== undefined) {
          olderThanHours = parseInt(body.olderThanHours);
        }
        if (body.includeEmptyRooms !== undefined) {
          includeEmptyRooms = body.includeEmptyRooms;
        }
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
    const { data: staleRooms, error: queryError } = await supabaseClient.from("game_rooms").select("id").lt("created_at", cutoffISOString);
    if (queryError) {
      console.error("Error finding stale rooms:", queryError);
    } else if (staleRooms && staleRooms.length > 0) {
      console.log(`Found ${staleRooms.length} stale rooms to clean up`);
      // Process each stale room
      for (const room of staleRooms){
        const success = await cleanupRoom(supabaseClient, room.id);
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
      const { data: activeRooms, error: activeRoomsError } = await supabaseClient.from("game_rooms").select("id").gte("created_at", cutoffISOString).eq("status", "lobby");
      if (activeRoomsError) {
        console.error("Error finding active rooms:", activeRoomsError);
      } else if (activeRooms && activeRooms.length > 0) {
        console.log(`Checking ${activeRooms.length} active rooms for empty ones`);
        // Check each room for players
        for (const room of activeRooms){
          const { count, error: countError } = await supabaseClient.from("game_players").select("*", {
            count: "exact",
            head: true
          }).eq("room_id", room.id);
          if (countError) {
            console.error(`Error counting players for room ${room.id}:`, countError);
            continue;
          }
          // If room has no players, clean it up
          if (count === 0) {
            console.log(`Room ${room.id} is empty, cleaning up`);
            const success = await cleanupRoom(supabaseClient, room.id);
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
    return new Response(JSON.stringify({
      success: true,
      message: "Room cleanup completed",
      stats
    }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    // Return error response
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
});

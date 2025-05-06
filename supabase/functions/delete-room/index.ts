import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req)=>{
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      success: false,
      message: "Method not allowed"
    }), {
      status: 405,
      headers
    });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { roomId, hostId } = await req.json();
    if (!roomId) {
      return new Response(JSON.stringify({
        success: false,
        message: "Missing required field: roomId"
      }), {
        status: 400,
        headers
      });
    }
    console.log(`Processing room deletion for room ${roomId}`);
    const { data: room, error: roomError } = await supabase.from("game_rooms").select("host_id, status").eq("id", roomId).single();
    if (roomError) {
      console.log("Room not found or already deleted");
      return new Response(JSON.stringify({
        success: true,
        message: "Room already deleted"
      }), {
        status: 200,
        headers
      });
    }
    if (hostId && room.host_id !== hostId) {
      console.log("Host has changed, not deleting room");
      return new Response(JSON.stringify({
        success: false,
        message: "Host has changed, deletion cancelled"
      }), {
        status: 403,
        headers
      });
    }
    const { count, error: countError } = await supabase.from("game_players").select("*", {
      count: "exact",
      head: true
    }).eq("room_id", roomId).eq("is_online", true);
    if (countError) {
      console.error("Error counting players:", countError);
      return new Response(JSON.stringify({
        success: false,
        message: "Error checking if room is empty",
        error: countError.message
      }), {
        status: 500,
        headers
      });
    }
    if (count && count > 0) {
      console.log(`Room ${roomId} is not empty (${count} players), cancelling deletion`);
      return new Response(JSON.stringify({
        success: false,
        message: "Room is not empty, deletion cancelled"
      }), {
        status: 200,
        headers
      });
    }
    console.log(`Deleting empty room ${roomId}`);
    const { data: rounds, error: roundsError } = await supabase.from("game_rounds").select("id").eq("room_id", roomId);
    if (roundsError) {
      console.error("Error fetching rounds for deletion:", roundsError);
    }
    const roundIds = rounds?.map((r)=>r.id) || [];
    console.log(`Found ${roundIds.length} rounds to clean up`);
    if (roundIds.length > 0) {
      for (const roundId of roundIds){
        try {
          const { error: captionsError } = await supabase.from("player_captions").delete().eq("round_id", roundId);
          if (captionsError) {
            console.error(`Error deleting captions for round ${roundId}:`, captionsError);
          }
        } catch (err) {
          console.error(`Error in caption deletion for round ${roundId}:`, err);
        }
      }
    }
    try {
      const { error: votesError } = await supabase.from("player_votes").delete().eq("room_id", roomId);
      if (votesError) {
        console.error("Error deleting votes:", votesError);
      } else {
        console.log("Successfully deleted votes");
      }
    } catch (err) {
      console.error("Error in votes deletion:", err);
    }
    try {
      const { error: playersError } = await supabase.from("game_players").delete().eq("room_id", roomId);
      if (playersError) {
        console.error("Error deleting players:", playersError);
      } else {
        console.log("Successfully deleted players");
      }
    } catch (err) {
      console.error("Error in player deletion:", err);
    }
    try {
      const { error: roundsDeleteError } = await supabase.from("game_rounds").delete().eq("room_id", roomId);
      if (roundsDeleteError) {
        console.error("Error deleting rounds:", roundsDeleteError);
      } else {
        console.log("Successfully deleted rounds");
      }
    } catch (err) {
      console.error("Error in rounds deletion:", err);
    }
    try {
      const { error: roomError } = await supabase.from("game_rooms").delete().eq("id", roomId);
      if (roomError) {
        console.error("Error deleting room:", roomError);
        try {
          await supabase.from("game_rooms").update({
            status: "completed"
          }).eq("id", roomId);
          return new Response(JSON.stringify({
            success: true,
            message: "Room marked as completed (deletion failed)"
          }), {
            status: 200,
            headers
          });
        } catch (updateError) {
          console.error("Failed to mark room as completed:", updateError);
          return new Response(JSON.stringify({
            success: false,
            message: "Failed to delete or mark room as completed"
          }), {
            status: 500,
            headers
          });
        }
      } else {
        console.log(`Successfully deleted room ${roomId}`);
        return new Response(JSON.stringify({
          success: true,
          message: "Room successfully deleted"
        }), {
          status: 200,
          headers
        });
      }
    } catch (err) {
      console.error("Error in room deletion:", err);
      return new Response(JSON.stringify({
        success: false,
        message: "Error deleting room",
        error: err instanceof Error ? err.message : "Unknown error"
      }), {
        status: 500,
        headers
      });
    }
  } catch (error) {
    console.error("Error processing room deletion:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(JSON.stringify({
      success: false,
      message: "Error processing room deletion",
      error: errorMessage
    }), {
      status: 500,
      headers
    });
  }
});

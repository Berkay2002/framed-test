import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req)=>{
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers
    });
  }
  // Only allow POST requests
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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Parse request data
    const { roomId, currentHostId, newHostId } = await req.json();
    // Validate inputs
    if (!roomId) {
      return new Response(JSON.stringify({
        success: false,
        message: "Room ID is required"
      }), {
        status: 400,
        headers
      });
    }
    if (!currentHostId) {
      return new Response(JSON.stringify({
        success: false,
        message: "Current host ID is required"
      }), {
        status: 400,
        headers
      });
    }
    if (!newHostId) {
      return new Response(JSON.stringify({
        success: false,
        message: "New host ID is required"
      }), {
        status: 400,
        headers
      });
    }
    console.log(`Processing host transfer from ${currentHostId} to ${newHostId} in room ${roomId}`);
    // 1. Verify the room exists
    const { data: room, error: roomError } = await supabase.from("game_rooms").select("host_id").eq("id", roomId).single();
    if (roomError) {
      console.error("Room error:", roomError);
      return new Response(JSON.stringify({
        success: false,
        message: "Room not found"
      }), {
        status: 404,
        headers
      });
    }
    // 2. Verify the current user is actually the host
    // First check room.host_id (this is faster)
    if (room.host_id !== currentHostId) {
      // Double check with player record in case room.host_id is out of sync
      const { data: hostCheck, error: hostCheckError } = await supabase.from("game_players").select("is_host").eq("user_id", currentHostId).eq("room_id", roomId).eq("is_host", true).maybeSingle();
      if (hostCheckError || !hostCheck) {
        console.error("Host verification error:", hostCheckError);
        return new Response(JSON.stringify({
          success: false,
          message: "Only the current host can transfer host status"
        }), {
          status: 403,
          headers
        });
      }
    }
    // 3. Verify the new host exists in the room
    const { data: newHostPlayer, error: newHostCheckError } = await supabase.from("game_players").select("id, user_id").eq("id", newHostId).eq("room_id", roomId).eq("is_online", true).single();
    if (newHostCheckError || !newHostPlayer) {
      console.error("New host check error:", newHostCheckError);
      return new Response(JSON.stringify({
        success: false,
        message: "The selected player is not in this room or not online"
      }), {
        status: 400,
        headers
      });
    }
    // 4. Start transactions to change host status
    // First, find the current host player
    const { data: currentHostPlayer, error: currentHostPlayerError } = await supabase.from("game_players").select("id").eq("user_id", currentHostId).eq("room_id", roomId).eq("is_host", true).single();
    if (currentHostPlayerError) {
      console.error("Error finding current host player:", currentHostPlayerError);
      return new Response(JSON.stringify({
        success: false,
        message: "Failed to find current host player record"
      }), {
        status: 500,
        headers
      });
    }
    // 4.1 Remove host status from the current host
    const { error: removeHostError } = await supabase.from("game_players").update({
      is_host: false
    }).eq("id", currentHostPlayer.id);
    if (removeHostError) {
      console.error("Remove host error:", removeHostError);
      return new Response(JSON.stringify({
        success: false,
        message: "Failed to remove host status from current host"
      }), {
        status: 500,
        headers
      });
    }
    // 4.2 Assign host status to the new host
    const { error: assignHostError } = await supabase.from("game_players").update({
      is_host: true
    }).eq("id", newHostId);
    if (assignHostError) {
      console.error("Assign host error:", assignHostError);
      // If this fails, try to revert the current host's status
      try {
        await supabase.from("game_players").update({
          is_host: true
        }).eq("id", currentHostPlayer.id);
      } catch (revertError) {
        console.error("Failed to revert host status:", revertError);
      }
      return new Response(JSON.stringify({
        success: false,
        message: "Failed to assign host status to new host"
      }), {
        status: 500,
        headers
      });
    }
    // 4.3 Update the host_id in the room table for consistency
    const { error: updateRoomError } = await supabase.from("game_rooms").update({
      host_id: newHostPlayer.user_id,
      updated_at: new Date().toISOString()
    }).eq("id", roomId);
    if (updateRoomError) {
      console.error("Update room error:", updateRoomError);
      // Instead of failing the whole operation, log the error but continue
      // since the player's is_host flag is the primary indicator
      console.warn("Failed to update room host_id, but host transfer completed successfully in game_players table");
      // Return success anyway since the critical part (player host status) was updated
      return new Response(JSON.stringify({
        success: true,
        message: "Host status transferred successfully (room table not updated)",
        warning: "Room host_id could not be updated, but player host status was changed",
        newHostId: newHostId,
        newHostUserId: newHostPlayer.user_id
      }), {
        status: 200,
        headers
      });
    }
    console.log(`Successfully transferred host from ${currentHostId} to ${newHostPlayer.user_id} in room ${roomId}`);
    return new Response(JSON.stringify({
      success: true,
      message: "Host status transferred successfully",
      newHostId: newHostId,
      newHostUserId: newHostPlayer.user_id
    }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error("Error in transfer-host:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({
      success: false,
      message: "Error transferring host",
      error: errorMessage
    }), {
      status: 500,
      headers
    });
  }
});

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
    const { playerId, userId, forceDelete = false } = await req.json();
    // Validate inputs
    if (!playerId) {
      return new Response(JSON.stringify({
        success: false,
        message: "Player ID is required"
      }), {
        status: 400,
        headers
      });
    }
    if (!userId) {
      return new Response(JSON.stringify({
        success: false,
        message: "User ID is required"
      }), {
        status: 400,
        headers
      });
    }
    console.log(`Processing leave request for player ${playerId}`);
    // Check if player still exists and get room and host information
    const { data: player, error: playerError } = await supabase.from("game_players").select("room_id, is_host").eq("id", playerId).maybeSingle();
    if (playerError) {
      if (playerError.code === 'PGRST116') {
        // Record not found - player might have been already removed
        return new Response(JSON.stringify({
          success: true,
          message: "Player already removed"
        }), {
          status: 200,
          headers
        });
      }
      return new Response(JSON.stringify({
        success: false,
        message: `Could not find player record: ${playerError.message}`
      }), {
        status: 500,
        headers
      });
    }
    // If player doesn't exist anymore, no need to remove them
    if (!player) {
      return new Response(JSON.stringify({
        success: true,
        message: "Player not found or already removed"
      }), {
        status: 200,
        headers
      });
    }
    const roomId = player.room_id;
    const isHost = player.is_host || false;
    if (!roomId) {
      return new Response(JSON.stringify({
        success: false,
        message: "Room ID not available"
      }), {
        status: 400,
        headers
      });
    }
    // Check for total player count and online player count
    // This helps determine if the host is the only player or if there are others
    const { count: totalPlayerCount, error: totalCountError } = await supabase.from("game_players").select("*", {
      count: "exact",
      head: true
    }).eq("room_id", roomId);
    const { count: onlinePlayerCount, error: onlineCountError } = await supabase.from("game_players").select("*", {
      count: "exact",
      head: true
    }).eq("room_id", roomId).eq("is_online", true);
    console.log(`Room ${roomId} has ${totalPlayerCount} total players and ${onlinePlayerCount} online players`);
    // Host is the only player in the room (or only online player)
    const hostIsOnlyPlayer = isHost && (totalPlayerCount === 1 || onlinePlayerCount === 1);
    // Host is leaving but there are other online players
    const hostLeavingWithOthers = isHost && onlinePlayerCount > 1;
    // Cases:
    // 1. Host is only player (online or total) -> Delete room directly
    // 2. Host leaving with others -> Transfer host status first
    // 3. Regular player leaving -> Just remove/mark offline
    if (hostIsOnlyPlayer) {
      console.log(`Host is the only player in room ${roomId}, proceeding with room deletion`);
      // Delete the room directly - no need for extra checks
      return await deleteRoom(supabase, roomId, playerId, isHost, headers);
    } else if (hostLeavingWithOthers) {
      if (forceDelete) {
        console.log(`Host leaving room ${roomId} with other players, attempting to transfer host status`);
        // Find another player to make host
        const { data: otherPlayers, error: otherPlayersError } = await supabase.from("game_players").select("id, user_id").eq("room_id", roomId).neq("id", playerId).eq("is_online", true).limit(1);
        if (!otherPlayersError && otherPlayers && otherPlayers.length > 0) {
          // Assign the first remaining player as host
          const { error: hostUpdateError } = await supabase.from("game_players").update({
            is_host: true
          }).eq("id", otherPlayers[0].id);
          if (hostUpdateError) {
            console.error("Error updating new host:", hostUpdateError);
            return new Response(JSON.stringify({
              success: false,
              message: "Failed to transfer host status",
              error: hostUpdateError.message
            }), {
              status: 500,
              headers
            });
          }
          // Also update the room's host_id
          const { error: roomUpdateError } = await supabase.from("game_rooms").update({
            host_id: otherPlayers[0].user_id,
            updated_at: new Date().toISOString()
          }).eq("id", roomId);
          if (roomUpdateError) {
            console.error("Error updating room host:", roomUpdateError);
          // Non-critical error, continue anyway
          }
          console.log(`Successfully transferred host to player ${otherPlayers[0].id}`);
          // Now remove the original host player
          await removePlayer(supabase, playerId, forceDelete);
          return new Response(JSON.stringify({
            success: true,
            message: "Player removed and host status transferred",
            wasHost: true,
            newHostId: otherPlayers[0].id
          }), {
            status: 200,
            headers
          });
        } else {
          // Couldn't find another online player to transfer host to
          console.error("Could not find another online player to transfer host to");
          return new Response(JSON.stringify({
            success: false,
            message: "Failed to find another online player to transfer host status to",
            isHostPrevention: true,
            roomId: roomId
          }), {
            status: 403,
            headers
          });
        }
      } else {
        // If not forceDelete, don't allow host to leave without transferring
        return new Response(JSON.stringify({
          success: false,
          message: "As the host, you must transfer host status to another player before leaving",
          isHostPrevention: true,
          roomId: roomId
        }), {
          status: 403,
          headers
        });
      }
    } else {
      // Regular player leaving (not host or special case)
      console.log(`Regular player ${playerId} leaving room ${roomId}`);
      // Remove the player (delete or mark offline)
      const result = await removePlayer(supabase, playerId, forceDelete);
      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          message: result.message
        }), {
          status: 500,
          headers
        });
      }
      // If player was just marked offline, return immediately
      if (!forceDelete) {
        return new Response(JSON.stringify({
          success: true,
          message: "Player marked as offline"
        }), {
          status: 200,
          headers
        });
      }
      // Check if this was the last player after deletion
      const { count: remainingPlayerCount, error: countError } = await supabase.from("game_players").select("*", {
        count: "exact",
        head: true
      }).eq("room_id", roomId).eq("is_online", true);
      if (remainingPlayerCount === 0) {
        // Last player left, clean up the room
        console.log(`Last player left room ${roomId}, cleaning up`);
        return await deleteRoom(supabase, roomId, playerId, isHost, headers);
      }
      // Player successfully removed but room still has players
      return new Response(JSON.stringify({
        success: true,
        message: "Player removed successfully",
        wasHost: isHost
      }), {
        status: 200,
        headers
      });
    }
  } catch (error) {
    console.error("Error in leave-room:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({
      success: false,
      message: "Error removing player from room",
      error: errorMessage
    }), {
      status: 500,
      headers
    });
  }
});
// Helper functions to make the code more modular and readable
// Remove a player (delete or mark offline)
async function removePlayer(supabase, playerId, forceDelete) {
  if (forceDelete) {
    // Delete the player
    const { error: deleteError } = await supabase.from("game_players").delete().eq("id", playerId);
    if (deleteError) {
      console.error("Error deleting player:", deleteError);
      return {
        success: false,
        message: `Failed to delete player: ${deleteError.message}`
      };
    }
    console.log(`Deleted player ${playerId}`);
    return {
      success: true
    };
  } else {
    // Just mark the player as offline
    const { error: updateError } = await supabase.from("game_players").update({
      is_online: false,
      last_seen: new Date().toISOString()
    }).eq("id", playerId);
    if (updateError) {
      console.error("Error updating player status:", updateError);
      return {
        success: false,
        message: `Failed to update player status: ${updateError.message}`
      };
    }
    console.log(`Marked player ${playerId} as offline`);
    return {
      success: true
    };
  }
}
// Delete a room and all related data
async function deleteRoom(supabase, roomId, playerId, wasHost, headers) {
  // First, mark the room as completed to avoid it showing up in room lists
  await supabase.from("game_rooms").update({
    status: "completed",
    updated_at: new Date().toISOString()
  }).eq("id", roomId);
  try {
    // Remove the player if they haven't been removed yet
    const { data: playerExists } = await supabase.from("game_players").select("id").eq("id", playerId).maybeSingle();
    if (playerExists) {
      await supabase.from("game_players").delete().eq("id", playerId);
    }
    // Delete related data first
    const { data: rounds, error: roundsError } = await supabase.from("game_rounds").select("id").eq("room_id", roomId);
    if (!roundsError && rounds) {
      for (const round of rounds){
        await supabase.from("player_captions").delete().eq("round_id", round.id);
      }
    }
    await supabase.from("game_rounds").delete().eq("room_id", roomId);
    await supabase.from("player_votes").delete().eq("room_id", roomId);
    await supabase.from("game_players").delete().eq("room_id", roomId);
    // Finally delete the room
    await supabase.from("game_rooms").delete().eq("id", roomId);
    console.log(`Successfully deleted room ${roomId} and all related data`);
    return new Response(JSON.stringify({
      success: true,
      message: "Player removed and room deleted",
      wasLastPlayer: true,
      wasHost: wasHost,
      roomDeleted: true
    }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error("Error deleting room:", error);
    return new Response(JSON.stringify({
      success: true,
      message: "Player removed but room could not be fully deleted (marked as completed)",
      warning: true,
      wasLastPlayer: true,
      wasHost: wasHost
    }), {
      status: 200,
      headers
    });
  }
}

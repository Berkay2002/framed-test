import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { roomId, userId } = await req.json();
    // Validate inputs
    if (!roomId) {
      return new Response(JSON.stringify({
        error: 'Room ID is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!userId) {
      return new Response(JSON.stringify({
        error: 'User ID is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Check if room exists and user is the host
    const { data: room, error: roomError } = await supabase.from("game_rooms").select("*").eq("id", roomId).single();
    if (roomError) {
      return new Response(JSON.stringify({
        error: 'Room not found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (room.host_id !== userId) {
      return new Response(JSON.stringify({
        error: 'Only the host can start the game'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check if the game is already in progress
    if (room.status === 'in_progress') {
      return new Response(JSON.stringify({
        error: 'Game is already in progress'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Count players to ensure there are enough (at least 2)
    const { count: playerCount, error: countError } = await supabase.from("game_players").select("*", {
      count: "exact",
      head: true
    }).eq("room_id", roomId);
    if (countError) {
      return new Response(JSON.stringify({
        error: 'Failed to count players'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!playerCount || playerCount < 1) {
      return new Response(JSON.stringify({
        error: 'At least 2 players are required to start'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Update room status to in_progress and set current round to 1
    const { data: updatedRoom, error: updateError } = await supabase.from("game_rooms").update({
      status: "in_progress",
      current_round: 1,
      started_at: new Date().toISOString()
    }).eq("id", roomId).select().single();
    if (updateError) {
      return new Response(JSON.stringify({
        error: 'Failed to update room status'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create first round (with placeholder images for now)
    const { data: round, error: roundError } = await supabase.from("game_rounds").insert({
      room_id: roomId,
      round_number: 1,
      real_image_url: "https://placekitten.com/500/500",
      fake_image_url: "https://placekitten.com/500/501",
      started_at: new Date().toISOString()
    }).select().single();
    if (roundError) {
      return new Response(JSON.stringify({
        error: 'Failed to create first round'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    return new Response(JSON.stringify({
      room: updatedRoom,
      round
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("Start game error:", error);
    return new Response(JSON.stringify({
      error: error.message || 'An unexpected error occurred'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// Generate a random room code (4 uppercase letters + 2 numbers)
function generateRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Omitting I and O to avoid confusion
  const numbers = '123456789'; // Omitting 0 to avoid confusion
  let code = '';
  // Generate 4 random letters
  for(let i = 0; i < 4; i++){
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  // Append 2 random numbers
  for(let i = 0; i < 2; i++){
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  return code;
}
// Generate a unique game alias for a player
async function generateGameAlias(supabase, roomId) {
  // Array of fun adjectives and animals for generating aliases
  const adjectives = [
    'Happy',
    'Sleepy',
    'Grumpy',
    'Sneezy',
    'Dopey',
    'Bashful',
    'Doc',
    'Brave',
    'Clever',
    'Daring',
    'Eager',
    'Fancy',
    'Gentle',
    'Honest',
    'Jolly',
    'Kind',
    'Lucky',
    'Mighty',
    'Noble',
    'Polite',
    'Quick',
    'Swift',
    'Tiny',
    'Wise',
    'Zany'
  ];
  const animals = [
    'Panda',
    'Tiger',
    'Eagle',
    'Shark',
    'Wolf',
    'Bear',
    'Fox',
    'Koala',
    'Lion',
    'Otter',
    'Parrot',
    'Rabbit',
    'Snake',
    'Turtle',
    'Whale',
    'Zebra',
    'Duck',
    'Crow',
    'Frog',
    'Seal',
    'Owl',
    'Goat',
    'Horse',
    'Mouse',
    'Llama'
  ];
  // Try to find a unique combination
  for(let attempts = 0; attempts < 50; attempts++){
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const alias = `${adjective}${animal}`;
    // Check if this alias is already used in the room
    const { count, error } = await supabase.from("game_players").select("*", {
      count: "exact",
      head: true
    }).eq("room_id", roomId).eq("game_alias", alias);
    if (error) {
      console.error("Error checking alias uniqueness:", error);
      // Even if there's an error, return an alias (will be caught by DB constraints if duplicate)
      return alias;
    }
    // If count is 0, the alias is available
    if (count === 0) {
      return alias;
    }
  }
  // If we exhausted our attempts, use a timestamp fallback
  return `Player${Date.now().toString().slice(-6)}`;
}
// Define CORS headers
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
    const { userId } = await req.json();
    // Validate userId
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
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Generate room code
    const code = generateRoomCode();
    // First create the room
    const { data: room, error: roomError } = await supabase.from("game_rooms").insert({
      host_id: userId,
      code,
      status: "lobby",
      created_at: new Date().toISOString()
    }).select().single();
    if (roomError) throw roomError;
    if (!room) throw new Error("Failed to create room");
    const roomId = room.id;
    // Generate a unique alias for the host
    const gameAlias = await generateGameAlias(supabase, roomId);
    // Add the host as a player
    const { data: player, error: playerError } = await supabase.from("game_players").insert({
      room_id: roomId,
      user_id: userId,
      game_alias: gameAlias,
      is_host: true,
      is_online: true,
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    }).select().single();
    if (playerError) throw playerError;
    if (!player) throw new Error("Failed to add host as player");
    // Return the room and player data
    return new Response(JSON.stringify({
      room,
      player
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

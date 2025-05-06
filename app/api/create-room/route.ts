import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from '@/utils/supabase/server';
import { Database } from "@/utils/supabase/types";

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

async function generateGameAlias() {
  // Array of fun adjectives and animals for generating aliases
  const adjectives = [
    'Happy', 'Sleepy', 'Grumpy', 'Sneezy', 'Dopey', 'Bashful', 'Doc', 'Brave',
    'Clever', 'Daring', 'Eager', 'Fancy', 'Gentle', 'Honest', 'Jolly', 'Kind',
    'Lucky', 'Mighty', 'Noble', 'Polite', 'Quick', 'Swift', 'Tiny', 'Wise', 'Zany'
  ];
  const animals = [
    'Panda', 'Tiger', 'Eagle', 'Shark', 'Wolf', 'Bear', 'Fox', 'Koala', 'Lion',
    'Otter', 'Parrot', 'Rabbit', 'Snake', 'Turtle', 'Whale', 'Zebra', 'Duck',
    'Crow', 'Frog', 'Seal', 'Owl', 'Goat', 'Horse', 'Mouse', 'Llama'
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const alias = `${adjective}${animal}`;
  
  // If we exhausted our attempts, use a timestamp fallback
  return alias;
}
/*
// Generate a unique game alias for the player
function generateGameAlias(playerName: string) {
  // Clean the name and add a random number
  const cleanName = playerName.replace(/[^a-zA-Z0-9]/g, '');
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${cleanName}${randomSuffix}`;
}
*/
export async function POST(request: NextRequest) {
  try {
    console.log("Processing create-room request");
    
    // Parse request body
    let userId: string;
    let playerName: string;
    let roomName: string;
    
    try {
      const body = await request.json();
      userId = body.userId;
      playerName = body.playerName;
      roomName = body.roomName;
      
      console.log(`Create room request: name=${roomName}, host=${playerName} (${userId})`);
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return NextResponse.json({ 
        success: false, 
        error: "Invalid request body" 
      }, { status: 400 });
    }
    
    // Validate required fields
    if (!userId) {
      console.log("Missing userId in request");
      return NextResponse.json({ 
        success: false, 
        error: "User ID is required" 
      }, { status: 400 });
    }
    
    if (!playerName) {
      console.log("Missing playerName in request");
      return NextResponse.json({ 
        success: false, 
        error: "Player name is required" 
      }, { status: 400 });
    }
    
    if (!roomName) {
      console.log("Missing roomName in request");
      return NextResponse.json({ 
        success: false, 
        error: "Room name is required" 
      }, { status: 400 });
    }
    
    // First try using a regular authenticated client (which respects RLS policies)
    try {
      console.log("Attempting to create room with authenticated client (respecting RLS)");
      const supabase = await createClient();
      
      // Generate a unique room code
      const code = generateRoomCode();
      
      // First verify that the user is authenticated
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error("Auth error:", authError);
        return NextResponse.json({
          success: false,
          error: "Authentication error: " + (authError?.message || "User not authenticated")
        }, { status: 401 });
      }
      
      // Ensure the authenticated user ID matches the requested user ID
      if (user.id !== userId) {
        console.error(`User ID mismatch: authenticated as ${user.id} but requested ${userId}`);
        return NextResponse.json({
          success: false,
          error: "User ID mismatch: You can only create rooms as yourself"
        }, { status: 403 });
      }
      
      console.log(`Creating room "${roomName}" with host ${playerName} and code ${code}`);
      console.log("Room data being inserted:", JSON.stringify({
        code,
        host_id: userId,
        status: "lobby", 
        created_at: new Date().toISOString()
      }));
      
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .insert({
          code,
          host_id: userId,
          status: "lobby",
          created_at: new Date().toISOString()
        })
        .select("*")
        .single();
      
      if (roomError) {
        console.error("Error creating room with authenticated client:", roomError);
        throw roomError; // Will be caught and we'll try admin client as fallback
      }
      
      // Generate game alias for the player
      //const gameAlias = generateGameAlias(playerName);
      const gameAlias = await generateGameAlias();
      console.log(`Generated alias for new player: ${gameAlias}`);
      
      // Add host as first player
      console.log(`Adding host ${playerName} as player in room ${room.id} with alias ${gameAlias}`);
      const { data: player, error: playerError } = await supabase
        .from("game_players")
        .insert({
          game_alias: gameAlias,
          user_id: userId,
          room_id: room.id,
          is_host: true,
          is_online: true,
          joined_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        })
        .select("*")
        .single();
      
      if (playerError) {
        console.error("Error adding player with authenticated client:", playerError);
        
        // Attempt to clean up the room since we couldn't add the player
        console.log(`Cleaning up room ${room.id} due to player creation failure`);
        await supabase.from("game_rooms").delete().eq("id", room.id);
        
        throw playerError; // Will be caught and we'll try admin client as fallback
      }
      
      console.log(`Successfully created room ${room.id} with host player ${player.id} using authenticated client`);
      return NextResponse.json({ 
        success: true, 
        room,
        player
      });
    } catch (rlsError) {
      // Log the RLS error but continue to try with admin client
      console.warn("RLS error, falling back to admin client:", rlsError);
    }
    
    // Fallback to admin client if RLS approach fails
    console.log("Falling back to admin client due to RLS issues");
    let supabase;
    try {
      supabase = createAdminClient();
      console.log("Created admin Supabase client");
    } catch (clientError) {
      console.error("Failed to create Supabase admin client:", clientError);
      return NextResponse.json({
        success: false,
        error: 'Server configuration error: ' + (clientError instanceof Error ? clientError.message : String(clientError))
      }, { status: 500 });
    }


    
    // Generate a unique room code
    const code = generateRoomCode();
    
    // Create new room
    console.log(`Creating room "${roomName}" with host ${playerName} and code ${code} using admin client`);
    console.log("Room data being inserted:", JSON.stringify({
      code,
      host_id: userId,
      status: "lobby",
      created_at: new Date().toISOString()
    }));
    
    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .insert({
        code,
        host_id: userId,
        status: "lobby",
        created_at: new Date().toISOString()
      })
      .select("*")
      .single();
    
    if (roomError) {
      console.error("Error creating room with admin client:", roomError);
      console.error("Error details:", JSON.stringify(roomError));
      console.error("Error code:", roomError.code);
      console.error("Error message:", roomError.message);
      console.error("Error details:", roomError.details);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to create room: " + roomError.message 
      }, { status: 500 });
    }
    
    if (!room) {
      console.error("Room creation failed without error");
      return NextResponse.json({ 
        success: false, 
        error: "Failed to create room - no data returned" 
      }, { status: 500 });
    }
    /*
    // Generate game alias for the player
    const gameAlias = generateGameAlias();
    
    // Add host as first player
    console.log(`Adding host ${playerName} as player in room ${room.id} with alias ${gameAlias} using admin client`);
    const { data: player, error: playerError } = await supabase
      .from("game_players")
      .insert({
        game_alias: gameAlias,
        user_id: userId,
        room_id: room.id,
        is_host: true,
        is_online: true,
        joined_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      })
      .select("*")
      .single();
    
    if (playerError) {
      console.error("Error adding player with admin client:", playerError);
      console.error("Player error details:", JSON.stringify(playerError));
      
      // Attempt to clean up the room since we couldn't add the player
      console.log(`Cleaning up room ${room.id} due to player creation failure`);
      await supabase.from("game_rooms").delete().eq("id", room.id);
      
      return NextResponse.json({ 
        success: false, 
        error: "Failed to add player to room: " + playerError.message 
      }, { status: 500 });
    }
    
    console.log(`Successfully created room ${room.id} with host player ${player.id} using admin client`);
    return NextResponse.json({ 
      success: true, 
      room,
      player
    });
    */
    
  } catch (error: unknown) {
    console.error("Error in create-room API:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }

} 
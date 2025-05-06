import { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "@/utils/supabase/types";
import { createAdminClient } from "@/utils/supabase/admin";

// Generate a unique game alias for a player
async function generateGameAlias(supabase: SupabaseClient<Database>, roomId: string) {
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

export async function POST(req: NextRequest) {
  try {
    console.log("Processing join-room request");
    const { userId, code } = await req.json();
    console.log(`Join room request for code: ${code}, userId: ${userId}`);
    
    // Input validation
    if (!userId) {
      return NextResponse.json({
        error: 'User ID is required'
      }, { status: 400 });
    }
    
    if (!code) {
      return NextResponse.json({
        error: 'Room code is required'
      }, { status: 400 });
    }
    
    // Create Supabase admin client
    let supabase;
    try {
      supabase = createAdminClient();
      console.log("Created admin Supabase client");
    } catch (clientError) {
      console.error("Failed to create Supabase client:", clientError);
      return NextResponse.json({
        error: 'Server configuration error: ' + (clientError instanceof Error ? clientError.message : String(clientError))
      }, { status: 500 });
    }
    
    // Get the room by code
    console.log(`Looking up room with code: ${code}`);
    const { data: room, error: roomError } = await supabase.from("game_rooms").select("*").eq("code", code).single();
    
    if (roomError) {
      console.error("Room lookup error:", roomError);
      return NextResponse.json({
        error: 'Room not found'
      }, { status: 404 });
    }
    
    console.log(`Found room with ID: ${room.id}`);
    
    // Check if player is already in the room (RECONNECTION FLOW)
    console.log("Checking if player already exists in room...");
    const { data: existingPlayer, error: playerError } = await supabase.from("game_players")
      .select("*")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .maybeSingle();
    
    // If player already exists, update their online status (RECONNECT)
    if (existingPlayer) {
      console.log(`Player ${existingPlayer.id} already exists, reconnecting...`);
      // Update player's online status and last_seen timestamp
      const { data: updatedPlayer, error: updateError } = await supabase.from("game_players").update({
        is_online: true,
        last_seen: new Date().toISOString()
      }).eq("id", existingPlayer.id).select().single();
      
      if (updateError) {
        console.error("Error updating player status:", updateError);
        // Continue with the existing player anyway
      }
      
      console.log(`Successfully reconnected player ${existingPlayer.id}`);
      return NextResponse.json({
        room,
        player: updatedPlayer || existingPlayer,
        reconnected: true
      });
    }
    
    // FIRST-TIME JOIN FLOW
    console.log(`New player joining room ${room.id}`);
    const isHost = room.host_id === userId;
    
    // Try up to 3 times to create a player with a unique alias
    let retries = 0;
    let player = null;
    let insertError = null;
    
    while(retries < 3 && !player){
      try {
        const gameAlias = await generateGameAlias(supabase, room.id);
        console.log(`Generated alias for new player: ${gameAlias}`);
        
        const { data, error } = await supabase.from("game_players").insert({
          room_id: room.id,
          user_id: userId,
          game_alias: gameAlias,
          is_host: isHost,
          is_online: true,
          joined_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        }).select().single();
        
        if (error) {
          // If there's a uniqueness conflict, try again
          if (error.code === '23505') {
            console.log(`Alias conflict detected, retrying (attempt ${retries + 1}/3)...`);
            retries++;
            insertError = error;
            continue;
          }
          throw error;
        }
        
        player = data;
      } catch (err) {
        console.error("Error creating player:", err);
        retries++;
        insertError = err;
      }
    }
    
    // If we couldn't create a player after retries, return an error
    if (!player) {
      console.error("Failed to create player after retries:", insertError);
      return NextResponse.json({
        error: 'Failed to create player with unique alias'
      }, { status: 500 });
    }
    
    console.log(`Successfully added new player ${player.id} to room ${room.id}`);
    return NextResponse.json({
      room,
      player,
      reconnected: false
    });
    
  } catch (error: unknown) {
    console.error("Join room error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }, { status: 500 });
  }
} 
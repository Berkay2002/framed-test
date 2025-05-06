import { NextRequest, NextResponse } from "next/server";
import { Database } from "@/utils/supabase/types";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    console.log("Processing start-game request");
    
    // Parse request body
    let roomId: string;
    let userId: string;
    
    try {
      const body = await request.json();
      roomId = body.roomId;
      userId = body.userId;
      
      console.log(`Start game request for roomId: ${roomId}, userId: ${userId}`);
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      return NextResponse.json({ 
        success: false, 
        error: "Invalid request body" 
      }, { status: 400 });
    }
    
    if (!roomId || !userId) {
      console.log("Missing roomId or userId in request");
      return NextResponse.json({ 
        success: false, 
        error: "Missing roomId or userId" 
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
        success: false,
        error: 'Server configuration error: ' + (clientError instanceof Error ? clientError.message : String(clientError))
      }, { status: 500 });
    }
    
    // First check if user is the host for this room
    console.log(`Verifying user ${userId} is the host of room ${roomId}`);
    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("id", roomId)
      .eq("host_id", userId)
      .maybeSingle();
    
    if (roomError) {
      console.error("Error fetching room:", roomError);
      return NextResponse.json({ 
        success: false, 
        error: "Error verifying room ownership" 
      }, { status: 500 });
    }
    
    if (!room) {
      console.log("User is not the host of this room or room doesn't exist");
      return NextResponse.json({ 
        success: false, 
        error: "Only the host can start the game, or the room doesn't exist" 
      }, { status: 403 });
    }
    
    // Verify there are enough players
    console.log(`Checking player count in room ${roomId}`);
    const { count: playerCount, error: countError } = await supabase
      .from("game_players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("is_online", true);
    
    if (countError) {
      console.error("Error counting players:", countError);
      return NextResponse.json({ 
        success: false, 
        error: "Error verifying player count" 
      }, { status: 500 });
    }
    
    const minPlayers = 1; // For development, allow starting with fewer players
    
    if (!playerCount || playerCount < minPlayers) {
      console.log(`Not enough players: ${playerCount ?? 0}/${minPlayers}`);
      return NextResponse.json({ 
        success: false, 
        error: `Need at least ${minPlayers} players to start` 
      }, { status: 400 });
    }
    
    console.log(`Room has ${playerCount} players, updating status to 'in_progress'`);


    //select impostor
    console.log(`Fetching player IDs for room ${roomId}`);
    const { data: players, error: playersError } = await supabase
    .from("game_players")
    .select("user_id")
    .eq("room_id", roomId);
    
    if (playersError || !players || players.length === 0) {
      console.error("Error fetching players:", playersError);
      return NextResponse.json({ success: false, error: "Failed to fetch players for round setup" }, { status: 500 });
    }
    
    //Select Impostor
    const impostorIndex = Math.floor(Math.random() * players.length);
    const impostorId = players[impostorIndex].user_id;
    console.log(`Selected impostor: ${impostorId}`);
    
    // Initialize round 1 with empty image URLs - the round-image-url endpoint will handle the actual image selection
    console.log(`Initializing round 1 data for room ${roomId}`);
    const { error: insertRoundError } = await supabase
      .from("game_rounds")
      .insert({
        room_id: roomId,
        round_number: 1,
        real_image_url: "", // Will be populated by the round-image-url endpoint
        fake_image_url: "", // Will be populated by the round-image-url endpoint
      });

    if (insertRoundError) {
      console.error("Error inserting game round:", insertRoundError);
      return NextResponse.json({ success: false, error: "Failed to initialize game round" }, { status: 500 });
    }
    
    // Update room status to "in_progress" and impostor id
    const { error: updateError } = await supabase
      .from("game_rooms")
      .update({ 
        status: "in_progress",
        started_at: new Date().toISOString(),
        impostor_id: impostorId,
        current_round: 1
      })
      .eq("id", roomId);
    
    if (updateError) {
      console.error("Error updating room status:", updateError);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to start game" 
      }, { status: 500 });
    }
    
    console.log(`Successfully started game for room ${roomId}`);
    return NextResponse.json({ success: true });
    
  } catch (error: unknown) {
    console.error("Error in start-game API:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
} 
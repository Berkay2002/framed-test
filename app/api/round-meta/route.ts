import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Get URL parameters
    const searchParams = request.nextUrl.searchParams;
    const gameId = searchParams.get('gameId');
    const roundParam = searchParams.get('round');

    // Validate parameters
    if (!gameId || !roundParam) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing gameId or round parameter" 
      }, { status: 400 });
    }

    // Convert round to number
    const roundNumber = parseInt(roundParam, 10);
    if (isNaN(roundNumber)) {
      return NextResponse.json({ 
        success: false, 
        error: "Round parameter must be a number" 
      }, { status: 400 });
    }

    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: "Authentication required"
      }, { status: 401 });
    }

    // Get the player in this game room
    const { data: player, error: playerError } = await supabase
      .from("game_players")
      .select("id, user_id, room_id")
      .eq("user_id", user.id)
      .eq("room_id", gameId)
      .single();

    if (playerError || !player) {
      return NextResponse.json({
        success: false,
        error: "Player not found in this game room"
      }, { status: 404 });
    }

    // Get the round data
    const { data: round, error: roundError } = await supabase
      .from("game_rounds")
      .select("id, real_image_url, fake_image_url")
      .eq("room_id", gameId)
      .eq("round_number", roundNumber)
      .single();

    if (roundError || !round) {
      return NextResponse.json({
        success: false,
        error: "Round not found"
      }, { status: 404 });
    }

    // Get the game room to check if this player is the impostor
    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .select("impostor_id")
      .eq("id", gameId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({
        success: false,
        error: "Game room not found"
      }, { status: 404 });
    }

    // Determine if the current user is the impostor
    const isImpostor = room.impostor_id === user.id;

    // Create the promptKey - for real image or fake image based on player role
    const promptKey = isImpostor ? round.fake_image_url : round.real_image_url;

    return NextResponse.json({
      success: true,
      roundId: round.id,
      promptKey,
      isImpostor
    });
    
  } catch (error) {
    console.error("Error in round-meta endpoint:", error);
    return NextResponse.json({
      success: false,
      error: "Server error processing round metadata"
    }, { status: 500 });
  }
} 
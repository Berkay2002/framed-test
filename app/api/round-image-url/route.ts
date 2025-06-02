import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Get URL parameters
    const searchParams = request.nextUrl.searchParams;
    const roomId = searchParams.get('key'); // game room Id

    console.log("round-image-url API called for room ID:", roomId);
    
    // Validate parameters
    if (!roomId) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing key parameter" 
      }, { status: 400 });
    }

    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("Authentication error in round-image-url:", authError);
      return NextResponse.json({
        success: false,
        error: "Authentication required"
      }, { status: 401 });
    }
    
    // 1. Get current game information
    const { data: gameRoom, error: gameError } = await supabase
      .from('game_rooms')
      .select('impostor_id, current_round, status')
      .eq('id', roomId)
      .single();
    
    if (gameError || !gameRoom) {
      console.error("Error fetching game room:", gameError);
      return NextResponse.json({
        success: false,
        error: "Game room not found"
      }, { status: 404 });
    }
    
    if (gameRoom.status !== 'in_progress' || !gameRoom.current_round) {
      console.error("Game is not in progress or missing round number");
      return NextResponse.json({
        success: false,
        error: "Game not in valid state for image"
      }, { status: 400 });
    }
    
    // Check if user is impostor
    const isImpostor = user.id === gameRoom.impostor_id;
    
    // 2. Get the current round with image URLs (should already be populated from game start)
    const { data: roundData, error: roundError } = await supabase
      .from('game_rounds')
      .select('id, real_image_url, fake_image_url')
      .eq('room_id', roomId)
      .eq('round_number', gameRoom.current_round)
      .maybeSingle();
    
    if (roundError) {
      console.error("Error fetching round data:", roundError);
      return NextResponse.json({
        success: false,
        error: `Error fetching round: ${roundError.message}`
      }, { status: 500 });
    }
    
    if (!roundData) {
      console.error("Round not found for room", roomId, "round", gameRoom.current_round);
      return NextResponse.json({
        success: false,
        error: "Round not found"
      }, { status: 404 });
    }

    console.log(`Found round ${roundData.id} for room ${roomId}, round number ${gameRoom.current_round}`);
    console.log(`Round URLs - Real: ${roundData.real_image_url ? 'exists' : 'empty'}, Fake: ${roundData.fake_image_url ? 'exists' : 'empty'}`);
    
    // Check if the round has valid image URLs (they should already be populated from game start)
    if (!roundData.real_image_url || !roundData.fake_image_url) {
      console.error("Round found but image URLs are missing - this shouldn't happen with the new system", {
        roundId: roundData.id,
        realImage: roundData.real_image_url ? 'exists' : 'missing',
        fakeImage: roundData.fake_image_url ? 'exists' : 'missing'
      });
      
      return NextResponse.json({
        success: false,
        error: "Round images not properly initialized. Please restart the game.",
        details: "Images should be pre-selected at game start"
      }, { status: 500 });
    }
    
    // Get the appropriate URL based on player role
    const selectedUrl = isImpostor ? roundData.fake_image_url : roundData.real_image_url;
    
    // Get image details from image_titles table
    const { data: imageDetails } = await supabase
      .from('image_titles')
      .select('title, file_name, category')
      .eq('file_path', selectedUrl)
      .maybeSingle();
    
    console.log(`Returning ${isImpostor ? 'fake' : 'real'} image for round ${gameRoom.current_round}`);
    
    // Return the image data
    return NextResponse.json({
      url: selectedUrl,
      title: imageDetails?.title || "Game Image",
      file_name: imageDetails?.file_name || "image.jpg",
      category: imageDetails?.category || "Unknown Category",
      role: isImpostor ? "impostor" : "player"
    });
    
  } catch (error) {
    console.error("Error in round-image-url API:", error);
    return NextResponse.json({
      success: false,
      error: "Server error processing image request",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
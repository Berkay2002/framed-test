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
    
    const minPlayers = 1; // Set to 1 to allow solo mode for development/testing
    
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
    
    // Create a round record - this ensures round data exists immediately when the game starts
    console.log(`Creating all 6 round records with pre-selected images for room ${roomId}`);
    
    try {
      // Get all valid images from all categories
      const { data: allImages, error: allImagesError } = await supabase
        .from('image_titles')
        .select('id, file_path, title, file_name, category')
        .not('file_path', 'is', null)
        .gt('file_path', '');
      
      if (allImagesError) {
        console.error("Error fetching all images:", allImagesError);
        throw new Error(`Error fetching all images: ${allImagesError.message}`);
      }
      
      if (!allImages || allImages.length < 12) {
        console.error(`Not enough images found: ${allImages?.length || 0}/12 required`);
        throw new Error("Not enough images found for 6 rounds");
      }
      
      // Filter to valid images
      const validImages = allImages.filter(img => img.file_path && img.file_path.trim() !== '');
      console.log(`Found ${validImages.length} images with valid file paths`);
      
      if (validImages.length < 12) {
        console.error(`Not enough valid images: ${validImages.length}/12 required`);
        throw new Error("Not enough valid images for 6 rounds");
      }
      
      // New algorithm: Pick random image, then find counterpart from same category
      const selectedImagePairs: Array<{real: any, fake: any}> = [];
      const usedImages = new Set<number>(); // Track used image IDs
      
      console.log("Starting image pair selection algorithm...");
      
      for (let roundNumber = 1; roundNumber <= 6; roundNumber++) {
        let realImage = null;
        let fakeImage = null;
        let attempts = 0;
        const maxAttempts = 100; // Prevent infinite loops
        
        while ((!realImage || !fakeImage) && attempts < maxAttempts) {
          attempts++;
          
          // Step 1: Pick a random image that hasn't been used
          const availableImages = validImages.filter(img => !usedImages.has(img.id));
          
          if (availableImages.length < 2) {
            console.error(`Not enough available images for round ${roundNumber}. Available: ${availableImages.length}`);
            throw new Error(`Not enough available images for round ${roundNumber}`);
          }
          
          // Pick random image for "real"
          const randomIndex = Math.floor(Math.random() * availableImages.length);
          const candidateReal = availableImages[randomIndex];
          
          // Step 2: Find a counterpart from the same category that hasn't been used
          const sameCategory = availableImages.filter(img => 
            img.category === candidateReal.category && 
            img.id !== candidateReal.id &&
            !usedImages.has(img.id)
          );
          
          if (sameCategory.length > 0) {
            // Found a valid pair!
            realImage = candidateReal;
            fakeImage = sameCategory[Math.floor(Math.random() * sameCategory.length)];
            
            // Mark both images as used
            usedImages.add(realImage.id);
            usedImages.add(fakeImage.id);
            
            console.log(`Round ${roundNumber} (attempt ${attempts}): Found pair in category "${realImage.category}"`);
            console.log(`  Real: ${realImage.title || realImage.file_name}`);
            console.log(`  Fake: ${fakeImage.title || fakeImage.file_name}`);
          } else {
            console.log(`Round ${roundNumber} (attempt ${attempts}): No counterpart found for category "${candidateReal.category}", retrying...`);
          }
        }
        
        if (!realImage || !fakeImage) {
          console.error(`Failed to find image pair for round ${roundNumber} after ${maxAttempts} attempts`);
          throw new Error(`Could not find valid image pair for round ${roundNumber}`);
        }
        
        selectedImagePairs.push({ real: realImage, fake: fakeImage });
      }
      
      console.log(`Successfully selected ${selectedImagePairs.length} image pairs for 6 rounds`);
      
      // Create all 6 rounds with the selected image pairs
      const roundDuration = 20 * 1000; // 20 seconds (milliseconds) for dev
      const rounds = [];
      
      for (let roundNumber = 1; roundNumber <= 6; roundNumber++) {
        const { real: realImage, fake: fakeImage } = selectedImagePairs[roundNumber - 1];
        
        console.log(`Round ${roundNumber}: Real=${realImage.title || realImage.file_name}, Fake=${fakeImage.title || fakeImage.file_name} (Category: ${realImage.category})`);
        
        const deadLine = Date.now() + roundDuration;
        
        rounds.push({
          room_id: roomId,
          round_number: roundNumber,
          started_at: roundNumber === 1 ? new Date().toISOString() : null, // Only round 1 starts immediately
          real_image_url: realImage.file_path as string,
          fake_image_url: fakeImage.file_path as string,
          deadline_at: roundNumber === 1 ? new Date(deadLine).toISOString() : null, // Only round 1 has deadline initially
        });
      }
      
      // Insert all rounds at once
      const { error: roundsError } = await supabase
        .from("game_rounds")
        .insert(rounds);

      if (roundsError) {
        console.error("Error creating round records:", roundsError);
        throw new Error(`Failed to create rounds: ${roundsError.message}`);
      }
      
      console.log("Successfully created all 6 rounds with pre-selected images");
    } catch (roundCreationError) {
      console.error("Error creating rounds with images:", roundCreationError);
      return NextResponse.json({
        success: false,
        error: "Failed to initialize rounds with images: " + 
          (roundCreationError instanceof Error ? roundCreationError.message : String(roundCreationError))
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
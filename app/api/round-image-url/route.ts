import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Get URL parameters
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key'); //game room Id

    //console.log("this is the key", key);
    
    // Validate parameters
    if (!key) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing key parameter" 
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
    
    // Fetch the impostor id from current game
    const {data: gameData, error: gameError} = await supabase
      .from('game_rooms')
      .select('impostor_id')
      .eq('id', key)
      .single();
    
    console.log("game data: ", gameData);
      
    // Check if fetch was successful
    if(gameError || !gameData){
      return NextResponse.json({
        success: false,
        error: "Failed to fetch game data or game not found"
      }, {status: 404});
    }

    // Determine if the current user is the impostor in the current room
    const isImpostor = user.id === gameData.impostor_id;

    // Fetch all categories first
    const { data: categories, error: categoryError } = await supabase
      .from('image_titles')
      .select('category')
      .not('file_path', 'is', null)
      .not('file_name', 'is', null)
      .not('title', 'is', null);
      
    if (categoryError || !categories || categories.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Failed to fetch image categories or no images available"
      }, {status: 404});
    }
    
    // Get unique categories
    const uniqueCategories = Array.from(new Set(categories.map(item => item.category)));
    
    if (uniqueCategories.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No image categories available"
      }, {status: 404});
    }
    
    // Pick a random category
    const randomCategory = uniqueCategories[Math.floor(Math.random() * uniqueCategories.length)];
    
    // Fetch images from this category
    const { data: categoryImages, error: imagesError } = await supabase
      .from('image_titles')
      .select('id, file_path, title, file_name, category')
      .eq('category', randomCategory)
      .not('file_path', 'is', null)
      .not('file_name', 'is', null)
      .not('title', 'is', null);
    
    if (imagesError || !categoryImages || categoryImages.length < 2) {
      return NextResponse.json({
        success: false,
        error: `Not enough images available in the selected category: ${randomCategory}`
      }, {status: 404});
    }
    
    // Shuffle the array of category images
    const shuffledImages = [...categoryImages].sort(() => Math.random() - 0.5);
    
    // Select two different images from the same category
    const realImage = shuffledImages[0];
    const fakeImage = shuffledImages[1];
    
    // Determine which image to show based on player role
    const selectedImage = isImpostor ? fakeImage : realImage;
    
    // Store the selected images in the game_rounds table for this round
    const { data: currentRound, error: roundError } = await supabase
      .from('game_rooms')
      .select('current_round')
      .eq('id', key)
      .single();
      
    if (!roundError && currentRound && currentRound.current_round) {
      const roundNumber = currentRound.current_round;
      
      // Check if a round record already exists
      const { data: existingRound, error: checkError } = await supabase
        .from('game_rounds')
        .select('id')
        .eq('room_id', key)
        .eq('round_number', roundNumber)
        .single();
        
      if (!checkError && existingRound) {
        // Update existing round with the real and fake image URLs
        await supabase
          .from('game_rounds')
          .update({ 
            real_image_url: realImage.file_path || '',
            fake_image_url: fakeImage.file_path || ''
          })
          .eq('id', existingRound.id);
      } else {
        // Insert new round record
        await supabase
          .from('game_rounds')
          .insert([{
            room_id: key,
            round_number: roundNumber,
            real_image_url: realImage.file_path || '',
            fake_image_url: fakeImage.file_path || ''
          }]);
      }
    }
    
    // Return the URL for the selected image based on player role
    return NextResponse.json({
      url: selectedImage.file_path,
      title: selectedImage.title,
      file_name: selectedImage.file_name,
      category: selectedImage.category
    });
    
  } catch (error) {
    console.error("Error in round-image-url endpoint:", error);
    return NextResponse.json({
      success: false,
      error: "Server error processing image URL"
    }, { status: 500 });
  }
} 
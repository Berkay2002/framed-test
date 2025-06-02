import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: "Authentication required"
      }, { status: 401 });
    }

    // Check if images already exist
    const { data: existingImages, error: checkError } = await supabase
      .from('image_titles')
      .select('id')
      .limit(1);

    if (checkError) {
      console.error("Error checking existing images:", checkError);
      return NextResponse.json({
        success: false,
        error: "Failed to check existing images"
      }, { status: 500 });
    }

    if (existingImages && existingImages.length > 0) {
      return NextResponse.json({
        success: true,
        message: "Images already exist in database",
        count: existingImages.length
      });
    }

    // Sample image data
    const sampleImages = [
      // Animals category
      { category: 'Animals', title: 'Cute Cat', file_name: 'cat1.jpg', file_path: 'https://picsum.photos/500/500?random=1' },
      { category: 'Animals', title: 'Happy Dog', file_name: 'dog1.jpg', file_path: 'https://picsum.photos/500/500?random=2' },
      { category: 'Animals', title: 'Wild Lion', file_name: 'lion1.jpg', file_path: 'https://picsum.photos/500/500?random=3' },
      { category: 'Animals', title: 'Funny Monkey', file_name: 'monkey1.jpg', file_path: 'https://picsum.photos/500/500?random=4' },
      { category: 'Animals', title: 'Colorful Bird', file_name: 'bird1.jpg', file_path: 'https://picsum.photos/500/500?random=5' },

      // Nature category
      { category: 'Nature', title: 'Beautiful Sunset', file_name: 'sunset1.jpg', file_path: 'https://picsum.photos/500/500?random=6' },
      { category: 'Nature', title: 'Mountain View', file_name: 'mountain1.jpg', file_path: 'https://picsum.photos/500/500?random=7' },
      { category: 'Nature', title: 'Ocean Waves', file_name: 'ocean1.jpg', file_path: 'https://picsum.photos/500/500?random=8' },
      { category: 'Nature', title: 'Forest Path', file_name: 'forest1.jpg', file_path: 'https://picsum.photos/500/500?random=9' },
      { category: 'Nature', title: 'Desert Landscape', file_name: 'desert1.jpg', file_path: 'https://picsum.photos/500/500?random=10' },

      // Food category
      { category: 'Food', title: 'Delicious Pizza', file_name: 'pizza1.jpg', file_path: 'https://picsum.photos/500/500?random=11' },
      { category: 'Food', title: 'Fresh Salad', file_name: 'salad1.jpg', file_path: 'https://picsum.photos/500/500?random=12' },
      { category: 'Food', title: 'Chocolate Cake', file_name: 'cake1.jpg', file_path: 'https://picsum.photos/500/500?random=13' },
      { category: 'Food', title: 'Grilled Burger', file_name: 'burger1.jpg', file_path: 'https://picsum.photos/500/500?random=14' },
      { category: 'Food', title: 'Ice Cream Sundae', file_name: 'icecream1.jpg', file_path: 'https://picsum.photos/500/500?random=15' },

      // Technology category
      { category: 'Technology', title: 'Modern Laptop', file_name: 'laptop1.jpg', file_path: 'https://picsum.photos/500/500?random=16' },
      { category: 'Technology', title: 'Smartphone', file_name: 'phone1.jpg', file_path: 'https://picsum.photos/500/500?random=17' },
      { category: 'Technology', title: 'Gaming Console', file_name: 'console1.jpg', file_path: 'https://picsum.photos/500/500?random=18' },
      { category: 'Technology', title: 'Robot Assistant', file_name: 'robot1.jpg', file_path: 'https://picsum.photos/500/500?random=19' },
      { category: 'Technology', title: 'Virtual Reality', file_name: 'vr1.jpg', file_path: 'https://picsum.photos/500/500?random=20' },

      // Sports category
      { category: 'Sports', title: 'Soccer Ball', file_name: 'soccer1.jpg', file_path: 'https://picsum.photos/500/500?random=21' },
      { category: 'Sports', title: 'Basketball Game', file_name: 'basketball1.jpg', file_path: 'https://picsum.photos/500/500?random=22' },
      { category: 'Sports', title: 'Tennis Match', file_name: 'tennis1.jpg', file_path: 'https://picsum.photos/500/500?random=23' },
      { category: 'Sports', title: 'Swimming Pool', file_name: 'swimming1.jpg', file_path: 'https://picsum.photos/500/500?random=24' },
      { category: 'Sports', title: 'Mountain Climbing', file_name: 'climbing1.jpg', file_path: 'https://picsum.photos/500/500?random=25' },

      // Art category
      { category: 'Art', title: 'Abstract Painting', file_name: 'abstract1.jpg', file_path: 'https://picsum.photos/500/500?random=26' },
      { category: 'Art', title: 'Classical Sculpture', file_name: 'sculpture1.jpg', file_path: 'https://picsum.photos/500/500?random=27' },
      { category: 'Art', title: 'Street Graffiti', file_name: 'graffiti1.jpg', file_path: 'https://picsum.photos/500/500?random=28' },
      { category: 'Art', title: 'Digital Art', file_name: 'digital1.jpg', file_path: 'https://picsum.photos/500/500?random=29' },
      { category: 'Art', title: 'Photography', file_name: 'photo1.jpg', file_path: 'https://picsum.photos/500/500?random=30' },
    ];

    // Insert the sample images
    const { data: insertedImages, error: insertError } = await supabase
      .from('image_titles')
      .insert(sampleImages)
      .select();

    if (insertError) {
      console.error("Error inserting sample images:", insertError);
      return NextResponse.json({
        success: false,
        error: "Failed to insert sample images",
        details: insertError.message
      }, { status: 500 });
    }

    console.log(`Successfully inserted ${insertedImages?.length || 0} sample images`);

    return NextResponse.json({
      success: true,
      message: "Sample images populated successfully",
      count: insertedImages?.length || 0,
      categories: Array.from(new Set(sampleImages.map(img => img.category)))
    });

  } catch (error) {
    console.error("Error in populate-images API:", error);
    return NextResponse.json({
      success: false,
      error: "Server error populating images",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
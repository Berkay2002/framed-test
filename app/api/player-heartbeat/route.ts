import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "@/utils/supabase/types";

export async function POST(req: NextRequest) {
  try {
    const { playerId, userId } = await req.json();
    
    // Validate inputs
    if (!playerId) {
      return NextResponse.json({
        error: 'Player ID is required'
      }, { status: 400 });
    }
    
    if (!userId) {
      return NextResponse.json({
        error: 'User ID is required'
      }, { status: 400 });
    }
    
    // Create Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    
    // Validate environment variables
    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing environment variables:", {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey
      });
      return NextResponse.json({
        error: 'Server configuration error'
      }, { status: 500 });
    }
    
    const supabase = createClient<Database>(supabaseUrl, supabaseKey);
    
    // Update the player's last_seen timestamp and ensure online status
    // Also verify the player belongs to the user with eq('user_id', userId)
    const { data, error } = await supabase
      .from("game_players")
      .update({
        is_online: true,
        last_seen: new Date().toISOString() // Use ISO string format for timestamps
      })
      .eq("id", playerId)
      .eq("user_id", userId) // Security check: ensure player belongs to user
      .select()
      .single();
      
    if (error) {
      return NextResponse.json({
        error: 'Failed to update player status'
      }, { status: 500 });
    }
    
    if (!data) {
      return NextResponse.json({
        error: 'Player not found or does not belong to user'
      }, { status: 404 });
    }
    
    // Return success response with updated player
    return NextResponse.json({
      success: true,
      player: data
    });
    
  } catch (error: unknown) {
    console.error("Heartbeat error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }, { status: 500 });
  }
} 
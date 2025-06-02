import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  }

  const { roundId, playerId, captionText } = payload;

  if (!roundId || !playerId || typeof captionText !== 'string' || captionText.trim() === '') {
    return NextResponse.json({ error: 'Missing required fields: roundId, playerId, and captionText are required.' }, { status: 400 });
  }

  if (captionText.length > 300) { // Same limit as DB check constraint
      return NextResponse.json({ error: 'Caption is too long (max 300 characters).' }, { status: 400 });
  }

  try {
    // Verify that the playerId belongs to the authenticated user
    const { data: gamePlayer, error: playerError } = await supabase
      .from('game_players')
      .select('id, user_id, room_id')
      .eq('id', playerId)
      .eq('user_id', user.id)
      .single();

    if (playerError || !gamePlayer) {
      console.error('Player verification error:', playerError);
      return NextResponse.json({ error: 'Forbidden: Player ID does not match authenticated user or player not found.' }, { status: 403 });
    }

    // Check round deadline
    const { data: roundData, error: roundError } = await supabase
      .from('game_rounds')
      .select('deadline_at, room_id')
      .eq('id', roundId)
      .single();

    if (roundError || !roundData) {
      console.error('Round fetch error:', roundError);
      return NextResponse.json({ error: 'Round not found.' }, { status: 404 });
    }
    
    // Ensure the player is part of the room this round belongs to
    if (gamePlayer.room_id !== roundData.room_id) {
        return NextResponse.json({ error: 'Forbidden: Player not part of the round\'s game room.' }, { status: 403 });
    }

    if (roundData.deadline_at && new Date(roundData.deadline_at) < new Date()) {
      return NextResponse.json({ error: 'Too late to submit caption for this round.' }, { status: 409 }); // 409 Conflict
    }

    // Insert the caption
    const { data: newCaption, error: insertError } = await supabase
      .from('player_captions')
      .insert({
        round_id: roundId,
        player_id: playerId,
        caption: captionText,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Caption insert error:', insertError);
      if (insertError.code === '23505') { // Unique violation (already submitted)
        return NextResponse.json({ error: 'Caption already submitted for this round.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to submit caption.', details: insertError.message }, { status: 500 });
    }

    return NextResponse.json(newCaption, { status: 201 });

  } catch (error: any) {
    console.error('Unexpected error in caption-submit:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.', details: error.message }, { status: 500 });
  }
}
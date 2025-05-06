-- Fix RLS policies for game_rooms and game_players
-- This migration ensures proper permissions for authenticated users

-- For game_rooms table
-- 1. Make sure RLS is enabled
ALTER TABLE IF EXISTS public.game_rooms ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist
DROP POLICY IF EXISTS "anyone_insert_game_rooms" ON public.game_rooms;
DROP POLICY IF EXISTS "Host can delete their game room" ON public.game_rooms;
DROP POLICY IF EXISTS "Only host can update their game room" ON public.game_rooms;
DROP POLICY IF EXISTS "Anyone can view active game rooms" ON public.game_rooms;

-- 3. Create new policies with proper conditions
-- Allow any authenticated user to view game rooms
CREATE POLICY "Anyone can view active game rooms" 
ON public.game_rooms FOR SELECT 
USING (true);

-- Allow any authenticated user to create rooms (as themselves)
CREATE POLICY "Authenticated users can create game rooms" 
ON public.game_rooms FOR INSERT 
WITH CHECK (auth.uid() = host_id);

-- Allow host to update their own room
CREATE POLICY "Only host can update their game room" 
ON public.game_rooms FOR UPDATE 
USING (auth.uid() = host_id);

-- Allow host to delete their own room
CREATE POLICY "Host can delete their game room" 
ON public.game_rooms FOR DELETE 
USING (auth.uid() = host_id);

-- For game_players table
-- 1. Make sure RLS is enabled
ALTER TABLE IF EXISTS public.game_players ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view players" ON public.game_players;
DROP POLICY IF EXISTS "Users can insert themselves as players" ON public.game_players;
DROP POLICY IF EXISTS "Users can update their own player records" ON public.game_players;
DROP POLICY IF EXISTS "Users can delete their own player records" ON public.game_players;

-- 3. Create new policies with proper conditions
-- Anyone can view players
CREATE POLICY "Anyone can view players" 
ON public.game_players FOR SELECT 
USING (true);

-- Users can only insert themselves as players (user_id must match auth.uid)
CREATE POLICY "Users can insert themselves as players" 
ON public.game_players FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update only their own player records
CREATE POLICY "Users can update their own player records" 
ON public.game_players FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can delete only their own player records
CREATE POLICY "Users can delete their own player records" 
ON public.game_players FOR DELETE 
USING (auth.uid() = user_id);

-- For game_rounds table
ALTER TABLE IF EXISTS public.game_rounds ENABLE ROW LEVEL SECURITY;

-- Anyone can view rounds
CREATE POLICY "Anyone can view game rounds" 
ON public.game_rounds FOR SELECT 
USING (true);

-- Host of the room can create rounds
CREATE POLICY "Hosts can create game rounds" 
ON public.game_rounds FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.game_rooms
    WHERE id = public.game_rounds.room_id
    AND host_id = auth.uid()
  )
);

-- For player_captions and player_votes, similar approach
ALTER TABLE IF EXISTS public.player_captions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.player_votes ENABLE ROW LEVEL SECURITY;

-- Captions can be viewed by anyone
CREATE POLICY "Anyone can view captions" 
ON public.player_captions FOR SELECT 
USING (true);

-- Players can only create captions for themselves
CREATE POLICY "Players can create their own captions" 
ON public.player_captions FOR INSERT 
WITH CHECK (auth.uid() = (
  SELECT user_id FROM public.game_players
  WHERE id = public.player_captions.player_id
));

-- Votes can be viewed by anyone
CREATE POLICY "Anyone can view votes" 
ON public.player_votes FOR SELECT 
USING (true);

-- Players can only create votes for themselves
CREATE POLICY "Players can create their own votes" 
ON public.player_votes FOR INSERT 
WITH CHECK (auth.uid() = voter_id); 
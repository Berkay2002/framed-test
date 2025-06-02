-- Enable RLS on realtime.messages table (if not already enabled)
-- This table is managed by Supabase but we can add RLS policies to it
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to read broadcast messages 
-- only from rooms they are actually players in
CREATE POLICY "authenticated_can_read_room_broadcasts"
ON "realtime"."messages"
FOR SELECT
TO authenticated
USING (
  -- Only allow reading messages from channels where user is an active player
  EXISTS (
    SELECT 1
    FROM public.game_players gp
    JOIN public.game_rooms gr ON gp.room_id = gr.id
    WHERE 
      gp.user_id = auth.uid() AND
      gp.is_online = true AND
      -- Match the channel name format: roomId-lobby or roomId-round-X
      (
        (SELECT realtime.topic()) = CONCAT(gr.id, '-lobby') OR
        (SELECT realtime.topic()) LIKE CONCAT(gr.id, '-round-%')
      ) AND
      -- Only allow broadcast messages (not presence or other types)
      realtime.messages.extension = 'broadcast'
  )
);

-- Policy to allow authenticated users to send broadcast messages
-- only to rooms they are actually players in
CREATE POLICY "authenticated_can_send_room_broadcasts"
ON "realtime"."messages"
FOR INSERT
TO authenticated
WITH CHECK (
  -- Only allow sending messages to channels where user is an active player
  EXISTS (
    SELECT 1
    FROM public.game_players gp
    JOIN public.game_rooms gr ON gp.room_id = gr.id
    WHERE 
      gp.user_id = auth.uid() AND
      gp.is_online = true AND
      -- Match the channel name format: roomId-lobby or roomId-round-X
      (
        (SELECT realtime.topic()) = CONCAT(gr.id, '-lobby') OR
        (SELECT realtime.topic()) LIKE CONCAT(gr.id, '-round-%')
      ) AND
      -- Only allow broadcast messages
      realtime.messages.extension = 'broadcast'
  )
);

-- Optional: Policy for presence messages (if you want to track who's online in chat)
CREATE POLICY "authenticated_can_read_room_presence"
ON "realtime"."messages"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.game_players gp
    JOIN public.game_rooms gr ON gp.room_id = gr.id
    WHERE 
      gp.user_id = auth.uid() AND
      gp.is_online = true AND
      (
        (SELECT realtime.topic()) = CONCAT(gr.id, '-lobby') OR
        (SELECT realtime.topic()) LIKE CONCAT(gr.id, '-round-%')
      ) AND
      realtime.messages.extension = 'presence'
  )
);

CREATE POLICY "authenticated_can_send_room_presence"
ON "realtime"."messages"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.game_players gp
    JOIN public.game_rooms gr ON gp.room_id = gr.id
    WHERE 
      gp.user_id = auth.uid() AND
      gp.is_online = true AND
      (
        (SELECT realtime.topic()) = CONCAT(gr.id, '-lobby') OR
        (SELECT realtime.topic()) LIKE CONCAT(gr.id, '-round-%')
      ) AND
      realtime.messages.extension = 'presence'
  )
); 
# Game Chat System

This document explains the game chat system implementation and how it works with different chat channels using Supabase's broadcasting system.

## Broadcasting Architecture

The chat system uses Supabase's real-time broadcasting feature instead of a database table. This provides:

- **Real-time messaging**: Instant message delivery without database overhead
- **Temporary storage**: Messages are stored in memory during the session
- **Reduced database load**: No persistent storage of chat messages
- **Better performance**: Direct peer-to-peer communication through Supabase channels

### Broadcasting Channels

Messages are sent through dedicated broadcast channels:

```typescript
// Main chat channel for a room
const chatChannel = supabase.channel(`room-${roomId}-chat`);

// Host action notifications
const hostChannel = supabase.channel(`room-${roomId}-host-actions`);
```

## Chat Channels

### Lobby Channel

- General room chat that persists during the session
- Available in both lobby and game views
- Used for general communication between players
- Messages are stored in local memory during the session

### Round Channel

- Round-specific chat for the current round
- Only available during active gameplay
- Focused on discussion related to the current round
- Automatically cleared when a new round starts

### Private Channel (Future Implementation)

- Reserved for future implementation
- Will allow private messaging between players
- Infrastructure is in place but UI not yet implemented

## Implementation

### ChatService

The `ChatService` class in `lib/chat-service.ts` provides the core functionality:

- `sendMessage`: Send user messages via broadcasting
- `sendSystemMessage`: Send automated system messages via broadcasting
- `getRoomMessages`: Retrieve messages from local memory
- `subscribeToRoomMessages`: Subscribe to broadcast messages
- `clearRoundMessages`: Clear round-specific messages from memory

### Message Structure

```typescript
export type ChatMessage = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  channel: ChatChannel;
  is_system: boolean;
  round_number?: number | null;
  created_at: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  game_alias?: string | null;
};
```

### ChatPanel Component

The `ChatPanel` component in `components/game/ChatPanel.tsx` handles the UI:

- Displays messages from different channels
- Provides channel tabs when multiple channels are available
- Formats messages with user avatars and timestamps
- Automatically scrolls to latest messages
- Subscribes to broadcast messages for real-time updates

## Usage

### In Lobby View

In the lobby, only the lobby channel is available:

```tsx
<ChatPanel 
  roomId={currentRoom.id} 
  channel="lobby"
  maxHeight="500px"
/>
```

### In Game View

During gameplay, both lobby and round channels are available with tabs:

```tsx
<ChatPanel 
  roomId={currentRoom.id}
  showChannelTabs={true}
  roundNumber={currentRoom.current_round || undefined}
  maxHeight="600px"
/>
```

## System Events

The system automatically generates broadcast messages for important game events:

- Host actions (skip timer, skip voting)
- Round transitions
- Game status changes

### Host Actions Broadcasting

Host actions are broadcast through dedicated channels:

```typescript
// Skip timer notification
const skipTimerChannel = supabase.channel(`room-${roomId}-skip-timer`);
await skipTimerChannel.send({
  type: 'broadcast',
  event: 'host_action',
  payload: {
    action: 'skip_timer',
    message: 'Host skipped the timer! Moving to voting phase.',
    timestamp: new Date().toISOString(),
    round_number: currentRound
  }
});
```

## Broadcasting vs Database

### Advantages of Broadcasting:

- **Real-time**: Instant message delivery
- **Performance**: No database writes for chat messages
- **Scalability**: Better for high-frequency messaging
- **Simplicity**: No complex database queries or RLS policies

### Trade-offs:

- **Persistence**: Messages are not stored permanently
- **History**: Limited to session-based message history
- **Reliability**: Messages may be lost if connection drops

## Security

Security is handled through:

- **Channel naming**: Room-specific channels prevent cross-room message leakage
- **User authentication**: Only authenticated users can send messages
- **Profile verification**: User profiles are fetched from the database for message attribution

## Future Enhancements

- Implement private messaging between players using dedicated broadcast channels
- Add message reactions/emojis through broadcast events
- Optional message persistence for important game events
- Reconnection handling for dropped connections
- Message history recovery for rejoining players 
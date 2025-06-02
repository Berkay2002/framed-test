import { RealtimeChat } from '@/components/realtime-chat';
import type { GameContextType } from "@/lib/game-types";
import { cn } from "@/lib/utils";

// Import useGame safely with a fallback mechanism
let useGame: () => Pick<GameContextType, 'userId' | 'currentRoom' | 'players' | 'playerId'>;
try {
  // Try to import the useGame hook
  useGame = require('@/lib/game-context').useGame;
} catch (error) {
  // Provide a fallback if the hook is not available
  console.warn('useGame hook not available, using fallback');
  useGame = () => ({ userId: null, currentRoom: null, players: [], playerId: null });
}

interface ChatPanelProps {
  roomId: string;
  channel?: 'lobby' | 'round';
  roundNumber?: number;
  className?: string;
  maxHeight?: string;
  minHeight?: string;
  showChannelTabs?: boolean;
}

export function ChatPanel({ 
  roomId, 
  channel = 'lobby',
  roundNumber, 
  className = '', 
  maxHeight = '500px',
  minHeight = '200px',
  showChannelTabs = false
}: ChatPanelProps) {
  const { userId, players, playerId } = useGame();
  
  // Generate a unique room name incorporating the roomId and channel
  const uniqueRoomName = `${roomId}-${channel}${roundNumber ? `-round-${roundNumber}` : ''}`;
  
  // Find the current player from the players array using playerId
  const currentPlayer = players.find(player => player.id === playerId);
  
  // Use the player's game_alias if available, otherwise fallback to a generated username
  const username = currentPlayer?.game_alias || (userId ? `User-${userId.substring(0, 4)}` : 'Anonymous');

  // Determine if we're in GameView or LobbyView
  const isGameView = channel === 'round';

  return (
    
    <div className={cn("flex flex-col h-full", className)} style={{ 
      width: isGameView ? "30%" : undefined,
      height: '100%'
    }}>
      <div 
        className="rounded-md border border-border bg-card overflow-hidden flex flex-col shadow-sm h-full"
        style={{ 
          maxHeight: maxHeight,
          minHeight: minHeight,
        }}
      >
        <div className="bg-muted/10 dark:bg-muted/30 px-4 py-2 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-medium">
            {channel === 'lobby' ? 'Lobby Chat' : `Round Chat - Round ${roundNumber || '?'}`}
          </h3>
        </div>
        
        <div className="flex-1 overflow-hidden min-h-0">
          <RealtimeChat
            roomName={uniqueRoomName}
            username={username}
          />
        </div>
      </div>
    </div>
  );
} 
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardCopy, LogOutIcon, Settings, PlayIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GameRoom } from "@/lib/game-service";
import { useButtonDebounce } from "@/hooks/useButtonDebounce";
import { createClient } from '@/utils/supabase/client';

interface RoomHeaderProps {
  currentRoom: GameRoom;
  players: any[];
  isGameInProgress: boolean;
  currentRound?: number;
  isHost?: boolean;
  onStartGame?: () => Promise<void>;
  onLeaveRoom?: () => Promise<{ canceled?: boolean; error?: boolean } | unknown>;
}

export default function RoomHeader({ 
  currentRoom, 
  players, 
  isGameInProgress,
  currentRound,
  isHost,
  onStartGame,
  onLeaveRoom
}: RoomHeaderProps) {
  // Use debounce hook for starting the game
  const { isLoading: isStartingGame, handleAction: handleStartGame } = 
    useButtonDebounce(
      async () => onStartGame && await onStartGame(),
      { 
        //loadingMessage: "Starting game...",
        //successMessage: "Game started successfully!"
      }
    );
  
  // Use debounce hook for leaving the room, with improved error handling
  const { isLoading: isLeavingRoom, handleAction: handleLeaveRoom } = 
    useButtonDebounce(
      async () => {
        try {
          if (onLeaveRoom) {
            const result = await onLeaveRoom();
            // Check if the operation was canceled - don't show success message if canceled
            if (result && typeof result === 'object' && 'canceled' in result && result.canceled) {
              console.log("Leave room operation canceled by user");
              return false;
            }
          }
          return true;
        } catch (error) {
          console.error("Error in leave room handler:", error);
          toast.error("There was an error leaving the room, but we'll try to redirect you anyway");
          return false;
        }
      },
      {
        //loadingMessage: "Leaving room..."
      }
    );
  
  // Handle room deletion (host only)
  const { isLoading: isDeletingRoom, handleAction: handleDeleteRoom } = 
    useButtonDebounce(
      async () => {
        if (!isHost || isGameInProgress) {
          toast.error("Only the host can delete a room, and only before the game starts");
          return false;
        }
        
        // Confirm deletion
        if (!confirm("Are you sure you want to delete this room? This action cannot be undone.")) {
          return false;
        }
        
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session) {
            toast.error("You must be logged in to delete a room");
            return false;
          }
          
          // Call the delete-room API
          const response = await fetch('/api/delete-room', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              roomId: currentRoom.id,
              hostId: session.user.id
            })
          });
          
          const result = await response.json();
          
          if (result.success) {
            toast.success("Room deleted successfully");
            // Redirect to game hub
            window.location.href = '/game-hub';
            return true;
          } else {
            toast.error(result.message || "Failed to delete room");
            return false;
          }
        } catch (error) {
          console.error("Error deleting room:", error);
          toast.error("An error occurred while deleting the room");
          return false;
        }
      },
      {
        //loadingMessage: "Deleting room..."
      }
    );

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(currentRoom.code);
    toast.success("Room code copied to clipboard!");
  };

  return (
    <Card className="mb-8 bg-[#3a2d52] border-none shadow-md">
      <div className="flex flex-col p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-white">Game Room</h1>
          
          <div className="flex items-center gap-3">
            {!isGameInProgress && isHost && (
              <Button 
                onClick={handleStartGame}
                disabled={isStartingGame || !Array.isArray(players) || players.length < 1}
                className="bg-[#4CAF50] hover:bg-[#45a049] text-white flex items-center gap-2"
              >
                {isStartingGame ? (
                  <>
                    <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-4 w-4" />
                    <span>Start Game</span>
                  </>
                )}
              </Button>
            )}
            
            {!isGameInProgress && isHost && (
              <Button 
                variant="outline"
                onClick={handleDeleteRoom}
                disabled={isDeletingRoom}
                className="bg-transparent border-gray-600 text-white hover:bg-[#4d3f68] flex items-center gap-2"
              >
                {isDeletingRoom ? (
                  <>
                    <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Delete Room</span>
                  </>
                )}
              </Button>
            )}
            
            <Button 
              variant="outline"
              onClick={() => toast.info("Settings feature coming soon!")}
              className="bg-transparent border-gray-600 text-white hover:bg-[#4d3f68] flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              <span>Game Settings</span>
            </Button>
            
            {onLeaveRoom && (
              <Button
                variant="destructive"
                onClick={handleLeaveRoom}
                disabled={isLeavingRoom}
                className="bg-[#9f3a3a] hover:bg-[#b14444] text-white flex items-center gap-2"
              >
                {isLeavingRoom ? (
                  <>
                    <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                    <span>Leaving...</span>
                  </>
                ) : (
                  <>
                    <LogOutIcon className="h-4 w-4" />
                    <span>Leave Game</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex items-center mb-2">
          <div className="bg-[#2c2241] text-gray-300 px-3 py-1 rounded-full text-sm font-medium">
            {isGameInProgress ? "Game in progress" : "Waiting for players"}
          </div>
          <div className="ml-2 flex items-center text-sm text-gray-300">
            <svg className="w-5 h-5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            {Array.isArray(players) && players.length}/8
          </div>
        </div>
        
        <p className="text-gray-300 mb-4">
          Game will begin when the host starts or when the lobby is full.
        </p>
        
        {!isGameInProgress && (
          <div className="flex items-center mb-4">
            <p className="text-white mr-2">Invite friends with code:</p>
            <span className="bg-[#2c2241] px-3 py-1 rounded font-mono font-medium text-white">
              {currentRoom.code}
            </span>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={handleCopyRoomCode}
              className="ml-1 h-8 w-8 p-0 text-white"
            >
              <ClipboardCopy size={16} />
              <span className="sr-only">Copy code</span>
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
} 
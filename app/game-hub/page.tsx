"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useGame } from '@/lib/game-context';
import { GameService, GameRoom } from '@/lib/game-service';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import { useButtonDebounce } from '@/hooks/useButtonDebounce';
import LoadingView from '@/components/game/LoadingView';

export default function GameHub() {
  const [activeRooms, setActiveRooms] = useState<GameRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { createRoom } = useGame();
  const router = useRouter();
  
  // Use the debounce hook for room creation
  const { isLoading: isCreatingRoom, handleAction: handleCreateRoom } = 
    useButtonDebounce(createRoom, {
      //loadingMessage: "Creating game room...",
      //successMessage: "Game room created successfully!"
    });

  useEffect(() => {
    loadActiveRooms();

    // Set up realtime subscription for game rooms
    const supabase = createClient();
    const subscription = supabase
      .channel('game_hub_rooms')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'game_rooms' }, 
        (payload) => {
          console.log('Game rooms changed:', payload);
          // Reload all rooms when any room changes
          loadActiveRooms();
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'game_players' },
        (payload) => {
          console.log('Game players changed:', payload);
          // Reload rooms when player data changes (affects empty room detection)
          loadActiveRooms();
        }
      )
      .subscribe();

    // Set up periodic refresh to catch any stale rooms
    const refreshInterval = setInterval(loadActiveRooms, 15000); // Refresh every 15 seconds
    
    // Set up periodic room heartbeat check (every hour)
    const heartbeatInterval = setInterval(() => {
      GameService.triggerRoomHeartbeat()
        .then(success => {
          if (success) {
            console.log('Room heartbeat check completed successfully');
            // Reload rooms to reflect any changes
            loadActiveRooms();
          } else {
            console.error('Room heartbeat check failed');
          }
        })
        .catch(error => {
          console.error('Error during room heartbeat check:', error);
        });
    }, 60 * 60 * 1000); // Run every hour
    
    // Run a heartbeat check when the page loads to clean up any stale rooms
    GameService.triggerRoomHeartbeat().catch(error => {
      console.error('Initial room heartbeat check failed:', error);
    });
    
    // Refresh rooms when the window gets focus
    const handleFocus = () => {
      console.log('Window focused, refreshing rooms');
      loadActiveRooms();
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      // Clean up subscription when component unmounts
      supabase.removeChannel(subscription);
      clearInterval(refreshInterval);
      clearInterval(heartbeatInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadActiveRooms = async () => {
    // Only set loading to true on initial load, not during realtime updates
    if (isLoading) {
      setIsLoading(true);
    }
    
    try {
      const rooms = await GameService.getActiveRooms();
      setActiveRooms(rooms);
    } catch (error) {
      console.error('Error loading rooms:', error);
      toast.error('Failed to load active rooms');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = (code: string) => {
    router.push(`/game-hub/${code}`);
  };

  // Format date to a readable format like shown in the screenshot
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Get hours and minutes in 12-hour format
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours === 0 ? 12 : hours; // Convert 0 to 12 for 12 AM
    
    return `${month}/${day}/${year}, ${hours}:${minutes} ${ampm}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Game Hub</h1>
          <Button 
            onClick={handleCreateRoom}
            disabled={isCreatingRoom}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isCreatingRoom ? "Creating..." : "Create New Game"}
          </Button>
        </div>

        <h2 className="text-xl font-semibold mb-4 text-foreground">Active Games</h2>

        {isLoading ? (
          <p className="text-muted-foreground">Loading rooms...</p>
        ) : activeRooms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeRooms.map((room) => (
              <div 
                key={room.id} 
                className="bg-card rounded-lg overflow-hidden shadow-md border border-border"
              >
                <div className="p-5">
                  <h3 className="text-xl font-bold mb-1 text-card-foreground">Game Room</h3>
                  <p className="text-muted-foreground mb-1">Code: {room.code}</p>
                  <p className="text-muted-foreground mb-1">Status: {room.status}</p>
                  <p className="text-muted-foreground mb-4">Created: {formatDate(room.created_at)}</p>
                  
                  <Button
                    onClick={() => handleJoinRoom(room.code)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Join Game
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-lg p-6 text-center border border-border">
            <p className="text-muted-foreground mb-4">No active games found.</p>
            <Button 
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isCreatingRoom ? "Creating..." : "Create a Game"}
            </Button>
          </div>
        )}
      </div>
      
      {/* Show overlay loader when creating a room */}
      <OverlayLoader visible={isCreatingRoom} />
    </div>
  );
}

// Loading overlay component to show when creating a room
export function OverlayLoader({visible}: {visible: boolean}) {
  if (!visible) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <LoadingView message="Creating your game room..." timeout={8000} />
    </div>
  );
} 
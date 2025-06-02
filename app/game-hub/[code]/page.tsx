"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { GameService } from "@/lib/game-service";
import LobbyView from "@/components/game/LobbyView";
import GameView from "@/components/game/GameView";
import AnimatedLoading from "@/components/game/AnimatedLoading";
import { createClient } from '@/utils/supabase/client';

// Dynamically import the useGame hook to fix module import errors
import type { GameContextType } from "@/lib/game-types"; // Create this file if it doesn't exist
const { useGame } = require('@/lib/game-context') as { useGame: () => GameContextType };

export default function GameRoom() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const { 
    currentRoom, 
    players, 
    isHost, 
    error, 
    joinRoom, 
    startGame, 
    leaveRoom,
    playerId,
    userId,
    currentRound
  } = useGame();

  // First, validate session before attempting to join
  useEffect(() => {
    const validateSession = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();
      
      if (error || !data.session) {
        console.log("Session invalid, redirecting to sign-in");
        // Store the current room code to redirect back after login
        sessionStorage.setItem('returnToRoom', code);
        router.push(`/sign-in?message=Please sign in to rejoin room ${code}`);
        return;
      }
      
      // Session is valid
      setSessionChecked(true);
    };
    
    validateSession();
  }, [code, router]);

  // Handle room joining and cleanup - only after session is validated
  useEffect(() => {
    if (!sessionChecked) return;
    
    let isJoiningRoom = false;
    let mounted = true;
    
    const joinRoomIfNeeded = async () => {
      if (isJoiningRoom || !mounted) return;
      isJoiningRoom = true;
      
      try {
        if (currentRoom?.code === code) {
          console.log(`Already in room ${code}, no need to join again`);
          isJoiningRoom = false;
          return;
        }
        
        if (!currentRoom && code) {
          // Check if we recently created or left this room (to prevent auto-rejoining)
          let justCreatedRoom = false;
          let recentlyLeftRoom = false;
          
          try {
            if (typeof window !== 'undefined') {
              justCreatedRoom = Boolean(localStorage.getItem(`created_room_${code}`));
              recentlyLeftRoom = Boolean(sessionStorage.getItem(`left_room_${code}`));
              
              if (recentlyLeftRoom) {
                console.log(`Recently left room ${code}, not rejoining`);
                sessionStorage.removeItem(`left_room_${code}`);
                //toast.info(`You've left room ${code}`);
                isJoiningRoom = false;
                return;
              }
            }
          } catch (e) {
            console.warn("Could not access storage:", e);
          }
          
          if (justCreatedRoom) {
            console.log(`Room ${code} was just created, not attempting to join again`);
            try {
              if (typeof window !== 'undefined') {
                localStorage.removeItem(`created_room_${code}`);
              }
            } catch (e) {
              console.warn("Could not access localStorage:", e);
            }
            
            if (!currentRoom) {
              try {
                const roomDetails = await GameService.getRoomByCode(code);
                if (!roomDetails) {
                }
              } catch (err) {
                console.error("Error getting room details:", err);
                toast.error("Error fetching room details");
              }
            }
            isJoiningRoom = false;
            return;
          }
          
          try {
            // Add a slight delay to prevent rapid re-joining attempts
            await new Promise(resolve => setTimeout(resolve, 300)); 
            
            if (mounted) {
              const result = await joinRoom(code);
              if (!result) {
                console.log("Join room returned no result");
              }
            }
          } catch (joinError: any) {
            console.error("Error in joinRoom:", joinError);
            toast.error(`Failed to join: ${joinError.message || "Unknown error"}`);
          }
        }
      } catch (err:any) {
        console.error("Error joining room:", err);
        if (mounted) {
          toast.error(`Could not join room: ${err.message || "Unknown error"}`);
        }
      } finally {
        isJoiningRoom = false;
      }
    };
    
    joinRoomIfNeeded();
    
    return () => {
      mounted = false;
    };
  }, [code, currentRoom, joinRoom, sessionChecked]);

  // Handle user leaving the page - use both beforeunload and visibilitychange
  useEffect(() => {
    const handleUnload = () => {
      if (playerId && userId) {
        try {
          // Using navigator.sendBeacon for more reliable cleanup during page unload
          const data = JSON.stringify({ playerId, userId });
          navigator.sendBeacon('/api/leave-room', data);
        } catch (e) {
          console.error("Failed to send beacon:", e);
        }
      }
    };
    
    // Handle page visibility changes (tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Rejoin if needed when tab becomes visible again
        if (currentRoom && code && playerId) {
          // Update player's online status
          const supabase = createClient();
          (async () => {
            try {
              await supabase.from("game_players")
                .update({ is_online: true, last_seen: new Date().toISOString() })
                .eq("id", playerId);
              console.log("Updated player online status on visibility change");
            } catch (error) {
              console.error("Failed to update player status:", error);
            }
          })();
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [playerId, userId, currentRoom, code]);

  // Show error if there is one
  if (error) {
    toast.error(error);
  }

  // If loading for a long time, check if we can force a reload to refresh state
  useEffect(() => {
    if (isLoading) {
      // Set a timeout to handle potential stuck loading states
      const timer = setTimeout(() => {
        // If still loading after 5 seconds, provide more detailed feedback
        if (currentRoom?.status === 'in_progress') {
          console.log('Loading in-progress game taking too long...');
          // Instead of forcing a refresh, try to reuse existing data
          if (currentRoom && players.length > 0) {
            toast.info("Game data loaded with what we have");
            setIsLoading(false);
          } else {
            toast.error("Unable to load complete game data");
          }
        } else if (!currentRoom) {
          console.log('Room loading timeout reached, still no room data');
          toast.error("Unable to load game room data. Please try again.");
        }
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, currentRoom?.status, currentRoom, players.length]);

  // Listen for refresh events from LoadingView
  useEffect(() => {
    const handleRefreshRequest = () => {
      // Just trigger a data refresh without full page reload
      if (currentRoom) {
        console.log('Refresh requested, updating room data');
        // This will trigger data updates via subscriptions
      }
    };
    
    const handleCacheCleared = () => {
      console.log('Cache cleared, reloading data');
      // Trigger a more thorough refresh without full page reload
      if (currentRoom) {
        // Re-join the room to refresh all data
        joinRoom(code).catch(err => {
          console.error('Error rejoining room after cache clear:', err);
        });
      }
    };
    
    // Add event listeners
    window.addEventListener('game:refresh-requested', handleRefreshRequest);
    window.addEventListener('game:cache-cleared', handleCacheCleared);
    
    // Clean up
    return () => {
      window.removeEventListener('game:refresh-requested', handleRefreshRequest);
      window.removeEventListener('game:cache-cleared', handleCacheCleared);
    };
  }, [currentRoom, code, joinRoom]);

  // Listen for view change events from GameView
  useEffect(() => {
    const handleViewChangeNeeded = (event: Event) => {
      // Handle view change event from GameView
      const customEvent = event as CustomEvent;
      console.log('View change needed:', customEvent.detail);
      
      // Update current room if needed
      if (customEvent.detail?.newStatus && currentRoom) {
        // Update the room status locally instead of refreshing the whole page
        setIsLoading(false); // Ensure loading state is cleared
      }
    };
    
    // Add event listeners
    window.addEventListener('game:view-change-needed', handleViewChangeNeeded);
    
    // Clean up
    return () => {
      window.removeEventListener('game:view-change-needed', handleViewChangeNeeded);
    };
  }, [currentRoom]);

  // Safety check - if room is not in_progress or is Inactive, we should be in the lobby
  // But ONLY do this if we've successfully loaded data
  useEffect(() => {
    if (!isLoading && currentRoom) {
      if (currentRoom.status !== 'in_progress') {
        console.log(`Room ${currentRoom.id} status issue (status: ${currentRoom.status}), showing lobby view`);
        // No need to refresh - GameView and LobbyView rendering is conditional based on room status
      }
    }
  }, [currentRoom, isLoading]);

  const handleStartGame = async () => {
    try {
      toast.loading("Starting game...");
      
      // Add some context logging to help with debugging
      console.log("Starting game, current state:", {
        roomId: currentRoom?.id,
        roomStatus: currentRoom?.status,
        hostId: currentRoom?.host_id,
        userId: userId,
        isHost: isHost
      });
      
      let startResult;
      try {
        startResult = await startGame();
        toast.dismiss();
      } catch (startError) {
        toast.dismiss();
        const errorMessage = startError instanceof Error ? startError.message : String(startError);
        console.error("Start game function error:", startError);
        toast.error(`Failed to start game: ${errorMessage}`);
        return;
      }
      
      if (startResult === null) {
        console.log("Game start returned no result - might be retrying");
        // Add a slight delay and check if the room state has changed to in_progress
        setTimeout(() => {
          if (currentRoom?.status === 'in_progress') {
          } else {
            toast.error("Game failed to start. Please try again.");
          }
        }, 1500);
        return;
      }
      
      // Validate the result data
      if (!startResult.room) {
        console.error("Start game result missing room data:", startResult);
        toast.error("Failed to start game: incomplete server response");
        return;
      }
      
      // If we're missing round data, log that but still continue (it's a partial success)
      if (!startResult.round) {
        console.warn("Start game result missing round data:", startResult);
      } else {
      }
      
    } catch (error) {
      toast.dismiss();
      const errorMessage = error instanceof Error ? error.message : "Unknown error starting game";
      console.error("Error starting game:", error);
      
      // Include more diagnostic information in error messages
      const additionalInfo = typeof error === 'object' && error !== null
        ? ` (${Object.keys(error).join(', ')})`
        : '';
      
      toast.error(`Failed to start game: ${errorMessage}${additionalInfo}`);
    }
  };

  const handleLeaveRoom = async () => {
    // Prevent multiple rapid leave attempts
    if (isLeavingRoom) return;
    
    setIsLeavingRoom(true);
    
    try {
      // First mark that we've left this room to prevent auto-rejoin
      try {
        sessionStorage.setItem(`left_room_${code}`, 'true');
      } catch (storageError) {
        console.warn("Could not access sessionStorage:", storageError);
      }
      
      // Set the application to show loading state before any API calls
      setIsLoading(true);
      
      // Store the current time to enforce minimum loading display time
      const transitionStartTime = Date.now();
      
      // Disable router navigation temporarily while leaving room
      const originalPush = router.push;
      router.push = () => Promise.resolve(true);
      
      try {
        // Attempt to properly leave the room
        const result = await leaveRoom(true); // Force delete to ensure player can leave
        
        // Check if the user canceled the leave action
        if (result && typeof result === 'object' && 'canceled' in result && result.canceled) {
          console.log("Leave room operation canceled by user");
          setIsLeavingRoom(false);
          setIsLoading(false); // Reset loading state
          
          // Restore router.push
          router.push = originalPush;
          return;
        }
      } finally {
        // Always restore router.push even if there's an error
        router.push = originalPush;
      }
      
      // Calculate how much time has passed since starting the transition
      const elapsedTime = Date.now() - transitionStartTime;
      const remainingTime = Math.max(2000 - elapsedTime, 0);
      
      // Show the loading animation for a minimum of 2 seconds before redirecting
      console.log(`Showing loading animation for ${remainingTime}ms more to complete 2s minimum`);
      
      setTimeout(() => {
        // Now we can navigate using our restored router
        router.push('/game-hub');
      }, remainingTime);
      
    } catch (error) {
      console.error("Error leaving room:", error);
      toast.error("Failed to leave room properly. Redirecting anyway...");
      
      // Reset state to ensure clean exit
      try {
        const supabase = createClient();
        if (playerId) {
          // Try to mark player as offline directly
          await supabase
            .from("game_players")
            .delete() // Change to delete instead of update
            .eq("id", playerId);
            
          console.log("Fallback: Directly deleted player record");
        }
      } catch (fallbackError) {
        console.error("Fallback cleanup failed:", fallbackError);
      }
      
      // Show loading state briefly before redirecting
      setIsLoading(true);
      setTimeout(() => {
        router.push('/game-hub');
      }, 2000);
    }
  };

  // Add additional logging for debugging
  console.log("Game room state:", {
    sessionChecked,
    isLoading,
    currentRoom,
    code,
    playerId,
    players: players.length
  });

  if (!sessionChecked || isLoading || !currentRoom) {
    return (
      <AnimatedLoading 
        animationType="among-us-gif"
        message={
          !sessionChecked 
            ? "Verifying your session..." 
            : !currentRoom 
              ? "Looking for room..." 
              : "Loading game data..."
        } 
        isLoaded={sessionChecked && !isLoading && currentRoom !== null}
        minDisplayTime={2000} // Display for at least 2 seconds
        transitionKey={`room-transition-${code}`} // Use consistent key for transitions
        onTimeout={() => {
          // Handle timeout by trying to continue with partial data if possible
          if (currentRoom) {
            setIsLoading(false);
          } else {
            toast.error(`Could not find room ${code}. Please check the room code or try again later.`);
          }
        }}
      />
    );
  }

  // Only show GameView if the room is specifically in "in_progress" status
  // and has a valid current round
  const isInGameMode = currentRoom.status === "in_progress" && currentRound !== null; 

  if (isInGameMode) {
    return (
      <GameView 
        currentRoom={currentRoom}
        players={players}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  // For any other status (lobby, dormant, completed), show the lobby view
  return (
    <LobbyView 
      currentRoom={currentRoom}
      players={players}
      isHost={isHost}
      playerId={playerId}
      onStartGame={handleStartGame}
      onLeaveRoom={handleLeaveRoom}
    />
  );
} 
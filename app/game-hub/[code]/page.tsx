"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useGame } from "@/lib/game-context";
import { GameService } from "@/lib/game-service";
import LobbyView from "@/components/game/LobbyView";
import GameView from "@/components/game/GameView";
import LoadingView from "@/components/game/LoadingView";
import { createClient } from '@/utils/supabase/client';

export default function GameRoom() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  
  const { 
    currentRoom, 
    players, 
    isHost, 
    isLoading, 
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
                  toast.warning("Room not found or no longer available");
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

  const handleStartGame = async () => {
    try {
      toast.loading("Starting game...");
      const startResult = await startGame();
      toast.dismiss();
      
      if (startResult === null) {
        console.log("Game start returned no result - might be retrying");
        // Add a slight delay and check if the room state has changed to in_progress
        setTimeout(() => {
          if (currentRoom?.status === 'in_progress') {
            toast.success("Game started successfully!");
            // Use router.refresh() instead of forcing a page reload
            router.refresh();
          } else {
            toast.error("Game failed to start. Please try again.");
          }
        }, 1500);
      } else {
        toast.success("Game started successfully!");
      }
    } catch (error) {
      toast.dismiss();
      const errorMessage = error instanceof Error ? error.message : "Unknown error starting game";
      console.error("Error starting game:", errorMessage);
      toast.error(`Failed to start game: ${errorMessage}`);
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
      
      // Attempt to properly leave the room
      const result = await leaveRoom(true); // Force delete to ensure player can leave
      
      // Check if the user canceled the leave action
      if (result && typeof result === 'object' && 'canceled' in result && result.canceled) {
        console.log("Leave room operation canceled by user");
        setIsLeavingRoom(false);
        return;
      }
      
      // Navigate back to game hub
      router.push('/game-hub');
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
      
      // Force redirect even if there was an error
      router.push('/game-hub');
    } finally {
      setIsLeavingRoom(false);
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

  // If loading for a long time, check if we can force a reload to refresh state
  useEffect(() => {
    if (isLoading) {
      // Set a timeout to handle potential stuck loading states
      const timer = setTimeout(() => {
        // If still loading after 5 seconds, provide more detailed feedback
        if (currentRoom?.status === 'in_progress') {
          console.log('Loading in-progress game taking too long, refreshing...');
          router.refresh();
        } else if (!currentRoom) {
          console.log('Room loading timeout reached, still no room data');
          toast.error("Unable to load game room data. Please try again.");
        }
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, currentRoom?.status, currentRoom, router]);

  if (!sessionChecked || isLoading || !currentRoom) {
    return <LoadingView message={
      !sessionChecked 
        ? "Verifying your session..." 
        : !currentRoom 
        ? `Looking for room ${code}...` 
        : "Loading game data..."
    } />;
  }

  const isWaiting = currentRoom.status === "lobby";

  if (!isWaiting) {
    return (
      <GameView 
        currentRoom={currentRoom}
        players={players}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

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
"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { GameService, GameRoom, GamePlayer, GameRound } from './game-service';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useButtonDebounce } from '@/hooks/useButtonDebounce';
import { StartGameResult } from './shared-types';
import dynamic from 'next/dynamic';

// Dynamically import the LeaveRoomConfirmation component to avoid problems with toast in SSR
const LeaveRoomConfirmation = dynamic(
  () => import('@/components/game/LeaveRoomConfirmation'),
  { ssr: false }
);

interface GameContextType {
  // Game state
  currentRoom: GameRoom | null;
  players: GamePlayer[];
  currentRound: GameRound | null;
  isHost: boolean;
  isLoading: boolean;
  error: string | null;
  userId: string | null;
  playerId: string | null;
  
  // Game actions
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<GameRoom | null>;
  startGame: () => Promise<StartGameResult | null>;
  submitCaption: (caption: string) => Promise<void>;
  submitVote: (playerId: string) => Promise<void>;
  leaveRoom: (forceDelete?: boolean) => Promise<unknown>;
}

interface CreateRoomParams {
  name: string;
  host: string;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [currentRound, setCurrentRound] = useState<GameRound | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  
  // Calculate if the current user is the host
  const isHost = !!(currentRoom && userId && currentRoom.host_id === userId);
  
  // Get the current user ID on mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const supabase = createClient();
        
        // First check if we have a session
        const { data: sessionData } = await supabase.auth.getSession();
        
        if (sessionData && sessionData.session) {
          // We have a valid session, get the user
          const { data, error } = await supabase.auth.getUser();
          
          if (error) {
            console.error("Auth error:", error);
            toast.error("Authentication error, please sign in again");
            router.push('/sign-in');
            return;
          }
          
          if (data && data.user) {
            setUserId(data.user.id);
            console.log(`User authenticated with ID: ${data.user.id}`);
            
            // Check if we need to return to a specific room after login
            if (typeof window !== 'undefined') {
              const returnToRoom = sessionStorage.getItem('returnToRoom');
              if (returnToRoom) {
                sessionStorage.removeItem('returnToRoom');
                // Small delay to ensure everything is initialized
                setTimeout(() => {
                  router.push(`/game-hub/${returnToRoom}`);
                }, 100);
              }
            }
          } else {
            // No user found, redirect to sign in
            router.push('/sign-in?message=Please sign in to access the game hub');
          }
        } else {
          // No session found, redirect to sign in
          router.push('/sign-in?message=Please sign in to access the game hub');
        }
      } catch (err) {
        console.error("Failed to get user:", err);
        router.push('/sign-in?message=Authentication error');
      }
    };
    
    getCurrentUser();
    
    // Set up auth state change listener
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`Auth state changed: ${event}`);
        
        if (event === 'SIGNED_IN' && session) {
          setUserId(session.user.id);
          console.log(`User signed in with ID: ${session.user.id}`);
        } else if (event === 'SIGNED_OUT') {
          setUserId(null);
          setPlayerId(null);
          setCurrentRoom(null);
          setPlayers([]);
          
          // If we're in a game room, redirect to sign in
          if (typeof window !== 'undefined' && window.location.pathname.includes('/game-hub/')) {
            router.push('/sign-in?message=You have been signed out');
          }
        }
      }
    );
    
    return () => {
      subscription.unsubscribe();
    };
  }, [router]);
  
  // Room heartbeat effect - send heartbeats while room is active
  useEffect(() => {
    if (currentRoom?.id && isHost) {
      console.log(`Setting up room heartbeat for room ${currentRoom.id}`);
      
      // Send initial heartbeat
      GameService.updateRoomHeartbeat(currentRoom.id);
      
      // Set up heartbeat interval (every 60 seconds)
      const heartbeatInterval = setInterval(() => {
        if (document.visibilityState === 'visible' && currentRoom?.id) {
          console.log(`Sending room heartbeat for ${currentRoom.id}`);
          GameService.updateRoomHeartbeat(currentRoom.id);
        }
      }, 60000); // 1 minute heartbeat
      
      // Clean up interval on unmount or room change
      return () => {
        clearInterval(heartbeatInterval);
      };
    }
  }, [currentRoom?.id, isHost]);
  
  // Clean up stale rooms effect - run a cleanup check when the game hub loads
  useEffect(() => {
    // Only run this cleanup from the game hub page
    if (typeof window !== 'undefined' && window.location.pathname === '/game-hub') {
      // Run cleanup operation for rooms with stale heartbeats (inactive for 5+ minutes)
      GameService.cleanupStaleHeartbeats(5)
        .then(count => {
          if (count > 0) {
            console.log(`Cleaned up ${count} rooms with stale heartbeats`);
          }
        })
        .catch(err => {
          console.error("Error cleaning up stale rooms:", err);
        });
    }
  }, []);
  
  // Auto-setup subscriptions when playerId or currentRoom changes
  useEffect(() => {
    if (currentRoom?.id && playerId && userId) {
      console.log(`Setting up subscriptions for room ${currentRoom.id} with player ${playerId}`);
      const cleanup = setupSubscriptions(currentRoom.id);
      
      // Set up a heartbeat interval to update player's last_seen timestamp
      const heartbeatInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          GameService.updatePlayerHeartbeat(playerId, userId);
        }
      }, 30000); // Send heartbeat every 30 seconds when tab is visible
      
      return () => {
        cleanup();
        clearInterval(heartbeatInterval);
      };
    }
  }, [currentRoom?.id, playerId, userId]);
  
  // Add document visibility change handler to mark player as offline/online
  useEffect(() => {
    if (playerId && userId) {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // User returned to the tab, mark as online
          GameService.updatePlayerHeartbeat(playerId, userId).catch(err => {
            console.error("Failed to update player heartbeat:", err);
            // Don't show toast for this as it's a background operation
          });
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [playerId, userId]);
  
  // Create a new room and redirect to it
  const createRoom = async (): Promise<void> => {
    if (!userId) {
      toast.error("Please sign in to create a room");
      router.push('/sign-in');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`Creating room for user ${userId}...`);
      // Generate a random room name
      const roomName = `Game Room ${Math.floor(Math.random() * 1000)}`;
      // Get a random player name for this game
      const playerNames = ["Captain", "Explorer", "Detective", "Agent", "Pilot", "Scout"];
      const randomName = playerNames[Math.floor(Math.random() * playerNames.length)];
      
      try {
        // Try the normal GameService method first
        const result = await GameService.createRoom(userId, randomName, roomName);
        console.log("CreateRoom API result:", result);
        setCurrentRoom(result.room);
        setPlayerId(result.player.id);
        setPlayers([result.player]);
        
        // Set a flag in localStorage to prevent auto-join loop
        localStorage.setItem(`created_room_${result.room.code}`, 'true');
        
        // Redirect to the new room page using Next.js Router
        console.log(`Redirecting to room with code ${result.room.code}`);
        const targetPath = `/game-hub/${result.room.code}`;
        console.log("Navigating to:", targetPath);
        
        // Use Router.push for client-side navigation
        router.push(targetPath);
      } catch (serviceError) {
        console.error("GameService.createRoom failed:", serviceError);
        toast.error("Using direct approach to create room due to API error");
        
        // Direct client-side room creation as a last resort
        const supabase = createClient();
        
        // Generate room code
        const generateCode = () => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code = '';
          for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return code;
        };
        
        const roomCode = generateCode();
        
        // Directly create room with client
        const { data: room, error: roomError } = await supabase
          .from("game_rooms")
          .insert({
            code: roomCode,
            host_id: userId || '',
            status: "lobby",
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (roomError) {
          console.error("Direct room creation failed:", roomError);
          throw new Error(`Failed to create room: ${roomError.message}`);
        }
        
        // Generate a game alias
        const gameAlias = `${randomName}${Math.floor(Math.random() * 1000)}`;
        
        // Add player to room
        const { data: player, error: playerError } = await supabase
          .from("game_players")
          .insert({
            room_id: room.id,
            user_id: userId || '',
            game_alias: gameAlias,
            is_host: true,
            is_online: true,
            joined_at: new Date().toISOString(),
            last_seen: new Date().toISOString()
          })
          .select()
          .single();
        
        if (playerError) {
          console.error("Direct player creation failed:", playerError);
          throw new Error(`Failed to add player to room: ${playerError.message}`);
        }
        
        setCurrentRoom(room);
        setPlayerId(player.id);
        setPlayers([player]);
        
        // Set a flag in localStorage to prevent auto-join loop
        localStorage.setItem(`created_room_${room.code}`, 'true');
        
        // Redirect to the new room page using Next.js Router
        console.log(`Redirecting to room with code ${room.code}`);
        const targetPath = `/game-hub/${room.code}`;
        console.log("Navigating to:", targetPath);
        
        // Use Router.push for client-side navigation 
        router.push(targetPath);
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to create room';
      setError(errorMessage);
      toast.error(errorMessage);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Join a room by code
  const joinRoom = async (code: string): Promise<GameRoom | null> => {
    if (!userId) {
      // Store room code for after sign-in
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('returnToRoom', code);
      }
      toast.error("Please sign in to join a room");
      router.push('/sign-in');
      return null;
    }
    
    // Don't attempt to join if we just left this room
    if (typeof window !== 'undefined' && sessionStorage.getItem(`left_room_${code}`)) {
      console.log(`Recently left room ${code}, removing flag`);
      sessionStorage.removeItem(`left_room_${code}`);
      return null;
    }
    
    // Prevent multiple rapid-fire join attempts
    if (isJoiningRoom) {
      console.log("Already joining a room, ignoring duplicate request");
      return null;
    }
    
    // Add a debounce to prevent rapid re-joining
    const debounceKey = `joining_${code}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(debounceKey)) {
      console.log("Join request debounced");
      return currentRoom;
    }
    
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(debounceKey, 'true');
        // Clear debounce after 2 seconds
        setTimeout(() => sessionStorage.removeItem(debounceKey), 2000);
      }
    } catch (e) {
      console.warn("Could not access sessionStorage for debounce:", e);
    }
    
    setIsJoiningRoom(true);
    setIsLoading(true);
    setError(null);    
    try {
      // First check if the room exists
      const supabase = createClient();
      const { data: existingRoom } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("code", code)
        .single();
      
      if (!existingRoom) {
        toast.error(`Room ${code} not found or no longer available`);
        return null;
      }
      
      // Check if we're already in this room
      if (currentRoom?.id === existingRoom.id) {
        console.log(`Already in room ${code}, returning current room`);
        return currentRoom;
      }
      
      // Proceed with joining
      const { room, player, reconnected } = await GameService.joinRoom(code, userId);
      
      setPlayerId(player.id);
      setCurrentRoom(room);
      
      // Get all the players in the room
      try {
        const roomPlayers = await GameService.getPlayersInRoom(room.id);
        setPlayers(roomPlayers);
      } catch (playersError) {
        console.error("Error fetching players:", playersError);
        // Continue anyway, we can fetch players through subscription
      }
      
      // If the game is already in progress, get the current round
      if (room.status === 'in_progress' && room.current_round) {
        try {
          const round = await GameService.getCurrentRound(room.id);
          setCurrentRound(round);
        } catch (roundError) {
          console.error("Error fetching round:", roundError);
          // Continue anyway
        }
      }
      
      // Show a different toast message based on reconnection status
      if (reconnected) {
        console.log(`Reconnected to room ${code}`);
      } else {
        toast.success(`Joined room ${code} as ${player.game_alias}`);
      }
      
      // Check if already on the room page to avoid unnecessary navigation
      const currentPath = window.location.pathname;
      const expectedPath = `/game-hub/${code}`;
      
      if (currentPath !== expectedPath) {
        router.push(expectedPath);
      }
      
      return room;
    } catch (err: any) {
      console.error("Error joining room:", err);
      setError(err.message || "Failed to join room");
      toast.error(err.message || "Failed to join room");
      return null;
    } finally {
      setIsJoiningRoom(false);
      setIsLoading(false);
    }
  };
  
  // Start the game (host only)
  const startGame = async () => {
    if (!isHost || !currentRoom || !userId) {
      toast.error("Only the host can start the game");
      return null;
    }
    
    // Prevent multiple clicks from starting the game multiple times
    if (isStartingGame) {
      console.log("Game start already in progress, ignoring duplicate request");
      return null;
    }
    
    setIsStartingGame(true);
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`Starting game in room ${currentRoom.id}`);
      const result = await GameService.startGame(currentRoom.id, userId);
      
      // Update local state with the new room and round
      setCurrentRoom(result.room);
      setCurrentRound(result.round);
      console.log("Game started successfully:", result);
      
      return result;
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to start game';
      setError(errorMessage);
      console.error("Error starting game:", err);
      throw err;
    } finally {
      setIsLoading(false);
      
      // Reset the starting state after a timeout
      setTimeout(() => {
        setIsStartingGame(false);
      }, 5000);
    }
  };
  
  // Submit a caption
  const submitCaption = async (caption: string) => {
    if (!currentRoom || !currentRound || !playerId) {
      toast.error("Cannot submit caption at this time");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await GameService.submitCaption(currentRound.id, playerId, caption);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to submit caption';
      setError(errorMessage);
      toast.error(errorMessage);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Submit a vote
  const submitVote = async (votedForId: string) => {
    if (!currentRoom || !playerId) {
      toast.error("Cannot submit vote at this time");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await GameService.submitVote(currentRoom.id, playerId, votedForId);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to submit vote';
      setError(errorMessage);
      toast.error(errorMessage);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Leave the current room
  const leaveRoom = async (forceDelete = true): Promise<unknown> => {
    // Prevent multiple rapid leave attempts
    if (isLeavingRoom) {
      console.log("Already leaving room, ignoring duplicate request");
      return Promise.resolve({ canceled: true });
    }
    
    // If forceDelete is not explicitly passed, show a confirmation dialog
    if (!forceDelete) {
      return new Promise((resolve: (value: unknown) => void) => {
        // Show the leave room confirmation dialog via toast
        toast.custom((t) => (
          <LeaveRoomConfirmation 
            isHost={isHost}
            isLastPlayer={players.length === 1}
            onCancel={() => {
              toast.dismiss(t);
              resolve({ canceled: true });
            }}
            onConfirm={async () => {
              toast.dismiss(t);
              // Set leaving state
              setIsLeavingRoom(true);
              
              // Always force delete if user confirms to ensure they can exit
              try {
                const result = await leaveRoom(true); // Always force delete for intentional leaves
                resolve(result);
              } catch (error) {
                console.error("Error in confirmed leave:", error);
                // Resolve anyway to allow UI to proceed
                resolve({ error: true });
              }
            }}
          />
        ), { duration: Infinity });
      });
    }
    
    // Only show loading toast for direct/forced leave (not showing it twice for confirmed leaves)
    if (!isLeavingRoom) {
      // Mark as leaving to prevent duplicate calls
      setIsLeavingRoom(true);
    }
    
    // Keep track of player and room IDs before they're cleared
    const currentPlayerId = playerId;
    const currentRoomId = currentRoom?.id;
    const roomCode = currentRoom?.code;
    const wasOnlyPlayer = players.length === 1;
    
    try {
      // Set a flag in sessionStorage to prevent auto-rejoin
      if (roomCode) {
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.setItem(`left_room_${roomCode}`, 'true');
            console.log(`Marked room ${roomCode} as recently left to prevent auto-rejoin`);
          }
        } catch (e) {
          console.warn("Could not access sessionStorage:", e);
        }
      }
      
      // If we have a player ID and user ID, mark the player as offline in the database
      if (currentPlayerId && userId) {
        try {
          // Ensure player is removed from room even if API call fails
          const result = await GameService.removePlayerFromRoom(currentPlayerId, userId, true);
          console.log("Successfully left room:", result);
          
          // Show success toast
          if (wasOnlyPlayer) {
            toast.success("Left room and room was closed");
          } else {
            toast.success("Left room successfully");
          }
        } catch (leaveError) {
          console.error("Error leaving room (continuing anyway):", leaveError);
          
          // Try fallback with direct Supabase call if API fails
          try {
            const supabase = createClient();
            
            // Always delete player record to ensure they can leave
            await supabase
              .from("game_players")
              .delete()
              .eq("id", currentPlayerId);
              
            console.log("Used fallback to delete player");
            
            // If last player, attempt to mark room as completed to hide it from active rooms
            if (wasOnlyPlayer && currentRoomId) {
              await supabase
                .from("game_rooms")
                .update({ status: "completed" })
                .eq("id", currentRoomId);
                
              console.log("Used fallback to mark room as completed");
            }
            
            toast.success(wasOnlyPlayer ? "Left room and room was closed" : "Left room");
          } catch (fallbackError) {
            console.error("Fallback operation failed:", fallbackError);
            // Continue with cleanup even if all API calls fail
          }
        }
      }
    } catch (err) {
      console.error("Error leaving room:", err);
    } finally {
      // Clear local state regardless of success/failure
      setCurrentRoom(null);
      setPlayers([]);
      setCurrentRound(null);
      setPlayerId(null);
      
      // Reset the leaving state after a timeout to prevent rapid fire leave attempts
      setTimeout(() => {
        setIsLeavingRoom(false);
      }, 5000);
      
      // Always force redirect to ensure users can leave
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        if (currentPath !== '/game-hub') {
          // Navigate back to game hub
          router.push('/game-hub');
        } else {
          console.log("Already on the game hub page, not redirecting");
        }
      }
    }
  };
  
  // Set up real-time subscriptions for a room
  const setupSubscriptions = (roomId: string) => {
    const supabase = createClient();
    
    // Subscribe to room changes
    const roomSubscription = GameService.subscribeToRoom(roomId, async (payload) => {
      console.log(`Room subscription triggered:`, payload.eventType);
      // Update the room state when it changes
      if (payload.new) {
        setCurrentRoom(payload.new);
        
        // If the round changes, fetch the new round
        if (payload.new.current_round !== currentRoom?.current_round) {
          const round = await GameService.getCurrentRound(roomId);
          setCurrentRound(round);
        }
      }
    });
    
    // Subscribe to player changes - making this more responsive
    const playersSubscription = GameService.subscribeToPlayers(roomId, async (payload) => {
      console.log(`Player subscription triggered:`, payload.eventType, payload);
      
      // Immediately update the local players list when a player leaves (DELETE event)
      if (payload.eventType === 'DELETE' && payload.old) {
        console.log(`Player ${payload.old.id} was deleted, removing from local state`);
        setPlayers(currentPlayers => 
          currentPlayers.filter(player => player.id !== payload.old.id)
        );
        
        // Also fetch the complete list to ensure consistency
        try {
          const roomPlayers = await GameService.getPlayersInRoom(roomId);
          console.log(`Refreshed player list after deletion, now ${roomPlayers.length} players`);
          setPlayers(roomPlayers);
        } catch (err) {
          console.error("Error refreshing players after deletion:", err);
        }
        return;
      }
      
      // For updates (like a player going offline), update that specific player
      if (payload.eventType === 'UPDATE' && payload.new) {
        console.log(`Player ${payload.new.id} was updated`, payload.new);
        
        // If player went from online to offline, filter them out from the displayed players list
        if (payload.old?.is_online === true && payload.new.is_online === false) {
          console.log(`Player ${payload.new.id} went offline, removing from displayed players`);
          setPlayers(currentPlayers => 
            currentPlayers.filter(player => player.id !== payload.new.id || player.is_online === true)
          );
        } else if (payload.old?.is_online === false && payload.new.is_online === true) {
          // Player came back online, make sure they're included
          console.log(`Player ${payload.new.id} came back online, adding to displayed players`);
          setPlayers(currentPlayers => {
            // Check if player already exists in the list
            const playerExists = currentPlayers.some(player => player.id === payload.new.id);
            // If not, add them, otherwise update their info
            return playerExists 
              ? currentPlayers.map(player => player.id === payload.new.id ? payload.new : player)
              : [...currentPlayers, payload.new];
          });
        } else {
          // Just update the player's info for other changes
          setPlayers(currentPlayers => 
            currentPlayers.map(player => 
              player.id === payload.new.id ? payload.new : player
            )
          );
        }
        
        // Always refresh the player list to ensure consistency
        try {
          const roomPlayers = await GameService.getPlayersInRoom(roomId);
          console.log(`Refreshed player list after update, now ${roomPlayers.length} total players, filtering offline players`);
          
          // Only display online players in the UI
          const onlinePlayers = roomPlayers.filter(player => player.is_online === true);
          console.log(`Displaying ${onlinePlayers.length} online players`);
          setPlayers(onlinePlayers);
        } catch (err) {
          console.error("Error refreshing players after update:", err);
        }
        return;
      }
      
      // For other events (like INSERT), fetch all players for consistency
      try {
        const roomPlayers = await GameService.getPlayersInRoom(roomId);
        console.log(`Refreshed player list for ${payload.eventType}, now ${roomPlayers.length} total players`);
        
        // Only display online players in the UI
        const onlinePlayers = roomPlayers.filter(player => player.is_online === true);
        console.log(`Displaying ${onlinePlayers.length} online players`);
        setPlayers(onlinePlayers);
      } catch (err) {
        console.error(`Error refreshing players for ${payload.eventType}:`, err);
      }
    });
    
    // Initial fetch to ensure we have the latest data
    GameService.getPlayersInRoom(roomId).then(roomPlayers => {
      // Only display online players in the UI
      const onlinePlayers = roomPlayers.filter(player => player.is_online === true);
      console.log(`Initial player fetch: ${roomPlayers.length} total, ${onlinePlayers.length} online`);
      setPlayers(onlinePlayers);
    }).catch(err => {
      console.error("Error in initial player fetch:", err);
    });
    
    // Cleanup subscriptions on unmount
    return () => {
      roomSubscription.unsubscribe();
      playersSubscription.unsubscribe();
    };
  };
  
  const value = {
    currentRoom,
    players,
    currentRound,
    isHost,
    isLoading,
    error,
    userId,
    playerId,
    createRoom,
    joinRoom,
    startGame,
    submitCaption,
    submitVote,
    leaveRoom
  };
  
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
} 
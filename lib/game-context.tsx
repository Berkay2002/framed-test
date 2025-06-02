"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { GameService, GameRoom, GamePlayer, GameRound, PlayerCaption, PlayerVote } from "@/lib/game-service"; 
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
  isImpostor: boolean;
  
  // Game actions
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<GameRoom | null>;
  startGame: () => Promise<StartGameResult | null>;
  submitCaption: (caption: string) => Promise<void>;
  leaveRoom: (forceDelete?: boolean) => Promise<unknown>;
  submitVote: (votedForId: string) => Promise<void>;
  submitMultipleVotes: (playerIds: string[]) => Promise<void>;
  advanceToRound: (roundNumber: number) => Promise<void>; 
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
  const [hasVoted, setHasVoted] = useState(false);
  
  // Calculate if the current user is the host
  const isHost = !!(currentRoom && userId && currentRoom.host_id === userId);
  const isImpostor = !!(currentRoom && userId && currentRoom.impostor_id === userId);
  
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
      console.log(`Room ${currentRoom.id} is active`);
    }
  }, [currentRoom?.id, isHost]);
  
  // Clean up stale rooms effect - run a cleanup check when the game hub loads
  useEffect(() => {
    // Only run this cleanup from the game hub page
    if (typeof window !== 'undefined' && window.location.pathname === '/game-hub') {
      // Run cleanup operation for rooms with stale heartbeats (inactive for 5+ minutes)
      // Not critical - we'll just log that this functionality is disabled for now
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
          // Direct Supabase call instead of GameService method
          const supabase = createClient();
          (async () => {
            try {
              await supabase
                .from("game_players")
                .update({ 
                  is_online: true,
                  last_seen: new Date().toISOString() 
                })
                .eq("id", playerId)
                .eq("user_id", userId);
              console.log('Player online status updated');
            } catch (error) {
              console.error('Failed to update player online status:', error);
            }
          })();
        }
      }, 30000); // Send heartbeat every 30 seconds when tab is visible
      
      // Listen for manual round refresh requests
      const handleForceRoundRefresh = async (event: Event) => {
        const customEvent = event as CustomEvent;
        const { roomId, nextRoundNumber } = customEvent.detail;
        
        if (roomId === currentRoom.id) {
          console.log(`🔄 Manual round refresh requested for room ${roomId}, round ${nextRoundNumber}`);
          try {
            // First refresh the room data
            const roomData = await GameService.getRoomByCode(currentRoom.code);
            if (roomData) {
              console.log(`📡 Refreshed room data: status=${roomData.status}, current_round=${roomData.current_round}`);
              const oldRound = currentRoom.current_round;
              setCurrentRoom(roomData);
              
              // Then fetch the new round data if game is in progress
              if (roomData.status === 'in_progress' && roomData.current_round) {
                const roundData = await GameService.getCurrentRound(roomId);
                console.log(`📡 Manual refresh: fetched round data for round ${nextRoundNumber}:`, roundData);
                
                if (roundData) {
                  setCurrentRound(roundData);
                  
                  // Dispatch the round change event for components to handle
                  window.dispatchEvent(new CustomEvent('game:round-changed', {
                    detail: { 
                      roomId: roomId,
                      oldRound: oldRound,
                      newRound: nextRoundNumber,
                      roundData: roundData
                    }
                  }));
                  
                  console.log(`✅ Manual round refresh completed successfully`);
                  toast.info(`Round ${nextRoundNumber} detected via polling!`);
                } else {
                  console.warn(`⚠️ No round data found for round ${nextRoundNumber}`);
                }
              } else {
                console.log(`📝 Room not in progress, clearing round data`);
                setCurrentRound(null);
              }
            }
          } catch (error) {
            console.error('❌ Error in manual round refresh:', error);
          }
        }
      };
      
      window.addEventListener('game:force-round-refresh', handleForceRoundRefresh);
      
      return () => {
        cleanup();
        clearInterval(heartbeatInterval);
        window.removeEventListener('game:force-round-refresh', handleForceRoundRefresh);
      };
    }
  }, [currentRoom?.id, playerId, userId]);
  
  // Effect to handle room status changes
  useEffect(() => {
    // Check for inactive or completed status
    const isCompleted = currentRoom?.status === 'completed';
    
    if (isCompleted) {
      // Reset game state when room is inactive or game is completed
      console.log(`Room is completed, resetting game state`);
      setCurrentRound(null);
    }
  }, [currentRoom?.status]);
  
  // Helper function to verify and correct the game state
  const verifyGameState = (room: GameRoom | null) => {
    if (!room) return;
    
    console.log("Verifying game state for room:", room.id);
    
    // If room is in lobby or completed, ensure currentRound is null
    if (room.status === 'lobby' || room.status === 'completed') {
      if (currentRound !== null) {
        console.log(`Room ${room.id} is in ${room.status} status but currentRound is not null, correcting`);
        setCurrentRound(null);
      }
    } 
    // If room is in progress, ensure we have a currentRound
    else if (room.status === 'in_progress' && currentRound === null && room.current_round) {
      console.log(`Room ${room.id} is in_progress but currentRound is null, fetching round data`);
      // Fetch the current round
      GameService.getCurrentRound(room.id).then(round => {
        if (round) {
          console.log(`Fetched round data for room ${room.id}:`, round);
          setCurrentRound(round);
        } else {
          console.log(`No round data found for in_progress room ${room.id}`);
        }
      }).catch(err => {
        console.error(`Error fetching round data for room ${room.id}:`, err);
      });
    }
  };
  
  // Apply the verification whenever currentRoom changes
  useEffect(() => {
    if (currentRoom) {
      verifyGameState(currentRoom);
    }
  }, [currentRoom?.id, currentRoom?.status]);
  
  // Create a new room and redirect to it
  const createRoom = async (): Promise<void> => {
    if (!userId) {
      //toast.error("Please sign in to create a room");
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
        
        // Keep loading state active for a minimum time to show animation
        // before navigation
        setTimeout(() => {
          // Use Router.push for client-side navigation
          router.push(targetPath);
        }, 2000);
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
        
        // Keep loading state active for a minimum time to show animation
        // before navigation
        setTimeout(() => {
          // Use Router.push for client-side navigation
          router.push(targetPath);
        }, 2000);
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
        const roomPlayers = await GameService.getPlayersInRoom(room.id, true);
        const onlinePlayers = roomPlayers.filter(player => player.is_online);
        setPlayers(onlinePlayers);
      } catch (playersError) {
        console.error("Error fetching players:", playersError);
        // Continue anyway, we can fetch players through subscription
      }
      
      // Important: Always clear current round when joining a room unless the status is in_progress
      // This is to ensure players joining a lobby don't get thrown into the game view
      if (room.status === 'lobby' || room.status === 'completed') {
        console.log(`Room is in ${room.status} state, setting currentRound to null`);
        setCurrentRound(null);
      } else if (room.status === 'in_progress' && room.current_round) {
        // Only fetch the current round if the game is actually in progress
        try {
          const round = await GameService.getCurrentRound(room.id);
          console.log(`Fetched current round for in_progress game:`, round);
          setCurrentRound(round);
        } catch (roundError) {
          console.error("Error fetching current round:", roundError);
          // If we can't fetch the round, set it to null to be safe
          setCurrentRound(null);
        }
      } else {
        // Fallback for any other state
        setCurrentRound(null);
      }
      
      // Show a different toast message based on reconnection status
      if (reconnected) {
        console.log(`Reconnected to room ${code}`);
        toast.success(`Reconnected to room ${code}`);
      } else {
        toast.success(`Joined room ${code} as ${player.game_alias}`);
      }
      
      // Check if already on the room page to avoid unnecessary navigation
      const currentPath = window.location.pathname;
      const expectedPath = `/game-hub/${code}`;
      
      if (currentPath !== expectedPath) {
        // Keep loading state active during navigation
        setTimeout(() => {
          router.push(expectedPath);
          // Only reset loading state after a minimum duration
          setTimeout(() => {
            setIsJoiningRoom(false);
            setIsLoading(false);
          }, 500);
        }, 2000);
        
        // Don't reset loading state here, it will be done after navigation
        return room;
      }
      
      return room;
    } catch (err: any) {
      console.error("Error joining room:", err);
      setError(err.message || "Failed to join room");
      toast.error(err.message || "Failed to join room");
      setIsJoiningRoom(false);
      setIsLoading(false);
      return null;
    } finally {
      // Only reset states if we're not navigating to another page
      // Otherwise the states will be reset after navigation
      if (window.location.pathname === `/game-hub/${code}`) {
        setIsJoiningRoom(false);
        setIsLoading(false);
      }
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
      
      if (!result) {
        console.error("startGame returned null or undefined result");
        throw new Error("Failed to start game - server returned no result");
      }
      
      if (!result.room) {
        console.error("startGame returned result with missing room data:", result);
        throw new Error("Failed to start game - incomplete server response");
      }
      
      // Update local state with the new room and round
      setCurrentRoom(result.room);
      
      // Verify we got a valid round object, log the result if not
      if (!result.round) {
        console.warn("startGame returned result with missing round data:", result);
        // Don't throw here, but don't update currentRound if it's null
      } else {
        setCurrentRound(result.round);
      }
      
      // Send game start announcements - disabled for broadcast chat
      try {
        // System messages don't work with broadcast chat
        // await ChatService.sendSystemMessage(
        //   result.room.id,
        //   `Game started! Round 1 is beginning...`,
        //   'lobby'
        // );
        
        // Send a message to the round-specific chat
        // await ChatService.sendSystemMessage(
        //   result.room.id,
        //   `Round 1 has started! Discuss the image and identify the impostor.`,
        //   'round',
        //   1
        // );
        console.log('Game start announcements skipped (broadcast chat)');
      } catch (chatError) {
        console.error('Failed to send game start chat messages:', chatError);
        // Don't block game start if messages fail
      }
      
      return result;
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to start game';
      setError(errorMessage);
      console.error("Error starting game:", err);
      
      // Clear the loading state to ensure UI remains responsive
      setIsLoading(false);
      setIsStartingGame(false);
      
      // Re-throw the error so it can be handled by the caller
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
      console.log("current room: ", currentRoom);
      console.log("current round: ",currentRound);
      console.log("player id: ",playerId);
      
      toast.error("Cannot submit caption at this time because currentroom, currentround or playerid is invalid");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await GameService.submitCaption(currentRound.id, playerId, caption);
      toast.success("Caption submitted successfully!");
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to submit caption';
      setError(errorMessage);
      toast.error(errorMessage);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit a single vote for a player
  const submitVote = async (votedForId: string) => {
    if (!currentRoom || !playerId || !currentRound?.id) {
      console.error("❌ SUBMIT VOTE: Missing required data", {
        currentRoom: !!currentRoom,
        playerId: !!playerId,
        currentRound: !!currentRound?.id
      });
      toast.error("Cannot submit vote at this time");
      return;
    }
    
    if (hasVoted) {
      console.warn("⚠️ SUBMIT VOTE: Player has already voted");
      toast.error("You've already voted in this round");
      return;
    }
    
    console.log(`🗳️ SUBMIT VOTE: Starting vote submission`);
    console.log(`🗳️ SUBMIT VOTE: Room ID: ${currentRoom.id}`);
    console.log(`🗳️ SUBMIT VOTE: Round ID: ${currentRound.id}`);
    console.log(`🗳️ SUBMIT VOTE: Voter ID (playerId): ${playerId}`);
    console.log(`🗳️ SUBMIT VOTE: Voted for ID: ${votedForId}`);
    
    setIsLoading(true);
    setError(null);
    
    try {
      await GameService.submitMultipleVotes(
        currentRoom.id,
        currentRound.id,
        playerId,
        [votedForId] // Single vote as array
      );
      
      setHasVoted(true);
      console.log(`✅ SUBMIT VOTE: Vote submitted successfully`);
      toast.success("Vote submitted successfully!");
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to submit vote';
      console.error("❌ SUBMIT VOTE: Error submitting vote:", err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const submitMultipleVotes = async (votedForIds: string[]) => {
    if (!currentRoom || !playerId || !currentRound?.id) {
      toast.error("Cannot submit votes at this time");
      return;
    }
    
    if (hasVoted) {
      toast.error("You've already voted in this round");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await GameService.submitMultipleVotes(
        currentRoom.id,
        currentRound.id,
        playerId,
        votedForIds
      );
      
      setHasVoted(true);
      toast.success(`Successfully submitted ${votedForIds.length} votes!`);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to submit votes';
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
    const wasHost = isHost;
    
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
          // Direct Supabase call instead of GameService
          if (forceDelete) {
            const supabase = createClient();
            await supabase
              .from("game_players")
              .delete()
              .eq("id", currentPlayerId)
              .eq("user_id", userId);
            
            console.log("Successfully left room via direct database call");
          } else {
            const supabase = createClient();
            await supabase
              .from("game_players")
              .update({ 
                is_online: false,
                last_seen: new Date().toISOString() 
              })
              .eq("id", currentPlayerId)
              .eq("user_id", userId);
              
            console.log("Successfully marked player as offline");
          }
          
          // Show appropriate success toast based on context and new room status
          if (wasOnlyPlayer && !wasHost) {
            // Regular player who was the last one in the room
            toast.success("Left room and room is now inactive");
          } else if (wasOnlyPlayer && wasHost) {
            // Host who was the last one in the room - room is now inactive (dormant)
            //toast.success("Left room successfully - room will remain available in the Game Hub");
          } else if (wasHost) {
            // Host leaving but other players remain
            toast.success("Left room successfully - host status transferred");
          } else {
            // Regular player leaving
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
            
            // If we were the last player, mark room as dormant (inactive)
            if (wasOnlyPlayer && currentRoomId) {
              await supabase
                .from("game_rooms")
                .update({ status: "dormant", last_activity: new Date().toISOString() })
                .eq("id", currentRoomId);
                
              console.log("Used fallback to mark room as dormant (inactive)");
              toast.success("Left room successfully - room is now inactive");
            } else {
              // Not the last player
              toast.success(wasHost 
                ? "Left room successfully - host status transferred" 
                : "Left room successfully");
            }
          } catch (fallbackError) {
            console.error("Fallback operation failed:", fallbackError);
            // Continue with cleanup even if all API calls fail
            toast.success("Left room");
          }
        }
      }
      
      // Announce player leaving in chat - disabled for broadcast chat
      if (currentRoom && playerId) {
        try {
          const playerInfo = players.find(p => p.id === playerId);
          const playerName = playerInfo?.game_alias || 'Player';
          
          // System messages don't work with broadcast chat
          // ChatService.sendSystemMessage(
          //   currentRoom.id,
          //   `${playerName} has left the room.`,
          //   'lobby'
          // ).catch(err => {
          //   console.error("Error sending player left message:", err);
          // });
          console.log(`${playerName} left room announcement skipped (broadcast chat)`);
        } catch (err) {
          console.error("Error getting player info for announcement:", err);
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
      
      // Handle navigation based on current state
      // Note: Many components override this navigation with their own logic
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        if (currentPath !== '/game-hub') {
          // Navigate back to game hub - many components override this
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
      console.log(`🏠 Room subscription triggered:`, payload.eventType, `Room ${roomId}`);
      // Update the room state when it changes
      if (payload.new) {
        console.log(`📊 Room update: old_round=${payload.old?.current_round}, new_round=${payload.new.current_round}, status=${payload.new.status}`);
        setCurrentRoom(payload.new);
        
        // Check for room status changes and handle appropriately
        if (payload.old && payload.old.status !== payload.new.status) {
          console.log(`🔄 Room status changed from ${payload.old.status} to ${payload.new.status}`);
          
          // If room status changed to lobby from in_progress, clear the current round
          if (payload.new.status === 'lobby' && payload.old.status === 'in_progress') {
            console.log(`🏠 Room went back to lobby, clearing current round`);
            setCurrentRound(null);
          }
        }
        
        // If the round changes, fetch the new round, but only if the game is in progress
        if (payload.old && payload.new.current_round !== payload.old.current_round) {
          console.log(`🎯 ROOM ROUND CHANGED from ${payload.old.current_round} to ${payload.new.current_round}`);
          if (payload.new.status === 'in_progress') {
            console.log(`🎮 Game in progress, fetching round data for round ${payload.new.current_round}`);
            try {
              const round = await GameService.getCurrentRound(roomId);
              console.log(`✅ Successfully fetched round data:`, round);
              setCurrentRound(round);
              
              // Dispatch a custom event to notify other components about the round change
              // This ensures GameView and other components can react to round transitions
              window.dispatchEvent(new CustomEvent('game:round-changed', {
                detail: { 
                  roomId: roomId,
                  oldRound: payload.old.current_round,
                  newRound: payload.new.current_round,
                  roundData: round
                }
              }));
              
            } catch (error) {
              console.error(`❌ Error fetching round data:`, error);
              setCurrentRound(null);
            }
          } else {
            console.log(`🚫 Game not in progress, clearing current round`);
            setCurrentRound(null);
          }
        } else if (!payload.old && payload.new.current_round && payload.new.status === 'in_progress') {
          // Handle case where there's no old payload (first load)
          console.log(`🎬 Initial round load for round ${payload.new.current_round}`);
          try {
            const round = await GameService.getCurrentRound(roomId);
            setCurrentRound(round);
          } catch (error) {
            console.error(`❌ Error fetching initial round data:`, error);
            setCurrentRound(null);
          }
        }
        
        // Verify the game state after all changes
        verifyGameState(payload.new);
      }
    });
    
    // Subscribe to player changes
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
          const roomPlayers = await GameService.getPlayersInRoom(roomId, true);
          const onlinePlayers = roomPlayers.filter(player => player.is_online);
          console.log(`Refreshed player list after deletion, now ${onlinePlayers.length} online players`);
          setPlayers(onlinePlayers);
        } catch (err) {
          console.error("Error refreshing players after deletion:", err);
        }
        return;
      }
      
      // For updates (like a player going offline)
      if (payload.eventType === 'UPDATE' && payload.new) {
        console.log(`Player ${payload.new.id} was updated`, payload.new);
        
        // Update player in the current list
        setPlayers(currentPlayers => 
          currentPlayers.map(player => 
            player.id === payload.new.id ? payload.new : player
          )
        );
        
        // Refresh the player list
        try {
          const roomPlayers = await GameService.getPlayersInRoom(roomId, true);
          const onlinePlayers = roomPlayers.filter(player => player.is_online);
          console.log(`Refreshed player list after update: ${onlinePlayers.length} online players`);
          setPlayers(onlinePlayers);
        } catch (err) {
          console.error("Error refreshing players:", err);
        }
        return;
      }
      
      // For other events (like INSERT), fetch all players
      try {
        const roomPlayers = await GameService.getPlayersInRoom(roomId, true); // Include offline players
        const onlinePlayers = roomPlayers.filter(player => player.is_online);
        console.log(`Refreshed player list for ${payload.eventType}: ${onlinePlayers.length} online players (${roomPlayers.length} total)`);
        console.log(`Online players:`, onlinePlayers.map(p => ({ id: p.id, alias: p.game_alias, online: p.is_online })));
        setPlayers(onlinePlayers);
      } catch (err) {
        console.error(`Error refreshing players for ${payload.eventType}:`, err);
      }
    });
    
    // Initial fetch to ensure we have the latest data
    GameService.getPlayersInRoom(roomId, true).then(roomPlayers => {
      const onlinePlayers = roomPlayers.filter(player => player.is_online);
      console.log(`Initial player fetch: ${onlinePlayers.length} online players`);
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


  const advanceToRound = async (roundNumber: number) => {
    if (!currentRoom || !userId || !isHost) {
      toast.error("Only the host can advance to the next round");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const supabase = createClient();
      
      // 1. Update the game_rooms table to the new round
      const { data: updatedRoomData, error: roomUpdateError } = await supabase
        .from('game_rooms')
        .update({ current_round: roundNumber })
        .eq('id', currentRoom.id)
        .select()
        .single();

      if (roomUpdateError) throw roomUpdateError;
      if (!updatedRoomData) throw new Error("Failed to update room for next round.");
      
      // 2. Activate the existing round (pre-created when game started)
      console.log(`Activating pre-existing round ${roundNumber} for room ${currentRoom.id}`);
      
      const { data: updatedRoundData, error: roundUpdateError } = await supabase
        .from('game_rounds')
        .update({
          started_at: new Date().toISOString(),
          deadline_at: new Date(Date.now() + 20 * 1000).toISOString(), // 20 seconds for dev
        })
        .eq('room_id', currentRoom.id)
        .eq('round_number', roundNumber)
        .select()
        .single();

      if (roundUpdateError) {
        console.error("Error activating round:", roundUpdateError);
        throw new Error(`Failed to activate round ${roundNumber}: ${roundUpdateError.message}`);
      }
      
      if (!updatedRoundData) {
        throw new Error(`Round ${roundNumber} not found - it should have been pre-created when the game started.`);
      }

      // 3. Clear any old votes for this round
      try {
        if (playerId) {
          await supabase
            .from("player_votes")
            .delete()
            .eq("round_id", updatedRoundData.id)
            .eq("voter_id", playerId);
        }
      } catch (voteErr) {
        console.warn("Failed to clear old votes, but continuing:", voteErr);
      }

      // 4. Update context state (for host)
      setCurrentRoom(updatedRoomData);
      setCurrentRound(updatedRoundData);
      setHasVoted(false); // Reset voting status for the new round

      // 5. Immediately dispatch round change event to ensure all components respond
      // This is crucial for ensuring non-host players transition properly
      console.log(`🚀 Host dispatching immediate round change event for round ${roundNumber}`);
      window.dispatchEvent(new CustomEvent('game:round-changed', {
        detail: { 
          roomId: currentRoom.id,
          oldRound: currentRoom.current_round,
          newRound: roundNumber,
          roundData: updatedRoundData
        }
      }));

      toast.success(`Round ${roundNumber} started! New images loaded.`);
      
    } catch (err) {
      console.error("Error advancing to next round:", err);
      const message = err instanceof Error ? err.message : "An unknown error occurred";
      setError(message);
      toast.error(`Failed to start next round: ${message}`);
    } finally {
      setIsLoading(false);
    }
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
    isImpostor,
    createRoom,
    joinRoom,
    startGame,
    submitCaption,
    leaveRoom,
    submitVote,
    submitMultipleVotes,
    advanceToRound,
  };
  
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (context == undefined){
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
}
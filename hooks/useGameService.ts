import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { GameService, GameRoom, GamePlayer } from '@/lib/game-service';

interface CreateRoomParams {
  roomName: string;
  playerName: string;
}

interface JoinRoomParams {
  roomCode: string;
  playerName: string;
}

export function useGameService() {
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const supabase = createClient();
  
  // Create a room
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState<Error | null>(null);
  
  const createRoom = async (params: CreateRoomParams) => {
    setIsCreatingRoom(true);
    setCreateRoomError(null);
    
    try {
      console.log(`Creating room with name: ${params.roomName}, player: ${params.playerName}`);
      
      // First try the API endpoint
      try {
        const response = await fetch('/api/create-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            roomName: params.roomName, 
            playerName: params.playerName 
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to create room: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Room created successfully via API:', result);
        
        setCurrentRoom(result.room);
        setPlayerId(result.player.id);
        setPlayers([result.player]);
        
        toast.success('Room created successfully!');
        return result.room;
      } catch (apiError) {
        console.error('API room creation failed, using fallback:', apiError);
        
        // Generate a random 6-character code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // Insert room directly
        const { data: roomData, error: roomError } = await supabase
          .from("game_rooms")
          .insert({
            name: params.roomName,
            code,
            status: 'lobby',
            host_id: 'user-fallback', // This should be replaced with actual user ID
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (roomError) throw roomError;
        
        // Insert player as host
        const { data: playerData, error: playerError } = await supabase
          .from("game_players")
          .insert({
            game_alias: params.playerName,
            room_id: roomData.id,
            user_id: 'user-fallback', // This should be replaced with actual user ID
            is_host: true,
            is_online: true,
            joined_at: new Date().toISOString(),
            last_seen: new Date().toISOString()
          })
          .select()
          .single();
        
        if (playerError) throw playerError;
        
        setCurrentRoom(roomData);
        setPlayerId(playerData.id);
        setPlayers([playerData]);
        
        toast.success('Room created (client fallback)');
        return roomData;
      }
    } catch (error) {
      console.error('Error in createRoom:', error);
      setCreateRoomError(error instanceof Error ? error : new Error(String(error)));
      toast.error('Failed to create room');
      return null;
    } finally {
      setIsCreatingRoom(false);
    }
  };
  
  // Join a room
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [joinRoomError, setJoinRoomError] = useState<Error | null>(null);
  
  const joinRoom = async (params: JoinRoomParams) => {
    setIsJoiningRoom(true);
    setJoinRoomError(null);
    
    try {
      console.log(`Joining room with code: ${params.roomCode}, player: ${params.playerName}`);
      
      // First try the API endpoint
      try {
        const response = await fetch('/api/join-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            roomCode: params.roomCode, 
            playerName: params.playerName 
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to join room: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Room joined successfully via API:', result);
        
        setCurrentRoom(result.room);
        setPlayerId(result.player.id);
        
        // Get all players
        const { data: allPlayers } = await supabase
          .from("game_players")
          .select("*")
          .eq("room_id", result.room.id);
          
        if (allPlayers) {
          setPlayers(allPlayers);
        }
        
        toast.success('Joined room successfully!');
        return result;
      } catch (apiError) {
        console.error('API room joining failed, using fallback:', apiError);
        
        // Find room by code
        const { data: roomData, error: roomError } = await supabase
          .from("game_rooms")
          .select()
          .eq("code", params.roomCode)
          .single();
        
        if (roomError) throw roomError;
        
        // Insert player
        const { data: playerData, error: playerError } = await supabase
          .from("game_players")
          .insert({
            game_alias: params.playerName,
            room_id: roomData.id,
            user_id: 'user-fallback', // This should be replaced with actual user ID
            is_host: false,
            is_online: true,
            joined_at: new Date().toISOString(),
            last_seen: new Date().toISOString()
          })
          .select()
          .single();
        
        if (playerError) throw playerError;
        
        setCurrentRoom(roomData);
        setPlayerId(playerData.id);
        
        // Get all players
        const { data: allPlayers } = await supabase
          .from("game_players")
          .select("*")
          .eq("room_id", roomData.id);
          
        if (allPlayers) {
          setPlayers(allPlayers);
        }
        
        toast.success('Joined room (client fallback)');
        return { room: roomData, player: playerData };
      }
    } catch (error) {
      console.error('Error in joinRoom:', error);
      setJoinRoomError(error instanceof Error ? error : new Error(String(error)));
      toast.error('Failed to join room');
      return null;
    } finally {
      setIsJoiningRoom(false);
    }
  };
  
  // Start game
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [startGameError, setStartGameError] = useState<Error | null>(null);
  
  const startGame = async (roomId: string) => {
    if (!currentRoom) return null;
    
    setIsStartingGame(true);
    setStartGameError(null);
    
    try {
      // First try the API endpoint
      try {
        const response = await fetch('/api/start-game', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roomId }),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to start game: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Game started successfully via API:', result);
        
        setCurrentRoom(result.room);
        toast.success('Game started!');
        return result.room;
      } catch (apiError) {
        console.error('API start game failed, using fallback:', apiError);
        
        // Update room status directly
        const { data: roomData, error: roomError } = await supabase
          .from("game_rooms")
          .update({ status: 'playing' })
          .eq("id", roomId)
          .select()
          .single();
        
        if (roomError) throw roomError;
        
        setCurrentRoom(roomData);
        toast.success('Game started (client fallback)');
        return roomData;
      }
    } catch (error) {
      console.error('Error in startGame:', error);
      setStartGameError(error instanceof Error ? error : new Error(String(error)));
      toast.error('Failed to start game');
      return null;
    } finally {
      setIsStartingGame(false);
    }
  };
  
  // Function to leave a room
  const leaveRoom = useCallback(async () => {
    if (!playerId || !currentRoom) return false;
    
    try {
      //toast.loading('Leaving room...');
      
      await supabase
        .from("game_players")
        .delete()
        .eq("id", playerId);
      
      setCurrentRoom(null);
      setPlayerId(null);
      setPlayers([]);
      
      //toast.success('Left the game room');
      return true;
    } catch (error) {
      console.error('Error leaving room:', error);
      return false;
    }
  }, [playerId, currentRoom, supabase]);
  
  // Set up real-time subscriptions for the current room
  useEffect(() => {
    if (!currentRoom) return;
    
    // Subscribe to players changes
    const playersSubscription = supabase
      .channel(`room-players-${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `room_id=eq.${currentRoom.id}`,
        },
        async () => {
          // Get updated players
          const { data, error } = await supabase
            .from('game_players')
            .select()
            .eq('room_id', currentRoom.id);
          
          if (!error && data) {
            setPlayers(data);
          }
        }
      )
      .subscribe();
      
    // Subscribe to room changes
    const roomSubscription = supabase
      .channel(`room-status-${currentRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_rooms',
          filter: `id=eq.${currentRoom.id}`,
        },
        async () => {
          // Get updated room data
          const { data: room } = await supabase
            .from('game_rooms')
            .select()
            .eq('id', currentRoom.id)
            .single();
            
          if (room) {
            setCurrentRoom(room);
          }
        }
      )
      .subscribe();
      
    return () => {
      playersSubscription.unsubscribe();
      roomSubscription.unsubscribe();
    };
  }, [currentRoom, supabase]);
  
  return {
    currentRoom,
    playerId,
    players,
    isHost: players.some(p => p.id === playerId && p.is_host),
    createRoom,
    joinRoom,
    startGame,
    leaveRoom,
    isCreatingRoom,
    isJoiningRoom,
    isStartingGame,
    createRoomError,
    joinRoomError,
    startGameError
  };
} 
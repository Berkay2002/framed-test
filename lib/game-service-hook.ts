import { useApiCall } from "@/hooks/useApiCall";
import { createClient } from "@/utils/supabase/client";
import { CreateRoomResult, JoinRoomResult } from "./shared-types";

/**
 * Hooks-based Game Service for handling game-related API operations with direct database fallbacks
 */
export function useGameService() {
  // Create Room API Hook
  const createRoom = useApiCall<
    { userId: string; playerName: string; roomName: string },
    CreateRoomResult
  >({
    endpoint: '/api/create-room',
    fallbackFn: async ({ userId, playerName, roomName }) => {
      if (!userId) {
        throw new Error("User ID is required to create a room");
      }
      
      const supabase = createClient();
      
      // Generate a unique room code
      const generateCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoiding confusing chars
        let code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };
      
      const roomCode = generateCode();
      
      // Check if user is authenticated
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error(`Authentication error: ${sessionError?.message || 'User not authenticated'}`);
      }
      
      // 1. Create a new room
      const roomData = {
        code: roomCode,
        host_id: userId,
        status: "lobby",
        name: roomName,
        created_at: new Date().toISOString()
      };
      
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .insert(roomData)
        .select()
        .single();
      
      if (roomError) {
        throw new Error(`Failed to create room: ${roomError.message}`);
      }
      
      if (!room) {
        throw new Error("Failed to create room: No data returned");
      }
      
      // 2. Generate a game alias (or use the provided playerName)
      const gameAlias = playerName || `Player${Math.floor(Math.random() * 1000)}`;
      
      // 3. Create a new player record as the host
      const { data: player, error: playerError } = await supabase
        .from("game_players")
        .insert({
          room_id: room.id,
          user_id: userId,
          game_alias: gameAlias,
          is_host: true,
          is_online: true,
          joined_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        })
        .select()
        .single();
      
      if (playerError) {
        throw new Error(`Failed to create player: ${playerError.message}`);
      }
      
      if (!player) {
        throw new Error("Failed to create player: No data returned");
      }
      
      // Save flag in localStorage to avoid double-joining
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(`created_room_${room.code}`, 'true');
        }
      } catch (e) {
        console.warn("Could not access localStorage:", e);
      }
      
      return { room, player };
    },
    loadingMessage: 'Creating room...',
    successMessage: 'Room created successfully!',
  });
  
  // Join Room API Hook
  const joinRoom = useApiCall<
    { code: string; userId: string },
    JoinRoomResult
  >({
    endpoint: '/api/join-room',
    fallbackFn: async ({ code, userId }) => {
      if (!code || !userId) {
        throw new Error("Room code and User ID are required to join a room");
      }
      
      const supabase = createClient();
      
      // 1. Find the room by code
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("code", code)
        .single();
      
      if (roomError || !room) {
        throw new Error(`Room not found with code ${code}`);
      }
      
      // 2. Check if user is already in the room
      const { data: existingPlayer, error: existingPlayerError } = await supabase
        .from("game_players")
        .select("*")
        .eq("room_id", room.id)
        .eq("user_id", userId)
        .single();
      
      if (existingPlayer) {
        // Update the existing player to be online
        await supabase
          .from("game_players")
          .update({
            is_online: true,
            last_seen: new Date().toISOString()
          })
          .eq("id", existingPlayer.id);
        
        return { room, player: existingPlayer, alreadyJoined: true };
      }
      
      // 3. Generate a game alias for the player
      const animalAdjectives = ["Polite", "Honest", "Brave", "Clever", "Witty", "Swift", "Kind", "Bold"];
      const animalNames = ["Rabbit", "Fox", "Bear", "Wolf", "Eagle", "Mouse", "Tiger", "Lion"];
      
      const randomAdjective = animalAdjectives[Math.floor(Math.random() * animalAdjectives.length)];
      const randomAnimal = animalNames[Math.floor(Math.random() * animalNames.length)];
      const gameAlias = `${randomAdjective}${randomAnimal}`;
      
      // 4. Create a new player record
      const { data: player, error: playerError } = await supabase
        .from("game_players")
        .insert({
          room_id: room.id,
          user_id: userId,
          game_alias: gameAlias,
          is_host: false,
          is_online: true,
          joined_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        })
        .select()
        .single();
      
      if (playerError || !player) {
        throw new Error(`Failed to add player to room: ${playerError?.message || "Unknown error"}`);
      }
      
      return { room, player, alreadyJoined: false };
    },
    loadingMessage: 'Joining room...',
    successMessage: 'Joined room successfully!',
  });
  
  // Return all available hooks
  return {
    createRoom,
    joinRoom,
    // Additional hooks would be added here as needed
  };
} 
import { createClient } from "@/utils/supabase/client";
import { Database, Tables, TablesInsert } from "@/utils/supabase/types";
import { CreateRoomResult, JoinRoomResult, StartGameResult, LeaveRoomResult } from "./shared-types";

export type GameRoom = Tables<"game_rooms">;
export type GamePlayer = Tables<"game_players">;
export type GameRound = Tables<"game_rounds">;
export type PlayerCaption = Tables<"player_captions">;
export type PlayerVote = Tables<"player_votes">;
export type Profile = Tables<"profiles">;

/**
 * Game Service class for handling all game-related database operations
 */
export class GameService {
  /**
   * Create a new game room
   */
  static async createRoom(userId: string, playerName: string = "Player", roomName: string = "Game Room"): Promise<CreateRoomResult> {
    if (!userId) {
      throw new Error("User ID is required to create a room");
    }
    
    const supabase = createClient();
    
    try {
      // Try using API route first
      try {
        console.log("Attempting to create room via API route...");
        const response = await fetch('/api/create-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId, playerName, roomName })
        });
        
        console.log(`API response status: ${response.status}`);
        
        // Get the response text for debugging
        const responseText = await response.text();
        
        if (!response.ok) {
          console.error(`API returned error status ${response.status}:`, responseText);
          throw new Error(`API error: ${response.status} - ${responseText}`);
        }
        
        try {
          // Parse the JSON response
          const data = JSON.parse(responseText);
          console.log("Successfully created room via API route");
          return data as CreateRoomResult;
        } catch (parseError) {
          console.error("Failed to parse API response:", parseError);
          console.error("Raw response:", responseText);
          throw new Error("Invalid response from API");
        }
      } catch (apiError) {
        console.warn("API route failed in create-room, using fallback:", apiError);
        
        // Fallback to direct implementation
        console.log("Using fallback method to create room");
        
        // Generate a unique room code - use a format that works with RLS policies
        // Format: 6 alphanumeric characters, uppercase
        const generateCode = () => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoiding confusing chars like 0/O, 1/I
          let code = '';
          for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return code;
        };
        
        const roomCode = generateCode();
        
        // Check if user is authenticated before proceeding
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          throw new Error(`Authentication error: ${sessionError?.message || 'User not authenticated'}`);
        }
        
        console.log("Authenticated user confirmed, creating room with code:", roomCode);
        
        // 1. Create a new room - including all required fields
        const roomData = {
          code: roomCode,
          host_id: userId,
          status: "lobby", // Must match expected status in DB
          created_at: new Date().toISOString()
        };
        
        console.log("Inserting room with data:", JSON.stringify(roomData));
        
        const { data: room, error: roomError } = await supabase
          .from("game_rooms")
          .insert(roomData)
          .select()
          .single();
        
        if (roomError) {
          console.error("Room creation error details:", roomError);
          console.error("Room creation error message:", roomError.message);
          console.error("Room creation error code:", roomError.code);
          console.error("Room creation error details:", roomError.details);
          
          // If it's an RLS error, try to provide more guidance
          if (roomError.code === '42501' || roomError.message.includes('row-level security policy')) {
            throw new Error(`Failed to create room due to security policy. Make sure you're authenticated and have permission to create rooms. Error: ${roomError.message}`);
          }
          
          throw new Error(`Failed to create room: ${roomError.message}`);
        }
        
        if (!room) {
          throw new Error("Failed to create room: No data returned");
        }
        
        // 2. Get user profile for the game alias
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();
        
        if (profileError) {
          console.error("Profile fetch error:", profileError);
          // Continue even without a profile
        }
        
        // Generate a random animal-based alias
        const animalAdjectives = ["Polite", "Honest", "Brave", "Clever", "Witty", "Swift", "Kind", "Bold"];
        const animalNames = ["Rabbit", "Fox", "Bear", "Wolf", "Eagle", "Mouse", "Tiger", "Lion"];
        
        const randomAdjective = animalAdjectives[Math.floor(Math.random() * animalAdjectives.length)];
        const randomAnimal = animalNames[Math.floor(Math.random() * animalNames.length)];
        const gameAlias = `${randomAdjective}${randomAnimal}`;
        
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
          console.error("Player creation error:", playerError);
          throw new Error(`Failed to create player: ${playerError.message}`);
        }
        
        if (!player) {
          throw new Error("Failed to create player: No data returned");
        }
        
        // Save a flag that we just created this room to avoid double-joining
        // Only try to use localStorage in browser environments to avoid SSR issues
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(`created_room_${room.code}`, 'true');
          }
        } catch (e) {
          console.warn("Could not access localStorage:", e);
        }
        
        console.log("Successfully created room via fallback method");
        return { room, player };
      }
    } catch (error) {
      console.error("Room creation error:", error);
      throw error;
    }
  }
  
  /**
   * Join a game room using a room code
   */
  static async joinRoom(code: string, userId: string): Promise<JoinRoomResult> {
    if (!code || !userId) {
      throw new Error("Room code and User ID are required to join a room");
    }
    
    const supabase = createClient();
    
    try {
      console.log(`Attempting to join room with code: ${code}`);
      
      // Try using the API route first
      try {
        const response = await fetch('/api/join-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, userId })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("Successfully joined room via API route");
          return data as JoinRoomResult;
        }
        
        // If there's an error with the API route, log it but continue to fallback
        console.warn("API route error, using fallback method:", await response.text());
      } catch (apiError) {
        console.warn("API route failed, using fallback method:", apiError);
      }
      
      // FALLBACK: Implement the join-room logic directly in the client
      console.log("Using fallback method to join room");
      
      // 1. Get the room by code
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("code", code)
        .single();
      
      if (roomError) {
        console.error("Room fetch error:", roomError);
        throw new Error("Room not found");
      }
      
      if (!room) {
        throw new Error("Room not found or no longer available");
      }
      
      if (room.status !== "lobby") {
        throw new Error("Cannot join a game that has already started");
      }
      
      // 2. Check if player is already in the room
      const { data: existingPlayer, error: playerCheckError } = await supabase
        .from("game_players")
        .select("*")  // Select all fields to match the GamePlayer type
        .match({ room_id: room.id, user_id: userId })
        .maybeSingle();
      
      if (playerCheckError) {
        console.error("Player check error:", playerCheckError);
      }
      
      // If player is already in the room, just return success
      if (existingPlayer) {
        console.log("Player already in room, returning existing player");
        return {
          room,
          player: existingPlayer,
          reconnected: true
        };
      }
      
      // 3. Get user profile for the game alias
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      
      if (profileError) {
        console.error("Profile fetch error:", profileError);
        throw new Error("Failed to get user profile");
      }

      // Generate a random animal-based alias if no preferred alias exists
      const animalAdjectives = ["Polite", "Honest", "Brave", "Clever", "Witty", "Swift", "Kind", "Bold"];
      const animalNames = ["Rabbit", "Fox", "Bear", "Wolf", "Eagle", "Mouse", "Tiger", "Lion"];

      // const randomAdjective = animalAdjectives[Math.floor(Math.random() * animalAdjectives.length)];
      // const randomAnimal = animalNames[Math.floor(Math.random() * animalNames.length)];
      // const gameAlias = `${randomAdjective}${randomAnimal}`;

      let uniqueAlias = false;
      let randomAdjective = animalAdjectives[Math.floor(Math.random() * animalAdjectives.length)];
      let randomAnimal = animalNames[Math.floor(Math.random() * animalNames.length)];
      let gameAlias = `${randomAdjective}${randomAnimal}`;
      // fetch all players at once to avoid multiple queries ?
      for (let i = 0; i < 50; i++) {
        const { data: matchingAlias, error: comparePlayerError } = await supabase
          .from("game_players")
          .select("game_alias")  // Select all fields to match the GamePlayer type
          .match({ room_id: room.id, game_alias: gameAlias});

        if (comparePlayerError) {
          console.error("Alias read error:", comparePlayerError);
          randomAdjective = animalAdjectives[Math.floor(Math.random() * animalAdjectives.length)];
          randomAnimal = animalNames[Math.floor(Math.random() * animalNames.length)];
          gameAlias = `${randomAdjective}${randomAnimal}`;
          continue;
        }
        
        if(matchingAlias && matchingAlias.length > 0){
          randomAdjective = animalAdjectives[Math.floor(Math.random() * animalAdjectives.length)];
          randomAnimal = animalNames[Math.floor(Math.random() * animalNames.length)];
          gameAlias = `${randomAdjective}${randomAnimal}`;
        } else {
          uniqueAlias = true;
          break;
        } 
      }
      
      if(!uniqueAlias){
        gameAlias += Math.floor(Math.random() * 1000);
      }

      // 4. Create a new player record
      const { data: player, error: insertError } = await supabase
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
      
      if (insertError) {
        console.error("Player insert error:", insertError);
        throw new Error("Failed to add player to room");
      }
      
      console.log("Successfully joined room via fallback method");
      return {
        room,
        player,
        reconnected: false
      };
    } catch (error) {
      console.error("Room join error:", error);
      throw error;
    }
  }
  
  /**
   * Start a game session
   */
  static async startGame(roomId: string, hostId: string): Promise<StartGameResult> {
    if (!roomId || !hostId) {
      throw new Error("Room ID and Host ID are required to start a game");
    }
    
    const supabase = createClient();
    
    try {
      // Try using API route first
      try {
        const response = await fetch('/api/start-game', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roomId, userId: hostId })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("Successfully started game via API route");
          return data as StartGameResult;
        }
        
        // Log the error but continue to fallback
        console.warn("API route error in start-game, using fallback:", await response.text());
      } catch (apiError) {
        console.warn("API route failed in start-game, using fallback:", apiError);
      }
      
      console.log("Using fallback method to start game");
      
      // 1. Verify the user is the host of the room
      const { data: hostCheck, error: hostCheckError } = await supabase
        .from("game_players")
        .select("is_host")
        .match({ room_id: roomId, user_id: hostId })
        .single();
      
      if (hostCheckError) {
        console.error("Host check error:", hostCheckError);
        throw new Error("Failed to verify host status");
      }
      
      if (!hostCheck.is_host) {
        throw new Error("Only the host can start the game");
      }
      
      // 2. Update the room status to "in_progress"
      const { data: updatedRoom, error: roomUpdateError } = await supabase
        .from("game_rooms")
        .update({
          status: "in_progress",
          current_round: 1,
          updated_at: new Date().toISOString(),
          started_at: new Date().toISOString()
        })
        .eq("id", roomId)
        .select()
        .single();
      
      if (roomUpdateError) {
        console.error("Room update error:", roomUpdateError);
        throw new Error("Failed to update room status");
      }
      
      // 3. Create the first round
      const round = await this.createRound(roomId, 1);
      
      console.log("Successfully started game via fallback method");
      return { room: updatedRoom, round };
    } catch (error) {
      console.error("Game start error:", error);
      throw error;
    }
  }
  
  /**
   * Create a new game round
   */
  static async createRound(roomId: string, roundNumber: number): Promise<GameRound> {
    const supabase = createClient();
    
    // For testing purposes, using placeholder image URLs
    // In production, you would use real and AI-generated images
    const { data, error } = await supabase
      .from("game_rounds")
      .insert({
        room_id: roomId,
        round_number: roundNumber,
        real_image_url: "https://placekitten.com/500/500",
        fake_image_url: "https://placekitten.com/500/501",
        started_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Submit a caption for an image
   */
  static async submitCaption(roundId: string, playerId: string, caption: string): Promise<PlayerCaption> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("player_captions")
      .insert({
        round_id: roundId,
        player_id: playerId,
        caption,
        submitted_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Submit a vote for a player
   */
  static async submitVote(roomId: string, voterId: string, votedForId: string): Promise<PlayerVote> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("player_votes")
      .insert({
        room_id: roomId,
        voter_id: voterId,
        voted_for_id: votedForId,
        voted_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Get active game rooms
   */
  static async getActiveRooms(): Promise<GameRoom[]> {
    const supabase = createClient();
    
    try {
      // First get rooms that are in lobby status
      const { data: rooms, error } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("status", "lobby")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      if (!rooms || rooms.length === 0) return [];
      
      // For development, just return all rooms without checking player counts
      // This prevents the constant error messages about player counting
      return rooms;
      
      /* Commented out for development - enable this code for production
      // We'll use Promise.all to process rooms in parallel, but wait for all cleanups
      const roomPromises = rooms.map(async (room) => {
        try {
          // Get player count for this room
          const { count, error: countError } = await supabase
            .from("game_players")
            .select("*", { count: "exact", head: true })
            .eq("room_id", room.id);
          
          if (countError) {
            console.error(`Error counting players for room ${room.id}:`, countError);
            return null; // Skip this room due to error
          }
          
          // Only include rooms that have at least one player
          if (count && count > 0) {
            return room; // Return the room to include it
          } else {
            // Room has no players, clean it up
            console.log(`Room ${room.id} has no players, cleaning up...`);
            try {
              // Wait for cleanup to complete
              await this.cleanupRoomIfEmpty(room.id);
            } catch (err) {
              console.error(`Failed to clean up empty room ${room.id}:`, err);
            }
            // Don't include empty rooms in the results
            return null;
          }
        } catch (error) {
          console.error(`Error processing room ${room.id}:`, error);
          return null; // Skip on error
        }
      });
      
      // Wait for all room processing to complete
      const processedRooms = await Promise.all(roomPromises);
      
      // Filter out nulls (rooms that were empty or had errors)
      return processedRooms.filter((room): room is GameRoom => room !== null);
      */
    } catch (error) {
      console.error("Error getting active rooms:", error);
      // Return empty array instead of throwing for better UX during development
      return [];
    }
  }
  
  /**
   * Get room by code
   */
  static async getRoomByCode(code: string): Promise<GameRoom | null> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Get players in a room
   */
  static async getPlayersInRoom(roomId: string, includeOffline: boolean = false): Promise<GamePlayer[]> {
    const supabase = createClient();
    
    try {
      console.log(`Fetching players for room: ${roomId}, includeOffline: ${includeOffline}`);
      
      // Build the query
      let query = supabase
        .from("game_players")
        .select("*")
        .eq("room_id", roomId);
      
      // Only filter by online status if we don't want offline players
      if (!includeOffline) {
        query = query.eq("is_online", true);
      }
      
      // Execute the query
      const { data, error } = await query;
      
      if (error) {
        // Log the full error object for debugging
        console.error("Error fetching players - full error:", JSON.stringify(error, null, 2));
        
        // For development, return empty array instead of throwing
        console.warn("Returning empty player list due to error");
        return [];
      }
      
      // Log the response for debugging
      console.log(`Found ${data?.length || 0} players in room ${roomId}${!includeOffline ? ' (online only)' : ''}`);
      
      return data || [];
    } catch (err) {
      // Log the full error for debugging
      console.error("Exception in getPlayersInRoom:", err);
      console.error("Error details:", JSON.stringify(err, null, 2));
      
      // For development, return empty array
      return [];
    }
  }
  
  /**
   * Get current round details
   */
  static async getCurrentRound(roomId: string): Promise<GameRound | null> {
    const supabase = createClient();
    
    // Get the current round number from the room
    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .select("current_round")
      .eq("id", roomId)
      .single();
    
    if (roomError) throw roomError;
    if (!room.current_round) return null;
    
    // Get the round details
    const { data, error } = await supabase
      .from("game_rounds")
      .select("*")
      .eq("room_id", roomId)
      .eq("round_number", room.current_round)
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Set up real-time subscriptions for a room
   */
  static subscribeToRoom(roomId: string, callback: (payload: any) => void) {
    const supabase = createClient();
    
    return supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`
      }, callback)
      .subscribe();
  }
  
  /**
   * Set up real-time subscriptions for players in a room
   */
  static subscribeToPlayers(roomId: string, callback: (payload: any) => void) {
    const supabase = createClient();
    
    return supabase
      .channel(`players:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `room_id=eq.${roomId}`
      }, callback)
      .subscribe((status) => {
        // Log subscription status and adjust reconnection if needed
        console.log(`Player subscription status for room ${roomId}:`, status);
        
        if (status === 'SUBSCRIBED') {
          console.log(`Successfully subscribed to player changes for room ${roomId}`);
        } else {
          console.warn(`Player subscription status for room ${roomId}: ${status}`);
          
          // After a short delay, try to fetch players manually to keep state current
          setTimeout(() => {
            this.getPlayersInRoom(roomId)
              .then(players => {
                if (typeof callback === 'function') {
                  callback({
                    eventType: 'MANUAL_REFRESH',
                    new: null,
                    old: null,
                    players: players
                  });
                }
              })
              .catch(err => {
                console.error("Error in manual player refresh:", err);
              });
          }, 2000);
        }
      });
  }
  
  /**
   * Remove a player from a room
   */
  static async removePlayerFromRoom(playerId: string, userId: string, forceDelete: boolean = false): Promise<void> {
    if (!playerId || !userId) {
      throw new Error("Player ID and User ID are required");
    }
    
    const supabase = createClient();
    
    try {
      // Try using API route first for leave-room
      try {
        const response = await fetch('/api/leave-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ playerId, userId })
        });
        
        if (response.ok) {
          console.log("Successfully removed player via API route");
          return;
        }
        
        // Log the error but continue to fallback
        console.warn("API route error in leave-room, using fallback:", await response.text());
      } catch (apiError) {
        console.warn("API route failed in leave-room, using fallback:", apiError);
      }
      
      // FALLBACK: Direct implementation
      console.log("Using fallback method to remove player");
      
      // Get player details (to check if host and get room ID)
      const { data: player, error: playerError } = await supabase
        .from("game_players")
        .select("*")
        .eq("id", playerId)
        .eq("user_id", userId)
        .maybeSingle();
      
      if (playerError || !player) {
        // Silently fail if player record can't be found
        console.log("Player record not found or already removed");
        return;
      }
      
      const roomId = player.room_id;
      
      // If player is host, try to transfer host status to another player
      if (player.is_host) {
        console.log("Current player is host, attempting to transfer host status");
        
        // Find another online player in the room
        const { data: otherPlayers, error: otherPlayersError } = await supabase
          .from("game_players")
          .select("*")
          .eq("room_id", roomId)
          .eq("is_online", true)
          .neq("id", playerId)
          .order("joined_at", { ascending: true })
          .limit(1);
        
        if (otherPlayersError) {
          console.error("Error finding other players:", otherPlayersError);
        }
        
        // If found another player, transfer host status
        if (otherPlayers && otherPlayers.length > 0) {
          const newHostPlayer = otherPlayers[0] as GamePlayer;
          console.log(`Transferring host to player ${newHostPlayer.id}`);
          
          // Update the new host player
          await supabase
            .from("game_players")
            .update({ is_host: true })
            .eq("id", newHostPlayer.id);
          
          // Update the room host_id
          await supabase
            .from("game_rooms")
            .update({ host_id: newHostPlayer.user_id })
            .eq("id", roomId);
        } else {
          console.log("No other online players found to transfer host status to. Proceeding with leave.");
        }
      }
      
      // Update the player to offline or delete completely
      if (forceDelete) {
        console.log(`Force deleting player ${playerId}`);
        await supabase
          .from("game_players")
          .delete()
          .eq("id", playerId);
      } else {
        // For unintentional disconnects (crashes), just mark the player as offline
        // This keeps their place in the game in case they reconnect
        console.log(`Marking player ${playerId} as offline`);
        await supabase
          .from("game_players")
          .update({ 
            is_online: false,
            last_seen: new Date().toISOString() 
          })
          .eq("id", playerId);
      }
      
      // Check if the room is now empty and should be cleaned up
      await this.cleanupRoomIfEmpty(roomId);
    } catch (error) {
      console.error("Error removing player from room:", error);
      // Don't re-throw the error since this is usually a cleanup operation
      // that should proceed even if parts of it fail
    }
  }
  
  /**
   * Check if a room is empty and delete it if no players remain
   */
  static async cleanupRoomIfEmpty(roomId: string): Promise<void> {
    if (!roomId) {
      console.error("Cannot clean up room: missing roomId");
      return;
    }
    
    console.log(`Checking if room ${roomId} is empty...`);
    const supabase = createClient();
    
    try {
      // Add a small delay before checking if a room is empty
      // This prevents race conditions when players are joining/leaving
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Count players in the room
      const { count, error: countError } = await supabase
        .from("game_players")
        .select("*", { count: "exact", head: true })
        .eq("room_id", roomId);
      
      if (countError) {
        console.error("Error counting players in room:", countError);
        return;
      }
      
      console.log(`Room ${roomId} has ${count} players`);
      
      // If no players left, attempt to delete the room
      if (count === 0) {
        console.log(`Room ${roomId} is empty, attempting to delete it...`);
        
        try {
          // IMPORTANT: Even if we can't delete the room due to RLS policies,
          // we should mark it as no longer active so it doesn't show up in the hub
          const firstUpdateResult = await supabase
            .from("game_rooms")
            .update({ status: "completed" }) // Mark as completed instead of lobby
            .eq("id", roomId);
            
          console.log(`Updated room status to completed. Now attempting deletion...`);
          
          // Now attempt full deletion (this might fail due to RLS)
          const success = await this.forceDeleteRoom(roomId);
          
          if (success) {
            console.log(`Successfully deleted empty room ${roomId}`);
          } else {
            console.error(`Failed to delete room ${roomId}, but it's now marked as completed`);
          }
        } catch (error) {
          console.error(`Error in room cleanup attempt:`, error);
        }
      }
    } catch (error) {
      console.error("Error in cleanupRoomIfEmpty:", error);
    }
  }
  
  /**
   * Clean up stale game rooms (older than the specified hours)
   * This can be called periodically from an admin function
   */
  static async cleanupStaleRooms(olderThanHours: number = 24): Promise<void> {
    const supabase = createClient();
    
    try {
      // Calculate cutoff time
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);
      const cutoffISOString = cutoffTime.toISOString();
      
      // Get stale room IDs
      const { data: staleRooms, error: queryError } = await supabase
        .from("game_rooms")
        .select("id")
        .lt("created_at", cutoffISOString);
      
      if (queryError) {
        console.error("Error finding stale rooms:", queryError);
        return;
      }
      
      if (!staleRooms || staleRooms.length === 0) {
        console.log("No stale rooms found");
        return;
      }
      
      console.log(`Found ${staleRooms.length} stale rooms to clean up`);
      
      // Delete related data and rooms
      for (const room of staleRooms) {
        // Delete related data first (cascade doesn't work for all relations)
        await supabase
          .from("game_rounds")
          .delete()
          .eq("room_id", room.id);
          
        await supabase
          .from("player_votes")
          .delete()
          .eq("room_id", room.id);
          
        await supabase
          .from("game_players")
          .delete()
          .eq("room_id", room.id);
        
        // Then delete the room
        await supabase
          .from("game_rooms")
          .delete()
          .eq("id", room.id);
      }
      
      console.log(`Cleaned up ${staleRooms.length} stale rooms`);
    } catch (error) {
      console.error("Error in cleanupStaleRooms:", error);
    }
  }
  
  /**
   * Force delete a room and all its related data
   * This is a more aggressive version that tries to clear everything even if foreign keys might be blocking
   */
  static async forceDeleteRoom(roomId: string, userId?: string): Promise<boolean> {
    if (!roomId) {
      console.error("Cannot delete room: missing roomId");
      return false;
    }
    
    console.log(`Force deleting room ${roomId} and all related data...`);
    const supabase = createClient();
    
    try {
      // First, check if the room exists and get the host_id
      const { data: room, error: roomFetchError } = await supabase
        .from("game_rooms")
        .select("host_id")
        .eq("id", roomId)
        .maybeSingle();
        
      if (roomFetchError) {
        console.error("Error fetching room for deletion:", roomFetchError);
        return false;
      }
      
      // If room doesn't exist, consider the deletion successful
      if (!room) {
        console.log(`Room ${roomId} not found, considering deletion successful`);
        return true;
      }
      
      // Check if we need to respect the host-only policy
      if (userId && room.host_id !== userId) {
        console.error(`User ${userId} is not the host of room ${roomId}, cannot delete`);
        return false;
      }
      
      // 1. Get all round IDs for this room (needed for caption deletion)
      const { data: rounds, error: roundsError } = await supabase
        .from("game_rounds")
        .select("id")
        .eq("room_id", roomId);
        
      if (roundsError) {
        console.error("Error fetching rounds for deletion:", roundsError);
        // Continue anyway
      }
      
      const roundIds = rounds?.map(r => r.id) || [];
      console.log(`Found ${roundIds.length} rounds to clean up`);
      
      // 2. Delete player captions first using the round IDs
      if (roundIds.length > 0) {
        for (const roundId of roundIds) {
          try {
            const { error: captionsError } = await supabase
              .from("player_captions")
              .delete()
              .eq("round_id", roundId);
              
            if (captionsError) {
              console.error(`Error deleting captions for round ${roundId}:`, captionsError);
            }
          } catch (err) {
            console.error(`Error in caption deletion for round ${roundId}:`, err);
          }
        }
      }
      
      // 3. Delete all player votes for this room
      try {
        const { error: votesError } = await supabase
          .from("player_votes")
          .delete()
          .eq("room_id", roomId);
          
        if (votesError) {
          console.error("Error deleting votes:", votesError);
        } else {
          console.log("Successfully deleted votes");
        }
      } catch (err) {
        console.error("Error in votes deletion:", err);
      }
      
      // 4. Delete all players for this room
      try {
        const { error: playersError } = await supabase
          .from("game_players")
          .delete()
          .eq("room_id", roomId);
          
        if (playersError) {
          console.error("Error deleting players:", playersError);
        } else {
          console.log("Successfully deleted players");
        }
      } catch (err) {
        console.error("Error in player deletion:", err);
      }
      
      // 5. Delete all rounds for this room
      try {
        const { error: roundsDeleteError } = await supabase
          .from("game_rounds")
          .delete()
          .eq("room_id", roomId);
          
        if (roundsDeleteError) {
          console.error("Error deleting rounds:", roundsDeleteError);
        } else {
          console.log("Successfully deleted rounds");
        }
      } catch (err) {
        console.error("Error in rounds deletion:", err);
      }
      
      // 6. Finally, delete the room itself
      try {
        const { error: roomError } = await supabase
          .from("game_rooms")
          .delete()
          .eq("id", roomId);
          
        if (roomError) {
          console.error("Error deleting room:", roomError);
          console.error("Full error details:", JSON.stringify(roomError));
          return false;
        } else {
          console.log(`Successfully deleted room ${roomId}`);
          return true;
        }
      } catch (err) {
        console.error("Error in room deletion:", err);
        return false;
      }
    } catch (error) {
      console.error("Error in forceDeleteRoom:", error);
      return false;
    }
  }
  
  /**
   * Update a player's heartbeat to mark them as active
   */
  static async updatePlayerHeartbeat(playerId: string, userId: string): Promise<void> {
    if (!playerId || !userId) {
      throw new Error("Player ID and User ID are required");
    }
    
    try {
      // Try using API route first
      try {
        const response = await fetch('/api/player-heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ playerId, userId })
        });
        
        if (response.ok) {
          // Success, nothing else needed
          return;
        }
        
        // Log the error but continue to fallback
        console.warn("API route error in player-heartbeat, using fallback:", await response.text());
      } catch (apiError) {
        console.warn("API route failed in player-heartbeat, using fallback:", apiError);
      }
      
      // FALLBACK: Direct implementation
      console.log("Using fallback method for player heartbeat");
      
      const supabase = createClient();
      
      // Update the player's online status and last_seen timestamp
      await supabase
        .from("game_players")
        .update({
          is_online: true,
          last_seen: new Date().toISOString()
        })
        .eq("id", playerId)
        .eq("user_id", userId);
        
    } catch (error) {
      console.error("Error updating player heartbeat:", error);
      // Don't throw an error since heartbeat failures shouldn't break the UI
    }
  }
  
  /**
   * Clean up rooms with stale heartbeats
   * @param staleMinutes Number of minutes without a heartbeat to consider a room stale
   * @returns Promise resolving to the number of rooms cleaned up
   */
  static async cleanupStaleHeartbeats(staleMinutes: number = 5): Promise<number> {
    const supabase = createClient();
    
    try {
      // Calculate cutoff time
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - staleMinutes);
      const cutoffISOString = cutoffTime.toISOString();
      
      // Get stale rooms based on heartbeat
      const { data: staleRooms, error: queryError } = await supabase
        .from("game_rooms")
        .select("id")
        .lt("last_heartbeat", cutoffISOString)
        .eq("status", "lobby"); // Only cleanup lobby rooms, not in-progress or completed
      
      if (queryError) {
        console.error("Error finding stale heartbeat rooms:", queryError);
        return 0;
      }
      
      if (!staleRooms || staleRooms.length === 0) {
        console.log("No stale heartbeat rooms found");
        return 0;
      }
      
      console.log(`Found ${staleRooms.length} rooms with stale heartbeats to clean up`);
      
      // Process each stale room
      let cleanedCount = 0;
      for (const room of staleRooms) {
        try {
          // Mark room as completed
          const { error: updateError } = await supabase
            .from("game_rooms")
            .update({ status: "completed" })
            .eq("id", room.id);
          
          if (updateError) {
            console.error(`Error updating stale room ${room.id} status:`, updateError);
            continue;
          }
          
          // Try to fully delete the room
          const success = await this.forceDeleteRoom(room.id);
          
          if (success) {
            console.log(`Successfully deleted stale heartbeat room ${room.id}`);
            cleanedCount++;
          } else {
            console.error(`Failed to delete stale heartbeat room ${room.id}, but it's now marked as completed`);
          }
        } catch (error) {
          console.error(`Error cleaning up stale heartbeat room ${room.id}:`, error);
        }
      }
      
      return cleanedCount;
    } catch (error) {
      console.error("Error in cleanupStaleHeartbeats:", error);
      return 0;
    }
  }
  
  /**
   * Update room's heartbeat timestamp to keep it active
   * @param roomId The ID of the room to update
   * @returns Promise resolving to the updated room or null if update failed
   */
  static async updateRoomHeartbeat(roomId: string): Promise<GameRoom | null> {
    if (!roomId) {
      console.warn("Cannot update room heartbeat: missing roomId");
      return null;
    }
    
    console.log(`Updating heartbeat for room ${roomId}`);
    const supabase = createClient();
    
    try {
      // Update the room's last_heartbeat timestamp
      const { data, error } = await supabase
        .from("game_rooms")
        .update({ 
          last_heartbeat: new Date().toISOString() 
        })
        .eq("id", roomId)
        .select()
        .single();
      
      if (error) {
        console.error(`Error updating room heartbeat for ${roomId}:`, error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error(`Error in updateRoomHeartbeat for ${roomId}:`, error);
      return null;
    }
  }
  
  /**
   * Trigger the room heartbeat check, which will clean up empty and inactive rooms
   * This can be called periodically from a client or admin interface
   */
  static async triggerRoomHeartbeat(): Promise<boolean> {
    try {
      console.log("Triggering room heartbeat check");
      const response = await fetch('/api/room-heartbeat', {
        method: 'GET'
      });
      
      if (!response.ok) {
        console.error(`Room heartbeat check failed: ${response.status} ${response.statusText}`);
        return false;
      }
      
      const result = await response.json();
      console.log("Room heartbeat check result:", result);
      
      return result.success;
    } catch (error) {
      console.error("Error triggering room heartbeat:", error);
      return false;
    }
  }
} 
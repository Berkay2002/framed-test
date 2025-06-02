import { createClient } from "@/utils/supabase/client";
import { Database, Tables, TablesInsert } from "@/utils/supabase/types";
import { CreateRoomResult, JoinRoomResult, StartGameResult, LeaveRoomResult } from "./shared-types";
//import { v4 as uuidv4 } from "uuid";
import { ChatService } from './chat-service';

// Re-export types from database for convenience
export type GameRoom = Tables<"game_rooms"> & {
  // Add last_activity field used for dormant rooms
  last_activity?: string | null;
  // Ensure playerCount is included in the type
  playerCount?: number;
};

// Define proper room status types
export type RoomStatus = 'lobby' | 'in_progress' | 'completed';

// Define update types
export type RoomUpdates = Partial<{
  name: string;
  description: string;
  status: RoomStatus;
  current_round: number;
  completed_at: string | null;
  dormant_at: string | null;
  impostor_id: string | null;
}>;

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
        
        // Announce player joining the room
        ChatService.sendSystemMessage(
          room.id,
          `${gameAlias} has joined the room.`,
          'lobby'
        );
        
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
        //throw new Error("Room not found or no longer available");
      }
      
      // Handle Inactive rooms or completed games
      if (room.status === "dormant" || room.status === "completed") {
        console.log(`Room ${room.id} is ${room.status}, resetting...`);
        
        const updates: any = {
          updated_at: new Date().toISOString()
        };
        
      //   // If room is completed, reset to lobby
      //   if (room.status === "completed") {
      //     updates.status = "lobby";
      //     updates.current_round = null;
      //   }
        
        // If room is dormant, reactivate it to lobby
        if (room.status === "dormant") {
          updates.status = "lobby";
        }
        
        const { data: updatedRoom, error: updateError } = await supabase
          .from("game_rooms")
          .update(updates)
          .eq("id", room.id)
          .select()
          .single();
        
        if (updateError) {
          console.error("Error resetting room:", updateError);
          // Continue anyway, using the original room data
        } else if (updatedRoom) {
          console.log(`Successfully reset room ${room.id}`);
          // Use the updated room data
          room.status = updatedRoom.status;
          room.current_round = updatedRoom.current_round;
        }
      } else if (room.status !== "lobby") {
        // This should just be in_progress now
        throw new Error("Cannot join a game that is already in progress");
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
        
        // Make sure the player is marked as online
        await supabase
          .from("game_players")
          .update({ 
            is_online: true,
            last_seen: new Date().toISOString()
          })
          .eq("id", existingPlayer.id);
          
        // Announce player joining the room
        ChatService.sendSystemMessage(
          room.id,
          `${existingPlayer.game_alias} has rejoined the room.`,
          'lobby'
        );
        
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
      
      // Announce player joining the room
      ChatService.sendSystemMessage(
        room.id,
        `${gameAlias} has joined the room.`,
        'lobby'
      );
      
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
          // Parse the response with error handling
          try {
            const responseText = await response.text();
            
            // Try to parse as JSON
            let data;
            try {
              data = JSON.parse(responseText);
            } catch (parseError) {
              console.error("Error parsing start-game response:", parseError);
              console.error("Raw response:", responseText);
              throw new Error("Invalid response from API: " + responseText.substring(0, 100));
            }
            
            // If response doesn't have success property, or it's not true, throw an error
            if (!data.success) {
              throw new Error(data.error || "API returned unsuccessful response");
            }
            
            console.log("Successfully started game via API route");
            
            // Now that the game is started, we need to fetch the room and round data
            const { data: updatedRoom, error: roomError } = await supabase
              .from("game_rooms")
              .select("*")
              .eq("id", roomId)
              .single();
              
            if (roomError) {
              throw new Error("Failed to fetch updated room after game start: " + roomError.message);
            }
            
            // Get the created round
            const { data: roundData, error: roundError } = await supabase
              .from("game_rounds")
              .select("*")
              .eq("room_id", roomId)
              .eq("round_number", 1)
              .single();
              
            if (roundError) {
              console.error("Failed to fetch round data:", roundError);
              // Don't fail the entire operation, but return the room with null round
              return { room: updatedRoom, round: null };
            }
            
            return { room: updatedRoom, round: roundData };
          } catch (parsingError) {
            console.error("Error processing API response:", parsingError);
            throw parsingError;
          }
        }
        
        // Log the error but continue to fallback
        let errorText = "API returned status " + response.status;
        try {
          const errorResponse = await response.text();
          console.warn("API route error in start-game, using fallback:", errorResponse);
          errorText += ": " + errorResponse;
        } catch (readError) {
          console.warn("Failed to read error response:", readError);
        }
        throw new Error(errorText);
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
        throw new Error("Failed to verify host status: " + hostCheckError.message);
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
          started_at: new Date().toISOString()
        })
        .eq("id", roomId)
        .select()
        .single();
      
      if (roomUpdateError) {
        console.error("Room update error:", roomUpdateError);
        throw new Error("Failed to update room status: " + roomUpdateError.message);
      }
      
      // 3. Create the first round
      let round;
      try {
        round = await this.createRound(roomId, 1);
      } catch (roundError) {
        console.error("Failed to create game round:", roundError);
        // Don't fail the entire operation, but return null for the round
        round = null;
      }
      
      // Announce game start
      try {
        ChatService.sendSystemMessage(
          roomId,
          `Game started! Round 1 beginning...`,
          'lobby'
        );
      } catch (error) {
        console.error("Failed to send game start announcement:", error);
        // Don't block the game start if the announcement fails
      }
      
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
    
    console.log(`Creating round ${roundNumber} for room ${roomId}`);
    
    // Check if the round already exists to avoid duplicate creation
    const { data: existingRound, error: checkError } = await supabase
      .from("game_rounds")
      .select("*")
      .eq("room_id", roomId)
      .eq("round_number", roundNumber)
      .maybeSingle();
    
    if (!checkError && existingRound) {
      return existingRound;
    }
    
    try {
      // Select images first before creating the round
      console.log("Selecting images for new round");
      
      // 1. Get categories with at least 2 images
      console.log("Fetching categories from image_titles table...");
      const { data: categoriesRaw, error: categoriesError } = await supabase
        .from('image_titles')
        .select('category, file_path')
        .not('file_path', 'is', null)
        .gt('file_path', '');
      
      if (categoriesError) {
        console.error("Error fetching image categories:", categoriesError);
        throw new Error(`Failed to fetch image categories: ${categoriesError.message}`);
      }
      
      console.log(`Retrieved ${categoriesRaw?.length || 0} total rows from image_titles`);
      if (categoriesRaw && categoriesRaw.length > 0) {
        console.log("Sample file_path from first result:", categoriesRaw[0].file_path?.substring(0, 50) + "...");
      }
      
      if (!categoriesRaw || categoriesRaw.length < 2) {
        console.error("Not enough images found in database");
        throw new Error("Not enough images found in database");
      }
      
      // Count images per category
      const categoryCount: Record<string, number> = {};
      categoriesRaw.forEach(item => {
        if (item.category && item.file_path) {
          categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
        }
      });
      
      console.log("Categories with counts:", JSON.stringify(categoryCount));
      
      // Filter to categories with at least 2 images
      const validCategories = Object.entries(categoryCount)
        .filter(([_, count]) => count >= 2)
        .map(([category]) => category);
      
      console.log(`Found ${validCategories.length} categories with at least 2 images:`, validCategories);
      
      if (validCategories.length === 0) {
        console.error("No categories with at least 2 images found");
        throw new Error("No categories with enough images");
      }
      
      // Select a random category
      const randomCategory = validCategories[Math.floor(Math.random() * validCategories.length)];
      console.log(`Selected random category: ${randomCategory}`);
      
      // Get all images from this category
      console.log(`Fetching images for category "${randomCategory}"...`);
      const { data: images, error: imagesError } = await supabase
        .from('image_titles')
        .select('id, file_path, title, file_name, category')
        .eq('category', randomCategory)
        .not('file_path', 'is', null)
        .gt('file_path', '');
      
      if (imagesError) {
        console.error(`Error fetching images for category ${randomCategory}:`, imagesError);
        throw new Error(`Error fetching images: ${imagesError.message}`);
      }
      
      console.log(`Retrieved ${images?.length || 0} images for category "${randomCategory}"`);
      if (images && images.length > 0) {
        console.log("First few images:");
        images.slice(0, Math.min(3, images.length)).forEach((img, i) => {
          console.log(`  Image ${i+1}: id=${img.id}, title=${img.title || 'untitled'}, file_path=${img.file_path ? `${img.file_path.substring(0, 30)}...` : 'empty'}`);
        });
      }
      
      if (!images || images.length < 2) {
        console.error(`Not enough images in category ${randomCategory}`);
        throw new Error(`Not enough images in category ${randomCategory}`);
      }
      
      // Shuffle and select two different images
      const validImages = images.filter(img => img.file_path && img.file_path.trim() !== '');
      console.log(`Found ${validImages.length} images with valid file paths out of ${images.length} total`);
      
      const shuffledImages = [...validImages].sort(() => Math.random() - 0.5);
      
      if (shuffledImages.length < 2) {
        console.error(`Not enough valid images with file paths in category ${randomCategory}`);
        throw new Error(`Not enough valid images in category ${randomCategory}`);
      }
      
      const realImage = shuffledImages[0];
      const fakeImage = shuffledImages[1];
      
      console.log("Selected real image:", {
        id: realImage.id,
        title: realImage.title || 'unnamed',
        file_name: realImage.file_name,
        file_path: realImage.file_path ? `${realImage.file_path.substring(0, 30)}...` : 'invalid'
      });
      
      console.log("Selected fake image:", {
        id: fakeImage.id,
        title: fakeImage.title || 'unnamed',
        file_name: fakeImage.file_name,
        file_path: fakeImage.file_path ? `${fakeImage.file_path.substring(0, 30)}...` : 'invalid'
      });
      
      // Verify we have valid URLs before proceeding
      if (!realImage.file_path || !fakeImage.file_path) {
        console.error("Selected images don't have valid file paths");
        throw new Error("Selected images don't have valid file paths");
      }

      
      const roundDuration = 20 * 1000; // 20 seconds (milliseconds) for dev
      const deadLine = Date.now() + roundDuration;
      
      // Create the round with valid image URLs
      const { data, error } = await supabase
        .from("game_rounds")
        .insert({
          room_id: roomId,
          round_number: roundNumber,
          real_image_url: realImage.file_path,
          fake_image_url: fakeImage.file_path,
          started_at: new Date().toISOString(),
          deadline_at: new Date(deadLine).toISOString(),
        })
        .select()
        .maybeSingle();
      
      if (error) {
        // Check if it's a duplicate key error
        if (error.code === "23505") { // PostgreSQL duplicate key error
          // Try fetching the round that was just created by someone else
          console.log("Duplicate round detected, fetching the existing one");
          const { data: retryRound } = await supabase
            .from("game_rounds")
            .select("*")
            .eq("room_id", roomId)
            .eq("round_number", roundNumber)
            .single();
          
          if (!retryRound) {
            throw new Error("Round creation failed and no existing round found");
          }
          return retryRound;
        } else {
          throw error;
        }
      }
      
      if (!data) {
        throw new Error("Round creation returned no data");
      }
      
      console.log(`Successfully created round ${roundNumber} for room ${roomId} with images`);
      return data;
    } catch (createError) {
      console.error(`Failed to create round ${roundNumber}:`, createError);
      
      // Fallback - check if the round was created despite the error
      const { data: retryCheck } = await supabase
        .from("game_rounds")
        .select("*")
        .eq("room_id", roomId)
        .eq("round_number", roundNumber)
        .maybeSingle();
        
      if (retryCheck) {
        console.log("Found round despite creation error, using it");
        return retryCheck;
      }
      
      throw createError;
    }
  }
  
  
  //Submit a caption for an image
  static async submitCaption(roundId: string, playerId: string, caption: string): Promise<PlayerCaption> {

    // No longer uses direct Supabase client here, calls API instead
    const response = await fetch('/api/caption-submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roundId, playerId, captionText: caption }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      // Log the detailed error from the server if available
      console.error('API Error submitting caption:', responseData);
      const errorMessage = responseData.error || `Failed to submit caption. Status: ${response.status}`;
      const errorDetails = responseData.details || '';
      throw new Error(`${errorMessage}${errorDetails ? ` Details: ${errorDetails}` : ''}`);
    }

    return responseData as PlayerCaption;
  }

  // Submit multiple votes for a player
static async submitMultipleVotes(roomId: string, roundId: string, voterId: string, votedForIds: string[]): Promise<PlayerVote[]> {
    const supabase = createClient();

    try{
      console.log(`🗳️ VOTE SUBMISSION: Starting vote submission for voter ${voterId}`);
      console.log(`🗳️ VOTE SUBMISSION: Room ID: ${roomId}`);
      console.log(`🗳️ VOTE SUBMISSION: Round ID: ${roundId}`);
      console.log(`🗳️ VOTE SUBMISSION: Voted for IDs:`, votedForIds);
      
      // check if you are impostor
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .select("impostor_id")
        .eq("id", roomId)
        .single();
        
      if (roomError) {
        console.error(`❌ VOTE SUBMISSION: Error fetching room:`, roomError);
        throw roomError;
      }
      
      console.log(`🏠 VOTE SUBMISSION: Room data fetched, impostor_id: ${room?.impostor_id}`);

      //insert votes
      const voteRecords = votedForIds.map(votedForId => ({
        room_id: roomId,
        round_id: roundId,
        voter_id: voterId,
        voted_for_id: votedForId,
        voted_at: new Date().toISOString()
      }));

      console.log(`📝 VOTE SUBMISSION: Vote records to insert:`, voteRecords);

      const {data: votesData, error: votesError } = await supabase
        .from("player_votes")
        .insert(voteRecords)
        .select();

      if(votesError) {
        console.error(`❌ VOTE SUBMISSION: Error inserting votes:`, votesError);
        throw votesError;
      }
      
      console.log(`✅ VOTE SUBMISSION: Votes inserted successfully:`, votesData);

      //for each player get their points
      for(const playerId of votedForIds){

        //check if impostor for extra points
        const isImpostor = playerId === room?.impostor_id;

        const pointsToAward = isImpostor ? 1 : 2; //double points for impostor
        
        console.log(`🎯 VOTE SUBMISSION: Awarding ${pointsToAward} points to player ${playerId} (impostor: ${isImpostor})`);

        //get caption for this player in this round
        const {data: captions, error: captionError} = await supabase
          .from("player_captions")
          .select("id, points")
          .eq("player_id", playerId)
          .eq("round_id", roundId)
          .single();

        if (captionError) {
          console.error(`❌ VOTE SUBMISSION: Error fetching caption for player ${playerId}:`, captionError);
          throw captionError;
        }

        if (captions) {
          // increment current points value
          const currentPoints = captions.points || 0;
          console.log(`📊 VOTE SUBMISSION: Current points for player ${playerId}: ${currentPoints}`);
          
          const newPoints = currentPoints + pointsToAward;  
          console.log(`📊 VOTE SUBMISSION: New points for player ${playerId}: ${newPoints}`);
          
          //update value supabase
          const { error: updateError } = await supabase
            .from("player_captions")
            .update({ points: newPoints })
            .eq("id", captions.id);
            
          if (updateError) {
            console.error(`❌ VOTE SUBMISSION: Error updating points for player ${playerId}:`, updateError);
            throw updateError;
          }
          
          console.log(`✅ VOTE SUBMISSION: Points updated for player ${playerId}`);

        } else {
          console.warn(`⚠️ VOTE SUBMISSION: No caption found for player ${playerId} in round ${roundId}`);
        }
      }

      console.log(`🎉 VOTE SUBMISSION: All votes and points processed successfully`);
      return votesData || [];
    } catch(err){
      console.error("❌ VOTE SUBMISSION: Error submitting votes", err);
      throw err;
    }
  }//mul votes func end

  static async getVotingResults(roundId: string): Promise<any[]> {
  const supabase = createClient();
  
  // Get the room ID from the round
  const { data: round, error: roundError } = await supabase
    .from("game_rounds")
    .select("room_id")
    .eq("id", roundId)
    .single();
    
  if (roundError) throw roundError;
  
  // Get the room to determine impostor
  const { data: room, error: roomError } = await supabase
    .from("game_rooms")
    .select("impostor_id")
    .eq("id", round.room_id)
    .single();
    
  if (roomError) throw roomError;
  
  // Get all captions with their points
  const { data: captions, error: captionError } = await supabase
    .from("player_captions")
    .select("id, caption, player_id, points")
    .eq("round_id", roundId);
    
  if (captionError) throw captionError;
  if (!captions) return [];
  
  // Get player info to display names
  const { data: players, error: playerError } = await supabase
    .from("game_players")
    .select("id, game_alias")
    .eq("room_id", round.room_id);
    
  if (playerError) throw playerError;
  
  // Prepare results with player info and points
  const results = captions.map(caption => {
    const player = players?.find(p => p.id === caption.player_id);
    return {
      id: caption.id,
      caption: caption.caption,
      player_id: caption.player_id,
      player_alias: player?.game_alias || "Unknown Player",
      vote_count: Math.floor(caption.points || 0), // Estimate vote count based on points
      points: caption.points || 0,
      is_impostor: caption.player_id === room?.impostor_id
    };
  });
  
  // Sort by points descending
  return results.sort((a, b) => b.points - a.points);
}
  
  /**
   * Get active game rooms
   */
  static async getActiveRooms(): Promise<GameRoom[]> {
    const supabase = createClient();
    
    try {
      console.log("Fetching active and dormant rooms from the database...");
      
      // Get rooms that are in lobby status or dormant status
      const { data: rooms, error } = await supabase
        .from("game_rooms")
        .select("*")
        .in("status", ["lobby", "dormant"]) // Include both lobby and dormant rooms
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching rooms:", error);
        throw error;
      }
      
      if (!rooms || rooms.length === 0) {
        console.log("No active or dormant rooms found");
        return [];
      }
      
      console.log(`Found ${rooms.length} rooms: ${rooms.filter(r => r.status === "lobby").length} lobby, ${rooms.filter(r => r.status === "dormant").length} dormant`);
      
      // For each room, get the player count
      const roomsWithPlayerCount = await Promise.all(
        rooms.map(async (room) => {
          try {
            // Get player count for this room
            const { count, error: countError } = await supabase
              .from("game_players")
              .select("*", { count: "exact", head: true })
              .eq("room_id", room.id)
              .eq("is_online", true);
              
            if (countError) {
              console.error(`Error counting players for room ${room.id}:`, countError);
              return { ...room, playerCount: 0 };
            }
            
            const playerCount = count || 0;
            console.log(`Room ${room.id} (${room.code}) has ${playerCount} online players, status: ${room.status}`);
            
            return { 
              ...room, 
              playerCount
            };
          } catch (error) {
            console.error(`Error processing room ${room.id}:`, error);
            return { ...room, playerCount: 0 };
          }
        })
      );
      
      console.log(`Returning ${roomsWithPlayerCount.length} rooms with player counts`);
      return roomsWithPlayerCount;
    } catch (error) {
      console.error("Error getting active rooms:", error);
      // Return empty array instead of throwing for better UX
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
    
    try {
      console.log(`Fetching current round for room ${roomId}`);
      
      // Get the current round number from the room
      const { data: room, error: roomError } = await supabase
        .from("game_rooms")
        .select("current_round, status")
        .eq("id", roomId)
        .single();
      
      if (roomError) {
        console.error(`Error fetching room details for getCurrentRound: ${roomError.message}`);
        throw new Error(`Couldn't get room details: ${roomError.message}`);
      }
      
      // If room has no current round or is not in_progress, just return null
      if (!room.current_round || room.status !== 'in_progress') {
        console.log(`Room ${roomId} has no current round or is not in progress`);
        return null;
      }
      
      console.log(`Looking for round ${room.current_round} in room ${roomId}`);
      
      // Get the round details
      const { data: roundData, error: roundError } = await supabase
        .from("game_rounds")
        .select("*")
        .eq("room_id", roomId)
        .eq("round_number", room.current_round)
        .single();
      
      // If we found round data (even with empty image URLs), return it
      // The round-image-url API will populate the image URLs when requested
      if (!roundError && roundData) {
        console.log(`Successfully found round data for room ${roomId}, round ${room.current_round}`);
        return roundData;
      }
      
      // If the round doesn't exist at all, create a new one
      console.warn(`Round ${room.current_round} not found for room ${roomId}, creating it now`);
      
      try {
        // Attempt to create the round
        const { data: newRound, error: createError } = await supabase
          .from("game_rounds")
          .insert({
            room_id: roomId,
            round_number: room.current_round,
            started_at: new Date().toISOString(),
            real_image_url: "", // Empty placeholder that will be populated by round-image-url API
            fake_image_url: ""  // Empty placeholder that will be populated by round-image-url API
          })
          .select()
          .single();
        
        if (createError) {
          console.error(`Failed to create missing round: ${createError.message}`);
          throw new Error(`Couldn't create missing round: ${createError.message}`);
        }
        
        console.log(`Successfully created missing round ${room.current_round} for room ${roomId}`);
        return newRound;
      } catch (createErr) {
        console.error(`Error creating missing round: ${createErr}`);
        throw new Error(`Failed to get or create round: ${createErr}`);
      }
    } catch (err) {
      console.error(`Error in getCurrentRound for room ${roomId}:`, err);
      throw err;
    }
  }
  
  /**
   * Set up real-time subscriptions for a room
   */
  static subscribeToRoom(roomId: string, callback: (payload: any) => void) {
    const supabase = createClient();
    
    console.log(`🔌 Setting up room subscription for room: ${roomId}`);
    
    return supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`
      }, (payload) => {
        console.log(`📡 Room subscription received payload:`, payload);
        callback(payload);
      })
      .subscribe((status) => {
        console.log(`📺 Room subscription status for ${roomId}: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Successfully subscribed to room changes for ${roomId}`);
        } else if (status === 'TIMED_OUT') {
          console.error(`⏰ Room subscription TIMED OUT for ${roomId} - this may indicate auth/permission issues`);
        } else if (status === 'CLOSED') {
          console.error(`❌ Room subscription CLOSED for ${roomId}`);
        } else {
          console.warn(`⚠️ Room subscription status for ${roomId}: ${status}`);
        }
      });
  }
  
  /**
   * Set up real-time subscriptions for all game rooms
   * @param callback Function to call when room changes are detected
   */
  static subscribeToAllRooms(callback: (payload: any) => void) {
    const supabase = createClient();
    
    return supabase
      .channel('all-rooms')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_rooms'
      }, callback)
      .subscribe((status) => {
        console.log(`All rooms subscription status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to all room changes');
        } else {
          console.warn(`All rooms subscription status: ${status}`);
        }
      });
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
   * Leave a game room
   */
  static async leaveRoom(roomId: string, userId: string, playerId: string): Promise<LeaveRoomResult> {
    if (!roomId || !userId || !playerId) {
      throw new Error("Room ID, User ID and Player ID are required to leave a room");
    }
    
    const supabase = createClient();
    
    try {
      console.log(`Player ${playerId} (user ${userId}) leaving room ${roomId}`);
      
      // Mark player as offline
      const { error: updateError } = await supabase
        .from("game_players")
        .update({ 
          is_online: false,
          last_seen: new Date().toISOString() 
        })
        .eq("id", playerId)
        .eq("user_id", userId);
      
      if (updateError) {
        console.error("Error updating player status:", updateError);
        throw new Error("Failed to update player status");
      }
      
      // Check if the player is host and transfer host status if needed
      const { data: player, error: playerError } = await supabase
        .from("game_players")
        .select("is_host")
        .eq("id", playerId)
        .single();
      
      if (playerError) {
        console.error("Error fetching player info:", playerError);
      } else if (player.is_host) {
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
        } else if (otherPlayers && otherPlayers.length > 0) {
          const newHostPlayer = otherPlayers[0];
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
        }
      }
      
      // Count remaining online players in the room 
      const { count, error: countError } = await supabase
        .from("game_players")
        .select("*", { count: "exact", head: true })
        .eq("room_id", roomId)
        .eq("is_online", true);
      
      if (countError) {
        console.error("Error counting players:", countError);
      } else {
        const playerCount = count || 0;
        console.log(`Room ${roomId} has ${playerCount} remaining online players`);
        
        // If no online players remain and room is in lobby or in_progress, mark it as dormant (inactive)
        if (playerCount === 0) {
          console.log(`Room ${roomId} is empty after player left, marking as dormant (inactive)`);
          
          const { error: roomError } = await supabase
            .from("game_rooms")
            .update({ 
              status: "dormant",
              last_activity: new Date().toISOString() 
            })
            .eq("id", roomId);
          
          if (roomError) {
            console.error("Error updating room status:", roomError);
          } else {
            console.log(`Room ${roomId} marked as dormant (inactive)`);
          }
        }
      }
      
      // Get room and player details for announcement
      const { data: roomForAnnouncement } = await supabase
        .from("game_rooms")
        .select("id")
        .eq("id", roomId)
        .single();

      const { data: playerDetails } = await supabase
        .from("game_players")
        .select("game_alias")
        .eq("id", playerId)
        .single();

      // Announce player leaving
      if (roomForAnnouncement && playerDetails) {
        try {
          ChatService.sendSystemMessage(
            roomForAnnouncement.id,
            `${playerDetails.game_alias} has left the room.`,
            'lobby'
          );
        } catch (error) {
          console.error(`Error sending leave announcement: ${error}`);
        }
      }
      
      // Check if room is now empty and should be marked as inactive
      await this.cleanupRoomIfEmpty(roomId);
      
      return { 
        success: true,
        message: "Left room successfully" 
      };
    } catch (error) {
      console.error("Error in leaveRoom:", error);
      throw error;
    }
  }
  
  /**
   * Clean up a room if it's empty (has no players)
   */
  static async cleanupRoomIfEmpty(roomId: string): Promise<boolean> {
    if (!roomId) {
      console.warn("Cannot cleanup room: missing roomId");
      return false;
    }
    
    const supabase = createClient();
    
    try {
      // Check if room is empty
      const { count, error: countError } = await supabase
        .from("game_players")
        .select("*", { count: "exact", head: true })
        .eq("room_id", roomId);
      
      if (countError) {
        console.error(`Error counting players in room ${roomId}:`, countError);
        return false;
      }
      
      // Only clean up if there are zero players
      if (count === 0) {
        console.log(`Room ${roomId} is empty, cleaning up`);
        
        // Delete the room and all associated data
        const deleted = await GameService.forceDeleteRoom(roomId, 'system');
        return deleted;
      }
      
      console.log(`Room ${roomId} still has ${count} players, not cleaning up`);
      return false;
    } catch (error) {
      console.error(`Error in cleanupRoomIfEmpty for ${roomId}:`, error);
      return false;
    }
  }
  
  /**
   * Debug function to list all dormant rooms
   */
  static async getDormantRooms(): Promise<GameRoom[]> {
    const supabase = createClient();
    
    try {
      console.log("Fetching dormant rooms for debugging...");
      
      const { data: rooms, error } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("status", "dormant")
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching dormant rooms:", error);
        throw error;
      }
      
      console.log(`Found ${rooms?.length || 0} dormant rooms`);
      
      if (rooms?.length) {
        rooms.forEach(room => {
          console.log(`Dormant room: ${room.id} (${room.code}), host: ${room.host_id}`);
        });
      }
      
      return rooms || [];
    } catch (error) {
      console.error("Error getting dormant rooms:", error);
      return [];
    }
  }
  
  /**
   * Get ALL game rooms without filtering by status
   */
  static async getAllRooms(): Promise<GameRoom[]> {
    const supabase = createClient();
    
    try {
      console.log("Fetching ALL rooms from the database without status filtering...");
      
      // Get all rooms without filtering by status
      const { data: rooms, error } = await supabase
        .from("game_rooms")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching all rooms:", error);
        throw error;
      }
      
      if (!rooms || rooms.length === 0) {
        console.log("No rooms found at all");
        return [];
      }
      
      console.log(`Found ${rooms.length} total rooms with statuses:`, 
        rooms.reduce((acc, room) => {
          acc[room.status] = (acc[room.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      );
      
      // For each room, get the player count
      const roomsWithPlayerCount = await Promise.all(
        rooms.map(async (room) => {
          try {
            // Get player count for this room
            const { count, error: countError } = await supabase
              .from("game_players")
              .select("*", { count: "exact", head: true })
              .eq("room_id", room.id)
              .eq("is_online", true);
              
            if (countError) {
              console.error(`Error counting players for room ${room.id}:`, countError);
              return { ...room, playerCount: 0 };
            }
            
            const playerCount = count || 0;
            console.log(`Room ${room.id} (${room.code}) has ${playerCount} online players, status: ${room.status}`);
            
            return { 
              ...room, 
              playerCount
            };
          } catch (error) {
            console.error(`Error processing room ${room.id}:`, error);
            return { ...room, playerCount: 0 };
          }
        })
      );
      
      console.log(`Returning ${roomsWithPlayerCount.length} rooms with player counts`);
      return roomsWithPlayerCount;
    } catch (error) {
      console.error("Error getting all rooms:", error);
      // Return empty array instead of throwing for better UX
      return [];
    }
  }
  
  /**
   * Reactivate an inactive room by setting its status back to 'lobby'
   */
  static async reactivateRoom(roomId: string, userId: string): Promise<GameRoom | null> {
    if (!roomId || !userId) {
      console.error("Cannot reactivate room: missing roomId or userId");
      return null;
    }
    
    console.log(`Reactivating room ${roomId} for user ${userId}...`);
    const supabase = createClient();
    
    try {
      // First, check if the room exists and get the host_id
      const { data: room, error: roomFetchError } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomId)
        .single();
        
      if (roomFetchError) {
        console.error("Error fetching room for reactivation:", roomFetchError);
        return null;
      }
      
      // If room doesn't exist, return null
      if (!room) {
        console.log(`Room ${roomId} not found for reactivation`);
        return null;
      }
      
      // Check if user is the host
      if (room.host_id !== userId) {
        console.error(`User ${userId} is not the host of room ${roomId}, cannot reactivate`);
        return null;
      }
      
      // If room is already in lobby status, just return it
      if (room.status === 'lobby') {
        console.log(`Room ${roomId} is already active (lobby)`);
        return room;
      }
      
      // Update room status to lobby
      const { data: updatedRoom, error: updateError } = await supabase
        .from("game_rooms")
        .update({ 
          status: "lobby",
          updated_at: new Date().toISOString(),
        })
        .eq("id", roomId)
        .select()
        .single();
        
      if (updateError) {
        console.error("Error reactivating room:", updateError);
        return null;
      }
      
      console.log(`Successfully reactivated room ${roomId}`);
      return updatedRoom;
    } catch (error) {
      console.error("Error in reactivateRoom:", error);
      return null;
    }
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
   * Force delete a room and all related data
   * This is a permanent delete operation - use with caution!
   */
  static async forceDeleteRoom(roomId: string, userId: string): Promise<boolean> {
    if (!roomId || !userId) {
      console.error("Cannot delete room: missing roomId or userId");
      return false;
    }
    
    console.log(`Force deleting room ${roomId} by user ${userId}`);
    const supabase = createClient();
    
    try {
      // First, check if the user is the host of the room
      const { data: room, error: roomFetchError } = await supabase
        .from("game_rooms")
        .select("host_id")
        .eq("id", roomId)
        .single();
        
      if (roomFetchError) {
        console.error("Error fetching room for deletion:", roomFetchError);
        return false;
      }
      
      if (!room) {
        console.log(`Room ${roomId} not found for deletion`);
        return false;
      }
      
      // Check if user is the host or has admin privileges
      if (room.host_id !== userId) {
        console.error(`User ${userId} is not the host of room ${roomId}, cannot delete`);
        return false;
      }
      
      // Delete all player records first (due to foreign key constraints)
      const { error: playersDeleteError } = await supabase
        .from("game_players")
        .delete()
        .eq("room_id", roomId);
        
      if (playersDeleteError) {
        console.error("Error deleting players:", playersDeleteError);
        // Continue anyway - we want to try to delete as much as possible
      }
      
      // Delete all rounds in the room
      try {
        const { data: rounds, error: roundsError } = await supabase
          .from("game_rounds")
          .select("id")
          .eq("room_id", roomId);
          
        if (roundsError) {
          console.error("Error fetching rounds:", roundsError);
        } else if (rounds && rounds.length > 0) {
          // Delete captions for all rounds
          for (const round of rounds) {
            const { error: captionsError } = await supabase
              .from("player_captions")
              .delete()
              .eq("round_id", round.id);
              
            if (captionsError) {
              console.error(`Error deleting captions for round ${round.id}:`, captionsError);
            }
          }
          
          // Now delete the rounds
          const { error: roundsDeleteError } = await supabase
            .from("game_rounds")
            .delete()
            .eq("room_id", roomId);
            
          if (roundsDeleteError) {
            console.error("Error deleting rounds:", roundsDeleteError);
          }
        }
      } catch (roundsError) {
        console.error("Error handling rounds deletion:", roundsError);
      }
      
      // Delete votes
      try {
        const { error: votesError } = await supabase
          .from("player_votes")
          .delete()
          .eq("room_id", roomId);
          
        if (votesError) {
          console.error("Error deleting votes:", votesError);
        }
      } catch (votesError) {
        console.error("Error deleting votes (caught):", votesError);
      }
      
      // Finally, delete the room itself
      const { error: roomDeleteError } = await supabase
        .from("game_rooms")
        .delete()
        .eq("id", roomId)
        .eq("host_id", userId); // Extra safety check
        
      if (roomDeleteError) {
        console.error("Error deleting room:", roomDeleteError);
        return false;
      }
      
      console.log(`Successfully deleted room ${roomId}`);
      return true;
    } catch (error) {
      console.error("Error in forceDeleteRoom:", error);
      return false;
    }
  }
  
  /**
   * Clean up stale rooms that haven't been active for a specific number of hours
   * This is an admin function and will delete rooms and all related data
   */
  static async cleanupStaleRooms(hours: number = 24): Promise<number> {
    if (hours < 1) {
      console.error("Hours must be at least 1");
      return 0;
    }
    
    console.log(`Cleaning up rooms inactive for ${hours}+ hours`);
    const supabase = createClient();
    let cleanedCount = 0;
    
    try {
      // Calculate the cutoff time
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);
      const cutoffTimeString = cutoffTime.toISOString();
      
      // Find rooms with last activity older than the cutoff
      const { data: staleRooms, error: roomsError } = await supabase
        .from("game_rooms")
        .select("*")
        .lt("last_activity", cutoffTimeString);
      
      if (roomsError) {
        console.error("Error finding stale rooms:", roomsError);
        return 0;
      }
      
      if (!staleRooms || staleRooms.length === 0) {
        console.log("No stale rooms found");
        return 0;
      }
      
      console.log(`Found ${staleRooms.length} stale rooms to clean up`);
      
      // Process each stale room
      for (const room of staleRooms) {
        try {
          // Attempt to delete the room using our force delete method
          const success = await this.forceDeleteRoom(room.id, room.host_id);
          
          if (success) {
            cleanedCount++;
            console.log(`Successfully deleted stale room ${room.id} (${room.code})`);
          } else {
            console.error(`Failed to delete stale room ${room.id} (${room.code})`);
          }
        } catch (roomError) {
          console.error(`Error processing stale room ${room.id}:`, roomError);
        }
      }
      
      console.log(`Stale room cleanup completed: ${cleanedCount}/${staleRooms.length} rooms deleted`);
      return cleanedCount;
    } catch (error) {
      console.error("Error in cleanupStaleRooms:", error);
      throw error;
    }
  }
  
  //Get captions for a specific round
  static async getRoundCaptions(roundId: string): Promise<PlayerCaption[]> {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from("player_captions")
      .select("id, caption, round_id, player_id, submitted_at, peep_target_id, points")
      .eq("round_id", roundId);
      
    if (error) throw error;
    return data || [];
  }

  // Get round results with vote counts
  static async getRoundResults(roundId: string): Promise<{
    winner: {
      playerId: string;
      playerAlias: string;
      caption: string;
      voteCount: number;
    } | null;
    results: Array<{
      playerId: string;
      playerAlias: string;
      caption: string;
      voteCount: number;
    }>;
    totalVotes: number;
  }> {
    const supabase = createClient();
    
    try {
      console.log(`Getting round results for round ${roundId}`);
      
      // Get all captions for this round
      const { data: captions, error: captionsError } = await supabase
        .from("player_captions")
        .select("id, caption, player_id")
        .eq("round_id", roundId);
      
      if (captionsError) {
        console.error("Error fetching captions:", captionsError);
        throw new Error(`Failed to fetch captions: ${captionsError.message}`);
      }
      
      if (!captions || captions.length === 0) {
        console.log("No captions found for this round");
        return {
          winner: null,
          results: [],
          totalVotes: 0
        };
      }
      
      console.log(`Found ${captions.length} captions for round ${roundId}`);
      
      // Get player info for all players who submitted captions
      const playerIds = Array.from(new Set(captions.map(c => c.player_id) || []));
      const { data: players, error: playersError } = await supabase
        .from("game_players")
        .select("id, game_alias")
        .in("id", playerIds);
      
      if (playersError) {
        console.error("Error fetching players:", playersError);
        throw new Error(`Failed to fetch players: ${playersError.message}`);
      }
      
      // Create a map of player ID to alias for quick lookup
      const playerMap = new Map(players?.map(p => [p.id, p.game_alias]) || []);
      
      // Get the round info to find the room_id
      const { data: roundInfo, error: roundInfoError } = await supabase
        .from("game_rounds")
        .select("room_id")
        .eq("id", roundId)
        .single();
      
      if (roundInfoError || !roundInfo) {
        console.error("Error fetching round info:", roundInfoError);
        throw new Error(`Failed to fetch round info: ${roundInfoError?.message}`);
      }
      
      // Get all votes for players in this round, filtered by room_id to ensure we only get votes from this game
      const { data: votes, error: votesError } = await supabase
        .from("player_votes")
        .select("voted_for_id")
        .eq("room_id", roundInfo.room_id)
        .in("voted_for_id", playerIds);
      
      if (votesError) {
        console.error("Error fetching votes:", votesError);
        throw new Error(`Failed to fetch votes: ${votesError.message}`);
      }
      
      console.log(`Found ${votes?.length || 0} votes for this round`);
      
      // Count votes for each player
      const voteCounts: Record<string, number> = {};
      votes?.forEach(vote => {
        voteCounts[vote.voted_for_id] = (voteCounts[vote.voted_for_id] || 0) + 1;
      });
      
      console.log("Vote counts:", voteCounts);
      
      // Create results array
      const results = captions.map(caption => ({
        playerId: caption.player_id,
        playerAlias: playerMap.get(caption.player_id) || "Unknown Player",
        caption: caption.caption || "",
        voteCount: voteCounts[caption.player_id] || 0
      }));
      
      // Sort by vote count (descending) to find winner
      results.sort((a, b) => b.voteCount - a.voteCount);
      
      const winner = results.length > 0 ? results[0] : null;
      const totalVotes = votes?.length || 0;
      
      console.log(`Round results calculated: ${results.length} players, winner: ${winner?.playerAlias || 'none'} with ${winner?.voteCount || 0} votes`);
      
      return {
        winner,
        results,
        totalVotes
      };
    } catch (error) {
      console.error("Error in getRoundResults:", error);
      throw error;
    }
  }

  // Get all game results for a room (optimized for final results)
  static async getAllGameResults(roomId: string): Promise<Array<{
    roundNumber: number;
    roundId: string;
    results: Array<{
      playerId: string;
      playerAlias: string;
      caption: string;
      voteCount: number;
    }>;
  }>> {
    const supabase = createClient();
    
    try {
      console.log(`Getting all game results for room ${roomId}`);
      
      // Get all rounds for this room
      const { data: rounds, error: roundsError } = await supabase
        .from('game_rounds')
        .select('id, round_number')
        .eq('room_id', roomId)
        .order('round_number', { ascending: true });

      if (roundsError) {
        throw new Error(`Failed to fetch rounds: ${roundsError.message}`);
      }

      if (!rounds || rounds.length === 0) {
        console.log("No rounds found for this room");
        return [];
      }

      console.log(`Found ${rounds.length} rounds for room ${roomId}`);

      // Get results for each round individually to ensure proper vote counting per round
      const gameResults = [];
      
      for (const round of rounds) {
        try {
          const roundResults = await this.getRoundResults(round.id);
          gameResults.push({
            roundNumber: round.round_number,
            roundId: round.id,
            results: roundResults.results
          });
        } catch (error) {
          console.error(`Error getting results for round ${round.round_number}:`, error);
          // Continue with other rounds even if one fails
          gameResults.push({
            roundNumber: round.round_number,
            roundId: round.id,
            results: []
          });
        }
      }

      console.log(`Calculated results for ${gameResults.length} rounds`);
      return gameResults;

    } catch (error) {
      console.error("Error in getAllGameResults:", error);
      throw error;
    }
  }
}
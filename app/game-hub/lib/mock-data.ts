import { v4 as uuidv4 } from 'uuid';

// Types matching our database schema
export interface GameRoom {
  id: string;
  code: string;
  host_id: string;
  status: 'lobby' | 'in_progress' | 'completed';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  current_round: number;
  impostor_id?: string;
}

export interface GamePlayer {
  id: string;
  room_id: string;
  user_id: string;
  game_alias: string;
  joined_at: string;
  is_host: boolean;
}

// Pre-created mock data
const mockRooms: Record<string, GameRoom> = {
  "TESTROOM": {
    id: "test-room-id",
    code: "TESTROOM",
    host_id: "host-user-id",
    status: "lobby",
    created_at: new Date().toISOString(),
    current_round: 0
  }
};

const mockPlayers: Record<string, GamePlayer[]> = {
  "test-room-id": [
    {
      id: "host-player-id",
      room_id: "test-room-id",
      user_id: "host-user-id",
      game_alias: "Host Player",
      joined_at: new Date().toISOString(),
      is_host: true
    },
    {
      id: "player1-id",
      room_id: "test-room-id",
      user_id: "player1-user-id",
      game_alias: "Player 1",
      joined_at: new Date().toISOString(),
      is_host: false
    },
    {
      id: "player2-id",
      room_id: "test-room-id",
      user_id: "player2-user-id",
      game_alias: "Player 2",
      joined_at: new Date().toISOString(),
      is_host: false
    }
  ]
};

// Mock data store
class MockDataStore {
  private rooms: Record<string, GameRoom>;
  private players: Record<string, GamePlayer[]>;
  private currentUserId: string = 'mock-user-id';

  constructor() {
    this.rooms = { ...mockRooms };
    this.players = { ...mockPlayers };
    console.log("Mock data store initialized with test room: TESTROOM");
  }

  // Helper method
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => 
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
  }

  // Public methods that mimic Supabase client
  async createRoom(): Promise<{ data: GameRoom | null; error: Error | null }> {
    try {
      const roomId = uuidv4();
      const roomCode = this.generateRoomCode();
      
      const room: GameRoom = {
        id: roomId,
        code: roomCode,
        host_id: this.currentUserId,
        status: 'lobby',
        created_at: new Date().toISOString(),
        current_round: 0
      };

      const hostPlayer: GamePlayer = {
        id: uuidv4(),
        room_id: roomId,
        user_id: this.currentUserId,
        game_alias: 'GameMaster',
        joined_at: new Date().toISOString(),
        is_host: true
      };

      this.rooms[roomCode] = room;
      this.players[roomId] = [hostPlayer];

      console.log('Created room:', { roomCode, room, hostPlayer });
      console.log('Current rooms:', this.rooms);

      return { data: room, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async joinRoom(roomCode: string): Promise<{ data: GamePlayer | null; error: Error | null }> {
    try {
      const room = this.rooms[roomCode];
      
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.status !== 'lobby') {
        throw new Error('Game has already started');
      }

      const existingPlayers = this.players[room.id] || [];
      const existingPlayer = existingPlayers.find(p => p.user_id === this.currentUserId);
      
      if (existingPlayer) {
        return { data: existingPlayer, error: null };
      }

      const newPlayer: GamePlayer = {
        id: uuidv4(),
        room_id: room.id,
        user_id: this.currentUserId,
        game_alias: `Player${Math.floor(Math.random() * 1000)}`,
        joined_at: new Date().toISOString(),
        is_host: false
      };

      this.players[room.id] = [...existingPlayers, newPlayer];
      return { data: newPlayer, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async getRoomPlayers(roomId: string): Promise<{ data: GamePlayer[] | null; error: Error | null }> {
    try {
      return { data: this.players[roomId] || [], error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async getRoomByCode(roomCode: string): Promise<{ data: GameRoom | null; error: Error | null }> {
    try {
      console.log('Looking for room:', roomCode);
      console.log('Available rooms:', this.rooms);
      
      const room = this.rooms[roomCode];
      if (!room) {
        throw new Error('Room not found');
      }
      return { data: room, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async removePlayer(playerId: string): Promise<{ error: Error | null }> {
    try {
      Object.keys(this.players).forEach(roomId => {
        const roomPlayers = this.players[roomId];
        const updatedPlayers = roomPlayers.filter(p => p.id !== playerId);
        if (updatedPlayers.length !== roomPlayers.length) {
          this.players[roomId] = updatedPlayers;
        }
      });
      
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  async startGame(roomCode: string): Promise<{ error: Error | null }> {
    try {
      const room = this.rooms[roomCode];
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.host_id !== this.currentUserId) {
        throw new Error('Only the host can start the game');
      }

      const roomPlayers = this.players[room.id];
      if (!roomPlayers || roomPlayers.length < 3) {
        throw new Error('Need at least 3 players to start');
      }

      room.status = 'in_progress';
      room.started_at = new Date().toISOString();
      
      // Randomly select impostor
      const randomPlayer = roomPlayers[Math.floor(Math.random() * roomPlayers.length)];
      room.impostor_id = randomPlayer.user_id;
      
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  // Method to simulate different users (for testing)
  setCurrentUser(userId: string) {
    this.currentUserId = userId;
    console.log('Set current user:', userId);
  }
}

// Export a singleton instance
export const mockDataStore = new MockDataStore(); 
import { GameRoom, GamePlayer, GameRound } from './game-service';
import { StartGameResult } from './shared-types';

export interface GameContextType {
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
import { GameRoom, GamePlayer, GameRound } from './game-service';

// Return types for Edge Function responses
export type CreateRoomResult = { 
  room: GameRoom;
  player: GamePlayer;
};

export type JoinRoomResult = { 
  room: GameRoom;
  player: GamePlayer;
  reconnected?: boolean;
};

export type StartGameResult = { 
  room: GameRoom;
  round: GameRound | null;
};

export type LeaveRoomResult = {
  success: boolean;
  message?: string;
  error?: string;
  warning?: string;
};

// Adjective/Noun lists for alias generation
export const ADJECTIVES = [
  "Happy", "Silly", "Clever", "Brave", "Shiny", 
  "Jumpy", "Fluffy", "Bouncy", "Sneaky", "Sparkly",
  "Mighty", "Fancy", "Speedy", "Spooky", "Cosmic"
];
  
export const NOUNS = [
  "Penguin", "Tiger", "Dragon", "Unicorn", "Robot", 
  "Wizard", "Ninja", "Pirate", "Dinosaur", "Astronaut",
  "Raccoon", "Dolphin", "Phoenix", "Squirrel", "Knight"
];

// Shared utility functions
export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function generateGameAlias(
  existingAliases: string[] | Set<string>
): Promise<string> {
  const usedAliases = existingAliases instanceof Set 
    ? existingAliases 
    : new Set(existingAliases);
  
  // Try to find an unused combination
  let attempts = 0;
  let alias;
  
  while (attempts < 50) { // Set a reasonable max attempts limit
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    
    alias = `${adjective}${noun}`;
    
    // If the alias is not used, return it
    if (!usedAliases.has(alias)) {
      return alias;
    }
    
    attempts++;
  }
  
  // If we can't find an unused combination, add a random number suffix
  const randomSuffix = Math.floor(Math.random() * 1000);
  return `${alias || ADJECTIVES[0] + NOUNS[0]}${randomSuffix}`;
} 
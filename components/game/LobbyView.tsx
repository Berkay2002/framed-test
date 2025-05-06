import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { GamePlayer, GameRoom } from "@/lib/game-service";
import RoomHeader from "./RoomHeader";
import PlayerList from "./PlayerList";

interface LobbyViewProps {
  currentRoom: GameRoom;
  players: GamePlayer[];
  isHost: boolean;
  playerId: string | null;
  onStartGame: () => Promise<void>;
  onLeaveRoom: () => Promise<{ canceled?: boolean; error?: boolean } | unknown>;
}

export default function LobbyView({ 
  currentRoom, 
  players, 
  isHost, 
  playerId,
  onStartGame, 
  onLeaveRoom
}: LobbyViewProps) {
  return (
    <div className="max-w-6xl mx-auto py-8 px-4 bg-background min-h-screen">
      <RoomHeader 
        currentRoom={currentRoom} 
        players={players} 
        isGameInProgress={false}
        isHost={isHost}
        onStartGame={onStartGame}
        onLeaveRoom={onLeaveRoom}
      />
      
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-foreground">Players in Lobby</h2>
      </div>
      
      <PlayerList 
        players={players} 
        currentRoom={currentRoom} 
        playerId={playerId} 
      />
    </div>
  );
} 
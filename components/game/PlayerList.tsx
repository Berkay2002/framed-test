import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { UserIcon } from "lucide-react";
import { GamePlayer, GameRoom } from "@/lib/game-service";

interface PlayerListProps {
  players: GamePlayer[];
  currentRoom: GameRoom;
  playerId: string | null;
}

// Utility function to get initials from game alias
const getInitialsFromAlias = (alias: string | null) => {
  if (!alias) return '?';
  
  // Try to find the boundary between adjective and noun
  const firstCapitalIndex = alias.split('').findIndex((char, index) => 
    index > 0 && char === char.toUpperCase()
  );
  
  if (firstCapitalIndex > 0) {
    // If we found a capital letter in the middle, use first letter + first capital
    return `${alias[0]}${alias[firstCapitalIndex]}`;
  } else {
    // Otherwise just use the first 2 characters
    return alias.substring(0, 2).toUpperCase();
  }
};

export default function PlayerList({ players, currentRoom, playerId }: PlayerListProps) {
  return (
    <div>
      {Array.isArray(players) && players.length > 0 ? (
        players.map((player) => (
          <Card 
            key={player.id}
            className="mb-4"
          >
            <CardContent className="p-4 flex items-center">
              <Avatar className="mr-4">
                <AvatarFallback className="bg-secondary/20 text-foreground">
                  {getInitialsFromAlias(player.game_alias)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-foreground">{player.game_alias || 'Anonymous Player'}</p>
                {player.id === playerId && (
                  <p className="text-xs text-muted-foreground">You</p>
                )}
              </div>
              {player.is_host || player.user_id === currentRoom?.host_id ? (
                <div className="ml-2 px-2 py-1 bg-secondary/20 text-secondary-foreground text-xs rounded-full">
                  Host
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      ) : (
        <Card className="text-center py-8 border-dashed">
          <CardContent>
            <p className="text-muted-foreground">No players have joined yet</p>
          </CardContent>
        </Card>
      )}
      
      {players && players.length > 0 && players.length < 8 && (
        <Card className="mb-4 border-dashed">
          <CardContent className="p-4 flex items-center">
            <Avatar className="mr-4">
              <AvatarFallback className="bg-secondary/10 text-muted-foreground">
                <UserIcon className="w-5 h-5" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-muted-foreground">Waiting for player...</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 
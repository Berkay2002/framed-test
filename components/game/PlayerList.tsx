import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserIcon, Crown } from "lucide-react";
import { GamePlayer, GameRoom } from "@/lib/game-service";

interface PlayerListProps {
  players: GamePlayer[];
  currentRoom: GameRoom;
  playerId: string | null;
  compactView?: boolean;
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

export default function PlayerList({ players, currentRoom, playerId, compactView = false }: PlayerListProps) {
  // Add empty slots for potential players
  const maxPlayers = 8;
  const emptySlots = maxPlayers - (players?.length || 0);
  
  // Layout class based on compact view mode
  const gridLayoutClass = compactView 
    ? "grid grid-cols-2 gap-2" 
    : "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3";
  
  // Size classes for compact view
  const avatarSizeClass = compactView ? "h-6 w-6" : "h-10 w-10";
  const contentPaddingClass = compactView ? "p-2" : "p-3 sm:p-4";
  
  return (
    <div className={gridLayoutClass}>
      {Array.isArray(players) && players.length > 0 ? (
        players.map((player) => (
          <Card 
            key={player.id}
            className={`border ${player.id === playerId ? 'border-primary/30 bg-primary/5' : ''}`}
          >
            <CardContent className={`${contentPaddingClass} flex items-center`}>
              <Avatar className={`${avatarSizeClass} mr-3 flex-shrink-0`}>
                <AvatarFallback className={`text-sm ${player.id === playerId ? 'bg-primary/20 text-primary' : 'dark:bg-secondary/20 bg-gray-200 text-foreground'}`}>
                  {getInitialsFromAlias(player.game_alias)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`font-medium text-foreground truncate ${compactView ? "text-sm" : ""}`}>
                    {player.game_alias || 'Anonymous Player'}
                  </p>
                  {(player.is_host || player.user_id === currentRoom?.host_id) && (
                    <Crown className={`${compactView ? "h-3 w-3" : "h-4 w-4"} text-amber-400 flex-shrink-0`} />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {player.id === playerId && (
                    <Badge 
                      variant="secondary" 
                      className="text-[10px] h-4 px-1.5 py-0 rounded-sm"
                    >
                      You
                    </Badge>
                  )}
                  {(player.is_host || player.user_id === currentRoom?.host_id) && (
                    <p className={`${compactView ? "text-[10px]" : "text-xs"} text-muted-foreground`}>Host</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card className="col-span-full text-center py-8 border-dashed">
          <CardContent>
            <p className="text-muted-foreground">No players have joined yet</p>
          </CardContent>
        </Card>
      )}
      
      {emptySlots > 0 && !compactView && (
        Array(Math.min(emptySlots, 6)).fill(null).map((_, index) => (
          <Card key={`empty-${index}`} className="border-dashed border-border/50">
            <CardContent className={`${contentPaddingClass} flex items-center`}>
              <Avatar className="h-9 w-9 mr-3 flex-shrink-0">
                <AvatarFallback className="bg-gray-100 dark:bg-secondary/10 text-muted-foreground">
                  <UserIcon className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-muted-foreground text-sm">Waiting for player...</p>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
} 
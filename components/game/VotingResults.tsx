import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Award, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from '@/lib/game-context';

interface VotingResultsProps {
  results: Array<{
    id: string;
    caption: string;
    player_id: string;
    player_alias: string;
    vote_count: number;
    points: number;
    is_impostor: boolean;
  }>;
  isLoading?: boolean;
  isHost?: boolean; 
  onNextRound?: () => void;
  onReturnToMenu?: () => void;
}

export default function VotingResults({ 
  results, 
  isLoading = false,
  isHost,
  onNextRound,
  onReturnToMenu
}: VotingResultsProps) {


  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <h2 className="text-2xl font-bold text-center mb-6">Tallying Votes...</h2>
        {[1, 2, 3].map(i => (
          <Card key={i} className="p-4">
            <CardContent className="p-2 flex items-center gap-4">
              {/* Avatar placeholder */}
              <div className="h-10 w-10 rounded-full bg-muted/70 animate-pulse" />
              <div className="flex-1">
                {/* Name placeholder */}
                <div className="h-6 w-3/4 mb-2 bg-muted/70 animate-pulse rounded-md" />
                {/* Caption placeholder */}
                <div className="h-4 w-1/2 bg-muted/70 animate-pulse rounded-md" />
              </div>
              {/* Score placeholder */}
              <div className="h-8 w-8 rounded-full bg-muted/70 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  if (results.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-6">No Votes Cast</h2>
        <Card className="p-6 text-center">
          <CardContent>
            <p>No one voted in this round!</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-center mb-6">Round Results</h2>
      
      {/* Results explanation */}
      <div className="mb-6 text-center text-sm text-muted-foreground">
        <p>Players earn 1 point per vote received.</p>
        <p>The impostor earns 2 bonus points for each vote they receive!</p>
      </div>
      
      {/* Results list */}
      <div className="space-y-4">
        {results.map((result, index) => (
          <Card key={result.id} className={`p-4 ${index === 0 ? 'border-yellow-500' : ''}`}>
            <CardContent className="p-2 flex items-start gap-3">
              <div className="flex flex-col items-center justify-center mr-2">
                {index === 0 && <Trophy className="w-6 h-6 text-yellow-500 mb-1" />}
                {index === 1 && <Award className="w-6 h-6 text-gray-400 mb-1" />}
                {index === 2 && <Medal className="w-6 h-6 text-amber-700 mb-1" />}
                <div className="text-2xl font-bold">
                  #{index + 1}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-medium">{result.player_alias}</span>
                  {result.is_impostor && (
                    <Badge variant="destructive" className="text-xs">Impostor</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1">"{result.caption}"</p>
                
                {/* Votes and points */}
                <div className="mt-2 flex items-center gap-4">
                  <div className="text-sm">
                    <span className="font-bold text-primary">{result.points}</span> points
                    {result.is_impostor && result.vote_count > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (includes impostor bonus)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Debug info - remove after testing */}
      <div className="mt-4 text-center text-xs text-muted-foreground">
        Debug: isHost={String(isHost)}, hasNextRound={String(!!onNextRound)}
      </div>

      {/* Start Next Round Button for Host */}
      {isHost && (
        <div className="mt-8 flex justify-center">
          <Button 
            onClick={onNextRound}
            size="lg"
            className="min-w-[200px]"
            variant="default"
          >
            Start Next Round
          </Button>

          <Button 
            onClick={onReturnToMenu}
            size="lg"
            className="min-w-[200px]"
            variant="outline"
            >
          Return to Menu
        </Button>
        </div>
      )}
    </div>
  );
}
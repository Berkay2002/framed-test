import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { GameRoom, GamePlayer, GameRound } from "@/lib/game-service";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from '@/utils/supabase/client';
import { ChatPanel } from "./ChatPanel";
import { GameService } from "@/lib/game-service";
import { LogOutIcon, Trophy, Crown, Users } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { useButtonDebounce } from "@/hooks/useButtonDebounce";
import { useGame } from "@/lib/game-context";
import { motion, AnimatePresence } from "framer-motion";

interface ResultViewProps {
  currentRoom: GameRoom;
  currentRound: GameRound | null;
  players: GamePlayer[];
  isFinalResults?: boolean;
  onLeaveRoom: () => Promise<{ canceled?: boolean; error?: boolean } | unknown>;
  onNextRound?: () => Promise<void>;
  onReturnToLobby?: () => Promise<void>;
  isStartingNextRound?: boolean;
}

interface RoundResult {
  playerId: string;
  playerAlias: string;
  caption: string;
  voteCount: number;
}

interface RoundResults {
  winner: RoundResult | null;
  results: RoundResult[];
  totalVotes: number;
}

interface PlayerGameScore {
  playerId: string;
  playerAlias: string;
  totalVotes: number;
  roundsWon: number;
  roundResults: Array<{
    roundNumber: number;
    caption: string;
    voteCount: number;
    isWinner: boolean;
  }>;
}

interface FinalGameResults {
  gameWinner: PlayerGameScore | null;
  playerScores: PlayerGameScore[];
  totalRounds: number;
}

export default function ResultView({ 
  currentRoom, 
  currentRound, 
  players, 
  isFinalResults,
  onLeaveRoom,
  onNextRound,
  onReturnToLobby,
  isStartingNextRound = false
}: ResultViewProps) {
  // States for image and results
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageTitle, setImageTitle] = useState<string>('');
  const [imageName, setImageName] = useState<string>('');
  const [imageCategory, setImageCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null);
  const [finalResults, setFinalResults] = useState<FinalGameResults | null>(null);
  const [animationPhase, setAnimationPhase] = useState<"loading" | "reveal" | "winner" | "complete">("loading");
  const [revealedResults, setRevealedResults] = useState<number>(0);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  const router = useRouter();
  const supabase = createClient();

  const {
    userId,
    isHost,
    isImpostor,
  } = useGame();

  // Reset data loaded state when switching between rounds or result types
  useEffect(() => {
    setDataLoaded(false);
    setAnimationPhase("loading");
    setRevealedResults(0);
    setRoundResults(null);
    setFinalResults(null);
    setError(null);
  }, [currentRoom?.id, currentRound?.id, isFinalResults]);

  // Use debounce hook for leaving the room
  const { isLoading: isLeavingRoom, handleAction: handleLeaveRoom } = 
    useButtonDebounce(
      async () => {
        try {
          if (onLeaveRoom) {
            const result = await onLeaveRoom();
            if (result && typeof result === 'object' && 'canceled' in result && result.canceled) {
              console.log("Leave room operation canceled by user");
              return false;
            }
          }
          return true;
        } catch (error) {
          console.error("Error in leave room handler:", error);
          toast.error("There was an error leaving the room, but we'll try to redirect you anyway");
          return false;
        }
      },
      {}
    );

  // Load round results and image
  useEffect(() => {
    const loadRoundData = async () => {
      if (!currentRoom?.id) {
        setError("Missing room data");
        return;
      }

      // Handle final results differently
      if (isFinalResults) {
        await loadFinalGameResults();
        return;
      }

      if (!currentRound?.id) {
        setError("Missing round data");
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        console.log(`Loading results for room ${currentRoom.id}, round ${currentRound.id}`);

        // Load round results
        const results = await GameService.getRoundResults(currentRound.id);
        console.log("Round results loaded:", results);
        setRoundResults(results);

        // Load the real image (non-impostor version) for results
        const { data: roundData, error: roundError } = await supabase
          .from('game_rounds')
          .select('real_image_url')
          .eq('id', currentRound.id)
          .single();

        if (roundError) {
          console.error("Error loading round data:", roundError);
          throw new Error(`Could not load round image: ${roundError.message}`);
        }
        
        if (!roundData?.real_image_url) {
          console.error("Round data missing real_image_url:", roundData);
          throw new Error("Round image URL is missing");
        }

        console.log("Round image URL:", roundData.real_image_url);

        // Get image details
        const { data: imageDetails, error: imageError } = await supabase
          .from('image_titles')
          .select('title, file_name, category')
          .eq('file_path', roundData.real_image_url)
          .maybeSingle();

        if (imageError) {
          console.warn("Error loading image details:", imageError);
          // Don't fail completely, just use defaults
        }

        setImageUrl(roundData.real_image_url);
        setImageTitle(imageDetails?.title || "Game Image");
        setImageName(imageDetails?.file_name || "image.jpg");
        setImageCategory(imageDetails?.category || "Game Category");

        console.log("ResultView data loaded successfully");

        // Start animation sequence only once
        if (animationPhase === "loading") {
          setTimeout(() => setAnimationPhase("reveal"), 1000);
        }
        
        setDataLoaded(true);
        
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load results";
        console.error("Error loading round data:", err);
        console.error("Error details:", {
          roomId: currentRoom?.id,
          roundId: currentRound?.id,
          error: err
        });
        setError(message);
        toast.error(`Failed to load results: ${message}`);
      } finally {
        setIsLoading(false);
      }
    };

    const loadFinalGameResults = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log(`Loading final game results for room ${currentRoom.id}`);

        // Get results for each round
        const allRoundResults = await GameService.getAllGameResults(currentRoom.id);

        // Calculate player scores across all rounds
        const playerScores = new Map<string, PlayerGameScore>();

        // Initialize player scores
        players.forEach(player => {
          playerScores.set(player.id, {
            playerId: player.id,
            playerAlias: player.game_alias,
            totalVotes: 0,
            roundsWon: 0,
            roundResults: []
          });
        });

        // Aggregate results from all rounds
        allRoundResults.forEach(({ roundNumber, results }) => {
          const roundWinner = results.length > 0 ? results[0] : null;
          
          results.forEach(result => {
            const playerScore = playerScores.get(result.playerId);
            if (playerScore) {
              playerScore.totalVotes += result.voteCount;
              playerScore.roundResults.push({
                roundNumber,
                caption: result.caption,
                voteCount: result.voteCount,
                isWinner: result.playerId === roundWinner?.playerId
              });
              
              if (result.playerId === roundWinner?.playerId) {
                playerScore.roundsWon++;
              }
            }
          });
        });

        // Convert to array and sort by total votes
        const sortedPlayerScores = Array.from(playerScores.values())
          .sort((a, b) => {
            // First sort by rounds won, then by total votes
            if (b.roundsWon !== a.roundsWon) {
              return b.roundsWon - a.roundsWon;
            }
            return b.totalVotes - a.totalVotes;
          });

        const gameWinner = sortedPlayerScores.length > 0 ? sortedPlayerScores[0] : null;

        setFinalResults({
          gameWinner,
          playerScores: sortedPlayerScores,
          totalRounds: allRoundResults.length
        });

        console.log("Final game results loaded:", {
          winner: gameWinner?.playerAlias,
          totalPlayers: sortedPlayerScores.length
        });

        // Start animation sequence only once
        if (animationPhase === "loading") {
          setTimeout(() => setAnimationPhase("reveal"), 1000);
        }

        setDataLoaded(true);

      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load final results";
        console.error("Error loading final game results:", err);
        setError(message);
        toast.error(`Failed to load final results: ${message}`);
      } finally {
        setIsLoading(false);
      }
    };

    // Only load data if we haven't loaded it yet or if the key identifiers changed
    if (!dataLoaded && (isLoading || (!roundResults && !isFinalResults) || (!finalResults && isFinalResults))) {
      loadRoundData();
    }
  }, [currentRoom?.id, currentRound?.id, isFinalResults, dataLoaded]); // Added dataLoaded to dependencies

  // Animation sequence for revealing results
  useEffect(() => {
    if (animationPhase === "reveal") {
      const resultsToReveal = isFinalResults ? finalResults?.playerScores : roundResults?.results;
      
      if (resultsToReveal && resultsToReveal.length > 0) {
        // Reset revealed results when starting reveal phase
        setRevealedResults(0);
        
        const revealInterval = setInterval(() => {
          setRevealedResults(prev => {
            const next = prev + 1;
            if (next >= resultsToReveal.length) {
              clearInterval(revealInterval);
              setTimeout(() => setAnimationPhase("winner"), 1000);
              return resultsToReveal.length;
            }
            return next;
          });
        }, 800); // Reveal one result every 800ms

        return () => clearInterval(revealInterval);
      } else {
        // No results to reveal (e.g., voting was skipped), skip directly to complete
        console.log("No results to reveal, skipping animation to complete phase");
        setTimeout(() => setAnimationPhase("complete"), 1000);
      }
    }
  }, [animationPhase, finalResults?.playerScores, roundResults?.results]); // Add dependencies

  // Complete animation after winner reveal
  useEffect(() => {
    if (animationPhase === "winner") {
      const timer = setTimeout(() => {
        setAnimationPhase("complete");
      }, 3000); // Show winner for 3 seconds

      return () => clearTimeout(timer);
    }
  }, [animationPhase]);

  if (isLoading) {
    return (
      <div className="relative w-full max-w-7xl mx-auto px-4 py-6 mt-4 flex flex-col">
        <div className="absolute inset-0 game-grid-bg opacity-40"></div>
        <div className="relative z-10 flex items-center justify-center min-h-[400px]">
          <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20">
            <CardContent className="p-8">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">Calculating results...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative w-full max-w-7xl mx-auto px-4 py-6 mt-4 flex flex-col">
        <div className="absolute inset-0 game-grid-bg opacity-40"></div>
        <div className="relative z-10 flex items-center justify-center min-h-[400px]">
          <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20">
            <CardContent className="p-8">
              <div className="flex flex-col items-center gap-4">
                <p className="text-destructive font-medium">{error}</p>
                <Button 
                  variant="outline" 
                  onClick={() => window.location.reload()}
                  className="border-primary/20 hover:bg-primary/10"
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 py-6 mt-4 flex flex-col">
      {/* Game grid background */}
      <div className="absolute inset-0 game-grid-bg opacity-40"></div>
      
      {/* Content overlay */}
      <div className="relative z-10">
        {/* Header with leave button */}
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-foreground game-title">
            {isFinalResults 
              ? "Final Game Results" 
              : `Round ${currentRoom.current_round} Results`
            }
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLeaveRoom}
            disabled={isLeavingRoom}
            className="text-red-500 border-red-500/30 hover:bg-red-500/10 h-9"
          >
            {isLeavingRoom ? (
              <>
                <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                <span>Leaving...</span>
              </>
            ) : (
              <>
                <LogOutIcon className="h-4 w-4 mr-2" />
                <span>Leave Game</span>
              </>
            )}
          </Button>
        </div>
        
        {/* Main content area - split into two columns */}
        <div className="flex flex-col lg:flex-row gap-4 h-auto max-h-[calc(100vh-160px)] game-lobby-container overflow-hidden">
          {/* Left Side - Results Content */}
          <div className="w-full lg:w-1/2 flex flex-col">
            <div className="mb-2">
              <h3 className="text-lg font-medium text-foreground">
                {isFinalResults ? "Game Overview" : "Round Results"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isFinalResults 
                  ? "See the overall winner and player performance across all rounds!"
                  : "See who got the most votes for their caption!"
                }
              </p>
            </div>
            
            <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20 overflow-auto flex-grow relative">
              {/* Top edge glow */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
              
              <CardContent className="p-6">
                <div className="flex flex-col items-center w-full">
                  {/* Image display - only for round results */}
                  {!isFinalResults && imageUrl && (
                    <motion.div 
                      className="flex flex-col items-center w-full mb-6"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                      <div className="max-w-full mx-auto p-2 bg-background/50 backdrop-blur-sm rounded-md shadow-glow border border-primary/20">
                        <Image 
                          src={imageUrl} 
                          width={300} 
                          height={300} 
                          alt={imageName} 
                          className="object-contain rounded-md" 
                          priority
                        />
                      </div>
                      <div className="text-center mt-4">
                        <h2 className="text-xl text-foreground font-medium game-title">{imageTitle}</h2>
                        {imageCategory && (
                          <p className="text-base text-muted-foreground">
                            Category: <span className="text-primary/80">{imageCategory}</span>
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-2">
                          This was the real image that non-impostors saw
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Final Results Display */}
                  {isFinalResults && finalResults && (
                    <div className="w-full max-w-2xl">
                      <h3 className="text-lg font-semibold mb-4 text-center">Final Game Results</h3>
                      
                      {/* Game Winner Announcement */}
                      {finalResults.gameWinner && animationPhase === "winner" && (
                        <motion.div
                          className="mb-6 text-center"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                        >
                          <div className="bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-lg p-6 border border-yellow-400/30">
                            <Crown className="h-12 w-12 text-yellow-400 mx-auto mb-3" />
                            <h4 className="text-2xl font-bold text-foreground mb-2">
                              🏆 {finalResults.gameWinner.playerAlias} Wins the Game! 🏆
                            </h4>
                            <div className="flex justify-center gap-6 text-sm text-muted-foreground">
                              <span>Rounds Won: <strong className="text-yellow-400">{finalResults.gameWinner.roundsWon}</strong></span>
                              <span>Total Votes: <strong className="text-yellow-400">{finalResults.gameWinner.totalVotes}</strong></span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      
                      {/* Player Rankings */}
                      <div className="space-y-3">
                        <AnimatePresence>
                          {finalResults.playerScores.slice(0, revealedResults).map((player, index) => (
                            <motion.div
                              key={player.playerId}
                              initial={{ opacity: 0, x: -50, scale: 0.8 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              transition={{ 
                                duration: 0.6, 
                                ease: "easeOut",
                                delay: 0.1 
                              }}
                            >
                              <Card className={`
                                ${index === 0 && animationPhase === "winner" ? 
                                  'border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/20' : 
                                  index === 1 ? 'border-gray-400 bg-gray-400/10' :
                                  index === 2 ? 'border-orange-400 bg-orange-400/10' :
                                  'border-primary/20 bg-background/50'
                                } transition-all duration-500
                              `}>
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold text-muted-foreground">
                                          #{index + 1}
                                        </span>
                                        {index === 0 && animationPhase === "winner" && (
                                          <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                                          >
                                            <Trophy className="h-6 w-6 text-yellow-400" />
                                          </motion.div>
                                        )}
                                        {index === 1 && <Trophy className="h-5 w-5 text-gray-400" />}
                                        {index === 2 && <Trophy className="h-5 w-5 text-orange-400" />}
                                      </div>
                                      <div>
                                        <p className="font-medium text-foreground">
                                          {player.playerAlias}
                                        </p>
                                        <div className="flex gap-4 text-sm text-muted-foreground">
                                          <span>Rounds Won: <strong>{player.roundsWon}</strong></span>
                                          <span>Total Votes: <strong>{player.totalVotes}</strong></span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Round-by-round breakdown */}
                                  <div className="mt-3 pt-3 border-t border-primary/10">
                                    <p className="text-xs text-muted-foreground mb-2">Round Performance:</p>
                                    <div className="grid grid-cols-3 gap-2">
                                      {player.roundResults.map((round) => (
                                        <div 
                                          key={round.roundNumber}
                                          className={`text-xs p-2 rounded ${
                                            round.isWinner 
                                              ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30' 
                                              : 'bg-background/50 text-muted-foreground'
                                          }`}
                                        >
                                          <div className="font-medium">R{round.roundNumber}</div>
                                          <div>{round.voteCount} votes</div>
                                          {round.isWinner && <div className="text-xs">👑 Winner</div>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>

                      {/* Game Stats */}
                      <div className="mt-6 text-center text-sm text-muted-foreground">
                        <p>Game completed with {finalResults.totalRounds} rounds</p>
                        <p>Total players: {finalResults.playerScores.length}</p>
                      </div>
                    </div>
                  )}

                  {/* Round Results Display */}
                  {!isFinalResults && roundResults && (
                    <div className="w-full max-w-md">
                      <h3 className="text-lg font-semibold mb-4 text-center">Caption Results</h3>
                      
                      {/* Check if there are any results */}
                      {roundResults.results.length > 0 ? (
                        <>
                          {/* Results List with Animation */}
                          <div className="space-y-3">
                            <AnimatePresence>
                              {roundResults.results.slice(0, revealedResults).map((result, index) => (
                                <motion.div
                                  key={result.playerId}
                                  initial={{ opacity: 0, x: -50, scale: 0.8 }}
                                  animate={{ opacity: 1, x: 0, scale: 1 }}
                                  transition={{ 
                                    duration: 0.6, 
                                    ease: "easeOut",
                                    delay: 0.1 
                                  }}
                                >
                                  <Card className={`
                                    ${index === 0 && animationPhase === "winner" ? 
                                      'border-yellow-400 bg-yellow-400/10 shadow-lg shadow-yellow-400/20' : 
                                      'border-primary/20 bg-background/50'
                                    } transition-all duration-500
                                  `}>
                                    <CardContent className="p-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          {index === 0 && animationPhase === "winner" && (
                                            <motion.div
                                              initial={{ scale: 0 }}
                                              animate={{ scale: 1 }}
                                              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                                            >
                                              <Trophy className="h-6 w-6 text-yellow-400" />
                                            </motion.div>
                                          )}
                                          <div>
                                            <div className="font-medium text-foreground">
                                              {result.playerAlias}
                                              {index === 0 && animationPhase === "winner" && (
                                                <Badge className="ml-2 bg-yellow-400/20 text-yellow-400 border-yellow-400/30">
                                                  Winner!
                                                </Badge>
                                              )}
                                            </div>
                                            <p className="text-sm text-muted-foreground italic">
                                              "{result.caption}"
                                            </p>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="font-bold text-lg text-primary">
                                            {result.voteCount}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            vote{result.voteCount !== 1 ? 's' : ''}
                                          </p>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>

                          {/* Winner Celebration */}
                          {animationPhase === "winner" && roundResults.winner && (
                            <motion.div
                              className="mt-6 text-center"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 }}
                            >
                              <div className="bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-lg p-4 border border-yellow-400/30">
                                <Crown className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
                                <h4 className="text-xl font-bold text-foreground">
                                  🎉 {roundResults.winner.playerAlias} Wins! 🎉
                                </h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  With {roundResults.winner.voteCount} votes for: "{roundResults.winner.caption}"
                                </p>
                              </div>
                            </motion.div>
                          )}

                          {/* Stats */}
                          {roundResults.totalVotes > 0 && (
                            <div className="mt-6 text-center text-sm text-muted-foreground">
                              <p>Total votes cast: {roundResults.totalVotes}</p>
                              <p>Players participated: {roundResults.results.length}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        /* No Results Message */
                        <div className="text-center py-8">
                          <div className="bg-background/50 backdrop-blur-sm rounded-lg p-6 border border-primary/20">
                            <Crown className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                            <h4 className="text-lg font-medium text-foreground mb-2">
                              No Caption Results
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              Voting was skipped for this round.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  {(animationPhase === "complete" || (roundResults && roundResults.results.length === 0)) && isHost && (
                    <motion.div
                      className="mt-6 flex gap-2 justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      {!isFinalResults && onNextRound && (
                        <Button 
                          onClick={onNextRound}
                          disabled={isStartingNextRound}
                          className="bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isStartingNextRound ? (
                            <>
                              <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                              <span>Starting...</span>
                            </>
                          ) : (
                            "Next Round"
                          )}
                        </Button>
                      )}
                      {onReturnToLobby && !isFinalResults && (
                        <Button 
                          variant="outline"
                          onClick={onReturnToLobby}
                          className="border-primary/20 hover:bg-primary/10"
                        >
                          Return to Lobby
                        </Button>
                      )}
                      {onReturnToLobby && isFinalResults && (
                        <Button 
                          variant="outline"
                          onClick={onReturnToLobby}
                          className="border-primary/20 hover:bg-primary/10"
                        >
                          New Game
                        </Button>
                      )}
                    </motion.div>
                  )}

                  {/* Debug: Animation Phase Indicator (only show in development) */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="mt-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        Animation Phase: {animationPhase} | Results: {roundResults?.results.length || 0} | Host: {isHost ? 'Yes' : 'No'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
              
              {/* Bottom edge glow */}
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
            </Card>
          </div>
          
          {/* Right Side - Chat */}
          <div className="w-full lg:w-1/2 flex flex-col">
            <div className="mb-2">
              <h2 className="text-2xl font-semibold text-foreground">Game Chat</h2>
              <p className="text-sm text-muted-foreground">
                Discuss the results with other players
              </p>
            </div>
            
            <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20 flex-grow flex flex-col relative h-[calc(100vh-440px)]">
              {/* Top edge glow */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
              
              <CardContent className="p-0 flex-grow flex flex-col h-full overflow-hidden">
                <ChatPanel 
                  roomId={currentRoom.id} 
                  channel="lobby"
                  className="border-none dark:bg-background/30 h-full flex-grow"
                  maxHeight="none"
                />
              </CardContent>
              
              {/* Bottom edge glow */}
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
} 
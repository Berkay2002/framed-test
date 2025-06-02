import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { GameRoom, GamePlayer } from "@/lib/game-service";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from '@/utils/supabase/client';
import { ChatPanel } from "./ChatPanel";
import { GameService } from "@/lib/game-service";
import { LogOutIcon, Users, Send } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { useButtonDebounce } from "@/hooks/useButtonDebounce";
import { useGame } from "@/lib/game-context";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import TimeRemaining from "@/components/game/TimeRemaining";
import CaptionVoting from "./CaptionVoting";
import ResultView from "./ResultView";

interface GameViewProps {
  currentRoom: GameRoom;
  players: GamePlayer[];
  onLeaveRoom: () => Promise<{ canceled?: boolean; error?: boolean } | unknown>;
}

export default function GameView({ 
  currentRoom, 
  players, 
  onLeaveRoom 
}: GameViewProps) {
    // States for image handling
    const [imageUrl, setImageUrl] = useState<string>('');
    const [realImg, setRealImg] = useState<string>(''); // Add this line
    const [imageTitle, setImageTitle] = useState<string>('');
    const [imageName, setImageName] = useState<string>('');
    const [imageCategory, setImageCategory] = useState<string>('');
    const [isImageLoading, setIsImageLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadedRoundId, setLoadedRoundId] = useState<string | null>(null);
    const [captionText, setCaptionText] = useState('');
    const [hovering, setHovering] = useState(false);
    const [roundPhase, setRoundPhase] = useState<"captioning" | "voting" | "results" | "final_results">("captioning");
    const [isSkippingTimer, setIsSkippingTimer] = useState(false);
    const [isSkippingVoting, setIsSkippingVoting] = useState(false);
    const [lastSkipAction, setLastSkipAction] = useState<{ action: string; timestamp: number } | null>(null);
    const [isStartingNextRound, setIsStartingNextRound] = useState(false);
    const [votingDeadline, setVotingDeadline] = useState<string | null>(null);
    const router = useRouter();

    const supabase = createClient();

    const {
      userId,
      currentRoom: contextRoom,
      players: contextPlayers,
      currentRound,
      isHost,
      isImpostor,
      isLoading: contextIsLoading,
      submitCaption,
      leaveRoom,
      startGame,
      submitVote,
      submitMultipleVotes,
      advanceToRound,
    } = useGame();

    // Add state for captions
    const [roundCaptions, setRoundCaptions] = useState<Array<{
      id: string;
      caption: string;
      player_id: string;
      player_alias?: string;
    }>>([]);

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

    // Safety check: if room is not in_progress or is Inactive, we should be in the lobby
    useEffect(() => {
      const shouldBeInLobby = 
          currentRoom.status !== 'in_progress' || !currentRound;  //Check for missing round data
      
      if (shouldBeInLobby) {
        console.log(`Room ${currentRoom.id} view issue:`, {
          status: currentRoom.status,
          currentRound: currentRound ? 'exists' : 'missing',
        });
        
        // Check if we need to try and fetch the round data
        if (currentRoom.status === 'in_progress' && !currentRound && currentRoom.current_round) {
          // Try to get the round data directly from the database
          const fetchRoundData = async () => {
            try {
              const { data: roundData, error: roundError } = await supabase
                .from('game_rounds')
                .select('*')
                .eq('room_id', currentRoom.id)
                .eq('round_number', currentRoom.current_round || 1)
                .single();
                
              if (roundError || !roundData) {
                console.error("Error fetching round data:", roundError);
                
                // Dispatch an event to notify parent components that the view should change
                window.dispatchEvent(new CustomEvent('game:view-change-needed', {
                  detail: { 
                    newStatus: 'lobby',
                    message: "Game data is incomplete. Returning to lobby."
                  }
                }));
                
                // Force navigation back to the room page to reset the view
                setTimeout(() => {
                  router.refresh();
                }, 2000);
              } else {
                console.log("Successfully fetched round data:", roundData);
                // Trigger a refresh to update the UI with the round data
                router.refresh();
              }
            } catch (err) {
              console.error("Failed to fetch round data:", err);
              toast.error("Failed to load game data. Please refresh the page.");
            }
          };
          
          fetchRoundData();
        } else {
          // Show a toast message to inform the user
          toast.info("Game data is incomplete. Returning to lobby.");
          
          // Force navigation back to the room page to reset the view
          setTimeout(() => {
            router.refresh();
          }, 1000);
        }
      }
    }, [currentRoom.status, currentRoom.id, currentRoom.current_round, currentRound, router, supabase]);

    const activeRoom = contextRoom;
    const activePlayers = contextPlayers;

    // Image loading effect
    useEffect(() => {
      // Only load image for in-progress game with valid round
      if (!currentRoom?.id || !currentRoom.current_round || !currentRound?.id || currentRoom.status !== 'in_progress') {
        return;
      }
      
      // Skip if we've already loaded this round's image
      if (loadedRoundId === currentRound.id && imageUrl) {
        console.log(`Image already loaded for round ${currentRound.id}`);
        return;
      }
      
      // Function to load the image
      const loadRoundImage = async (retryCount = 0) => {
        try {
          setIsImageLoading(true);
          setError(null);
          
          console.log(`Loading image for room ${currentRoom.id}, round ${currentRoom.current_round}, retry: ${retryCount}`);
          
          // Step 1: Try to get the round data directly from the database first
          const { data: roundData, error: roundError } = await supabase
            .from('game_rounds')
            .select('id, real_image_url, fake_image_url')
            .eq('room_id', currentRoom.id)
            .eq('round_number', currentRoom.current_round || 1)
            .maybeSingle();
          
          // Check if we have valid image URLs in the database
          const hasValidImages = !roundError && 
                              roundData && 
                              roundData.real_image_url && 
                              roundData.fake_image_url && 
                              roundData.real_image_url !== '' && 
                              roundData.fake_image_url !== '';
          
          // If we got round data with valid images, use it
          if (hasValidImages) {
            console.log(`Found round ${roundData.id} with images in database`);
            // Select the appropriate URL based on player role
            const isPlayerImpostor = userId === currentRoom.impostor_id;
            const selectedUrl = isPlayerImpostor ? roundData.fake_image_url : roundData.real_image_url;
            setRealImg(roundData.real_image_url); // Set realImg in state
            
            // Debug log
            console.log(`Selected ${isPlayerImpostor ? 'fake' : 'real'} image URL: ${selectedUrl.substring(0, 30)}...`);
            
            // Get image details from the image_titles table
            const { data: imageDetails } = await supabase
              .from('image_titles')
              .select('title, file_name, category')
              .eq('file_path', selectedUrl)
              .maybeSingle();
            
            if (selectedUrl) {
              // Pre-load the image
              try {
                await new Promise<void>((resolve, reject) => {
                  const img = new window.Image();
                  img.onload = () => resolve();
                  img.onerror = (e) => reject(new Error(`Failed to load image from URL: ${e}`));
                  img.src = selectedUrl;
                  
                  // Set a timeout to fail if image doesn't load within 10 seconds
                  setTimeout(() => reject(new Error('Image load timeout after 10 seconds')), 10000);
                });
                
                // Update state with image data
                setImageUrl(selectedUrl);
                setImageTitle(imageDetails?.title || "Game Image");
                setImageName(imageDetails?.file_name || "image.jpg");
                setImageCategory(imageDetails?.category || "Game Category");
                setLoadedRoundId(roundData.id);
                
                console.log(`Successfully loaded image directly from database for round ${roundData.id}`);
                return;
              } catch (imgError) {
                console.error(`Image loading error: ${imgError}`);
                throw new Error(`Image failed to load: ${imgError}`);
              }
            }
          } else if (roundData) {
            console.log(`Found round ${roundData.id} but URLs are empty or invalid. Real: ${roundData.real_image_url ? 'exists' : 'empty'}, Fake: ${roundData.fake_image_url ? 'exists' : 'empty'}`);
          }
          
          // If we couldn't get valid images from the database, use the API to populate them
          console.log("No valid images found in database, calling API to populate game_rounds");
          
          // Call the API to populate the game_rounds table
          const response = await fetch(`/api/round-image-url?key=${currentRoom.id}`);
          
          if (!response.ok) {
            // Try to extract error details from response
            let errorMessage = `Error (${response.status})`;
            let errorDetails = '';
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
              errorDetails = errorData.details || '';
              console.error("API error details:", errorData);
            } catch (e) {
              console.error("Failed to parse error response:", e);
              errorDetails = 'Could not parse error response';
            }
            
            // If the API fails and we've retried less than 5 times, wait and retry
            if (retryCount < 5) {
              console.log(`API call failed. Retry ${retryCount + 1}/5: Waiting 2 seconds before retrying`);
              setTimeout(() => loadRoundImage(retryCount + 1), 2000);
              return;
            }
            
            throw new Error(`Failed to get image: ${errorMessage}${errorDetails ? ` (${errorDetails})` : ''}`);
          }
          
          // Parse the API response to verify it has a URL
          try {
            const data = await response.json();
            console.log("API response:", data.url ? 'Has URL' : 'No URL');
            
            if (!data.url) {
              throw new Error("API returned success but no image URL was provided");
            }
            
            // Set image data from API response
            setImageUrl(data.url);
            setImageTitle(data.title || "Game Image");
            setImageName(data.file_name || "image.jpg");
            setImageCategory(data.category || "Game Category");
            
            // Update the loaded round ID
            if (roundData?.id) {
              setLoadedRoundId(roundData.id);
            }
            
            console.log("Successfully loaded image from API response");
            return;
          } catch (parseError) {
            console.error("Failed to parse API response:", parseError);
            throw new Error(`Failed to process API response: ${parseError}`);
          }
          
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to load image";
          console.error(`Image loading error (retry ${retryCount}/5):`, message);
          
          // If we've retried less than 5 times, wait and try again for certain errors
          if (retryCount < 5) {
            console.log(`Retry ${retryCount + 1}/5: Will retry in 2 seconds`);
            setTimeout(() => loadRoundImage(retryCount + 1), 2000);
            return;
          }
          
          setError(message);
          toast.error(`Failed to load image: ${message}`);
        } finally {
          setIsImageLoading(false);
        }
      };
      
      // Load image
      loadRoundImage(0);
    }, [currentRoom?.id, currentRoom?.current_round, currentRoom?.status, currentRound?.id, loadedRoundId, imageUrl]);

    // Handle caption submission
    const handleCaptionSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!captionText.trim()) {
        toast.error("Caption cannot be empty");
        return;
      }
      
      try {
        await submitCaption(captionText);
        toast.success("Caption submitted successfully!");
        setCaptionText(""); // Clear input after submission
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to submit caption";
        toast.error(`Error: ${message}`);
      }
    };

    // Fetch round captions
    const fetchRoundCaptions = async (roundId: string) => {
      try {
        //setIsLoading(true);
        const captions = await GameService.getRoundCaptions(roundId);
        
        // Enhance captions with player aliases
        const captionsWithAliases = captions.map(caption => {
            const player = players.find(p => p.id === caption.player_id);
            return {
              ...caption,
              caption: caption.caption || "",
              player_alias: player?.game_alias || "Unknown Player"
            };
        });
        
        setRoundCaptions(captionsWithAliases);
      } catch (err) {
        console.error("Failed to fetch captions:", err);
        toast.error("Failed to load captions for voting");
      } finally {
        //setIsLoading(false);
      }
    };

    // Monitor round deadline and transition between phases
    useEffect(() => {
      if (!currentRound?.deadline_at) return;
      
      const deadlineTime = new Date(currentRound.deadline_at).getTime();
      const currentTime = Date.now();
      const timeRemaining = deadlineTime - currentTime;
      
      if (timeRemaining <= 0) {
        // Deadline already passed
        setRoundPhase("voting");
        return;
      }
      
      // Set timer to transition to voting phase
      const timer = setTimeout(() => {
        setRoundPhase("voting");
        // Fetch captions when transitioning to voting
        fetchRoundCaptions(currentRound.id);
      }, timeRemaining);
      
      return () => clearTimeout(timer);
    }, [currentRound?.deadline_at, currentRound?.id]);

    // Monitor for real-time round updates (for skip actions)
    useEffect(() => {
      if (!currentRoom?.id || !currentRound?.id) return;

      const supabase = createClient();
      
      console.log(`Setting up real-time subscriptions for room ${currentRoom.id}, round ${currentRound.id}`);
      
      // Subscribe to round changes (for deadline updates when host skips timer)
      const roundSubscription = supabase
        .channel(`round-updates-${currentRound.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'game_rounds',
            filter: `id=eq.${currentRound.id}`
          },
          (payload) => {
            console.log("Round update detected:", payload);
            const updatedRound = payload.new;
            
            // Check if deadline was updated (host skipped timer)
            if (updatedRound.deadline_at) {
              const deadlineTime = new Date(updatedRound.deadline_at).getTime();
              const currentTime = Date.now();
              const timeDiff = deadlineTime - currentTime;
              
              console.log(`Deadline check: ${deadlineTime} vs ${currentTime}, diff: ${timeDiff}ms`);
              
              // If deadline is now or in the past, or very close (within 5 seconds), transition to voting
              // This accounts for network delays and clock differences
              if (timeDiff <= 5000) { // 5 second buffer for reliability
                console.log("Deadline updated by host (real-time), transitioning to voting");
                setRoundPhase("voting");
                fetchRoundCaptions(currentRound.id);
                toast.info("Host skipped the timer! Moving to voting phase.");
              }
            }
          }
        )
        .subscribe((status) => {
          console.log(`Round subscription status: ${status}`);
        });

      // Subscribe to broadcast messages for skip notifications
      const broadcastSubscription = supabase
        .channel(`room-${currentRoom.id}-host-actions`)
        .on(
          'broadcast',
          { event: 'host_action' },
          (payload) => {
            console.log("Host action broadcast received:", payload);
            const { action, message } = payload.payload;
            
            // Check for skip timer action
            if (action === 'skip_timer') {
              console.log("Host skipped timer via broadcast, transitioning to voting");
              // Only transition if we're not already in voting phase
              if (roundPhase !== "voting") {
                setRoundPhase("voting");
                fetchRoundCaptions(currentRound.id);
                toast.info("Host skipped the timer! Moving to voting phase.");
              }
            }
            
            // Check for skip voting action
            if (action === 'skip_voting') {
              console.log("Host skipped voting via broadcast, transitioning to results");
              // Only transition if we're not already in results phase
              if (roundPhase !== "results") {
                setRoundPhase("results");
                toast.info("Host skipped voting! Moving to results.");
              }
            }
          }
        )
        .subscribe((status) => {
          console.log(`Broadcast subscription status: ${status}`);
        });

      return () => {
        console.log("Unsubscribing from round updates");
        roundSubscription.unsubscribe();
        broadcastSubscription.unsubscribe();
      };
    }, [currentRoom?.id, currentRound?.id, roundPhase]);

    // Listen for round change events from the context
    useEffect(() => {
      const handleRoundChange = (event: CustomEvent) => {
        const { roomId, oldRound, newRound, roundData } = event.detail;
        console.log(`🎯 RECEIVED ROUND CHANGE EVENT: Room ${roomId}, Round ${oldRound} -> ${newRound}`);
        console.log(`🎯 Current GameView state: roundPhase=${roundPhase}, currentRoom=${currentRoom?.id}`);
        
        // Only react if this is for our current room
        if (roomId === currentRoom?.id && newRound > (oldRound || 0)) {
          console.log(`✅ Round change is for our room and round increased, processing transition`);
          
          // If we're in results phase, immediately transition to captioning
          if (roundPhase === "results" || roundPhase === "final_results") {
            console.log(`🚀 TRANSITIONING FROM ${roundPhase.toUpperCase()} TO CAPTIONING for round ${newRound}`);
          } else {
            console.log(`🔄 Already in ${roundPhase} phase, still resetting for new round ${newRound}`);
          }
          
          // Always reset the game state for the new round
          setRoundPhase("captioning");
          setRoundCaptions([]);
          setLoadedRoundId(null); // Force image reload
          setImageUrl('');
          
          toast.success(`Round ${newRound} started!`);
        } else {
          console.log(`❌ Ignoring round change event: roomId match=${roomId === currentRoom?.id}, round increased=${newRound > (oldRound || 0)}`);
        }
      };

      // Add event listener
      window.addEventListener('game:round-changed', handleRoundChange as EventListener);

      // Cleanup
      return () => {
        window.removeEventListener('game:round-changed', handleRoundChange as EventListener);
      };
    }, [currentRoom?.id, roundPhase]); // Added roundPhase to dependencies for better logging

    // Also listen for currentRound changes to handle round transitions for non-host players
    // This ensures that when the host advances to the next round, all players transition properly
    useEffect(() => {
      if (!currentRound?.id || !currentRoom?.id) return;
      
      console.log(`🔄 Context round changed - Round ${currentRound.round_number} (ID: ${currentRound.id}), Current phase: ${roundPhase}`);
      
      // If we're currently showing results but the round has changed to a new round, 
      // reset to captioning phase (this handles non-host players getting unstuck from ResultView)
      if (roundPhase === "results" || roundPhase === "final_results") {
        console.log(`🎯 Current phase is ${roundPhase}, checking if we should transition to captioning`);
        
        // Check if this round has a deadline_at (meaning it's actively running)
        if (currentRound.deadline_at) {
          const deadlineTime = new Date(currentRound.deadline_at).getTime();
          const currentTime = Date.now();
          
          console.log(`⏰ Deadline check: ${new Date(currentRound.deadline_at).toISOString()} vs now ${new Date().toISOString()}`);
          
          // If the deadline is in the future, this is a new active round
          if (deadlineTime > currentTime) {
            console.log(`🚀 NEW ACTIVE ROUND DETECTED! Transitioning from ${roundPhase} to captioning`);
            setRoundPhase("captioning");
            setRoundCaptions([]);
            setLoadedRoundId(null); // Force image reload
            setImageUrl('');
            toast.success(`Round ${currentRound.round_number} started!`);
          }
          // If deadline has passed, transition to voting
          else {
            console.log(`⏱️ Round ${currentRound.round_number} deadline has passed, transitioning to voting`);
            setRoundPhase("voting");
            fetchRoundCaptions(currentRound.id);
          }
        } else {
          console.log(`⚠️ Round has no deadline_at, this might be an inactive round`);
        }
      }
      
    }, [currentRound?.id, currentRound?.deadline_at, currentRound?.round_number]);

    // Backup polling mechanism for round changes (fallback when realtime fails)
    useEffect(() => {
      if (!currentRoom?.id || isHost) return; // Only for non-host players
      
      console.log(`🔄 Setting up backup polling for room ${currentRoom.id} (non-host player)`);
      
      const pollForRoundChanges = async () => {
        try {
          const roomData = await GameService.getRoomByCode(currentRoom.code);
          if (roomData && roomData.current_round !== currentRoom.current_round) {
            console.log(`🚨 BACKUP POLL: Detected round change from ${currentRoom.current_round} to ${roomData.current_round}`);
            
            // Manually trigger a context refresh
            window.dispatchEvent(new CustomEvent('game:force-round-refresh', {
              detail: { 
                roomId: currentRoom.id,
                nextRoundNumber: roomData.current_round
              }
            }));
          }
        } catch (error) {
          console.error('Error in backup polling:', error);
        }
      };
      
      // Poll every 2 seconds as backup
      const pollInterval = setInterval(pollForRoundChanges, 2000);
      
      return () => {
        console.log(`🛑 Stopping backup polling for room ${currentRoom.id}`);
        clearInterval(pollInterval);
      };
    }, [currentRoom?.id, currentRoom?.current_round, currentRoom?.code, isHost]);

    // Handle skip timer action
    const handleSkipTimer = async () => {
      // Guard clauses
      if (!isHost || !currentRoom?.id || !currentRound?.id) {
        console.warn("Skip timer failed: Missing required data", { isHost, roomId: currentRoom?.id, roundId: currentRound?.id });
        return;
      }

      if (roundPhase !== "captioning") {
        toast.error("Can only skip timer during captioning phase");
        return;
      }

      if (isSkippingTimer) {
        console.log("Skip timer already in progress, ignoring duplicate request");
        return;
      }

      // Prevent spamming - enforce 3 second cooldown between skip actions
      const now = Date.now();
      if (lastSkipAction && (now - lastSkipAction.timestamp) < 3000) {
        const remainingCooldown = Math.ceil((3000 - (now - lastSkipAction.timestamp)) / 1000);
        toast.error(`Please wait ${remainingCooldown} more seconds before using skip again`);
        return;
      }
      
      setIsSkippingTimer(true);
      
      try {
        console.log("Host initiating timer skip...");
        toast.loading("Skipping timer...", { duration: 2000 });
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch('/api/round-meta', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomId: currentRoom.id,
            roundId: currentRound.id,
            action: 'skip_timer'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        console.log("Timer skip API call successful, transitioning to voting...");
        
        // Record the skip action to prevent spamming
        setLastSkipAction({ action: 'skip_timer', timestamp: now });
        
        // Immediately transition to voting phase locally
        setRoundPhase("voting");
        
        // Fetch captions for voting
        try {
          await fetchRoundCaptions(currentRound.id);
        } catch (captionError) {
          console.error("Error fetching captions after skip:", captionError);
          // Don't fail the skip if caption fetching fails
          toast.warning("Timer skipped but failed to load captions. They should load shortly.");
        }
        
        // Show success message
        toast.dismiss();
        toast.success("Timer skipped! Moving to voting phase.");
        
      } catch (error) {
        console.error("Error skipping timer:", error);
        
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            toast.error("Skip timer request timed out. Please try again.");
          } else {
            toast.error(`Failed to skip timer: ${error.message}`);
          }
        } else {
          toast.error("Failed to skip timer. Please try again.");
        }
        
        // Reset to original state if the skip failed
        // (Don't change roundPhase since the skip failed)
        
      } finally {
        setIsSkippingTimer(false);
      }
    };

    // Handle skip voting action
    const handleSkipVoting = async () => {
      // Guard clauses
      if (!isHost || !currentRoom?.id) {
        console.warn("Skip voting failed: Missing required data", { isHost, roomId: currentRoom?.id });
        return;
      }

      if (roundPhase !== "voting") {
        toast.error("Can only skip voting during voting phase");
        return;
      }

      if (isSkippingVoting) {
        console.log("Skip voting already in progress, ignoring duplicate request");
        return;
      }

      // Prevent spamming - enforce 3 second cooldown between skip actions
      const now = Date.now();
      if (lastSkipAction && (now - lastSkipAction.timestamp) < 3000) {
        const remainingCooldown = Math.ceil((3000 - (now - lastSkipAction.timestamp)) / 1000);
        toast.error(`Please wait ${remainingCooldown} more seconds before using skip again`);
        return;
      }
      
      setIsSkippingVoting(true);
      
      try {
        console.log("Host initiating voting skip...");
        toast.loading("Skipping voting...", { duration: 2000 });
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch('/api/round-meta', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomId: currentRoom.id,
            action: 'skip_voting'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        console.log("Voting skip API call successful, transitioning to results...");
        
        // Record the skip action to prevent spamming
        setLastSkipAction({ action: 'skip_voting', timestamp: now });
        
        // Immediately transition to results phase locally
        setRoundPhase("results");
        
        // Show success message
        toast.dismiss();
        toast.success("Voting skipped! Moving to results.");
        
      } catch (error) {
        console.error("Error skipping voting:", error);
        
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            toast.error("Skip voting request timed out. Please try again.");
          } else {
            toast.error(`Failed to skip voting: ${error.message}`);
          }
        } else {
          toast.error("Failed to skip voting. Please try again.");
        }
        
        // Reset to original state if the skip failed
        // (Don't change roundPhase since the skip failed)
        
      } finally {
        setIsSkippingVoting(false);
      }
    };

    // Monitor voting completion and transition to results - simplified timer-based approach
    useEffect(() => {
      if (roundPhase !== "voting" || !currentRound?.id) return;

      console.log(`🔄 Setting up voting timer for round ${currentRound.id}`);

      // Set a fixed voting duration (e.g., 30 seconds)
      const votingDuration = 20000; // 20 seconds in milliseconds
      
      // Calculate and set the voting deadline
      const deadline = new Date(Date.now() + votingDuration).toISOString();
      setVotingDeadline(deadline);
      
      console.log(`⏱️ Starting voting timer: ${votingDuration / 1000} seconds`);
      console.log(`⏱️ Voting deadline set to: ${deadline}`);
      
      // Set timer to transition to results phase after voting duration
      const votingTimer = setTimeout(() => {
        console.log("⏰ Voting time is up, transitioning to results");
        setRoundPhase("results");
        setVotingDeadline(null); // Clear deadline
        toast.info("Voting time is up! Moving to results.");
      }, votingDuration);
      
      return () => {
        console.log("🛑 Clearing voting timer");
        clearTimeout(votingTimer);
        setVotingDeadline(null); // Clear deadline on cleanup
      };
    }, [roundPhase, currentRound?.id]);

    // Reset skip states when round changes
    useEffect(() => {
      // Reset skip states when transitioning between rounds or phases
      setIsSkippingTimer(false);
      setIsSkippingVoting(false);
      setIsStartingNextRound(false);
    }, [currentRound?.id, roundPhase]);

    // If we're in results phase, show ResultView
    if (roundPhase === "results" || roundPhase === "final_results") {
      return (
        <ResultView 
          currentRoom={currentRoom}
          currentRound={currentRound}
          players={players}
          isFinalResults={roundPhase === "final_results"}
          onLeaveRoom={onLeaveRoom}
          isStartingNextRound={isStartingNextRound}
          onNextRound={roundPhase === "final_results" ? undefined : async () => {
            // Prevent double-clicking
            if (isStartingNextRound) {
              console.log("Next round already in progress, ignoring duplicate request");
              return;
            }
            
            setIsStartingNextRound(true);
            
            try {
              // Get the most current room data from the database to ensure accuracy
              console.log("Fetching current room data for next round logic...");
              const { data: currentRoomData, error: roomFetchError } = await supabase
                .from("game_rooms")
                .select("current_round, status")
                .eq("id", currentRoom.id)
                .single();
              
              if (roomFetchError || !currentRoomData) {
                console.error("Failed to fetch current room data:", roomFetchError);
                toast.error("Failed to get current game state");
                return;
              }
              
              console.log("Current room data from DB:", currentRoomData);
              
              // Use the database value as the source of truth
              const actualCurrentRound = currentRoomData.current_round || 1;
              
              // Check if this is the final round (6 rounds total)
              const maxRounds = 6;
              
              console.log(`Current round: ${actualCurrentRound}, Max rounds: ${maxRounds}`);
              
              if (actualCurrentRound >= maxRounds) {
                // Game is complete, show final results and then return to lobby
                toast.info("Game completed! Showing final results...");
                
                // Update room status to completed but keep current_round for final results
                const { error: updateError } = await supabase
                  .from("game_rooms")
                  .update({
                    status: "completed",
                    completed_at: new Date().toISOString()
                  })
                  .eq("id", currentRoom.id);
                
                if (updateError) {
                  console.error("Error completing game:", updateError);
                  toast.error("Error completing game");
                  return;
                }
                
                // Transition to final results view
                setRoundPhase("final_results");
                return;
              }
              
              // Start next round using the context function
              const nextRoundNumber = actualCurrentRound + 1;
              console.log(`Starting next round ${nextRoundNumber} using advanceToRound`);
              
              toast.loading(`Starting round ${nextRoundNumber}...`);
              
              // Use the context's advanceToRound function which handles everything properly
              await advanceToRound(nextRoundNumber);
              
              toast.dismiss();
              console.log("Next round transition completed successfully");
              
            } catch (error) {
              console.error("Error in onNextRound:", error);
              const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
              toast.error(`Failed to start next round: ${errorMessage}`);
            } finally {
              setIsStartingNextRound(false);
            }
          }}
          onReturnToLobby={async () => {
            try {
              toast.loading("Returning to lobby...");
              
              // Update room status back to lobby
              const { error: updateError } = await supabase
                .from("game_rooms")
                .update({
                  status: "lobby",
                  current_round: null,
                  completed_at: new Date().toISOString()
                })
                .eq("id", currentRoom.id);
              
              if (updateError) {
                console.error("Error returning to lobby:", updateError);
                toast.error("Error returning to lobby");
                return;
              }
              
              toast.dismiss();
              toast.success(roundPhase === "final_results" ? "Starting new game!" : "Returned to lobby!");
              
              // Send system message
              // System messages don't work with broadcast chat
              // await ChatService.sendSystemMessage(
              //   currentRoom.id,
              //   roundPhase === "final_results" ? "Starting a new game!" : "Game ended. Returned to lobby.",
              //   'lobby'
              // );
              
              // Force a page refresh to return to lobby view
              router.refresh();
              
            } catch (error) {
              console.error("Error in onReturnToLobby:", error);
              toast.error("Failed to return to lobby");
            }
          }}
        />
      );
    }

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 py-6 mt-4 flex flex-col">
      {/* Game grid background */}
      <div className="absolute inset-0 game-grid-bg opacity-40"></div>
      
      {/* Content overlay */}
      <div className="relative z-10">
        {/* Game header with leave button */}
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-foreground game-title">Current Round {currentRoom.current_round}</h2>
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
        
        {/* Main content area - split into two columns like LobbyView */}
        <div className="flex flex-col lg:flex-row gap-4 h-auto max-h-[calc(100vh-160px)] game-lobby-container overflow-hidden">
          {/* Left Side - Game Content (Players in Lobby) */}
          <div className="w-full lg:w-1/2 flex flex-col">
            <div className="mb-2">
              <h3 className="text-lg font-medium text-foreground">Game Image</h3>
              <p className="text-sm text-muted-foreground">
                { "Are you the impostor? Then you might be seeing a different image than others! Be careful..."}
              </p>
            </div>
            
            <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20 overflow-auto flex-grow relative">
              {/* Top edge glow */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
              
              <CardContent className="p-6">
                <div className="flex flex-col items-center w-full">
                  {/* Error state */}
                  {error && (
                    <div className="p-4 my-4 bg-destructive/10 text-destructive rounded-md w-full border border-destructive/20">
                      <p className="text-center font-medium">{error}</p>
                      <p className="text-center text-sm mt-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setLoadedRoundId(null); // Force reload
                            setError(null);
                          }}
                          className="border-destructive/20 hover:bg-destructive/10"
                        >
                          Try Again
                        </Button>
                      </p>
                    </div>
                  )}
                  
                  {/* Loading state */}
                  {isImageLoading && (
                    <div className="flex flex-col items-center justify-center py-10 w-full">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                      <p className="text-muted-foreground">Loading image...</p>
                    </div>
                  )}
                  
                  {/* Image display */}
                  {!error && !isImageLoading && imageUrl && (
                    <div className="flex flex-col items-center w-full">
                      <div className="max-w-full mx-auto p-2 bg-background/50 backdrop-blur-sm rounded-md shadow-glow border border-primary/20 transition-all hover:shadow-lg">
                        <Image 
                          src={imageUrl} 
                          width={400} 
                          height={400} 
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
                      </div>
                    </div>
                  )}
                  
                  {/* Caption form */}
                  {currentRoom?.status === "in_progress" && (
                    <div className="mt-8">
                      {roundPhase === "captioning" && (
                        <>
                          {imageUrl && (
                            <div className="flex flex-col items-center gap-4">
                              <div className="relative w-full max-w-md rounded-lg overflow-hidden">
                              </div>
                              
                              {/* Caption form */}
                              <form onSubmit={handleCaptionSubmit} className="mt-6 w-full max-w-md">
                                <div className="relative">
                                  <Label htmlFor="caption" className="text-lg font-medium">Your Caption:</Label>
                                  <div className="relative">
                                    <Input
                                      id="caption"
                                      type="text"
                                      value={captionText}
                                      onChange={e => setCaptionText(e.target.value)}
                                      placeholder="What do you think about this image?"
                                      className="mt-1 border-primary/20 focus-visible:ring-primary/30 bg-background/60 backdrop-blur-sm pr-12 h-10"
                                    />
                                    <Button
                                      type="submit" 
                                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-3 bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
                                      disabled={isImageLoading || !imageUrl || contextIsLoading}
                                    >
                                      <Send className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </form>
                            </div>
                          )}
                          
                          {/* Show time remaining */}
                          {currentRound?.deadline_at && (
                            <div className="mt-4 text-center">
                              <TimeRemaining deadline={currentRound.deadline_at} />
                              
                              {/* Skip Timer Button - Commented out for dev */}
                              {/* {isHost && roundPhase === "captioning" && (
                                <div className="mt-3">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSkipTimer}
                                    disabled={isSkippingTimer || contextIsLoading}
                                    className="border-orange-500/30 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSkippingTimer ? (
                                      <>
                                        <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                                        <span>Skipping...</span>
                                      </>
                                    ) : (
                                      <>
                                        ⏭️ Skip Timer (Host)
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )} */}
                            </div>
                          )}
                        </>
                      )}
                      
                      {roundPhase === "voting" && (
                        <>
                          <CaptionVoting 
                            captions={roundCaptions}
                            onVote={async (captionId, playerId) => {
                              // Submit single vote
                              return submitVote(playerId); // Pass the playerId as a string
                            }}
                            playerId={userId}
                            isLoading={contextIsLoading}
                            maxVotes={1} // Set to 1 vote per player
                          />
                          
                          {/* Show voting time remaining */}
                          {votingDeadline && (
                            <div className="mt-4 text-center">
                              <TimeRemaining deadline={votingDeadline} />
                            </div>
                          )}
                          
                          {/* Debug: Voting Status Display */}
                          <div className="mt-4 p-3 bg-background/50 backdrop-blur-sm rounded border border-primary/20">
                            <h4 className="text-sm font-medium text-foreground mb-2">🗳️ Voting Status (Debug)</h4>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>Round ID: {currentRound?.id}</p>
                              <p>Room ID: {currentRoom.id}</p>
                              <p>Online Players: {players.filter(p => p.is_online !== false).length}</p>
                              <p>Player IDs: {players.filter(p => p.is_online !== false).map(p => p.id).join(', ')}</p>
                              <p>Current Phase: {roundPhase}</p>
                              {votingDeadline && <p>Voting Deadline: {new Date(votingDeadline).toLocaleTimeString()}</p>}
                            </div>
                          </div>
                          
                          {/* Debug: Skip to Results Button - Only show for host */}
                          {isHost && (
                            <div className="mt-4 text-center space-y-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSkipVoting}
                                disabled={isSkippingVoting || contextIsLoading}
                                className="border-purple-500/30 hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed mr-2"
                              >
                                {isSkippingVoting ? (
                                  <>
                                    <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                                    <span>Skipping...</span>
                                  </>
                                ) : (
                                  <>
                                    🏆 Skip to Results (Debug)
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Debug information (collapsible) */}
                <details className="mt-6 pt-4 border-t border-primary/20">
                  <summary className="cursor-pointer text-sm text-muted-foreground select-none">Debug Information</summary>
                  <div className="text-xs font-mono bg-background/50 backdrop-blur-sm p-2 rounded mt-2 overflow-auto max-h-32 border border-primary/10">
                    <p>Room ID: {currentRoom.id}</p>
                    <p>Room Status: {currentRoom.status}</p>
                    <p>Current Round: {currentRoom.current_round}</p>
                    <p>Image Loading: {imageUrl ? 'Yes' : 'No'}</p>
                    <p>Error: {error || 'None'}</p>
                    <p>Players: {players.length}</p>
                    {currentRoom.impostor_id && (
                      <>
                        <p>Impostor ID: {currentRoom.impostor_id}</p>
                        <p>You are {userId === currentRoom.impostor_id ? 'the impostor!' : 'not the impostor'}</p>
                      </>
                    )}
                  </div>
                </details>
              </CardContent>
              
              {/* Bottom edge glow */}
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
            </Card>
          </div>
          
          {/* Right Side - Chat (just like in LobbyView) */}
          <div className="w-full lg:w-1/2 flex flex-col">
            <div className="mb-2">
              <h2 className="text-2xl font-semibold text-foreground">Game Chat</h2>
              <p className="text-sm text-muted-foreground">
                Chat with other players during the game
              </p>
            </div>
            
            {/* Chat Card - Now with better height management */}
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
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface Caption {
  id: string;
  caption: string;
  player_id: string;
  player_alias?: string;
}

interface CaptionVotingProps {
  captions: Caption[];
  onVote: (captionId: string, playerId: string) => Promise<void>; // Changed to single vote
  playerId: string | null;
  isLoading?: boolean;
  maxVotes?: number; // Keep for backward compatibility but won't be used
}

export default function CaptionVoting({ 
  captions, 
  onVote, 
  playerId, 
  isLoading = false,
  maxVotes = 1 // Always 1 vote per player
}: CaptionVotingProps) {
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null); // Changed to single selection
  const [hasVoted, setHasVoted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter out the current player's own caption
  const votableCaptions = captions.filter(caption => caption.player_id !== playerId);

  const handleCaptionSelect = (captionId: string) => {
    if (hasVoted || isSubmitting) return;
    
    // Toggle selection (only one can be selected)
    if (selectedCaptionId === captionId) {
      setSelectedCaptionId(null);
    } else {
      setSelectedCaptionId(captionId);
    }
  };

  const handleSubmitVote = async () => {
    if (!selectedCaptionId || !playerId || hasVoted) {
      toast.error("Please select a caption to vote for");
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Find the selected caption to get the player ID
      const selectedCaption = captions.find(c => c.id === selectedCaptionId);
      if (!selectedCaption) {
        throw new Error("Selected caption not found");
      }

      await onVote(selectedCaptionId, selectedCaption.player_id);
      setHasVoted(true);
      toast.success("Vote submitted successfully!");
    } catch (error) {
      console.error("Error submitting vote:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to submit vote";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (votableCaptions.length === 0) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Voting Phase</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            No captions available for voting.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Vote for Your Favorite Caption</CardTitle>
        <p className="text-sm text-muted-foreground">
          {hasVoted 
            ? "Thank you for voting! Waiting for other players..." 
            : "Choose the caption you think is the best. You get one vote."
          }
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {votableCaptions.map((caption) => (
            <Card 
              key={caption.id}
              className={`cursor-pointer transition-all duration-200 ${
                selectedCaptionId === caption.id
                  ? 'border-primary bg-primary/10 shadow-md' 
                  : 'border-border hover:border-primary/50 hover:shadow-sm'
              } ${hasVoted || isSubmitting ? 'cursor-not-allowed opacity-50' : ''}`}
              onClick={() => handleCaptionSelect(caption.id)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-foreground font-medium mb-1">
                      "{caption.caption}"
                    </p>
                    <p className="text-sm text-muted-foreground">
                      by {caption.player_alias || 'Unknown Player'}
                    </p>
                  </div>
                  {selectedCaptionId === caption.id && (
                    <div className="ml-3 text-primary">
                      ✓
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!hasVoted && (
          <div className="mt-6 flex justify-center">
            <Button
              onClick={handleSubmitVote}
              disabled={!selectedCaptionId || isSubmitting || isLoading}
              className="px-8"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                  Submitting...
                </>
              ) : (
                <>
                  Submit Vote {selectedCaptionId ? '(1 selected)' : ''}
                </>
              )}
            </Button>
          </div>
        )}

        {hasVoted && (
          <div className="mt-6 text-center">
            <p className="text-green-600 dark:text-green-400 font-medium">
              ✅ Your vote has been submitted!
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Waiting for other players to finish voting...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
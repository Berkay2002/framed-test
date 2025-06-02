import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ClipboardCopy, 
  LogOutIcon, 
  Settings, 
  PlayIcon, 
  Trash2, 
  EllipsisVertical, 
  AlertCircle,
  Menu,
  QrCode,
  Share2,
  Copy
} from "lucide-react";
import { toast } from "sonner";
import { GameRoom, RoomStatus } from "@/lib/game-service";
import { useButtonDebounce } from "@/hooks/useButtonDebounce";
import { createClient } from '@/utils/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface RoomHeaderProps {
  currentRoom: GameRoom;
  players: any[];
  isGameInProgress: boolean;
  currentRound?: number;
  isHost?: boolean;
  onStartGame?: () => Promise<void>;
  onLeaveRoom?: () => Promise<{ canceled?: boolean; error?: boolean } | unknown>;
  hideMenuOptions?: boolean;
}

export default function RoomHeader({ 
  currentRoom, 
  players, 
  isGameInProgress,
  currentRound,
  isHost,
  onStartGame,
  onLeaveRoom,
  hideMenuOptions = false
}: RoomHeaderProps) {
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);

  // Track window size for responsive design
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 640);
    };
    
    // Set initial value
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use debounce hook for starting the game
  const { isLoading: isStartingGame, handleAction: handleStartGame } = 
    useButtonDebounce(
      async () => onStartGame && await onStartGame(),
      {}
    );
  
  // Use debounce hook for leaving the room, with improved error handling
  const { isLoading: isLeavingRoom, handleAction: handleLeaveRoom } = 
    useButtonDebounce(
      async () => {
        try {
          if (onLeaveRoom) {
            const result = await onLeaveRoom();
            // Check if the operation was canceled - don't show success message if canceled
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
  
  // Handle room deletion (host only)
  const { isLoading: isDeletingRoom, handleAction: handleDeleteRoom } = 
    useButtonDebounce(
      async () => {
        if (!isHost || isGameInProgress) {
          toast.error("Only the host can delete a room, and only before the game starts");
          return false;
        }
        
        // Confirm deletion
        if (!confirm("Are you sure you want to delete this room? This action cannot be undone.")) {
          return false;
        }
        
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session) {
            toast.error("You must be logged in to delete a room");
            return false;
          }
          
          // Call the delete-room API
          const response = await fetch('/api/delete-room', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              roomId: currentRoom.id,
              hostId: session.user.id
            })
          });
          
          const result = await response.json();
          
          if (result.success) {
            toast.success("Room deleted successfully");
            // Redirect to game hub
            window.location.href = '/game-hub';
            return true;
          } else {
            toast.error(result.message || "Failed to delete room");
            return false;
          }
        } catch (error) {
          console.error("Error deleting room:", error);
          toast.error("An error occurred while deleting the room");
          return false;
        }
      },
      {}
    );

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(currentRoom.code);
    toast.success("Room code copied to clipboard!");
  };

  // Generate shareable URL
  const shareableUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/game-hub/${currentRoom.code}`
    : '';

  // Share function for mobile devices
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my game room',
          text: `Join my game with code: ${currentRoom.code}`,
          url: shareableUrl
        });
      } catch (err) {
        console.error('Error sharing:', err);
        // Fallback to copying to clipboard
        handleCopyRoomCode();
      }
    } else {
      // Fallback to copying to clipboard if Web Share API is not available
      handleCopyRoomCode();
    }
  };

  // Get appropriate status text
  const getStatusText = () => {
    if (currentRoom.status === 'lobby') return "Waiting in Lobby";
    if (currentRoom.status === 'in_progress') return "Game in Progress";
    if (currentRoom.status === 'completed') return "Game Completed";
    return "Room Status Unknown";
  };

  return (
    <Card className="bg-background/90 backdrop-blur-sm border-primary/20 shadow-glow relative overflow-hidden">
      {/* Top edge glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
      
      <CardContent className="p-4">
        {/* Mobile Header */}
        <div className="flex flex-col space-y-3">
          {/* Status Row */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 text-foreground px-3 py-1 rounded-full text-sm font-medium border border-primary/20">
                {getStatusText()}
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <svg className="w-4 h-4 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                {players.length}/8
              </div>
            </div>
            
            {/* Mobile Menu */}
            {isSmallScreen && !hideMenuOptions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:bg-primary/10">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[180px] bg-background/95 backdrop-blur-sm border-primary/20">
                  {isHost && !isGameInProgress && (
                    <DropdownMenuItem
                      onClick={handleStartGame}
                      disabled={isStartingGame || !Array.isArray(players) || players.length < 1}
                      className="cursor-pointer text-green-600 dark:text-green-400 focus:bg-primary/10"
                    >
                      <PlayIcon className="mr-2 h-4 w-4" />
                      Start Game
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem
                    onClick={handleCopyRoomCode}
                    className="cursor-pointer focus:bg-primary/10"
                  >
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                    Copy Code
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem
                    onClick={() => setShowQrDialog(true)}
                    className="cursor-pointer focus:bg-primary/10"
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    Show QR Code
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem
                    onClick={handleShare}
                    className="cursor-pointer focus:bg-primary/10"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share Room
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={handleLeaveRoom}
                    disabled={isLeavingRoom}
                    className="cursor-pointer text-destructive dark:text-red-400 focus:bg-destructive/10"
                  >
                    <LogOutIcon className="mr-2 h-4 w-4" />
                    Leave Room
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        
          {/* Room Code Row */}
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-muted-foreground">ROOM CODE</div>
              <div className="flex items-baseline gap-2">
                <div className="text-foreground font-medium text-xl tracking-wider game-title">
                  {currentRoom.code}
                </div>
                {!isSmallScreen && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleCopyRoomCode}
                    className="text-xs text-muted-foreground hover:text-foreground p-0 h-auto hover:bg-transparent"
                  >
                    Copy
                  </Button>
                )}
              </div>
            </div>
            
            {/* Desktop Action Buttons */}
            {!isSmallScreen && (
              <div className="flex gap-2">
                {!hideMenuOptions && (
                  <Button 
                    variant="outline"
                    size="sm" 
                    onClick={() => setShowQrDialog(true)}
                    className="text-foreground border-primary/20 hover:bg-primary/10"
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    Share Room
                  </Button>
                )}
                
                {isHost && !isGameInProgress && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartGame}
                    disabled={isStartingGame || !Array.isArray(players) || players.length < 1}
                    className="text-green-600 dark:text-green-400 border-green-600/30 dark:border-green-400/30 hover:bg-green-600/10 dark:hover:bg-green-400/10"
                  >
                    <PlayIcon className="mr-2 h-4 w-4" />
                    Start Game
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLeaveRoom}
                  disabled={isLeavingRoom}
                  className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                >
                  <LogOutIcon className="mr-2 h-4 w-4" />
                  Leave
                </Button>
              </div>
            )}
          </div>
          
          {/* Game Status Row - Hidden on small screens */}
          {!isSmallScreen && currentRound !== undefined && (
            <div className="pb-1 flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                <span className="text-muted-foreground/70">Round:</span> {currentRound}
              </div>
            </div>
          )}
        </div>
      </CardContent>
      
      {/* Bottom edge glow */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
      
      {/* QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-sm border-primary/20 shadow-glow">
          <DialogHeader>
            <DialogTitle>Share Game Room</DialogTitle>
            <DialogDescription>
              Scan this QR code to join the game room or share the link
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-4 space-y-4">
            <div className="bg-white p-4 rounded-md shadow-glow">
              <QRCodeSVG 
                value={shareableUrl} 
                size={200}
                bgColor="#FFFFFF"
                fgColor="#000000"
                level="L"
                includeMargin={false}
              />
            </div>
            <p className="text-center font-medium game-title">Room Code: {currentRoom.code}</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              className="w-full sm:w-auto bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
              onClick={handleShare}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share Link
            </Button>
            <Button 
              variant="outline" 
              className="w-full sm:w-auto border-primary/20 hover:bg-primary/10"
              onClick={handleCopyRoomCode}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Code
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="w-full sm:w-auto">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
} 
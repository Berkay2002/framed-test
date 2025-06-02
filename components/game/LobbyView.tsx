import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { GamePlayer, GameRoom } from "@/lib/game-service";
import RoomHeader from "./RoomHeader";
import PlayerList from "./PlayerList";
import { ChatPanel } from "../game/ChatPanel";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, MessageSquare, QrCode, Share2, Copy, ArrowLeft } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown, UserIcon } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<string>("players");
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 0
  );
  const [windowHeight, setWindowHeight] = useState<number>(
    typeof window !== 'undefined' ? window.innerHeight : 0
  );

  // Track window resize for responsive adjustments
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Automatically switch to "players" tab on larger screens
  useEffect(() => {
    if (windowWidth >= 1024 && activeTab !== "players") {
      setActiveTab("players");
    }
  }, [windowWidth, activeTab]);

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

  // Copy room code to clipboard
  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(currentRoom.code);
    toast.success("Room code copied to clipboard!");
  };

  // Is this a mobile view?
  const isMobileView = windowWidth < 1024;
  const isTabletView = windowWidth >= 640 && windowWidth < 1024;

  // Calculate chat height for desktop view - adjusted to be more flexible and adaptive
  const getAdaptiveHeight = () => {
    if (windowHeight <= 700) {
      return 'calc(100vh - 320px)';
    } else if (windowHeight <= 800) {
      return 'calc(100vh - 340px)';
    } else if (windowHeight <= 900) {
      return 'calc(100vh - 360px)';
    } else {
      return 'calc(100vh - 380px)';
    }
  };
  
  const desktopChatHeight = getAdaptiveHeight();

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 py-6 mt-4 flex flex-col">
      {/* Game grid background */}
      <div className="absolute inset-0 game-grid-bg opacity-40"></div>
      
      {/* Content overlay */}
      <div className="relative z-10">
        {/* Room Header at the top */}
        <div className="mb-4">
          <RoomHeader 
            currentRoom={currentRoom} 
            players={players} 
            isGameInProgress={false}
            isHost={isHost}
            onStartGame={onStartGame}
            onLeaveRoom={onLeaveRoom}
            hideMenuOptions={false}
          />
        </div>
        
        {/* Sharing Section - Mobile & Tablet Only */}
        <div className="lg:hidden mb-3">
          <Card className="bg-background/90 backdrop-blur-sm border-primary/20 shadow-glow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium mb-1">Invite friends with code:</p>
                  <p className="text-xl font-bold tracking-wider game-title">{currentRoom.code}</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    variant="outline"
                    onClick={() => setShowQrDialog(true)}
                    className="h-10 w-10 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-2 border-primary/20 hover:bg-primary/10"
                  >
                    <QrCode className="h-5 w-5 sm:mr-2" />
                    <span className="sr-only sm:not-sr-only sm:inline-block">QR Code</span>
                  </Button>
                  <Button 
                    size="sm"
                    onClick={handleShare}
                    className="h-10 w-10 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-2 bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/30"
                  >
                    <Share2 className="h-5 w-5 sm:mr-2" />
                    <span className="sr-only sm:not-sr-only sm:inline-block">Share</span>
                  </Button>
                  <Button 
                    size="sm"
                    variant="secondary"
                    onClick={handleCopyRoomCode}
                    className="h-10 w-10 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
                  >
                    <Copy className="h-5 w-5 sm:mr-2" />
                    <span className="sr-only sm:not-sr-only sm:inline-block">Copy</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content: Desktop layout for large screens (Players and Chat side by side) */}
        <div className="hidden lg:flex gap-4 h-auto max-h-[calc(100vh-160px)] game-lobby-container overflow-hidden">
          {/* Left Side - Players (50%) */}
          <div className="w-1/2 flex flex-col">
            <div className="mb-2 flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Players in Lobby</h2>
                <p className="text-sm text-muted-foreground">
                  Waiting for players to join...
                  {isHost && ` Start the game when everyone is ready!`}
                </p>
              </div>
            </div>
            
            <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20 overflow-auto flex-grow">
              <CardContent className="p-4 sm:p-5">
                {/* Desktop Grid Layout for Players - Improved */}
                <div className="grid grid-cols-2 gap-4">
                  {Array.isArray(players) && players.length > 0 ? (
                    players.map((player) => (
                      <Card 
                        key={player.id}
                        className={`border ${player.id === playerId ? 'border-primary/40 bg-primary/10 shadow-glow' : 'bg-background/70 border-primary/10'} transition-all hover:bg-primary/5`}
                      >
                        <CardContent className="p-3 sm:p-4 flex items-center">
                          <Avatar className="h-9 w-9 mr-3 flex-shrink-0">
                            <AvatarFallback className={`text-sm ${player.id === playerId ? 'bg-primary/20 text-primary' : 'dark:bg-secondary/20 bg-gray-200 text-foreground'}`}>
                              {getInitialsFromAlias(player.game_alias)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-foreground truncate max-w-[120px] text-sm">
                                {player.game_alias || 'Anonymous Player'}
                              </p>
                              {(player.is_host || player.user_id === currentRoom?.host_id) && (
                                <Crown className="h-4 w-4 text-amber-400 flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center flex-wrap gap-1.5 mt-1">
                              {player.id === playerId && (
                                <Badge 
                                  variant="secondary" 
                                  className="text-[10px] h-4 px-1.5 py-0 rounded-sm"
                                >
                                  You
                                </Badge>
                              )}
                              {(player.is_host || player.user_id === currentRoom?.host_id) && (
                                <span className="text-xs text-muted-foreground whitespace-nowrap">Host</span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="col-span-full text-center py-6 border-dashed">
                      <CardContent>
                        <p className="text-muted-foreground">No players have joined yet</p>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Empty Slots */}
                  {(() => {
                    const maxPlayers = 8;
                    const emptySlots = maxPlayers - (players?.length || 0);
                    return emptySlots > 0 ? (
                      Array(Math.min(emptySlots, 8)).fill(null).map((_, index) => (
                        <Card key={`empty-${index}`} className="border-dashed border-primary/20 bg-background/30">
                          <CardContent className="p-3 sm:p-4 flex items-center">
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
                    ) : null;
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Right Side - Chat (50%) */}
          <div className="w-1/2 flex flex-col">
            <div className="mb-2">
              <h2 className="text-2xl font-semibold text-foreground">Game Chat</h2>
              <p className="text-sm text-muted-foreground">
                Chat with other players in the lobby
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

        {/* Mobile/Tablet Tabs Interface */}
        <div className="lg:hidden flex-1 pb-20">
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab} 
            className="w-full h-full"
          >
            <TabsList className="w-full grid grid-cols-2 h-auto mb-4 bg-background/80 backdrop-blur-sm border border-primary/20">
              <TabsTrigger 
                value="players" 
                className="py-3 data-[state=active]:bg-primary/10"
              >
                <div className="flex items-center justify-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Players ({players.length})</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="chat" 
                className="py-3 data-[state=active]:bg-primary/10"
              >
                <div className="flex items-center justify-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Chat</span>
                </div>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="players" className="mt-0 h-full">
              <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20 h-[calc(100vh-480px)]">
                <CardContent className="p-4 overflow-auto">
                  <PlayerList 
                    players={players} 
                    currentRoom={currentRoom} 
                    playerId={playerId}
                    compactView={windowWidth < 640}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="chat" className="mt-0 h-full">
              <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20 h-[calc(100vh-480px)] flex flex-col relative">
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
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
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
    </div>
  );
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
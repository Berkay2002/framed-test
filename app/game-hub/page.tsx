"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useGame } from '@/lib/game-context';
import { GameService, GameRoom, RoomStatus } from '@/lib/game-service';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import { useButtonDebounce } from '@/hooks/useButtonDebounce';
import AnimatedLoading from '@/components/game/AnimatedLoading';
import { QRCodeSVG } from 'qrcode.react';
import { 
  EllipsisVertical, 
  Trash2, 
  AlertCircle, 
  Users, 
  RefreshCw, 
  PlusCircle,
  ArrowRight,
  User,
  Mail,
  Settings,
  LogOut,
  QrCode,
  Share2,
  Copy
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Tabs, 
  TabsList, 
  TabsTrigger,
  TabsContent 
} from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// Type for rooms with player count
type RoomWithPlayerCount = GameRoom & { playerCount: number };

// Type for user profile
type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export default function GameHub() {
  const [activeRooms, setActiveRooms] = useState<RoomWithPlayerCount[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<RoomWithPlayerCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'active' | 'mine'>('active');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [directJoinCode, setDirectJoinCode] = useState<string>('');
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);
  const [roomSearchQuery, setRoomSearchQuery] = useState<string>('');
  const { createRoom, userId, joinRoom } = useGame();
  const router = useRouter();
  
  // Get the count of my inactive rooms for the badge
  const myInactiveRoomsCount = userId 
    ? activeRooms.filter(room => 
        room.host_id === userId && 
        room.playerCount === 0 // Only check playerCount
      ).length 
    : 0;
    
  // Get total rooms created by the user
  const totalUserRooms = userId
    ? activeRooms.filter(room => room.host_id === userId).length
    : 0;
    
  // Use the debounce hook for room creation
  const { isLoading: isCreatingRoom, handleAction: handleCreateRoom } = 
    useButtonDebounce(createRoom, {});

  // Load user profile
  useEffect(() => {
    if (userId) {
      const fetchUserProfile = async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
          
        if (error) {
          console.error('Error fetching user profile:', error);
          
          // If we get an auth error (401), force refresh the session
          if (error.code === '401' || error.message.includes('JWT')) {
            console.log('Auth error detected, attempting to refresh session');
            // Try to refresh the session
            const { error: refreshError } = await supabase.auth.refreshSession();
            
            if (refreshError) {
              console.error('Failed to refresh session:', refreshError);
              toast.error('Authentication expired. Redirecting to sign in...');
              
              // Redirect to sign in after a small delay
              setTimeout(() => {
                router.push('/sign-in');
              }, 1500);
              return;
            }
            
            // Session refreshed, try fetching profile again
            const { data: refreshedData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();
              
            if (refreshedData) {
              setUserProfile(refreshedData);
            }
          }
          
          return;
        }
        
        setUserProfile(data);
      };
      
      fetchUserProfile();
    }
  }, [userId, router]);

  // Handle auth errors by setting up a global listener
  useEffect(() => {
    const handleAuthError = (event: CustomEvent) => {
      console.log('Auth error detected from event:', event.detail);
      toast.error('Session expired. Please sign in again.');
      router.push('/sign-in');
    };
    
    // Listen for custom auth error events
    window.addEventListener('auth:error' as any, handleAuthError as any);
    
    return () => {
      window.removeEventListener('auth:error' as any, handleAuthError as any);
    };
  }, [router]);

  // Auto-switch to 'mine' tab if user has inactive rooms
  useEffect(() => {
    if (myInactiveRoomsCount > 0 && activeFilter === 'active') {
      console.log(`Auto-switching to 'My Rooms' tab because user has ${myInactiveRoomsCount} inactive rooms`);
      setActiveFilter('mine');
    }
  }, [myInactiveRoomsCount]);

  // Apply filters when the active filter or rooms change
  useEffect(() => {
    if (!activeRooms.length) {
      setFilteredRooms([]);
      return;
    }

    // Log all active rooms for debugging
    console.log('All active rooms:', activeRooms);
    console.log('Current user ID:', userId);
    
    if (activeFilter === 'active') {
      // For "Available Games" view, show all active rooms regardless of ownership
      const availableRooms = activeRooms.filter(room => 
        (room.status === 'lobby' || room.status === 'in_progress') &&
        room.playerCount > 0 // Only check playerCount
      );
      console.log(`Showing ${availableRooms.length} available rooms`);
      setFilteredRooms(availableRooms);
    } else {
      // For "My Rooms" view, show all rooms owned by the current user, including inactive ones
      const myRooms = activeRooms.filter(room => room.host_id === userId);
      console.log('My rooms (all statuses):', myRooms);
      console.log('My empty/inactive rooms count:', myRooms.filter(room => 
        room.playerCount === 0 || room.status === 'completed'
      ).length);
      setFilteredRooms(myRooms);
    }
  }, [activeRooms, activeFilter, userId]);

  // Fetch rooms on mount
  useEffect(() => {
    loadActiveRooms();
    
    // Set up real-time subscription to game rooms
    const subscription = GameService.subscribeToAllRooms((payload) => {
      console.log('Real-time room update detected:', payload);
      
      // Determine what happened
      if (payload.eventType === 'INSERT') {
        console.log('New room created:', payload.new);
        // Refresh the rooms list to get the latest data with player counts
        loadActiveRooms();
      } else if (payload.eventType === 'UPDATE') {
        console.log('Room updated:', payload.new);
        // Refresh the rooms list to get the latest data with player counts
        loadActiveRooms();
      } else if (payload.eventType === 'DELETE') {
        console.log('Room deleted:', payload.old);
        // If a room was deleted, filter it out of the current active rooms
        setActiveRooms(current => 
          current.filter(room => room.id !== payload.old.id)
        );
      }
    });
    
    // Clean up subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch active rooms
  const loadActiveRooms = async () => {
    setIsLoading(true);
    
    try {
      // Call the GameService to fetch active rooms
      const fetchedRooms = await GameService.getActiveRooms();
      
      // Filter and sort the rooms for display
      let filtered = [...fetchedRooms] as RoomWithPlayerCount[];
      
      // Filter based on current filter and search
      if (roomSearchQuery) {
        const query = roomSearchQuery.toLowerCase();
        filtered = filtered.filter(room => 
          room.code.toLowerCase().includes(query)
        );
      }
      
      if (activeFilter === 'active') {
        // Only show rooms that are in lobby state with active players
        filtered = filtered.filter(room => 
          room.status === 'lobby' && (room.playerCount || 0) > 0
        );
      } else if (activeFilter === 'mine') {
        // Only show rooms created by the current user
        filtered = filtered.filter(room => 
          room.host_id === userId
        );
      }
      
      // Always put rooms with players at the top
      filtered.sort((a, b) => {
        // First sort by player count (descending)
        if ((b.playerCount || 0) !== (a.playerCount || 0)) {
          return (b.playerCount || 0) - (a.playerCount || 0);
        }
        
        // For rooms with the same player count, sort active ones first
        const aActive = a.status === 'lobby' && (a.playerCount || 0) > 0;
        const bActive = b.status === 'lobby' && (b.playerCount || 0) > 0;
        
        if (aActive !== bActive) {
          return aActive ? -1 : 1;
        }
        
        // Finally sort by creation date (newest first)
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
      
      setActiveRooms(filtered);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      toast.error('Failed to load available rooms');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = (code: string) => {
    // Set loading state to show animation before navigation
    setIsLoading(true);
    
    // Apply a minimum delay before navigation to ensure
    // the loading animation displays properly
    setTimeout(() => {
      router.push(`/game-hub/${code}`);
    }, 2000);
  };

  const handleDeleteRoom = async (roomId: string) => {
    try {
      // Ask for confirmation first
      if (!confirm("Are you sure you want to delete this room? This action cannot be undone.")) {
        return;
      }
      
      setIsDeleting(roomId);
      const supabase = createClient();
      
      // Get current user to check if they're the host
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be signed in to delete a room');
        return;
      }
      
      const success = await GameService.forceDeleteRoom(roomId, user.id);
      if (success) {
        toast.success('Room deleted successfully');
        loadActiveRooms();
      } else {
        toast.error('Failed to delete room');
      }
    } catch (error) {
      console.error('Error deleting room:', error);
      toast.error('An error occurred while deleting the room');
    } finally {
      setIsDeleting(null);
    }
  };

  // Format date to a readable format like shown in the screenshot
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Get hours and minutes in 12-hour format
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours === 0 ? 12 : hours; // Convert 0 to 12 for 12 AM
    
    return `${month}/${day}/${year}, ${hours}:${minutes} ${ampm}`;
  };

  // Format last activity as a relative time (e.g., "2 minutes ago")
  const formatLastActivity = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  };

  // Get status badge for a room
  const getStatusBadge = (room: RoomWithPlayerCount) => {
    if (room.host_id === userId) {
      return (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/50 font-medium">
          Owner
        </Badge>
      );
    }
    if (room.status === 'in_progress') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/50 font-medium">
                In Progress
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Game is currently in progress</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    // Active room (lobby status)
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/50 font-medium">
              Active
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>This room is active and ready to join</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Get friendly status text for display
  const getStatusText = (room: RoomWithPlayerCount) => {
    if (room.status === 'in_progress') return 'In progress';
    if (room.status === 'completed') return 'Game ended';
    if (room.playerCount === 0) return 'Empty';
    return 'Active - Waiting for players';
  }

  // Handle Direct Join
  const handleDirectJoin = () => {
    if (!directJoinCode.trim()) return;
    
    setDirectJoinCode('');
    // Set loading state to show animation before navigation
    setIsLoading(true);
    
    // Apply a minimum delay for consistent loading animation
    setTimeout(() => {
      router.push(`/game-hub/${directJoinCode.trim()}`);
    }, 2000);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDirectJoin();
    }
  };

  if (isLoading) {
    return (
      <AnimatedLoading 
        animationType="among-us-gif"
        message="Loading Game Hub..." 
        isLoaded={activeRooms.length > 0}
        minDisplayTime={2000} // Display for at least 2 seconds
        transitionKey="hub-transition" // Use consistent key for transitions
        onTimeout={() => {
          setIsLoading(false);
          // If we already have some rooms data, use it even if incomplete
          if (activeRooms.length === 0) {
            // Try loading data again
            loadActiveRooms().catch(err => {
              console.error("Error loading rooms after timeout:", err);
            });
          }
        }}
      />
    );
  }

  // The main component content
  return (
    <div className="container-wide section-spacing mobile-pb">
      {/* Mobile-first layout with Game Hub title at top */}
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold">Game Hub</h1>
        <Button 
          variant="outline" 
          size="sm"
          className="flex items-center gap-1 sm:hidden"
          onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
        >
          <User className="h-4 w-4" />
          Profile
        </Button>
      </div>

      {/* Create Game Button - Full width on mobile */}
      <Button 
        onClick={handleCreateRoom} 
        disabled={isCreatingRoom}
        className="w-full mb-6 shadow-sm bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
      >
        {isCreatingRoom ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Game
          </>
        )}
      </Button>
      
      {/* Responsive Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column - Game Content */}
        <div className="w-full lg:w-[70%] space-y-6 order-1">
          {/* Game Room Tabs */}
          <Tabs 
            defaultValue={activeFilter} 
            value={activeFilter}
            onValueChange={(value) => setActiveFilter(value as 'active' | 'mine')}
            className="w-full"
          >
            <TabsList className="w-full mb-4 grid grid-cols-2 h-auto p-1">
              <TabsTrigger 
                value="active" 
                className="py-2.5 data-[state=active]:bg-primary/10"
              >
                Available Games
              </TabsTrigger>
              <TabsTrigger 
                value="mine" 
                className="py-2.5 relative data-[state=active]:bg-primary/10"
              >
                My Rooms
                {myInactiveRoomsCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 text-xs h-5 w-5 flex items-center justify-center p-0 rounded-full"
                  >
                    {myInactiveRoomsCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-0">
              {/* Direct Join Section */}
              <Card className="mb-6 responsive-card">
                <CardHeader className="pb-3 px-4">
                  <CardTitle className="text-md">Join by Code</CardTitle>
                  <CardDescription>
                    Enter a room code to join directly:
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4">
                  <div className="flex flex-col gap-3">
                    <Input
                      placeholder="Enter room code"
                      value={directJoinCode}
                      onChange={(e) => setDirectJoinCode(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="flex-grow"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        onClick={handleDirectJoin}
                        disabled={!directJoinCode.trim()}
                        className="whitespace-nowrap bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
                      >
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Join
                      </Button>
                      <Button
                        variant="outline"
                        className="whitespace-nowrap"
                        onClick={() => {
                          // Check if the browser supports camera access for QR scanning
                          if (typeof navigator !== 'undefined' && 
                              navigator.mediaDevices && 
                              typeof navigator.mediaDevices.getUserMedia === 'function') {
                            toast.info('Open your camera to scan a QR code', {
                              description: 'This will open your device camera to scan game room QR codes'
                            });
                            // We would ideally implement a QR scanner here, but that would require more complex components
                            // This is a placeholder that shows how it could work
                            // In a real implementation, you'd use a library like react-qr-reader
                          } else {
                            toast.error('QR scanning is not supported on this device');
                          }
                        }}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        Scan QR
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Available Games Display */}
              {filteredRooms.length === 0 ? (
                <EmptyState 
                  message="No active games available. Create a new game!"
                  handleCreateRoom={handleCreateRoom}
                  isCreatingRoom={isCreatingRoom}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredRooms.map(room => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      userId={userId}
                      handleJoinRoom={handleJoinRoom}
                      handleDeleteRoom={handleDeleteRoom}
                      isDeleting={isDeleting}
                      formatDate={formatDate}
                      formatLastActivity={formatLastActivity}
                      getStatusBadge={getStatusBadge}
                      getStatusText={getStatusText}
                      onShowQrCode={(code: string) => {
                        setSelectedRoomCode(code);
                        setQrDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="mine" className="mt-0">
              {/* My Rooms Display */}
              {filteredRooms.length === 0 ? (
                <EmptyState 
                  message="You haven't created any games yet. Create your first one!"
                  handleCreateRoom={handleCreateRoom}
                  isCreatingRoom={isCreatingRoom}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredRooms.map(room => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      userId={userId}
                      handleJoinRoom={handleJoinRoom}
                      handleDeleteRoom={handleDeleteRoom}
                      isDeleting={isDeleting}
                      formatDate={formatDate}
                      formatLastActivity={formatLastActivity}
                      getStatusBadge={getStatusBadge}
                      getStatusText={getStatusText}
                      onShowQrCode={(code: string) => {
                        setSelectedRoomCode(code);
                        setQrDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column - User Profile - Hidden on mobile, visible on desktop */}
        <div className="hidden lg:block lg:w-[30%] space-y-6 order-2">
          {/* User Profile Card */}
          <UserProfileCard 
            profile={userProfile} 
            totalRooms={totalUserRooms}
            inactiveRoomsCount={myInactiveRoomsCount}
          />
        </div>
      </div>
      
      {/* Mobile Profile - Fixed at bottom, only visible on mobile */}
      <div className="mobile-bottom-bar lg:hidden bg-background border-t border-border shadow-lg">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src={userProfile?.avatar_url || undefined} />
              <AvatarFallback className="bg-muted text-foreground">
                {userProfile?.full_name 
                  ? userProfile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                  : userProfile?.username?.substring(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="font-medium truncate text-foreground">
                {userProfile?.full_name || userProfile?.username || 'Anonymous'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {totalUserRooms} Rooms ({myInactiveRoomsCount} Inactive)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.location.href='/profile'}
              className="bg-primary/20 hover:bg-primary/30 text-foreground border-primary/20 h-8"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-destructive/20 hover:bg-destructive/30 text-foreground hover:text-foreground border-destructive/20 h-8"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.href = '/login';
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Game Room</DialogTitle>
            <DialogDescription>
              Scan this QR code to join the game room or share the link
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-4 space-y-4">
            <div className="bg-white p-4 rounded-md">
              <QRCodeSVG 
                value={`${window.location.origin}/game-hub/${selectedRoomCode}`} 
                size={200}
                bgColor="#FFFFFF"
                fgColor="#000000"
                level="L"
                includeMargin={false}
              />
            </div>
            <p className="text-center font-medium">Room Code: {selectedRoomCode}</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              className="w-full sm:w-auto"
              onClick={() => {
                const url = `${window.location.origin}/game-hub/${selectedRoomCode}`;
                if (navigator.share) {
                  navigator.share({
                    title: 'Join my game room',
                    text: `Join my game with code: ${selectedRoomCode}`,
                    url
                  }).catch(err => {
                    console.error('Could not share', err);
                  });
                } else {
                  navigator.clipboard.writeText(url);
                  toast.success('Link copied to clipboard');
                }
              }}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share Link
            </Button>
            <Button 
              variant="outline" 
              className="w-full sm:w-auto"
              onClick={() => {
                navigator.clipboard.writeText(selectedRoomCode || '');
                toast.success('Room code copied to clipboard');
              }}
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

// Room Card Component
function RoomCard({ 
  room, 
  userId, 
  handleJoinRoom, 
  handleDeleteRoom, 
  isDeleting,
  formatDate,
  formatLastActivity,
  getStatusBadge,
  getStatusText,
  onShowQrCode
}: {
  room: RoomWithPlayerCount;
  userId: string | null;
  handleJoinRoom: (code: string) => void;
  handleDeleteRoom: (id: string) => void;
  isDeleting: string | null;
  formatDate: (date: string | null) => string;
  formatLastActivity: (date: string | null) => string;
  getStatusBadge: (room: RoomWithPlayerCount) => React.ReactNode;
  getStatusText: (room: RoomWithPlayerCount) => string;
  onShowQrCode: (code: string) => void;
}) {
  const isOwner = room.host_id === userId;
  const isInactive = room.playerCount === 0;
  
  return (
    <Card className={`responsive-card transition-all duration-200 hover:shadow-md
      ${isInactive ? 'border-amber-500/30' : ''}
      ${isOwner ? 'ring-1 ring-primary/30' : ''}
    `}>
      <CardHeader className="pb-3 px-4">
        <div className="flex justify-between items-start">
          <div className="flex flex-col max-w-[85%]">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{getStatusBadge(room)}</CardTitle>
            </div>
            <CardDescription className="mt-1 font-medium">
              Code: <span className="text-foreground">{room.code}</span>
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onShowQrCode(room.code)}
              title="Show QR code"
            >
              <QrCode className="h-4 w-4" />
              <span className="sr-only">Show QR code</span>
            </Button>
            
            {isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-full flex-shrink-0"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                    <span className="sr-only">More options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {isInactive && (
                    <DropdownMenuItem
                      onClick={() => handleJoinRoom(room.code)}
                      className="text-blue-500 focus:text-blue-500 cursor-pointer"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Join & Reactivate
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => onShowQrCode(room.code)}
                    className="cursor-pointer"
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    Share QR Code
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeleteRoom(room.id)}
                    disabled={isDeleting === room.id}
                    className="text-destructive focus:text-destructive cursor-pointer"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting === room.id ? "Deleting..." : "Delete Room"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 px-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              room.status === 'in_progress' 
                ? 'bg-green-500' 
                : isInactive 
                  ? 'bg-amber-500' 
                  : 'bg-green-500'
            }`} />
            <span className="text-muted-foreground">{getStatusText(room)}</span>
          </div>
          
          <div className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className={`${room.playerCount === 0 ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
              {room.playerCount}/8 {room.playerCount === 0 ? "(Empty)" : ""}
            </span>
          </div>
        </div>
        
        <div className="text-sm">
          <p className="truncate-text text-muted-foreground">Created: {formatDate(room.created_at)}</p>
          {isInactive && room.last_activity && (
            <p className="truncate-text text-muted-foreground mt-1">Last activity: {formatLastActivity(room.last_activity)}</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-0 px-4">
        <Button
          onClick={() => handleJoinRoom(room.code)}
          className="w-full shadow-sm bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20 group"
        >
          {isInactive 
            ? "Join & Reactivate" 
            : "Join Game"}
          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// Empty State Component
function EmptyState({ 
  message, 
  handleCreateRoom, 
  isCreatingRoom 
}: {
  message: string;
  handleCreateRoom: () => void;
  isCreatingRoom: boolean;
}) {
  return (
    <Card className="p-4 text-center border border-border/50 bg-card/50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-full mx-auto">
          <p className="text-muted-foreground mb-4 text-sm sm:text-base">{message}</p>
          <Button 
            onClick={handleCreateRoom}
            disabled={isCreatingRoom}
            className="bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20 shadow-sm w-full"
          >
            {isCreatingRoom ? (
              <span className="flex items-center justify-center gap-2">Creating...</span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <PlusCircle className="h-5 w-5" />
                Create a Game
              </span>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// User Profile Card Component
function UserProfileCard({ 
  profile, 
  totalRooms,
  inactiveRoomsCount
}: {
  profile: UserProfile | null;
  totalRooms: number;
  inactiveRoomsCount: number;
}) {
  const supabase = createClient();
  
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };
  
  if (!profile) {
    return (
      <Card className="bg-background border-border shadow-md overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8">
            <User className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-border shadow-md overflow-hidden responsive-card">
      <CardHeader className="border-b border-border pb-4 pt-5 px-5">
        <CardTitle className="text-xl text-foreground">Profile</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/30">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/20 text-primary font-semibold">
              {profile.full_name 
                ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                : profile.username?.substring(0, 2).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          
          <div className="space-y-1 flex-1 min-w-0">
            <h3 className="font-medium text-lg text-foreground truncate">
              {profile.full_name || profile.username || 'Anonymous'}
            </h3>
            {profile.email && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground group w-full">
                <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                <div className="relative w-full min-w-0">
                  <span className="truncate block pr-2">{profile.email}</span>
                  <div className="hidden group-hover:block absolute top-0 left-0 right-0 z-10 bg-background py-1 px-2 rounded shadow-md">
                    {profile.email}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="text-center p-3 rounded-md bg-primary/10 border border-primary/20">
            <p className="text-2xl font-bold text-foreground">{totalRooms}</p>
            <p className="text-sm text-muted-foreground">Total Rooms</p>
          </div>
          <div className="text-center p-3 rounded-md bg-primary/10 border border-primary/20">
            <p className="text-2xl font-bold text-foreground">{inactiveRoomsCount}</p>
            <p className="text-sm text-muted-foreground">Inactive Rooms</p>
          </div>
        </div>
        
        <div className="flex flex-col space-y-3 pt-3">
          <Button 
            variant="outline" 
            className="w-full justify-start bg-primary/20 hover:bg-primary/30 text-foreground border-primary/20" 
            onClick={() => window.location.href='/profile'}
          >
            <Settings className="mr-2 h-4 w-4" />
            Account Settings
          </Button>
          <Button 
            variant="outline" 
            className="w-full justify-start bg-destructive/20 hover:bg-destructive/30 text-foreground hover:text-foreground border-destructive/20"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 
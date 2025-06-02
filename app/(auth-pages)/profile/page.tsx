"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, LogOut, Edit } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [userId, setUserId] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [friendUsername, setFriendUsername] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [updatingUsername, setUpdatingUsername] = useState(false);  
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const fetchProfile = async (profileID: string) => {
      console.log("B", profileID)
      if (profileID == "") return;
      const { data, error } = await supabase
        .from("profiles")
        .select("username, avatar_url, friend_ids, request_ids, sent_request_ids, blocked_users")
        .eq("id", profileID)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
      } else {
        setProfile(data);
        console.log("Profile fetched:", data);
      }
    }

    const fetchUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          console.error("Error fetching user:", error);
          router.push("/sign-in");
        } else {
          setUser(data.user);
          setUserId(data.user.id);
          fetchProfile(data.user.id);
        }
      } catch (err) {
        console.error("Failed to fetch user:", err);
        router.push("/sign-in");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const fetchRoomCode = async (roomId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("game_rooms")
      .select("code, status")
      .eq("id", roomId)
      .single();
    if (error) {
      console.error("Error fetching room code:", error);
      return null;
    }
    return data ? data.code : null;
  }


  // check if a friends is in game
  useEffect(() => {
    const supabase = createClient();
    // check for friend ids in game
    const checkFriendsInGame = async () => {
      setFriends([]); // Reset friends state before checking
      if (!profile) return;
      console.log("Checking friends in game for profile:", profile);

      if (!profile.friend_ids) {
        console.log("No friends to check in game.");
        return;
      }
      // get just the ids from the friend_ids array
      //const friendIds = profile.friend_ids.map((friend: { id: string }) => friend.id);

      const updatedFriendList: any[] = [];

      for (const friend of profile.friend_ids) {
        const id = friend.id; // Assuming friend_ids is an array of objects with an 'id' property
        // fetch the game_players data for each friend id
        const { data: gamePlayer, error } = await supabase
          .from("game_players")
          .select("id, room_id, is_online")
          .eq("user_id", id)
        if (error) {
          console.error(`Error fetching game player for friend ID ${id}:`, error);
          continue; // Skip to the next friend if there's an error
        }
        // while testing we allow multiple game_players for a user, here we choose the first one
        const singleGamePlayer = gamePlayer && gamePlayer.length > 0 ? gamePlayer[0] : null;

        if (singleGamePlayer) {
          const roomCode = await fetchRoomCode(singleGamePlayer.room_id);
          // add to friends state
          updatedFriendList.push({ id, username: friend.username, roomId: singleGamePlayer.room_id, code: roomCode, isOnline: singleGamePlayer.is_online });
          
        } else {
          console.log(`Friend with ID ${id} is not in game.`);
        }
      }

      setFriends(updatedFriendList);
    };

    const newRequests: any[] = [];
    const searchForRequests = async () => {
      if (!profile || !userId) return;
      const supabase = createClient();
      console.log("Searching for requests for profile:", userId);
      // .contains("sent_request_ids", [{ id: userId }]);
      // Find all profiles where sent_request_ids contains an object with the current user's id
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username")
        .contains("sent_request_ids", [userId]);

      if (error) {
        console.error("Error searching for sent requests:", error);
      } else {
        console.log("Profiles with your sent request:", data);
        // Filter out blocked users
        const blockedUsers = profile.blocked_users || [];
        const filteredData = data.filter((req: { id: string }) => !blockedUsers.includes(req.id));
        // Update requests state with filtered data
        newRequests.push(...filteredData);
      }
      addNewRequests();
    }

    // add new requests the table
    const addNewRequests = async () => {
      console.log("Adding new requests to profile:", newRequests);
      if (newRequests.length === 0) return;

      // add only new requests to the profile
      if (!profile || !userId) return;
      const supabase = createClient();
      console.log("Adding new requests to profile:", userId, newRequests);
      // Check if request_ids exists, if not initialize it
      if (!profile.request_ids) {
        profile.request_ids = [];
      }
      // Combine existing request_ids with new requests, ensuring no duplicates

      const existingRequestIds = new Set([
        ...(profile.request_ids || []).map((req: { id: string }) => req.id),
        ...(profile.friend_ids || []).map((friend: { id: string }) => friend.id),
        ...(profile.blocked_users || []).map((blocked: { id: string }) => blocked.id),
      ]);
      const newRequestsFiltered = newRequests.filter((req: { id: string }) => !existingRequestIds.has(req.id));
      if (newRequestsFiltered.length === 0) {
        console.log("No new requests to add.");
        setRequests(profile.request_ids);
        return; // No new requests to add
      }
      console.log("New requests to add:", newRequestsFiltered);
      // Update the profile with new requests
      // Ensure request_ids is an array of objects with id and username
      const updatedRequestIds = newRequestsFiltered.map((req: { id: string; username: string }) => ({ id: req.id, username: req.username }));
      // Combine with existing request_ids

      const { error } = await supabase
        .from("profiles")
        .update({ request_ids: updatedRequestIds })
        .eq("id", userId);

      if (error) {
        console.error("Error updating profile with new requests:", error);
      } else {
        console.log("Profile updated with new requests:", updatedRequestIds);
        setProfile((prev: any) => ({ ...prev, request_ids: updatedRequestIds }));
        setRequests(updatedRequestIds);
      }
    }


    checkFriendsInGame();
    searchForRequests();
    
    //fetchRequests();
  }, [profile]);


  const handleAcceptRequest = async (request: { id: string; username: string }) => {
    const supabase = createClient();
    if (!profile || !userId) return;

    // Remove from request_ids and add to friend_ids
    const updatedRequests = profile.request_ids.filter((currentRequest: { id: string }) => currentRequest.id !== request.id);
    const updatedFriends = [...(profile.friend_ids || []), { id: request.id, username: request.username }];

    const { error } = await supabase
      .from("profiles")
      .update({
        friend_ids: updatedFriends,
        request_ids: updatedRequests,
      })
      .eq("id", userId);

    if (error) {
      toast.error("Failed to accept friend request.");
      console.error("Error updating profile:", error);
    } else {
      toast.success("Friend request accepted!");
      // Update local state
      setProfile((prev: any) => ({
        ...prev,
        friend_ids: updatedFriends,
        request_ids: updatedRequests,
      }));
      setRequests((prev: any[]) => prev.filter((r) => r.id !== request.id));
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    const supabase = createClient();
    if (!profile || !userId) return;
    // Remove from request_ids
    const updatedRequests = profile.request_ids.filter((req: { id: string }) => req.id !== requestId);
    const updatedBlockedUsers = [...(profile.blocked_users || []), requestId];
    const { error } = await supabase
      .from("profiles")
      .update({
        request_ids: updatedRequests,
        blocked_users: updatedBlockedUsers,
      })
      .eq("id", userId);
    if (error) {
      toast.error("Failed to decline friend request.");
      console.error("Error updating profile:", error);
    }
    else {
      toast.success("Friend request declined.");
      // Update local state
      setProfile((prev: any) => ({
        ...prev,
        request_ids: updatedRequests,
        blocked_users: updatedBlockedUsers,
      }));
      // Remove the declined/blocked request from the requests state
      setRequests((prev: any[]) => prev.filter((r) => r.id !== requestId));
    }
  }

  const removeFriend = async (friendId: string) => {
    const supabase = createClient();
    if (!profile || !userId) return;
    // Remove from friend_ids
    const updatedFriends = profile.friend_ids.filter((friend: { id: string }) => friend.id !== friendId);
    const updatedBlockedUsers = [...(profile.blocked_users || []), friendId];
    const { error } = await supabase
      .from("profiles")
      .update({
        friend_ids: updatedFriends,
        blocked_users: updatedBlockedUsers,
      })
      .eq("id", userId);
    if (error) {
      toast.error("Failed to remove friend.");
      console.error("Error updating profile:", error);
    }
    else {
      toast.success("Friend removed.");
      // Update local state
      setProfile((prev: any) => ({
        ...prev,
        friend_ids: updatedFriends,
        blocked_users: updatedBlockedUsers,
      }));
      // Remove the friend from the friends state
      setFriends((prev: any[]) => prev.filter((f) => f.id !== friendId));
    }
  }


  // handle sending a friend request
  const sendFriendRequest = async (username: string) => {
    setSendingRequest(true);
    const supabase = createClient();

    if (!username) {
      setSendingRequest(false);
      return;
    }

    // Fetch the recipient's profile
    const { data: existingProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("id, username, friend_ids, request_ids, blocked_users")
      .eq("username", username)
      .single();

    if (fetchError || !existingProfile) {
      toast.error("User not found.");
      setSendingRequest(false);
      return;
    }

    // Prevent sending to yourself
    if (existingProfile.id === userId) {
      toast.error("You cannot send a friend request to yourself.");
      setSendingRequest(false);
      return;
    }

    // Prevent sending to someone who is already your friend
    if (existingProfile.friend_ids?.some((f: any) => f.id === userId)) {
      toast.error("You are already friends with this user.");
      setSendingRequest(false);
      return;
    }

    // Prevent duplicate requests
    if (existingProfile.request_ids?.some((r: any) => r.id === userId)) {
      toast.error("Friend request already sent.");
      setSendingRequest(false);
      return;
    }
    
    if (profile.sent_request_ids?.includes(existingProfile.id)) {
      toast.error("You have already sent a friend request to this user.");
      setSendingRequest(false);
      return;
    }

    // Prevent sending if you are blocked or have blocked them
    if (existingProfile.blocked_users?.includes(userId)) {
      toast.error("You cannot send a friend request to a user who has blocked you.");
      setSendingRequest(false);
      return;
    }

    // If you have blocked them, remove them from your blocked users
    if (profile.blocked_users?.includes(existingProfile.id)) {
      const updatedBlockedUsers = profile.blocked_users.filter((id: string) => id !== existingProfile.id);
      const { error: unblockError } = await supabase
        .from("profiles")
        .update({ blocked_users: updatedBlockedUsers })
        .eq("id", userId);

      if (unblockError) {
        toast.error("Failed to unblock user.");
        console.error("Error unblocking user:", unblockError);
        setSendingRequest(false);
        return;
      }
    }

    // Add your request to their request_ids
    const updatedYourSentRequestIds = [
      ...(Array.isArray(profile.sent_request_ids) ? profile.sent_request_ids : []),
      existingProfile.id
    ];

    const { error } = await supabase
      .from("profiles")
      .update({ sent_request_ids: updatedYourSentRequestIds })
      .eq("id", userId);

    if (error) {
      toast.error("Failed to send friend request.");
      console.error("Error updating profile:", error);
    } else {
      toast.success("Friend request sent!");
      setFriendUsername("");
    }
    setSendingRequest(false);
  };

  const handleUsernameChange = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newUsername.trim() || !userId) return;
  setUpdatingUsername(true);
  const supabase = createClient();

  // Check if the new username is already taken
  const { data: existingUser, error: fetchError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", newUsername.trim())
    .single();
  if (fetchError) {
    console.error("Error checking existing username:", fetchError);
    toast.error("Failed to check username availability.");
    setUpdatingUsername(false);
    return;
  }
  if (existingUser) {
    toast.error("Username is already taken.");
    setUpdatingUsername(false);
    return;
  }


  const { error } = await supabase
    .from("profiles")
    .update({ username: newUsername.trim() })
    .eq("id", userId);
  if (error) {
    toast.error("Failed to update username.");
  } else {
    toast.success("Username updated!");
    setProfile((prev: any) => ({ ...prev, username: newUsername.trim() }));
    setNewUsername("");
  }
  setUpdatingUsername(false);
};

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Redirecting to sign-in
  }

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 py-6 mt-4 flex flex-col">
      {/* Game grid background */}
      <div className="absolute inset-0 game-grid-bg opacity-40"></div>
      
      {/* Content overlay */}
      <div className="relative z-10 flex justify-center items-center">
        <Card className="shadow-glow bg-background/90 backdrop-blur-sm border-primary/20 overflow-auto flex-grow relative max-w-md w-full">
          {/* Top edge glow */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
          
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold text-foreground game-title">Profile</CardTitle>
          </CardHeader>
          
          <CardContent className="p-6 flex flex-col items-center">
            <div className="relative group mb-6">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary/30 transition-all duration-300 group-hover:border-primary/60 shadow-glow">
                <img
                  src={user.user_metadata.avatar_url}
                  alt="User Avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 rounded-full transition-opacity duration-300 flex items-center justify-center">
                <Edit className="w-5 h-5 text-primary/70 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            
            <div className="w-full space-y-4">
              <div className="bg-background/60 backdrop-blur-sm p-4 rounded-md border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1">Name:</p>
                <p className="font-medium text-foreground">{user.user_metadata.full_name || "N/A"}</p>
              </div>
              
              <div className="bg-background/60 backdrop-blur-sm p-4 rounded-md border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1">Email:</p>
                <p className="font-medium text-foreground">{user.email}</p>
              </div>

              <div className="bg-background/60 backdrop-blur-sm p-4 rounded-md border border-primary/20 mb-4">
                <form className="flex flex-col sm:flex-row gap-2 items-center" onSubmit={handleUsernameChange}>
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 w-1 rounded-md border border-primary/20 bg-background/70 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    disabled={updatingUsername}
                    placeholder={profile?.username || "Enter new username"}
                  />
                  <Button
                    type="submit"
                    className="w-full sm:w-auto bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
                    disabled={updatingUsername}
                  >
                    {updatingUsername ? "Updating..." : "Change Username"}
                  </Button>
                </form>
              </div>

              {/* Friends Section */}
              <div className="bg-background/60 backdrop-blur-sm p-4 rounded-md border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1">Friends:</p>
                {profile?.friend_ids && profile.friend_ids.length > 0 ? (
                  <div className="space-y-2">
                    {friends.map((req: { id: string; username: string; code: string }) => (
                      <div key={req.id} className="flex items-center justify-between gap-x-2">
                        <span>{req.username}</span>
                        <div className="flex gap-x-2">
                          {req.code && (
                            <Button
                              className="bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
                              asChild
                            >
                              <Link href={`/game/${req.code}`}>
                                Join Room - {req.code}
                              </Link>
                            </Button>
                          )}
                          <Button
                            className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                            variant="outline"
                            onClick={() => removeFriend(req.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No friends yet.</p>
                )}
              </div>

              {/* Friend Requests Section */}
              <div className="bg-background/60 backdrop-blur-sm p-4 rounded-md border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1">Friend Requests:</p>
                {profile?.request_ids && profile.request_ids.length > 0 ? (
                  <div className="space-y-2">
                    {requests.map((req: { id: string; username: string; }) => (
                      <div key={req.id} className="flex items-center justify-between">
                        <span>{req.username}</span>
                        <div className="flex gap-2">
                          <Button className="w-full sm:w-auto bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
                            onClick={() => handleAcceptRequest(req)}
                          >
                            Accept
                          </Button>
                          <Button className="w-full sm:w-auto text-red-500 border-red-500/30 hover:bg-red-500/10"
                            variant="outline"
                            onClick={() => handleDeclineRequest(req.id)}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No friend requests.</p>
                )}
              </div>

              {/* Send Friend Request Section */}    
              <div className="bg-background/60 backdrop-blur-sm p-4 rounded-md border border-primary/20 mb-4">
                <form
                  className="flex flex-col sm:flex-row gap-2 items-center"
                  onSubmit={e => {
                    e.preventDefault();
                    if (!friendUsername.trim()) return;
                    sendFriendRequest(friendUsername.trim());
                  }}
                >
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 w-1 rounded-md border border-primary/20 bg-background/70 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="Enter username"
                    value={friendUsername}
                    onChange={e => setFriendUsername(e.target.value)}
                    disabled={sendingRequest}
                  />
                  <Button
                    type="submit"
                    className="w-full sm:w-auto bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
                    disabled={sendingRequest}
                  >
                    {sendingRequest ? "Sending..." : "Send Friend Request"}
                  </Button>
                </form>
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col sm:flex-row gap-3 px-6 pb-6">
            <Button 
              className="w-full sm:w-auto bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20"
              asChild
            >
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Back to Home
              </Link>
            </Button>
            
            <Button 
              className="w-full sm:w-auto text-red-500 border-red-500/30 hover:bg-red-500/10"
              variant="outline"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </CardFooter>
          
          {/* Bottom edge glow */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
        </Card>
        
        {/* Decorative elements */}
        <div className="absolute w-2 h-2 bg-primary/30 rounded-sm left-[12%] top-1/2 animate-pulse"></div>
        <div className="absolute w-2 h-2 bg-primary/20 rounded-sm right-[15%] top-1/3 animate-ping-slow"></div>
        <div className="absolute w-3 h-3 bg-primary/10 left-1/4 bottom-10 animate-bounce-slow"></div>
      </div>
    </div>
  );
}
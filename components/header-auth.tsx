"use client";

import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation"; 
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { User, LogOut, Gamepad2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function HeaderAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  useEffect(() => {
    const supabase = createClient();
    
    // Check current user
    const getUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error("Error fetching user:", error);
          setUser(null);
        } else {
          setUser(data.user);
          console.log("User fetched:", data.user.user_metadata);
        }
      } catch (err) {
        console.error("Failed to get user:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    getUser();
    
    // Set up auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
        setLoading(false);
      }
    );
    
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);
  
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
    router.push("/");
  };
  
  if (loading) {
    return <div className="h-10 w-24 rounded-md bg-secondary animate-pulse"></div>;
  }
  
  return user ? (
    <div className="flex items-center gap-3">
      {/* Game Hub Button - Animated with game controller icon */}
      <Link
        href="/game-hub"
        className="py-2 px-4 rounded-md no-underline bg-primary/20 hover:bg-primary/30 text-foreground border border-primary/20 flex items-center gap-2 relative group overflow-hidden"
      >
        <Gamepad2 className="w-4 h-4 transition-transform group-hover:scale-110 group-hover:rotate-12" />
        <span className="hidden md:inline-block">Game Hub</span>
        {/* Glowing dot to indicate activity */}
        <span className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
      </Link>

      {/* User Dropdown Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className="relative flex items-center gap-2 py-2 px-3 rounded-md group">
            <div className="w-6 h-6 rounded-full overflow-hidden border-2 border-primary/30 flex-shrink-0 transition-all duration-300 group-hover:border-primary/60">
              <img
                src={user.user_metadata.avatar_url}
                alt="User Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="hidden md:inline-block max-w-[120px] truncate">{user.user_metadata.full_name || user.email}</span>
            <ChevronDown className="w-4 h-4 opacity-70 transition-transform group-hover:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px] p-2 animate-in fade-in-80 slide-in-from-top-5">
          <div className="px-2 pt-1 pb-2 mb-1 border-b border-border">
            <p className="font-medium text-sm">{user.user_metadata.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
              <User className="w-4 h-4" />
              <span>Profile</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={handleSignOut}
            className="flex items-center gap-2 text-red-400 dark:text-red-300 focus:text-red-400 dark:focus:text-red-300 cursor-pointer mt-1"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : (
    <Link
      href="/sign-in"
      className="py-2 px-4 rounded-md no-underline text-foreground bg-primary/20 hover:bg-primary/30 border border-primary/20 transition-all hover:shadow-md relative overflow-hidden group"
    >
      <span className="relative z-10">Sign in</span>
      <span className="absolute inset-0 bg-primary/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
    </Link>
  );
}

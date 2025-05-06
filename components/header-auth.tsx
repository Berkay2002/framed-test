"use client";

import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation"; 
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

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
    <div className="flex items-center gap-4">
      <p className="text-sm text-foreground">
        Hey, {user.email}!
      </p>
      <Button
        onClick={handleSignOut}
        variant="secondary"
        className="py-2 px-4 rounded-md"
      >
        Sign out
      </Button>
    </div>
  ) : (
    <Link
      href="/sign-in"
      className="py-2 px-4 rounded-md no-underline text-foreground bg-secondary hover:bg-secondary/80"
    >
      Sign in
    </Link>
  );
}

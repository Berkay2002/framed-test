import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { GameProvider } from "@/lib/game-context";

export default async function GameHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  
  // Get the user session
  const { data: { session } } = await supabase.auth.getSession();
  
  // If no session, redirect to login
  if (!session) {
    redirect("/sign-in?message=Please sign in to access the game hub");
  }

  return (
    <GameProvider>
      {children}
    </GameProvider>
  );
} 
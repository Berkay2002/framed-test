import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  
  // Check if there's a returnUrl in the query params
  const returnUrl = requestUrl.searchParams.get("returnUrl");

  // Handle OAuth error (e.g. user canceled the sign-in)
  if (error) {
    console.error(`Auth error: ${error}`, errorDescription);
    // Delay the redirect to show the loading animation for at least 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (code) {
    const supabase = await createClient();
    try {
      // Exchange the auth code for a session
      const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (sessionError) throw sessionError;
      
      // After successful authentication, we just continue without profile creation
      // Don't attempt to create a profile here as it might fail if the table doesn't exist yet
      
    } catch (exchangeError) {
      console.error("Failed to exchange code for session:", exchangeError);
      // Delay the redirect to show the loading animation for at least 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      return NextResponse.redirect(
        `${origin}/sign-in?error=${encodeURIComponent("Authentication failed. Please try again.")}`
      );
    }
  }

  // Delay the redirect to show the loading animation for at least 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // If there's a returnUrl, redirect to it, otherwise go to game hub
  if (returnUrl && returnUrl.startsWith('/game-hub/')) {
    console.log(`Redirecting to: ${origin}${returnUrl}`);
    return NextResponse.redirect(`${origin}${returnUrl}`);
  }
  
  // URL to redirect to after sign up process completes
  return NextResponse.redirect(`${origin}/game-hub`);
}

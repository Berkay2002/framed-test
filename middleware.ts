import { type NextRequest, NextResponse } from "next/server";
import { updateSession, createClient } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Always update the auth session
  const response = await updateSession(request);
  
  // Get the pathname from the URL
  const { pathname } = request.nextUrl;
  
  // Check if the path should be protected
  if (pathname.startsWith('/game-hub')) {
    try {
      const { supabase } = createClient(request);
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      
      // Redirect to login if no session or user exists
      if (!session || !user) {
        // Store the URL the user was trying to visit
        const returnUrl = encodeURIComponent(request.nextUrl.pathname);
        
        // Create redirect URL with message and return path
        const redirectUrl = new URL(`/sign-in?message=Please sign in to access the Game Hub&returnUrl=${returnUrl}`, request.url);
        
        return NextResponse.redirect(redirectUrl);
      }
    } catch (error) {
      console.error('Auth error in middleware:', error);
      const redirectUrl = new URL('/sign-in', request.url);
      redirectUrl.searchParams.set('message', 'Authentication error. Please sign in again.');
      return NextResponse.redirect(redirectUrl);
    }
  }
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

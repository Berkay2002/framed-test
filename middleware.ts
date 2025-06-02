import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from './utils/supabase/types';

// Create a Supabase client for middleware
export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let response = NextResponse.next();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // If the cookie is updated, update the cookies for the request and response
          request.cookies.set(name, value, options);
          response = NextResponse.next();
          response.cookies.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          // If the cookie is removed, update the cookies for the request and response
          request.cookies.set(name, '', options);
          response = NextResponse.next();
          response.cookies.set(name, '', options);
        }
      }
    }
  );

  return { supabase, response };
};

// Update the Supabase session
const updateSession = async (request: NextRequest) => {
  try {
    const { supabase, response } = createClient(request);

    // This will refresh session if expired - required for Server Components
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    await supabase.auth.getUser();

    return response;
  } catch (e) {
    // If you are here, a Supabase client could not be created!
    // This is likely because you have not set up environment variables.
    console.error('Error updating Supabase session:', e);
    return NextResponse.next();
  }
};

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

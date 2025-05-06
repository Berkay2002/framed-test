"use server";

// The purpose of this file is to handle the actions for the auth pages

import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// This action is used to sign out
// It redirects to the sign in page

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/sign-in");
};

// This action is used to sign in with Google
// It redirects to the Google sign in page
// The callback is handled in the auth/callback/route.ts file

export const signInWithGoogleAction = async (formData: FormData) => {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  
  // Get returnUrl from the form data if it exists
  const returnUrl = formData.get('returnUrl')?.toString();
  
  let redirectTo = `${origin}/auth/callback`;
  
  // If returnUrl exists, append it to the callback URL
  if (returnUrl) {
    redirectTo += `?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    console.error(error);
    return redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  // Redirect to the URL provided by Supabase to continue OAuth flow
  return redirect(data.url);
};

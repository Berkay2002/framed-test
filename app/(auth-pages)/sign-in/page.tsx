"use client";

import { useSearchParams } from "next/navigation";
import { FormMessage } from "@/components/form-message";
import { GoogleButton } from "@/components/google-button";
import { Suspense } from "react";
import Link from "next/link";

// Component that uses useSearchParams
function SignInContent() {
  const searchParams = useSearchParams();
  const errorMessage = searchParams.get("error");
  const message = searchParams.get("message");
  const returnUrl = searchParams.get("returnUrl");

  return (
      <div className="w-[500px] bg-[#342043] border border-[#3e2e59] rounded-md text-white">
        <div className="pt-5 pb-2 px-5 text-center">
          <h2 className="text-lg font-semibold text-white">Sign in</h2>
          <p className="text-white/70 text-sm mt-1">
            Use your Google account to access the Game Hub
          </p>
        </div>
        
        <div className="pt-2 pb-5 px-5 space-y-3">
          <GoogleButton returnUrl={returnUrl} />
          
          {errorMessage && (
            <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs">
              <FormMessage message={{ error: errorMessage }} />
            </div>
          )}
          
          <div className="pt-1 text-center">
            <Link href="/" className="text-xs text-white/80 hover:text-white">
              Return to homepage
            </Link>
          </div>
        </div>
      </div>
  );
}

// Main component with Suspense boundary
export default function Login() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">Welcome to Framed</h1>
          <p className="text-white/70 text-sm mt-1">Sign in to continue to the game</p>
        </div>

        <div className="w-[500px] bg-[#342043] border border-[#3e2e59] rounded-md text-white">
          <div className="pt-5 pb-2 px-5 text-center">
            <h2 className="text-lg font-semibold text-white">Sign in</h2>
            <p className="text-white/70 text-sm mt-1">Loading...</p>
          </div>
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
          </div>
        </div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}

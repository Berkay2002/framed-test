"use client";

import { useSearchParams } from "next/navigation";
import { FormMessage } from "@/components/form-message";
import { GoogleButton } from "@/components/google-button";
import { Suspense } from "react";

// Component that uses useSearchParams
function SignInContent() {
  const searchParams = useSearchParams();
  const errorMessage = searchParams.get("error");
  const message = searchParams.get("message");
  const returnUrl = searchParams.get("returnUrl");

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-w-64 max-w-md mx-auto">
      <div className="w-full">
        <h1 className="text-2xl font-medium text-center mb-2">Sign in</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Sign in with your Google account to access the Game Hub
        </p>

        <div className="flex flex-col gap-4">
          <GoogleButton returnUrl={returnUrl} />
          {message && <p className="text-sm text-center text-muted-foreground">{message}</p>}
          {errorMessage && <FormMessage message={{ error: errorMessage }} />}
        </div>
      </div>
    </div>
  );
}

// Main component with Suspense boundary
export default function Login() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex flex-col items-center justify-center min-w-64 max-w-md mx-auto">
        <div className="w-full">
          <h1 className="text-2xl font-medium text-center mb-2">Sign in</h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Loading...
          </p>
        </div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}

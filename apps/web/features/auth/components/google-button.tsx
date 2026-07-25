"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type GoogleButtonProps = { onError: (message: string) => void };

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.01v2.51h3.25c1.9-1.75 2.97-4.34 2.97-7.35Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.25-2.51c-.9.6-2.05.95-3.37.95-2.6 0-4.8-1.75-5.59-4.1H3.05v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.12-1.31.31-1.92v-2.6H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.52l3.36-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.98c1.47 0 2.79.5 3.83 1.48l2.88-2.88C16.95 2.94 14.7 2 12 2a10 10 0 0 0-8.95 5.48l3.36 2.6c.79-2.35 2.99-4.1 5.59-4.1Z"
      />
    </svg>
  );
}

export function GoogleButton({ onError }: GoogleButtonProps) {
  const [isPending, setIsPending] = useState(false);

  async function continueWithGoogle() {
    setIsPending(true);
    onError("");

    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/auth/callback`,
      errorCallbackURL: `${window.location.origin}/auth/callback`,
    });

    if (result.error) {
      onError(result.error.message ?? "Google sign-in could not be started. Please try again.");
      setIsPending(false);
    }
  }

  return (
    <Button className="w-full" disabled={isPending} onClick={continueWithGoogle} variant="outline">
      {isPending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <GoogleMark />
      )}
      Continue with Google
    </Button>
  );
}

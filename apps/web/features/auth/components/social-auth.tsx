"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type ProviderId = "google" | "github";

const providerLabels: Record<ProviderId, string> = {
  google: "Google",
  github: "GitHub",
};

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

function GitHubMark() {
  return (
    <svg aria-hidden="true" className="size-4 fill-current" viewBox="0 0 24 24">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.27 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.2.67.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

const providers: { id: ProviderId; mark: () => ReactNode }[] = [
  { id: "google", mark: GoogleMark },
  { id: "github", mark: GitHubMark },
];

export function SocialAuth({ className }: { className?: string }) {
  const [pendingProvider, setPendingProvider] = useState<ProviderId | null>(null);
  const [error, setError] = useState("");

  async function continueWith(provider: ProviderId) {
    setPendingProvider(provider);
    setError("");

    const result = await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}/auth/callback`,
      errorCallbackURL: `${window.location.origin}/auth/callback`,
    });

    if (result.error) {
      setError(
        result.error.message ??
          `${providerLabels[provider]} sign-in could not be started. Please try again.`,
      );
      setPendingProvider(null);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {providers.map(({ id, mark: Mark }) => {
        const isPending = pendingProvider === id;
        return (
          <Button
            key={id}
            className="w-full"
            disabled={pendingProvider !== null}
            onClick={() => void continueWith(id)}
            variant="outline"
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Mark />
            )}
            Continue with {providerLabels[id]}
          </Button>
        );
      })}

      {error && (
        <p
          aria-live="polite"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

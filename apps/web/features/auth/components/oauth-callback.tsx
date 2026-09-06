"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

export function OAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const providerError = searchParams.get("error");

  useEffect(() => {
    if (!session) return;
    router.replace("/dashboard");
    router.refresh();
  }, [router, session]);

  if (providerError || (!isPending && !session)) {
    return (
      <div className="text-center">
        <AlertCircle className="mx-auto size-10 text-destructive" aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-semibold">Sign-in didn’t finish.</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No account changes were made. You can safely try again.
        </p>
        <Link
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
          href="/sign-in"
        >
          Return to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="grid min-h-[18rem] place-items-center text-center">
      <div>
        <LoaderCircle className="mx-auto size-7 animate-spin text-primary" aria-hidden="true" />
        <h1 className="mt-5 text-xl font-semibold">Finishing your secure sign-in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isPending ? "Checking your session…" : "Redirecting you now…"}
        </p>
      </div>
    </div>
  );
}

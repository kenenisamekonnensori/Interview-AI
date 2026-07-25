"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { PropsWithChildren } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * UI guard only. API routes remain authoritative and use Fastify's session and
 * verified-user hooks before they return protected data.
 */
export function SessionGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    if (!session.user.emailVerified) {
      router.replace("/verify-email");
    }
  }, [isPending, router, session]);

  if (isPending || !session || !session.user.emailVerified) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoaderCircle
          className="size-6 animate-spin text-primary"
          aria-label="Checking your session"
        />
      </div>
    );
  }

  return children;
}

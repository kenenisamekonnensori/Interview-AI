"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function signOut() {
    setIsPending(true);
    await authClient.signOut();
    router.replace("/sign-in?signedOut=1");
    router.refresh();
  }

  return (
    <Button disabled={isPending} onClick={signOut} size="sm" variant="ghost">
      <LogOut className="size-4" aria-hidden="true" />
      Sign out
    </Button>
  );
}

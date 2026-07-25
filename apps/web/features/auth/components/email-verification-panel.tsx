"use client";

import { CheckCircle2, LoaderCircle, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function EmailVerificationPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { data: session, isPending, refetch } = authClient.useSession();
  const email = session?.user.email ?? searchParams.get("email") ?? "your email address";

  useEffect(() => {
    if (session?.user.emailVerified) {
      router.replace("/dashboard");
      router.refresh();
    }
  }, [router, session?.user.emailVerified]);

  async function resendEmail() {
    if (email === "your email address") {
      setError("Sign in first so we know where to send your verification email.");
      return;
    }

    setError("");
    setNotice("");
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: `${window.location.origin}/verify-email`,
    });

    if (result.error) {
      setError(result.error.message ?? "We could not resend the email. Please try again.");
      return;
    }

    setNotice("A new verification link is on its way.");
  }

  if (isPending) {
    return (
      <div className="grid min-h-[18rem] place-items-center">
        <LoaderCircle
          className="size-6 animate-spin text-primary"
          aria-label="Checking your session"
        />
      </div>
    );
  }

  return (
    <div className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
        <Mail className="size-7" aria-hidden="true" />
      </span>
      <p className="mt-7 text-sm font-medium text-primary">One last step</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Check your inbox.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        We sent a verification link to <span className="font-medium text-foreground">{email}</span>.
        Open it to activate your account.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card/50 p-4 text-left text-sm leading-6 text-muted-foreground">
        <p className="font-medium text-foreground">Didn’t receive it?</p>
        <p className="mt-1">
          Check spam, then request another link. Verification links expire for your protection.
        </p>
      </div>

      {notice && (
        <p
          aria-live="polite"
          className="mt-4 flex items-center justify-center gap-2 text-sm text-primary"
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {notice}
        </p>
      )}
      {error && (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button className="mt-6 w-full" onClick={resendEmail} variant="outline">
        <RefreshCw className="size-4" aria-hidden="true" />
        Resend verification email
      </Button>
      <button
        className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => void refetch()}
        type="button"
      >
        I’ve verified my email
      </button>
      <p className="mt-7 text-sm text-muted-foreground">
        Already verified?{" "}
        <Link className="font-medium text-primary hover:underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </div>
  );
}

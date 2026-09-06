import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SocialAuth } from "@/features/auth/components/social-auth";

export const metadata: Metadata = { title: "Sign in | Interviewer AI" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ signedOut?: string }>;
}) {
  const { signedOut } = await searchParams;

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in to Interviewer AI"
      subtitle="Continue with Google or GitHub. Your account is created automatically — no passwords, no forms."
    >
      {signedOut === "1" && (
        <p
          aria-live="polite"
          className="mb-4 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          You’ve been signed out.
        </p>
      )}
      <SocialAuth />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Interviewer AI?{" "}
        <Link className="font-medium text-primary hover:underline" href="/sign-up">
          Create an account
        </Link>
      </p>
      <p className="mt-8 border-t border-border pt-5 text-center text-xs leading-5 text-muted-foreground">
        By continuing, you agree to our{" "}
        <Link className="underline-offset-2 hover:underline" href="/terms">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link className="underline-offset-2 hover:underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </AuthCard>
  );
}
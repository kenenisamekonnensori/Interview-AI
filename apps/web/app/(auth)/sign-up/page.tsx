import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SocialAuth } from "@/features/auth/components/social-auth";

export const metadata: Metadata = { title: "Create account | Interviewer AI" };

export default function SignUpPage() {
  return (
    <AuthCard
      eyebrow="Get started"
      title="Create your account"
      subtitle="Use your Google or GitHub account — it takes seconds and there’s no password to remember."
    >
      <SocialAuth />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-primary hover:underline" href="/sign-in">
          Sign in
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

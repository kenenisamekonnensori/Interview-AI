import type { Metadata } from "next";
import { Suspense } from "react";

import { EmailVerificationPanel } from "@/features/auth/components/email-verification-panel";

export const metadata: Metadata = { title: "Verify your email | Interviewer AI" };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-[18rem]" />}>
      <EmailVerificationPanel />
    </Suspense>
  );
}

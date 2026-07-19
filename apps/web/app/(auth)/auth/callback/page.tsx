import { OAuthCallback } from "@/features/auth/components/oauth-callback";
import { Suspense } from "react";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-[18rem]" />}>
      <OAuthCallback />
    </Suspense>
  );
}

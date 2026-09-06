import type { PropsWithChildren } from "react";

import { SessionGuard } from "@/features/auth/components/session-guard";
import { AppShell } from "@/components/app-shell";

// Session-gated routes render a spinner until the client hydrates, so there
// is no meaningful static content to prerender. Generating them dynamically
// also avoids a Next 16 prerender-worker bug that fires when the host shell
// exports NODE_ENV=development (the vendored react-ssr runtime returns null
// inside the worker pool). CI envs are clean and would pass either way; this
// makes local builds correct on any machine.
export const dynamic = "force-dynamic";

export default function ProtectedLayout({ children }: PropsWithChildren) {
  return (
    <SessionGuard>
      <AppShell>{children}</AppShell>
    </SessionGuard>
  );
}

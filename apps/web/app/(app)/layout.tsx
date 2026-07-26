import type { PropsWithChildren } from "react";

import { SessionGuard } from "@/features/auth/components/session-guard";
import { AppShell } from "@/components/app-shell";

export default function ProtectedLayout({ children }: PropsWithChildren) {
  return (
    <SessionGuard>
      <AppShell>{children}</AppShell>
    </SessionGuard>
  );
}

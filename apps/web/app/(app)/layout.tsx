import type { PropsWithChildren } from "react";

import { SessionGuard } from "@/features/auth/components/session-guard";

export default function ProtectedLayout({ children }: PropsWithChildren) {
  return <SessionGuard>{children}</SessionGuard>;
}

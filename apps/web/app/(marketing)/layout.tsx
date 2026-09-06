import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "../../features/landing/components/site-footer";
import { SiteNav } from "../../features/landing/components/site-nav";

export const metadata: Metadata = {
  title: {
    default: "Interviewer AI",
    template: "%s · Interviewer AI",
  },
};

export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main className="flex-1 pt-16">{children}</main>
      <SiteFooter />
    </div>
  );
}

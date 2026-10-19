import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";
import { InteractiveGridSpotlight } from "@/features/landing/components/grid-background";

export const metadata: Metadata = {
  title: "Interviewer AI — Realistic voice mock interviews",
  description:
    "Live voice interviews with an AI interviewer that adapts, follows up, and scores you — built from your resume and target role.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--ink-canvas)] text-[var(--ink-text)] antialiased bg-grid-squares selection:bg-bronze-500/20 selection:text-bronze-900">
        <Providers>
          <InteractiveGridSpotlight />
          {children}
        </Providers>
      </body>
    </html>
  );
}

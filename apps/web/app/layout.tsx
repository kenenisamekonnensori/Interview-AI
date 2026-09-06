import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Interviewer AI — Realistic voice mock interviews",
  description:
    "Live voice interviews with an AI interviewer that adapts, follows up, and scores you — built from your resume and target role.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

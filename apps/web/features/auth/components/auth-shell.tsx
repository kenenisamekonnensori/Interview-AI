import { Mic } from "lucide-react";
import type { PropsWithChildren } from "react";

/**
 * Centered, minimal auth layout: brand, one card, nothing else.
 * Kept intentionally light so the page renders instantly.
 */
export function AuthShell({ children }: PropsWithChildren) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-24rem] mx-auto h-[32rem] max-w-3xl rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative w-full max-w-[26rem]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-b from-[#dcbd7e] to-[#b78a44] shadow-[0_6px_20px_-6px_rgba(203,162,95,0.55)] ring-1 ring-white/25">
            <Mic className="size-4 text-[#221a0d]" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Interviewer AI</span>
        </div>
        {children}
      </div>
    </main>
  );
}

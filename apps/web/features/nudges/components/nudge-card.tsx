"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Shared presentational shell for dashboard nudge cards.
 *
 * UX contract (applies to every nudge):
 * - Non-modal: no overlay, no focus trap, no scroll lock — never blocks the
 *   dashboard.
 * - Dismissal is one click (`X`, "Maybe later") or one Escape away, and the
 *   dismissal is the orchestrator's concern; this card only reports it.
 * - Gentle fade-and-rise entrance, disabled under `prefers-reduced-motion`.
 * - One polite screen-reader announcement per mount via `role="status"`.
 * - No hydration flash: entrance animation starts in the hidden state, so
 *   server and first client render agree.
 */
export function NudgeCard({
  testId,
  title,
  description,
  ctaHref,
  ctaLabel,
  ctaIcon,
  icon,
  eyebrow,
  children,
  onDismiss,
  dismissLabel,
}: {
  /** Stable test hook shared by all nudge cards. */
  testId: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
  ctaIcon?: ReactNode;
  icon: ReactNode;
  /** Optional checklist / progress content between description and actions. */
  children?: ReactNode;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Escape dismisses — the least effortful way to make the card go away
  // without ever trapping focus the way a modal would.
  const onDismissRef = useCallbackRef(onDismiss);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismissRef();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismissRef]);

  return (
    <section
      role="status"
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      className={`transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none ${
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card/60 bg-[radial-gradient(circle_at_0%_0%,oklch(0.72_0.15_230_/_12%),transparent_22rem)] p-6">
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/[.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{eyebrow}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-.02em]" id={`${testId}-title`}>
              {title}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>

            {children}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href={ctaHref}
                className="button-primary inline-flex h-10 items-center gap-1.5 px-3 text-sm"
              >
                {ctaIcon}
                {ctaLabel}
              </Link>
              <button
                type="button"
                onClick={onDismiss}
                className="text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Keep the Escape listener stable across renders without forcing callers to
 * memoize their handler (dismissal writes depend on data that changes).
 */
function useCallbackRef<T extends (...args: never[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  // https://github.com/facebook/react/issues/19240
  return useMemo(() => ((...args: never[]) => callbackRef.current(...args)) as T, []);
}

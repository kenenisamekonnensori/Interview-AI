"use client";

import { Menu, Mic2, PanelLeftClose } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { cn } from "@/lib/utils";
import { isRouteActive, navigationSections, type NavigationItem } from "@/lib/navigation";
import { apiClient } from "@/lib/api-client";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () =>
      apiClient<{
        profile: {
          preferredName: string | null;
          targetRole: string | null;
          accessibilityPreferences: { reduceMotion: boolean };
        };
      }>("/api/v1/profile"),
  });
  const reduceMotion =
    useReducedMotion() || Boolean(profile.data?.profile.accessibilityPreferences.reduceMotion);
  const identity = profile.data?.profile.preferredName ?? "Your profile";
  const initials =
    identity
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "YO";
  // Navigation always dismisses the mobile drawer, so the new page is not left
  // covered by the overlay.
  useEffect(() => setOpen(false), [pathname]);

  // Keyboard users must be able to close the drawer without reaching for a
  // pointer; Escape is the expected affordance.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div
      className={cn("min-h-screen bg-background")}
      data-reduce-motion={
        profile.data?.profile.accessibilityPreferences.reduceMotion ? "true" : undefined
      }
    >
      <button
        className={cn("fixed inset-0 z-30 bg-black/60 lg:hidden", open ? "block" : "hidden")}
        onClick={() => setOpen(false)}
        aria-label="Close navigation"
      />
      <motion.aside
        initial={reduceMotion ? false : { opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={cn("app-sidebar", open && "translate-x-0", compact && "lg:w-[88px]")}
      >
        <div className="flex h-20 items-center justify-between px-4">
          <Brand href="/dashboard" className={cn(compact && "lg:hidden")} />
          <span
            className={cn(
              "hidden lg:grid size-9 place-items-center rounded-xl bg-foreground text-background",
              !compact && "hidden",
            )}
          >
            <Mic2 className="size-4" />
          </span>
          <button
            className="icon-button hidden lg:inline-flex"
            onClick={() => setCompact(!compact)}
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose
              className={cn("size-4 transition-transform", compact && "rotate-180")}
            />
          </button>
        </div>
        <nav
          aria-label="Dashboard"
          className="flex flex-1 flex-col gap-7 overflow-y-auto px-3 py-2"
        >
          {navigationSections.map((section) => (
            <NavSection
              key={section.label}
              section={section}
              pathname={pathname}
              compact={compact}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>
        <div className="border-t border-white/[.06] p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl px-2 py-2",
              compact && "lg:justify-center",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-cyan-500 text-[11px] font-bold text-slate-950">
              {initials}
            </span>
            <span className={cn("min-w-0 flex-1", compact && "lg:hidden")}>
              <span className="block truncate text-xs font-medium">{identity}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {profile.data?.profile.targetRole ?? "Interview practice"}
              </span>
            </span>
            <span className={cn(compact && "lg:hidden")}>
              <SignOutButton />
            </span>
          </div>
        </div>
      </motion.aside>
      <div
        className={cn(
          "min-h-screen transition-[padding] duration-300 lg:pl-[264px]",
          compact && "lg:pl-[88px]",
        )}
      >
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-white/[.055] bg-background/75 px-5 backdrop-blur-xl sm:px-8">
          <button
            className="icon-button lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden text-sm text-muted-foreground sm:block">
            Your interview practice space
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/interviews/new" className="button-primary h-10 px-3.5 text-xs">
              <Mic2 className="size-3.5" /> New interview
            </Link>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

function NavSection({
  section,
  pathname,
  compact,
  onNavigate,
}: {
  section: { label: string; items: NavigationItem[] };
  pathname: string;
  compact: boolean;
  onNavigate: () => void;
}) {
  return (
    <div>
      <p
        className={cn(
          "px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground/70",
          compact && "lg:hidden",
        )}
      >
        {section.label}
      </p>
      <div className="space-y-1">
        {section.items.map((item) => {
          const active = isRouteActive(pathname, item.href);
          const Glyph = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "sidebar-link",
                active && "sidebar-link-active",
                compact && "lg:justify-center lg:px-0",
              )}
              title={compact ? item.label : undefined}
            >
              <Glyph className="size-[18px] shrink-0" aria-hidden="true" />
              <span className={cn(compact && "lg:hidden")}>{item.label}</span>
              {item.href === "/interviews/new" && !compact ? (
                <span className="ml-auto size-1.5 rounded-full bg-violet-300" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

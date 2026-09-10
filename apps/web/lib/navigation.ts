import {
  BriefcaseBusiness,
  CreditCard,
  Gauge,
  History,
  LayoutGrid,
  ListChecks,
  Mic2,
  Settings,
  Target,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match only the exact path (defaults to prefix matching). */
  exact?: boolean;
};

export type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

/**
 * Dashboard sidebar information architecture. Routes reuse the existing
 * application pages; Performance, Skills & Weaknesses, Readiness, and Practice
 * Plan are backed by their server-authoritative analytics endpoints, while
 * Subscription remains a placeholder until billing ships.
 */
export const navigationSections: NavigationSection[] = [
  {
    label: "Main",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutGrid, exact: true },
      { label: "Practice", href: "/interviews/new", icon: Mic2, exact: true },
      { label: "Interview Library", href: "/history", icon: History },
      { label: "Resume & Jobs", href: "/resumes", icon: BriefcaseBusiness },
      { label: "Performance", href: "/performance", icon: TrendingUp },
      { label: "Skills & Weaknesses", href: "/skills", icon: Target },
      { label: "Readiness", href: "/readiness", icon: Gauge },
      { label: "Practice Plan", href: "/practice-plan", icon: ListChecks },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Subscription", href: "/subscription", icon: CreditCard },
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Profile", href: "/profile", icon: UserRound },
    ],
  },
];

export function isRouteActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/dashboard" || href === "/interviews/new") return false;
  return pathname.startsWith(`${href}/`);
}

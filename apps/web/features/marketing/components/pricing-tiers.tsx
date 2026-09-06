"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

type BillingPeriod = "monthly" | "annual";

type Tier = {
  name: string;
  icp: string;
  tagline: string;
  monthly: number | null;
  annual: number | null;
  features: string[];
  ctaLabel: string;
  href: string;
  featured?: boolean;
};

/* Tier names are stage-named ("Free / Pro / Teams") with the ICP spelled out in
   the tagline — the pattern that collapses choice for the visitor. */
const tiers: Tier[] = [
  {
    name: "Free",
    icp: "For trying the real thing before committing.",
    tagline: "One voice interview a month, full report included.",
    monthly: 0,
    annual: 0,
    features: [
      "1 voice practice interview per month",
      "Resume & job-description analysis",
      "Full feedback report",
      "Behavioral and HR interview types",
    ],
    ctaLabel: "Start for free",
    href: "/sign-up",
  },
  {
    name: "Pro",
    icp: "For candidates who want to be ready for anything.",
    tagline: "Unlimited practice with full progress tracking.",
    monthly: 19,
    annual: 15,
    features: [
      "Unlimited practice interviews",
      "All interview types, including technical & system design",
      "Detailed progress tracking across sessions",
      "Communication metrics & trends",
      "Priority support",
    ],
    ctaLabel: "Get started",
    href: "/sign-up",
    featured: true,
  },
  {
    name: "Teams",
    icp: "For bootcamps, universities, and career services.",
    tagline: "Bulk accounts with shared analytics and dashboards.",
    monthly: null,
    annual: null,
    features: [
      "Everything in Pro",
      "Bulk account management",
      "Team dashboards & shared analytics",
      "Custom interview configurations",
      "Dedicated success support",
    ],
    ctaLabel: "Contact us",
    href: "/contact",
  },
];

export function PricingTiers() {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");

  return (
    <div>
      {/* Billing toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-full border border-[var(--hairline)] bg-[var(--ink-raised)] p-1">
          {(["monthly", "annual"] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setBilling(period)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                billing === period
                  ? "bg-white/[.08] text-[var(--ink-text)]"
                  : "text-[var(--ink-text-muted)] hover:text-[var(--ink-text)]"
              }`}
            >
              {period}
              {period === "annual" ? (
                <span className="ml-1.5 rounded-full bg-bronze-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-bronze-300">
                  Save 20%
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Tier cards */}
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {tiers.map((tier) => {
          const price = billing === "monthly" ? tier.monthly : tier.annual;
          const isCustom = tier.monthly === null;

          return (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-3xl border p-7 ${
                tier.featured
                  ? "border-[rgba(203,162,95,0.4)] bg-bronze-500/[.06] shadow-[0_0_40px_rgba(203,162,95,0.12)]"
                  : "border-[var(--hairline)] bg-[var(--ink-raised)]/60"
              }`}
            >
              {tier.featured ? (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-bronze-400 to-bronze-600 px-3 py-1 text-[11px] font-semibold text-[#221a0d] shadow-lg shadow-bronze-500/30">
                  Most popular
                </span>
              ) : null}

              <h2 className="text-lg font-semibold text-[var(--ink-text)]">{tier.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                {tier.icp}
              </p>

              <div className="mt-5 flex items-baseline gap-1.5">
                {isCustom ? (
                  <span className="text-4xl font-semibold tracking-[-0.03em] text-[var(--ink-text)]">
                    Custom
                  </span>
                ) : (
                  <>
                    <span className="text-4xl font-semibold tracking-[-0.03em] text-[var(--ink-text)]">
                      ${price}
                    </span>
                    <span className="text-sm text-[var(--ink-text-muted)]">/month</span>
                  </>
                )}
              </div>
              <p className="mt-1 h-4 text-xs text-[var(--ink-text-faint)]">{tier.tagline}</p>

              <ul className="mt-6 space-y-3">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-[var(--ink-text-secondary)]"
                  >
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-bronze-300"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={tier.href}
                className={`mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm ${
                  tier.featured ? "btn-primary" : "btn-ghost"
                }`}
              >
                {tier.ctaLabel}
                {tier.featured ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

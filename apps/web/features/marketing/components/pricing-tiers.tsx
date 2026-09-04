"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";

type BillingPeriod = "monthly" | "annual";

type Tier = {
  name: string;
  tagline: string;
  monthly: number | null;
  annual: number | null;
  features: string[];
  ctaLabel: string;
  href: string;
  featured?: boolean;
};

const tiers: Tier[] = [
  {
    name: "Free",
    tagline: "Try the real thing before you commit.",
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
    tagline: "For candidates who want to be ready for anything.",
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
    tagline: "For bootcamps, universities, and career services.",
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
        <div className="relative inline-flex items-center rounded-full border border-white/[.08] bg-white/[.04] p-1">
          {(["monthly", "annual"] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setBilling(period)}
              className={`relative rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                billing === period
                  ? "bg-white/[.09] text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {period}
              {period === "annual" ? (
                <span className="ml-1.5 rounded-full bg-[#6366f1]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#c0c1ff]">
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
                  ? "border-[#6366f1]/40 bg-[#6366f1]/[.06] shadow-[0_0_40px_rgba(99,102,241,0.15)]"
                  : "border-white/[.07] bg-white/[.03]"
              }`}
            >
              {tier.featured ? (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-3 py-1 text-[11px] font-semibold text-white shadow-lg shadow-[#6366f1]/30">
                  <Sparkles className="size-3" aria-hidden="true" />
                  Most popular
                </span>
              ) : null}

              <h2 className="text-lg font-semibold text-white">{tier.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/50">{tier.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                {isCustom ? (
                  <span className="text-4xl font-extrabold tracking-[-0.03em] text-white">
                    Custom
                  </span>
                ) : (
                  <>
                    <span className="text-4xl font-extrabold tracking-[-0.03em] text-white">
                      ${price}
                    </span>
                    <span className="text-sm text-white/45">/month</span>
                  </>
                )}
              </div>
              <p className="mt-1 h-4 text-xs text-white/35">
                {!isCustom && billing === "annual" && tier.monthly !== 0
                  ? `Billed annually — $${(tier.annual ?? 0) * 12}/year`
                  : isCustom
                    ? "Let's talk about your team's needs."
                    : tier.monthly === 0
                      ? "Free forever. No credit card required."
                      : ""}
              </p>

              <ul className="mt-6 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-white/65">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#6366f1]" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={tier.href}
                className={`mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all ${
                  tier.featured ? "btn-premium text-white" : "btn-ghost-glass text-white"
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

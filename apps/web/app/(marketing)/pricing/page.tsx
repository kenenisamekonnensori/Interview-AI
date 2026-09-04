import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { FaqList } from "../../../features/marketing/components/faq-list";
import { PageHeading } from "../../../features/marketing/components/page-heading";
import { PricingTiers } from "../../../features/marketing/components/pricing-tiers";

export const metadata: Metadata = { title: "Pricing" };

type Cell = { kind: "text"; value: string } | { kind: "check" } | { kind: "none" };

const comparisonRows: { feature: string; free: Cell; pro: Cell; teams: Cell }[] = [
  {
    feature: "Voice practice interviews",
    free: { kind: "text", value: "1 / month" },
    pro: { kind: "text", value: "Unlimited" },
    teams: { kind: "text", value: "Unlimited" },
  },
  {
    feature: "Interview types",
    free: { kind: "text", value: "Behavioral & HR" },
    pro: { kind: "text", value: "All types" },
    teams: { kind: "text", value: "All + custom" },
  },
  {
    feature: "Resume analysis",
    free: { kind: "check" },
    pro: { kind: "check" },
    teams: { kind: "check" },
  },
  {
    feature: "Job-description analysis",
    free: { kind: "check" },
    pro: { kind: "check" },
    teams: { kind: "check" },
  },
  {
    feature: "Full feedback reports",
    free: { kind: "check" },
    pro: { kind: "check" },
    teams: { kind: "check" },
  },
  {
    feature: "Personalized follow-up questions",
    free: { kind: "check" },
    pro: { kind: "check" },
    teams: { kind: "check" },
  },
  {
    feature: "Progress tracking & trends",
    free: { kind: "none" },
    pro: { kind: "check" },
    teams: { kind: "check" },
  },
  {
    feature: "Communication metrics",
    free: { kind: "none" },
    pro: { kind: "check" },
    teams: { kind: "check" },
  },
  {
    feature: "Team dashboards & admin",
    free: { kind: "none" },
    pro: { kind: "none" },
    teams: { kind: "check" },
  },
];

function ComparisonCell({ cell }: { cell: Cell }) {
  if (cell.kind === "text") {
    return <span className="text-sm text-white/70">{cell.value}</span>;
  }
  if (cell.kind === "check") {
    return (
      <span className="inline-grid size-6 place-items-center rounded-full bg-[#6366f1]/15">
        <Check className="size-3.5 text-[#c0c1ff]" aria-hidden="true" />
      </span>
    );
  }
  return <Minus className="mx-auto size-4 text-white/20" aria-hidden="true" />;
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <PageHeading
          eyebrow="Pricing"
          title="Simple pricing that grows with you"
          description="Start free and upgrade when you're ready. Every paid plan starts with a free trial — no credit card required to begin."
        />
      </div>

      <div className="mt-10">
        <PricingTiers />
      </div>

      {/* Comparison */}
      <section className="mt-20">
        <h2 className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
          Compare plans
        </h2>
        <div className="glass-surface mt-6 overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[.07]">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-white/40">
                  Feature
                </th>
                {["Free", "Pro", "Teams"].map((name) => (
                  <th
                    key={name}
                    className="px-6 py-4 text-center text-sm font-semibold text-white"
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-white/[.04] last:border-0"
                >
                  <td className="px-6 py-3.5 text-sm text-white/65">{row.feature}</td>
                  <td className="px-6 py-3.5 text-center">
                    <ComparisonCell cell={row.free} />
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <ComparisonCell cell={row.pro} />
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <ComparisonCell cell={row.teams} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing FAQ */}
      <section className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-center text-2xl font-bold tracking-[-0.02em] text-white">
          Pricing questions
        </h2>
        <div className="mt-8">
          <FaqList
            groups={[
              {
                title: "Billing & plans",
                items: [
                  {
                    q: "Do I need a credit card to start?",
                    a: "No. The Free plan is free forever with no credit card, and you can start Pro with a free trial before you're charged.",
                  },
                  {
                    q: "Can I cancel or switch plans anytime?",
                    a: "Yes. You can upgrade, downgrade, or cancel from your account settings at any time. Changes take effect at the start of the next billing cycle.",
                  },
                  {
                    q: "Do you offer refunds?",
                    a: "If you cancel within 14 days of your first Pro payment, we'll refund it in full — no questions asked. Just email support.",
                  },
                  {
                    q: "Do you offer discounts for students?",
                    a: "We offer a discount for verified students and bootcamp participants. Email support from your school address and we'll set you up.",
                  },
                  {
                    q: "What happens to my interviews if I downgrade to Free?",
                    a: "Your history and reports stay accessible. On Free you're limited to one new practice interview per month, but nothing you've already completed is removed.",
                  },
                ],
              },
            ]}
          />
        </div>
      </section>

      <div className="mt-16">
        <CtaCard
          title="Try Pro free for 14 days"
          body="Unlimited practice interviews, every interview type, and full progress tracking. Cancel anytime."
          ctaLabel="Start your free trial"
        />
      </div>
    </div>
  );
}
import type { Metadata } from "next";
import { CheckCircle2, History } from "lucide-react";
import { PageHeading } from "../../../features/marketing/components/page-heading";

export const metadata: Metadata = { title: "System status" };

const components = [
  { name: "API & authentication", description: "Account sign-in, sessions, and API endpoints" },
  { name: "Voice processing", description: "Speech recognition, synthesis, and live streaming" },
  { name: "AI interview generation", description: "Planning, follow-up questions, and evaluation" },
  { name: "Report generation", description: "Feedback reports and interview history" },
  { name: "Email delivery", description: "Verification and notification emails" },
  { name: "Data storage", description: "Resumes, transcripts, and uploaded files" },
];

export default function StatusPage() {
  const lastChecked = new Date().toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <PageHeading
        eyebrow="Trust"
        title="System status"
        description="Live status of the Interviewer AI platform. If something looks wrong, check here first — we post incidents and updates as they happen."
      />

      {/* Overall banner */}
      <div className="mt-10 flex flex-col items-start gap-4 rounded-3xl border border-emerald-400/20 bg-emerald-400/[.06] px-7 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">All systems operational</p>
            <p className="text-xs text-white/45">Last checked {lastChecked}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          No incidents
        </span>
      </div>

      {/* Component list */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
          Services
        </h2>
        <div className="glass-panel mt-4 divide-y divide-white/[.05] overflow-hidden rounded-2xl">
          {components.map((component) => (
            <div key={component.name} className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <p className="text-sm font-medium text-white">{component.name}</p>
                <p className="text-xs text-white/45">{component.description}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Operational
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Incident history */}
      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
          <History className="size-3.5" aria-hidden="true" />
          Incident history
        </h2>
        <div className="glass-panel mt-4 rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-white/60">No incidents reported in the last 90 days.</p>
          <p className="mt-1 text-xs text-white/35">
            When something does happen, we log the timeline here — transparently and in plain
            language.
          </p>
        </div>
      </section>
    </div>
  );
}

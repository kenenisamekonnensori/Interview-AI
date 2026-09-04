import type { Metadata } from "next";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { PageHeading } from "../../../features/marketing/components/page-heading";

export const metadata: Metadata = { title: "Documentation" };

const navItems = [
  { id: "getting-started", label: "Getting started" },
  { id: "resume-and-job", label: "Resumes & job descriptions" },
  { id: "voice-interviews", label: "Voice interviews" },
  { id: "reading-your-report", label: "Reading your report" },
  { id: "history-account", label: "History & your account" },
  { id: "plans-billing", label: "Plans & billing" },
];

function DocSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/[.06] pt-10 first:border-0 first:pt-0">
      <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-[-0.02em] text-white">
        <span className="text-sm font-mono text-[#6366f1]">{number}</span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-[1.8] text-white/60">{children}</div>
    </section>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => (
        <li key={item} className="flex items-start gap-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#6366f1]/12 text-xs font-semibold text-[#c0c1ff]">
            {index + 1}
          </span>
          <span className="text-[15px] leading-[1.8] text-white/60">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#6366f1]/20 bg-[#6366f1]/8 px-5 py-4 text-sm leading-relaxed text-white/70">
      {children}
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="max-w-3xl">
        <PageHeading
          eyebrow="Documentation"
          title="Documentation"
          description="Everything you need to get the most out of Interviewer AI — from your first practice session to reading your reports like a pro."
        />
      </div>

      {/* Mobile nav */}
      <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-2 lg:hidden">
        {navItems.map((item, index) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="rounded-full border border-white/[.08] bg-white/[.03] px-3 py-1 text-xs text-white/50 transition-colors hover:border-[#6366f1]/30 hover:text-white"
          >
            {index + 1}. {item.label}
          </a>
        ))}
      </nav>

      <div className="mt-10 grid gap-12 lg:grid-cols-[16rem_1fr]">
        {/* Sidebar nav (desktop) */}
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-8 space-y-1 border-l border-white/[.07] pl-4">
            {navItems.map((item, index) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block py-1 text-[13px] leading-snug text-white/45 transition-colors hover:text-white"
              >
                <span className="text-white/25">{index + 1}.</span> {item.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0 space-y-10">
          <DocSection id="getting-started" number="01" title="Getting started">
            <p>
              Interviewer AI is built around one loop: bring your context, have the conversation,
              leave with a plan. Here's how to go from a new account to your first practice
              interview in a few minutes.
            </p>
            <Steps
              items={[
                "Create a free account with your email or Google. Verify your email address when prompted.",
                "Upload your resume. We analyze it to understand your experience, skills, and the roles you've held.",
                "Add a job description — paste one from a real posting, or pick a role template if you don't have one yet.",
                "Choose an interview type (behavioral, technical, HR, or mixed) and start the interview.",
                "Answer out loud. The interviewer listens and adapts in real time.",
              ]}
            />
            <p>
              When the session ends, your report is generated automatically and saved to your
              history. That's the whole loop — practice, review, repeat.
            </p>
            <Note>
              You can practice with typed answers if you don't have a microphone or prefer not to
              speak. Voice is recommended, but every interview type works either way.
            </Note>
          </DocSection>

          <DocSection id="resume-and-job" number="02" title="Resumes & job descriptions">
            <p>
              The quality of your practice depends on the context you give it. The better your
              resume and the more specific your target job description, the more realistic the
              interview.
            </p>
            <h3 className="pt-2 text-base font-semibold text-white">Uploading your resume</h3>
            <Steps
              items={[
                "Supported formats: PDF, DOCX, and plain text.",
                "Keep the most recent version — the analysis focuses on what an interviewer would actually ask about.",
                "Check that your name, current role, and key skills are present and up to date.",
              ]}
            />
            <h3 className="pt-2 text-base font-semibold text-white">Adding a job description</h3>
            <p>
              Paste the full job description from the posting you're preparing for. We extract the
              required skills, responsibilities, and seniority level, then shape questions to match.
              If you don't have a specific posting, use a role template and we'll generate a
              representative description.
            </p>
          </DocSection>

          <DocSection id="voice-interviews" number="03" title="Voice interviews">
            <p>
              Voice practice is the core of Interviewer AI: you speak, and the interviewer hears
              you, thinks, and responds — the way a real conversation works.
            </p>
            <h3 className="pt-2 text-base font-semibold text-white">Before you start</h3>
            <Steps
              items={[
                "Use Chrome, Edge, or Safari on desktop, or the current mobile version of Chrome or Safari.",
                "Allow microphone access when your browser asks. Interviews won't start without it.",
                "Find a quiet space. Background noise makes it harder for the interviewer to catch you — just like a real call.",
                "Test your microphone in the session setup screen before you begin.",
              ]}
            />
            <h3 className="pt-2 text-base font-semibold text-white">During the interview</h3>
            <p>
              You don't need to do anything — just talk. The interviewer will ask a question, listen
              to your answer, and follow up based on what you said. If you need a moment, it's fine
              to pause; the interviewer will wait before prompting you. You can also switch to typed
              answers at any point.
            </p>
            <Note>
              Can't hear the interviewer or audio keeps cutting out? Check your volume, make sure no
              other app is holding the microphone, and re-test in the setup screen. If it persists,
              typed practice keeps the session fully usable.
            </Note>
          </DocSection>

          <DocSection id="reading-your-report" number="04" title="Reading your report">
            <p>
              After each interview you get a structured report. It scores you across the things
              real interviewers evaluate, then tells you what to do about it.
            </p>
            <Steps
              items={[
                "Overall score: a single number that summarizes the session — useful for tracking progress over time.",
                "Content scores: how complete, relevant, and technically grounded your answers were.",
                "Communication scores: clarity, structure, conciseness, and confidence as heard in your delivery.",
                "Strengths & weaknesses: specific patterns from your session, with examples of what you said.",
                "Next steps: prioritized, concrete improvements to work on in your next practice.",
              ]}
            />
            <p>
              Scores are generated from your actual answers — they're an honest read of that
              session, not a grade on you as a candidate. Use the trend across sessions, not any
              single number, to judge your progress.
            </p>
          </DocSection>

          <DocSection id="history-account" number="05" title="History & your account">
            <p>
              Every completed interview is saved to your history with its report attached. From
              there you can revisit any session, review your feedback, and see how your scores have
              changed over time.
            </p>
            <p>
              Your account settings let you update your profile, manage your plan, and control your
              data. You can delete your account at any time — doing so removes your profile and
              practice history. Deleting your account is permanent and can't be undone.
            </p>
          </DocSection>

          <DocSection id="plans-billing" number="06" title="Plans & billing">
            <p>
              The Free plan includes one practice interview per month with resume analysis and full
              reports — enough to try the real thing. Pro removes the limits: unlimited interviews,
              every interview type, progress tracking, and priority support. Teams plans are for
              bootcamps, universities, and career services that want dashboards and bulk accounts.
            </p>
            <p>
              You can upgrade, downgrade, or cancel from your account settings at any time. See the{" "}
              <a href="/pricing" className="text-[#c0c1ff] underline decoration-[#6366f1]/40 underline-offset-2 hover:text-white">
                pricing page
              </a>{" "}
              for full plan details, and the{" "}
              <a href="/faq" className="text-[#c0c1ff] underline decoration-[#6366f1]/40 underline-offset-2 hover:text-white">
                FAQ
              </a>{" "}
              for billing questions.
            </p>
          </DocSection>
        </div>
      </div>

      <div className="mt-16">
        <CtaCard
          title="Done reading — ready to practice?"
          body="The fastest way to understand Interviewer AI is to have a conversation with it."
          ctaLabel="Start a practice interview"
        />
      </div>
    </div>
  );
}
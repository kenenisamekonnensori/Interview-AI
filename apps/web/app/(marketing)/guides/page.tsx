import type { Metadata } from "next";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { PageHeading } from "../../../features/marketing/components/page-heading";
import { RichText, type RichBlock } from "../../../features/marketing/components/rich-text";

export const metadata: Metadata = { title: "Interview guides" };

type Guide = {
  id: string;
  number: string;
  title: string;
  tagline: string;
  blocks: RichBlock[];
};

const guides: Guide[] = [
  {
    id: "behavioral",
    number: "01",
    title: "Behavioral interviews",
    tagline: "Prove how you work with stories — told under pressure.",
    blocks: [
      {
        type: "p",
        text: "Behavioral questions (“tell me about a time you…”) exist because past behavior is the best predictor of future behavior. Interviewers aren't looking for the perfect story — they're looking for evidence of how you make decisions, handle conflict, and recover from failure.",
      },
      { type: "h2", text: "What interviewers are really testing" },
      {
        type: "ul",
        items: [
          "Judgment: can you explain why you made the choices you made?",
          "Self-awareness: do you know how your actions landed, including the misses?",
          "Ownership: do you claim your part of the outcome instead of deflecting?",
        ],
      },
      { type: "h2", text: "How to prepare" },
      {
        type: "ol",
        items: [
          "Build a story bank of 5–7 experiences, each proving a different strength: leadership through ambiguity, conflict, failure and recovery, influence without authority, and delivering under deadline.",
          "Shape each story with the STAR structure — but spend most of your time on the Action, where your decisions live.",
          "Rehearse out loud until each story fits in two minutes. Stories that only exist on paper collapse under follow-up questions.",
        ],
      },
      {
        type: "tip",
        text: "Practice with an interviewer that asks follow-ups. A behavioral story is only as good as its ability to survive “why did you do it that way?” — the question that ends most rehearsed answers.",
      },
      { type: "h2", text: "Prompts to try" },
      {
        type: "ul",
        items: [
          "“Tell me about a time you disagreed with your manager about the right approach.”",
          "“Describe a project that didn't go as planned and what you did about it.”",
          "“Give me an example of when you influenced someone without having authority over them.”",
        ],
      },
    ],
  },
  {
    id: "technical",
    number: "02",
    title: "Technical interviews",
    tagline: "Reasoning out loud is the skill — the code is just the output.",
    blocks: [
      {
        type: "p",
        text: "Technical interviews test two things at once: whether you can solve the problem, and whether you can think in a way other engineers can follow. Most candidates fail the second one, not the first — they solve silently and present the finished answer.",
      },
      { type: "h2", text: "What interviewers are really testing" },
      {
        type: "ul",
        items: [
          "Problem decomposition: do you break the problem down before writing anything?",
          "Communication: can another engineer follow your reasoning in real time?",
          "Collaboration: do you engage with hints, or treat them as defeat?",
          "Robustness: do you naturally consider edge cases and trade-offs?",
        ],
      },
      { type: "h2", text: "A repeatable approach" },
      {
        type: "ol",
        items: [
          "Restate the problem and the constraints out loud. Confirming scope buys clarity and shows you don't assume.",
          "Ask one or two clarifying questions about inputs, size, and edge cases before designing.",
          "Propose an approach and its complexity before you code — even a brute force. Interviewers want to see you choose, not just implement.",
          "Code while narrating intent: “here I'm trading memory for speed.”",
          "Test your solution with an example and an edge case, out loud, before saying you're done.",
        ],
      },
      {
        type: "quote",
        text: "The interviewer isn't deciding whether you can eventually solve it. They're deciding whether you're someone they'd want solving it with them.",
      },
      {
        type: "tip",
        text: "Practice full problems aloud against a timer, including the clarifying-questions phase. Voice practice that scores your communication will show you the moments your reasoning got hard to follow.",
      },
    ],
  },
  {
    id: "system-design",
    number: "03",
    title: "System design",
    tagline: "Scope, trade-offs, decisions — the interview is a conversation about judgment.",
    blocks: [
      {
        type: "p",
        text: "System design interviews are less about the final architecture and more about how you handle an open-ended problem: what you ask, what you prioritize, and whether you can justify the trade-offs you make. There is no single right answer — there are well-reasoned ones.",
      },
      { type: "h2", text: "What interviewers are really testing" },
      {
        type: "ul",
        items: [
          "Scope control: do you clarify requirements instead of boiling the ocean?",
          "Prioritization: can you identify what actually matters at the stated scale?",
          "Depth: do you go deep where it counts instead of name-dropping everywhere?",
          "Trade-off fluency: can you defend why you chose one option over another?",
        ],
      },
      { type: "h2", text: "A structure that works" },
      {
        type: "ol",
        items: [
          "Requirements: functional and non-functional, stated back to the interviewer.",
          "Estimation: rough scale — users, requests, data size — to anchor later decisions.",
          "High-level design: the core components and the data flow between them, drawn simply first.",
          "Deep dive: pick one or two areas the interviewer cares about and go genuinely deep.",
          "Trade-offs: name what you optimized and what you gave up — and when you'd reconsider.",
        ],
      },
      {
        type: "tip",
        text: "The best way to improve is reps with feedback. Practice designing systems aloud and get scored on how clearly you scope, structure, and justify — the components most candidates never practice at all.",
      },
    ],
  },
  {
    id: "hr-culture",
    number: "04",
    title: "HR & culture-fit",
    tagline: "The interview where honesty — calibrated and specific — wins.",
    blocks: [
      {
        type: "p",
        text: "Culture-fit interviews get a bad reputation as “soft,” but they're where hiring decisions actually get made. Two qualified candidates reach the final round; the one who seems like they'd be good to work with gets the offer. Preparation here is about signal, not scripts.",
      },
      { type: "h2", text: "What interviewers are really testing" },
      {
        type: "ul",
        items: [
          "Self-knowledge: what do you actually want, and can you say it plainly?",
          "Values alignment: how you work, how you handle feedback, what frustrates you.",
          "Motivation: why this company, this team, this role — and does it hold up?",
          "Honesty: calibrated answers read as trustworthy; rehearsed ones read as evasive.",
        ],
      },
      { type: "h2", text: "How to prepare" },
      {
        type: "ol",
        items: [
          "Research the company beyond the homepage: recent product news, the team's public writing, how they describe their work.",
          "Write down three genuine reasons this role fits you — not generic reasons, yours.",
          "Prepare honest answers for the uncomfortable questions: why you're leaving, what you're not good at, a time you struggled.",
          "Prepare two or three real questions to ask them. Questions are signals too.",
        ],
      },
      { type: "h2", text: "Prompts to try" },
      {
        type: "ul",
        items: [
          "“Why are you interested in this role, and why now?”",
          "“Tell me about a time you received hard feedback — how did you handle it?”",
          "“What kind of work brings out your best, and what drains you?”",
          "“Where do you want to be in two years, and how does this role fit that?”",
        ],
      },
    ],
  },
];

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <PageHeading
          eyebrow="Guides"
          title="Interview guides by type"
          description="Practice with purpose. Each guide breaks down what interviewers are really testing and how to train for it — then hands you prompts to practice."
        />
      </div>

      {/* Jump nav */}
      <nav aria-label="Guides" className="mt-10 flex flex-wrap gap-2">
        {guides.map((guide) => (
          <a
            key={guide.id}
            href={`#${guide.id}`}
            className="rounded-full border border-[var(--hairline)] bg-[var(--ink-raised)]/60 px-4 py-1.5 text-sm text-[var(--ink-text-secondary)] transition-all hover:border-[rgba(203,162,95,0.35)] hover:text-[var(--ink-text)]"
          >
            <span className="text-bronze-300">{guide.number}</span> {guide.title}
          </a>
        ))}
      </nav>

      {/* Guide sections */}
      <div className="mt-12 space-y-16">
        {guides.map((guide) => (
          <section
            key={guide.id}
            id={guide.id}
            className="glass-panel scroll-mt-24 rounded-3xl p-8 sm:p-10"
          >
            <div className="flex items-start gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bronze-500/15 font-mono text-sm font-semibold text-bronze-300">
                {guide.number}
              </span>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--ink-text)]">{guide.title}</h2>
                <p className="mt-1 text-sm text-[var(--ink-text-muted)]">{guide.tagline}</p>
              </div>
            </div>
            <div className="mt-7">
              <RichText blocks={guide.blocks} />
            </div>
          </section>
        ))}
      </div>

      <div className="mt-16">
        <CtaCard
          title="Turn a guide into a practice session"
          body="Pick your interview type, bring your resume and target role, and get asked the questions that matter."
          ctaLabel="Start practicing free"
        />
      </div>
    </div>
  );
}

import { PageHeading } from "./page-heading";

export type LegalSection = {
  id: string;
  heading: string;
  paragraphs: string[];
};

type LegalDocProps = {
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
};

export function LegalDoc({ title, description, updated, sections }: LegalDocProps) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <PageHeading eyebrow="Legal" title={title} description={description} />
      <p className="mt-6 text-xs text-white/40">Last updated: {updated}</p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[16rem_1fr]">
        {/* Table of contents (desktop) */}
        <nav aria-label="Table of contents" className="hidden lg:block">
          <div className="sticky top-8 space-y-1 border-l border-white/[.07] pl-4">
            {sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block py-1 text-[13px] leading-snug text-white/45 transition-colors hover:text-white"
              >
                <span className="text-white/25">{index + 1}.</span> {section.heading}
              </a>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0">
          {/* Compact TOC (mobile) */}
          <div className="mb-8 flex flex-wrap gap-2 lg:hidden">
            {sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-white/[.08] bg-white/[.03] px-3 py-1 text-xs text-white/50 transition-colors hover:border-[#6366f1]/30 hover:text-white"
              >
                {index + 1}. {section.heading}
              </a>
            ))}
          </div>

          <div className="space-y-10">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="flex items-baseline gap-3 text-lg font-semibold tracking-[-0.01em] text-white">
                  <span className="text-sm font-mono text-[#6366f1]">{index + 1}</span>
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="text-[15px] leading-[1.8] text-white/60">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
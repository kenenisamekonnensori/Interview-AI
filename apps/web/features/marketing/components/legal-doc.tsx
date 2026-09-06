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
      <p className="mt-6 text-xs text-[var(--ink-text-faint)]">Last updated: {updated}</p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[16rem_1fr]">
        {/* Table of contents (desktop) */}
        <nav aria-label="Table of contents" className="hidden lg:block">
          <div className="sticky top-8 space-y-1 border-l border-[var(--hairline)] pl-4">
            {sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block py-1 text-[13px] leading-snug text-[var(--ink-text-muted)] transition-colors hover:text-[var(--ink-text)]"
              >
                <span className="text-[var(--ink-text-faint)]">{index + 1}.</span> {section.heading}
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
                className="rounded-full border border-[var(--hairline)] bg-[var(--ink-raised)]/60 px-3 py-1 text-xs text-[var(--ink-text-muted)] transition-colors hover:border-[rgba(203,162,95,0.35)] hover:text-[var(--ink-text)]"
              >
                {index + 1}. {section.heading}
              </a>
            ))}
          </div>

          <div className="space-y-10">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="flex items-baseline gap-3 text-lg font-semibold tracking-[-0.01em] text-[var(--ink-text)]">
                  <span className="font-mono text-sm text-bronze-300">{index + 1}</span>
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <p
                      key={paragraphIndex}
                      className="text-[15px] leading-[1.8] text-[var(--ink-text-secondary)]"
                    >
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

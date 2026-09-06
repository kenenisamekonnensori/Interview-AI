import { ChevronDown } from "lucide-react";

export type FaqItem = {
  q: string;
  a: string;
};

export type FaqGroup = {
  title: string;
  id?: string;
  items: FaqItem[];
};

export function FaqList({ groups }: { groups: FaqGroup[] }) {
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.title} id={group.id} className="scroll-mt-24">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-text-muted)]">
            {group.title}
          </h2>
          <div className="mt-4 space-y-3">
            {group.items.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-[var(--hairline)] bg-[var(--ink-raised)]/60 px-5 py-4 transition-colors open:border-[rgba(203,162,95,0.35)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-[var(--ink-text)] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown
                    className="size-4 shrink-0 text-[var(--ink-text-muted)] transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

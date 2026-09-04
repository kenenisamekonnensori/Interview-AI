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
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
            {group.title}
          </h2>
          <div className="mt-4 space-y-3">
            {group.items.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-white/[.07] bg-white/[.03] px-5 py-4 transition-colors open:border-[#6366f1]/25"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown
                    className="size-4 shrink-0 text-white/40 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/55">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

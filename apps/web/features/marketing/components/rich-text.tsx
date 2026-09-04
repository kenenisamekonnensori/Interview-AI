import { Lightbulb } from "lucide-react";

export type RichBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "tip"; text: string };

export function RichText({ blocks }: { blocks: RichBlock[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "h2":
            return (
              <h2 key={index} className="pt-4 text-xl font-semibold tracking-[-0.02em] text-white">
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={index} className="pt-2 text-base font-semibold text-white">
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={index} className="text-[15px] leading-[1.8] text-white/60">
                {block.text}
              </p>
            );
          case "ul":
            return (
              <ul
                key={index}
                className="list-disc space-y-2 pl-5 text-[15px] leading-[1.8] text-white/60 marker:text-[#6366f1]"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={index}
                className="list-decimal space-y-2 pl-5 text-[15px] leading-[1.8] text-white/60 marker:text-[#6366f1]"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={index}
                className="rounded-r-xl border-l-2 border-[#6366f1] bg-white/[.03] py-3 pl-4 pr-5 text-[15px] italic leading-[1.7] text-white/70"
              >
                {block.text}
              </blockquote>
            );
          case "tip":
            return (
              <div
                key={index}
                className="flex items-start gap-3 rounded-xl border border-[#6366f1]/20 bg-[#6366f1]/8 p-4"
              >
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#c0c1ff]" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-white/70">{block.text}</p>
              </div>
            );
        }
      })}
    </div>
  );
}

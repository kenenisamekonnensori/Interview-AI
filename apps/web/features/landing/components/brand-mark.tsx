import { Mic } from "lucide-react";

/** Logo mark: bronze squircle with a dark mic — readable on any surface. */
export function BrandMark() {
  return (
    <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-b from-[#dcbd7e] to-[#b78a44] shadow-[0_6px_20px_-6px_rgba(203,162,95,0.55)] ring-1 ring-white/25">
      <Mic className="size-4 text-[#221a0d]" aria-hidden="true" />
    </span>
  );
}

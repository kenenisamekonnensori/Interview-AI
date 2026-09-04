import { Mic } from "lucide-react";

export function BrandMark() {
  return (
    <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] shadow-lg shadow-[#6366f1]/25">
      <Mic className="size-4" aria-hidden="true" />
    </span>
  );
}
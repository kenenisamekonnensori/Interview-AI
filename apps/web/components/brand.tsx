import { AudioLines } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function Brand({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link className={cn("group inline-flex items-center gap-2.5", className)} href={href}>
      <span className="grid size-9 place-items-center rounded-xl bg-foreground text-background shadow-[0_10px_30px_rgb(0_0_0_/_18%)] transition-transform group-hover:rotate-[-5deg]">
        <AudioLines className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.03em]">interviewly</span>
    </Link>
  );
}

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatPostDate, type BlogPost } from "../blog/posts";

export function BlogCard({ post, large = false }: { post: BlogPost; large?: boolean }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--ink-raised)]/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(203,162,95,0.35)]"
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full border border-[var(--hairline)] bg-bronze-500/10 px-2.5 py-0.5 text-[11px] font-medium text-bronze-300">
          {post.category}
        </span>
        <ArrowUpRight
          className="size-4 text-[var(--ink-text-faint)] transition-all duration-300 group-hover:text-bronze-300"
          aria-hidden="true"
        />
      </div>
      <h2
        className={`mt-4 text-balance font-semibold tracking-[-0.02em] text-[var(--ink-text)] transition-colors group-hover:text-bronze-200 ${
          large ? "text-2xl sm:text-3xl" : "text-lg"
        }`}
      >
        {post.title}
      </h2>
      {large ? (
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-text-secondary)]">
          {post.excerpt}
        </p>
      ) : null}
      <p className={`mt-auto text-xs text-[var(--ink-text-faint)] ${large ? "pt-6" : "pt-4"}`}>
        {formatPostDate(post.date)} · {post.readTime}
      </p>
    </Link>
  );
}

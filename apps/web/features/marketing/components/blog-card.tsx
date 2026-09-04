import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatPostDate, type BlogPost } from "../blog/posts";

export function BlogCard({ post, large = false }: { post: BlogPost; large?: boolean }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#6366f1]/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.1)]"
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full border border-[#6366f1]/20 bg-[#6366f1]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#c0c1ff]">
          {post.category}
        </span>
        <ArrowUpRight
          className="size-4 text-white/25 transition-all duration-300 group-hover:text-[#c0c1ff]"
          aria-hidden="true"
        />
      </div>
      <h2
        className={`mt-4 text-balance font-semibold tracking-[-0.02em] text-white transition-colors group-hover:text-[#c0c1ff] ${
          large ? "text-2xl sm:text-3xl" : "text-lg"
        }`}
      >
        {post.title}
      </h2>
      {large ? (
        <p className="mt-3 text-[15px] leading-relaxed text-white/55">{post.excerpt}</p>
      ) : null}
      <p className={`mt-auto text-xs text-white/35 ${large ? "pt-6" : "pt-4"}`}>
        {formatPostDate(post.date)} · {post.readTime}
      </p>
    </Link>
  );
}

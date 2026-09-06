import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import {
  posts,
  getPost,
  getRelatedPosts,
  formatPostDate,
} from "../../../../features/marketing/blog/posts";
import { BlogCard } from "../../../../features/marketing/components/blog-card";
import { CtaCard } from "../../../../features/marketing/components/cta-card";
import { RichText } from "../../../../features/marketing/components/rich-text";

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const related = getRelatedPosts(post);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-text-muted)] transition-colors hover:text-[var(--ink-text)]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All articles
      </Link>

      <article className="mt-8">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[var(--hairline)] bg-bronze-500/10 px-2.5 py-0.5 text-[11px] font-medium text-bronze-300">
            {post.category}
          </span>
          <span className="text-xs text-[var(--ink-text-faint)]">
            {formatPostDate(post.date)} · {post.readTime}
          </span>
        </div>
        <h1 className="mt-5 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--ink-text)] sm:text-4xl">
          {post.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--ink-text-secondary)]">
          {post.excerpt}
        </p>

        <div className="mt-6 flex items-center gap-3 border-b border-[var(--hairline)] pb-6">
          <span className="grid size-9 place-items-center rounded-full bg-gradient-to-b from-bronze-300 to-bronze-500 text-xs font-semibold text-[#221a0d]">
            IA
          </span>
          <div>
            <p className="text-sm font-medium text-[var(--ink-text)]">{post.author}</p>
            <p className="text-xs text-[var(--ink-text-faint)]">{post.authorRole}</p>
          </div>
        </div>

        <div className="mt-8">
          <RichText blocks={post.blocks} />
        </div>
      </article>

      {related.length > 0 ? (
        <section className="mt-16 border-t border-[var(--hairline)] pt-10">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-text-muted)]">
            Keep reading
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((relatedPost) => (
              <BlogCard key={relatedPost.slug} post={relatedPost} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-14">
        <CtaCard
          title="Practice what you just read"
          body="Turn this advice into a realistic voice session and get feedback on how you actually sound."
          ctaLabel="Start a practice interview"
        />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { posts, getFeaturedPost } from "../../../features/marketing/blog/posts";
import { BlogCard } from "../../../features/marketing/components/blog-card";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { PageHeading } from "../../../features/marketing/components/page-heading";

export const metadata: Metadata = { title: "Blog" };

export default function BlogIndexPage() {
  const featured = getFeaturedPost();
  const rest = posts.filter((post) => post.slug !== featured?.slug);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <PageHeading
        eyebrow="Blog"
        title="Insights for better interviews"
        description="Practical field notes on interviewing, communication, and career growth — written by the team building Interviewer AI."
      />

      {featured ? (
        <div className="mt-10">
          <BlogCard post={featured} large />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {rest.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>

      <div className="mt-14">
        <CtaCard
          title="Ready to put these ideas into practice?"
          body="Turn any of these tips into a live voice session — with an interviewer that actually responds."
          ctaLabel="Start practicing free"
        />
      </div>
    </div>
  );
}

import Link from "next/link";

/**
 * Honest placeholder for dashboard sections whose backend intelligence ships in
 * a later stage. Never renders metrics — only explains what will live here and
 * what the user can do today.
 */
export function PlaceholderSection({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-[2.55rem]">
          {title}
        </h1>
        <div className="mt-6 rounded-3xl border border-border bg-card/60 p-6">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          {action ? (
            <Link href={action.href} className="button-primary mt-4 inline-flex h-10 px-3 text-sm">
              {action.label}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}

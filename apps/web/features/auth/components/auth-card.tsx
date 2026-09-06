import type { PropsWithChildren } from "react";

type AuthCardProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
}>;

export function AuthCard({ eyebrow, title, subtitle, children }: AuthCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-8 shadow-[0_20px_60px_-24px_rgb(0_0_0_/_30%)] sm:p-9">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
      <div className="mt-7">{children}</div>
    </section>
  );
}
type PageHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
};

export function PageHeading({ eyebrow, title, description }: PageHeadingProps) {
  return (
    <div>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--bronze)]">
        {eyebrow}
      </p>
      <h1 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.025em] text-[var(--ink-text)] sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--ink-text-secondary)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

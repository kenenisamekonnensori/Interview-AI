type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

/** Shared section header: mono eyebrow + display title + optional lede. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: SectionHeadingProps) {
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--bronze)]">
        {eyebrow}
      </p>
      <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.025em] text-[var(--ink-text)] sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mx-auto mt-4 max-w-xl text-balance text-base leading-relaxed text-[var(--ink-text-secondary)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

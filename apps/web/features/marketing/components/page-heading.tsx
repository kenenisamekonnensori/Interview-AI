type PageHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
};

export function PageHeading({ eyebrow, title, description }: PageHeadingProps) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c0c1ff]">{eyebrow}</p>
      <h1 className="mt-4 text-balance text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/55">{description}</p>
      ) : null}
    </div>
  );
}
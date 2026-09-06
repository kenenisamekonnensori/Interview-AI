import Link from "next/link";
import { BrandMark } from "./brand-mark";

type FooterLink = {
  label: string;
  href: string;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

const footerColumns: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help center", href: "/help" },
      { label: "Documentation", href: "/docs" },
      { label: "Interview guides", href: "/guides" },
      { label: "FAQ", href: "/faq" },
    ],
  },
];

const legalLinks: FooterLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Cookies", href: "/cookies" },
  { label: "Security", href: "/security" },
];

// Placeholder profile URLs — replace with the real accounts once they exist.
const socials = [
  {
    label: "X (Twitter)",
    href: "https://x.com/interviewai",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z",
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com/company/interviewai",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    label: "GitHub",
    href: "https://github.com/interviewai",
    path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative">
      <div className="divider-glow mx-auto max-w-6xl" />

      <div className="mx-auto max-w-6xl px-6">
        {/* CTA strip */}
        <div className="flex flex-col items-start justify-between gap-6 pt-16 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--ink-text)]">
              Ready when you are.
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-text-secondary)]">
              Your first voice interview takes about fifteen minutes.
            </p>
          </div>
          <Link
            className="btn-primary inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-5 text-sm"
            href="/sign-up"
          >
            Get started free
          </Link>
        </div>

        {/* Link grid */}
        <div className="mt-14 grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Link className="flex items-center gap-2.5" href="/" aria-label="Interviewer AI home">
              <BrandMark />
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink-text)]">
                Interviewer AI
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--ink-text-secondary)]">
              Voice-first mock interviews that feel real — with adaptive follow-ups and clear,
              actionable feedback.
            </p>
            <Link
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-[rgba(45,212,191,0.2)] bg-[var(--teal-soft)] px-3 py-1 text-xs font-medium text-[var(--teal)] transition-opacity hover:opacity-80"
              href="/status"
            >
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--teal)] opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[var(--teal)]" />
              </span>
              All systems operational
            </Link>
            <div className="mt-6 flex items-center gap-1">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                  className="grid size-9 place-items-center rounded-lg text-[var(--ink-text-muted)] transition-colors hover:bg-white/[.06] hover:text-[var(--ink-text)]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="size-4"
                    aria-hidden="true"
                  >
                    <path d={social.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-text-muted)]">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      className="text-sm text-[var(--ink-text-secondary)] transition-colors hover:text-[var(--ink-text)]"
                      href={link.href}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[var(--hairline)] py-8 text-xs text-[var(--ink-text-faint)] sm:flex-row">
          <p>© {year} InterviewAi. All rights reserved.</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <Link
                  className="transition-colors hover:text-[var(--ink-text-secondary)]"
                  href={link.href}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

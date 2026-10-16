"use client";

import type { ProfileSummary } from "@/lib/profile-summary";
import { Button } from "@/components/ui/button";
import { CalendarIcon, ChevronRightIcon } from "@/components/ui/icons";

const SUGGESTED_QUESTIONS = [
  "What's the most complex system he's built end to end?",
  "How does he keep LLM answers grounded?",
  "What backend work has he done outside of AI?",
  "What has he built recently?"
];

export type EmptyStateProps = {
  profile: ProfileSummary;
  onAsk(question: string): void;
  onBook(): void;
  voice: React.ReactNode;
};

export function EmptyState({ profile, onAsk, onBook, voice }: EmptyStateProps) {
  const links = [
    { label: "GitHub", href: profile.links.github },
    { label: "LinkedIn", href: profile.links.linkedin },
    { label: "Email", href: `mailto:${profile.links.email}` }
  ];

  return (
    <section aria-labelledby="profile-name" className="flex w-full flex-col gap-10 py-10 sm:py-16">
      <div className="flex flex-col gap-5">
        <div>
          <h1 id="profile-name" className="text-28 font-semibold text-fg">
            {profile.name}
          </h1>
          <p className="mt-1.5 text-17 text-pretty text-fg-muted">{profile.positioning}</p>
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-13">
            {links.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  {...(link.href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noreferrer" })}
                  className="relative rounded-sm text-fg-muted underline before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] decoration-border-strong underline-offset-4 transition-colors duration-(--duration-fast) ease-out hover:text-fg hover:decoration-fg-subtle"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" leadingIcon={<CalendarIcon />} onClick={onBook}>
            Book a 15-min call
          </Button>
          {voice}
        </div>
      </div>

      <dl className="grid gap-px overflow-hidden rounded-lg bg-border shadow-[0_0_0_1px_var(--color-border)] sm:grid-cols-2">
        {profile.highlights.map((highlight) => (
          <div key={highlight.label} className="flex flex-col gap-1 bg-canvas px-4 py-3.5">
            <dt className="font-mono text-12 text-fg-subtle">{highlight.label}</dt>
            <dd className="text-14 text-pretty text-fg">{highlight.detail}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h2 className="font-mono text-12 text-fg-subtle">Ask about</h2>
        <ul className="mt-2 flex flex-col border-t border-border">
          {SUGGESTED_QUESTIONS.map((question) => (
            <li key={question} className="border-b border-border">
              <button
                type="button"
                onClick={() => onAsk(question)}
                className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-sm py-2.5 text-left text-14 text-fg-muted transition-colors duration-(--duration-fast) ease-out hover:text-fg"
              >
                {question}
                <ChevronRightIcon className="shrink-0 text-fg-subtle transition-[color,translate] duration-(--duration-fast) ease-out group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:translate-x-0" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-12 text-pretty text-fg-subtle">
        Answers come from Shubham&apos;s resume and project notes. Bookings go on his real calendar.
      </p>
    </section>
  );
}

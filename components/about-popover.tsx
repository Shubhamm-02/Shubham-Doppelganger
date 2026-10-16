"use client";

import * as Popover from "@radix-ui/react-popover";
import { useId } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { ExternalIcon, XIcon } from "@/components/ui/icons";
import type { ProfileSummary } from "@/lib/profile-summary";

export type ProfileLinks = ProfileSummary["links"];

export type AboutPopoverProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  links: ProfileLinks;
  onCloseAutoFocus?(event: Event): void;
  children: React.ReactElement;
};

function displayUrl(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function AboutPopover({ open, onOpenChange, links, onCloseAutoFocus, children }: AboutPopoverProps) {
  const titleId = useId();
  const contacts = [
    { label: "GitHub", href: links.github, value: displayUrl(links.github), external: true },
    { label: "LinkedIn", href: links.linkedin, value: displayUrl(links.linkedin), external: true },
    { label: "Email", href: `mailto:${links.email}`, value: links.email, external: false }
  ];

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          className="z-50 w-[min(22rem,calc(100vw-1.5rem))] origin-(--radix-popover-content-transform-origin) rounded-lg bg-surface shadow-md outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <div className="flex items-start justify-between gap-2 pt-3 pr-2 pl-4">
            <h2 id={titleId} className="pt-1 text-14 font-medium text-fg">
              About Wizard
            </h2>
            <Popover.Close asChild>
              <IconButton size="sm" label="Close" icon={<XIcon />} tooltipSide="left" />
            </Popover.Close>
          </div>
          <div className="flex flex-col gap-2 px-4 pt-1 pb-4 text-13 text-pretty text-fg-muted">
            <p>
              Wizard is Shubham&apos;s AI representative. It answers questions from his resume and project notes, and
              can book a 15-minute call with him in IST.
            </p>
            <p>It won&apos;t make things up. If his notes don&apos;t cover something, it says so.</p>
          </div>
          <div className="border-t border-border px-2 pt-2 pb-2">
            <p className="px-2 pt-1 pb-1.5 text-12 text-fg-subtle">Reach Shubham directly</p>
            <ul>
              {contacts.map((contact) => (
                <li key={contact.label}>
                  <a
                    href={contact.href}
                    target={contact.external ? "_blank" : undefined}
                    rel={contact.external ? "noreferrer" : undefined}
                    className="group flex h-9 items-center gap-3 rounded-md px-2 text-13 transition-colors duration-(--duration-fast) ease-out hover:bg-sunken focus-visible:-outline-offset-2 pointer-coarse:h-10"
                  >
                    <span className="w-16 shrink-0 text-fg">{contact.label}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-muted group-hover:text-fg">{contact.value}</span>
                    {contact.external ? <ExternalIcon className="shrink-0 text-fg-subtle" /> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

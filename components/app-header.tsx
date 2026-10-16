"use client";

import { useRef, useState } from "react";
import { AboutPopover, type ProfileLinks } from "@/components/about-popover";
import { OverflowMenu } from "@/components/overflow-menu";
import { SIDEBAR_ID, SIDEBAR_TOGGLE_ATTR } from "@/components/sidebar/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconButton } from "@/components/ui/icon-button";
import { SidebarIcon } from "@/components/ui/icons";
import { Monogram } from "@/components/ui/monogram";

export type AppHeaderProps = {
  name: string;
  links: ProfileLinks;
  isDesktop: boolean;
  sidebarExpanded: boolean;
  onToggleSidebar(): void;
  onNewChat(): void;
  voice?: React.ReactNode;
};

export function AppHeader({
  name,
  links,
  isDesktop,
  sidebarExpanded,
  onToggleSidebar,
  onNewChat,
  voice
}: AppHeaderProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const aboutFromMenu = useRef(false);

  const toggleLabel = isDesktop ? (sidebarExpanded ? "Hide chats" : "Show chats") : "Open chats";

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-1 border-b border-border bg-surface pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] md:pr-[max(0.75rem,env(safe-area-inset-right))] md:pl-[max(0.75rem,env(safe-area-inset-left))]">
      <IconButton
        label={toggleLabel}
        icon={<SidebarIcon />}
        aria-controls={isDesktop ? SIDEBAR_ID : undefined}
        aria-haspopup={isDesktop ? undefined : "dialog"}
        aria-expanded={sidebarExpanded}
        {...{ [SIDEBAR_TOGGLE_ATTR]: "" }}
        onClick={onToggleSidebar}
      />
      <AboutPopover
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        links={links}
        onCloseAutoFocus={(event) => {
          if (!aboutFromMenu.current) return;
          aboutFromMenu.current = false;
          event.preventDefault();
          moreRef.current?.focus();
        }}
      >
        <button
          type="button"
          className="flex h-10 min-w-0 items-center gap-2.5 rounded-md px-2 text-left transition-colors duration-(--duration-fast) ease-out hover:bg-sunken data-[state=open]:bg-sunken"
        >
          <Monogram size={24} className="shrink-0 text-fg" />
          <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
            <span className="truncate text-14 font-medium text-fg">{name}</span>
            <span className="truncate text-12 text-fg-subtle sm:text-13">AI representative</span>
          </span>
        </button>
      </AboutPopover>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {voice}
        <ThemeToggle />
        <OverflowMenu
          triggerRef={moreRef}
          onNewChat={onNewChat}
          onAbout={() => {
            aboutFromMenu.current = true;
            setAboutOpen(true);
          }}
        />
      </div>
    </header>
  );
}

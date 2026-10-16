"use client";

import { useRef } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { InfoIcon, MoreIcon, PlusIcon } from "@/components/ui/icons";
import { useModifierKey } from "@/components/ui/kbd";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";

export type OverflowMenuProps = {
  onNewChat(): void;
  onAbout(): void;
  triggerRef?: React.Ref<HTMLButtonElement>;
};

export function OverflowMenu({ onNewChat, onAbout, triggerRef }: OverflowMenuProps) {
  const modifier = useModifierKey();
  const chosen = useRef<"new-chat" | "about" | null>(null);

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton ref={triggerRef} label="More" icon={<MoreIcon />} />
      </MenuTrigger>
      <MenuContent
        onCloseAutoFocus={(event) => {
          const action = chosen.current;
          chosen.current = null;
          if (!action) return;
          event.preventDefault();
          if (action === "new-chat") onNewChat();
          else onAbout();
        }}
      >
        <MenuItem
          icon={<PlusIcon />}
          shortcut={<span className="font-mono text-12">{modifier === "⌘" ? "⌘K" : "Ctrl+K"}</span>}
          onSelect={() => {
            chosen.current = "new-chat";
          }}
        >
          New chat
        </MenuItem>
        <MenuItem
          icon={<InfoIcon />}
          onSelect={() => {
            chosen.current = "about";
          }}
        >
          About Wizard
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

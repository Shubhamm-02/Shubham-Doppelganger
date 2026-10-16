"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { cx } from "@/lib/client/cx";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuRadioGroup = DropdownMenu.RadioGroup;

const ITEM = cx(
  "relative flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-14 text-fg outline-none select-none pointer-coarse:h-10",
  "data-highlighted:bg-fg/8 dark:data-highlighted:bg-fg/12 data-disabled:opacity-50"
);

export function MenuContent({ className, align = "end", sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cx(
          "z-50 min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) rounded-lg bg-surface p-1 shadow-md",
          "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          className
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

type ItemExtras = { icon?: React.ReactNode; shortcut?: React.ReactNode };

export function MenuItem({ icon, shortcut, className, children, ...props }: ComponentProps<typeof DropdownMenu.Item> & ItemExtras) {
  return (
    <DropdownMenu.Item className={cx(ITEM, className)} {...props}>
      {icon ? <span className="text-fg-muted">{icon}</span> : null}
      <span className="flex-1">{children}</span>
      {shortcut ? <span className="ml-4 text-fg-subtle">{shortcut}</span> : null}
    </DropdownMenu.Item>
  );
}

export function MenuRadioItem({ icon, className, children, ...props }: ComponentProps<typeof DropdownMenu.RadioItem> & Pick<ItemExtras, "icon">) {
  return (
    <DropdownMenu.RadioItem className={cx(ITEM, className)} {...props}>
      {icon ? <span className="text-fg-muted">{icon}</span> : null}
      <span className="flex-1">{children}</span>
      <DropdownMenu.ItemIndicator className="text-fg">
        <CheckIcon />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cx("px-2.5 pt-1.5 pb-1 text-12 text-fg-subtle", className)} {...props} />;
}

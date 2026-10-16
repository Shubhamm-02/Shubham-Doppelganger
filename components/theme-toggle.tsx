"use client";

import { IconButton } from "@/components/ui/icon-button";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";
import { useTheme } from "@/hooks/use-theme";
import type { ThemePreference } from "@/lib/client/theme";

const OPTIONS = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon }
] as const;

function isThemePreference(value: string): value is ThemePreference {
  return OPTIONS.some((option) => option.value === value);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2];

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label={`Theme: ${current.label}`} icon={<current.Icon />} />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Theme</MenuLabel>
        <MenuRadioGroup value={theme} onValueChange={(value) => isThemePreference(value) && setTheme(value)}>
          {OPTIONS.map(({ value, label, Icon }) => (
            <MenuRadioItem key={value} value={value} icon={<Icon />}>
              {label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

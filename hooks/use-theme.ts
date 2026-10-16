"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyTheme,
  DARK_QUERY,
  readThemePreference,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference
} from "@/lib/client/theme";

const listeners = new Set<() => void>();

function subscribePreference(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeSystem(listener: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function systemPrefersDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

export function useTheme(): {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
} {
  const theme = useSyncExternalStore(subscribePreference, readThemePreference, () => "system" as const);
  const prefersDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false);
  const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  const setTheme = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    applyTheme(next, THEME_COLORS);
    listeners.forEach((listener) => listener());
  }, []);

  return { theme, resolvedTheme, setTheme };
}

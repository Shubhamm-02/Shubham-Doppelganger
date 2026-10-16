export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type ThemeColors = Record<ResolvedTheme, string>;

export const THEME_STORAGE_KEY = "wizard.theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";
export const THEME_COLORS: ThemeColors = { light: "#fafaf9", dark: "#0b0b0c" };

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    return;
  }
}

// Serialized into the pre-paint script, so it must not reference anything outside its parameters.
export function applyTheme(preference: ThemePreference, colors: ThemeColors) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = preference === "system" ? (prefersDark ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute("media");
    const follows = preference === "system" && media ? (media.includes("dark") ? "dark" : "light") : theme;
    meta.setAttribute("content", colors[follows]);
  });
}

function initTheme(key: string, colors: ThemeColors, apply: typeof applyTheme) {
  const read = (): ThemePreference => {
    try {
      const stored = localStorage.getItem(key);
      return stored === "light" || stored === "dark" ? stored : "system";
    } catch {
      return "system";
    }
  };
  apply(read(), colors);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => apply(read(), colors));
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) apply(read(), colors);
  });
}

export const themeScript = `(${initTheme.toString()})(${JSON.stringify(THEME_STORAGE_KEY)}, ${JSON.stringify(THEME_COLORS)}, ${applyTheme.toString()});`;

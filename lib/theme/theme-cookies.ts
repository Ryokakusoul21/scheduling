export type Theme = "light" | "dark" | "system";

/** Cookie holding the user's choice: "light" | "dark" | "system". */
export const THEME_COOKIE = "theme";
/** Cookie holding the last resolved appearance ("light" | "dark"), so the server can render "system" correctly. */
export const RESOLVED_THEME_COOKIE = "theme-resolved";

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

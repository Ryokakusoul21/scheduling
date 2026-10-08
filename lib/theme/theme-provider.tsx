"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { RESOLVED_THEME_COOKIE, THEME_COOKIE, type Theme } from "./theme-cookies";

export type { Theme };

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const ONE_YEAR = 60 * 60 * 24 * 365;

function resolve(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

function apply(theme: Theme) {
  const resolved = resolve(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  writeCookie(RESOLVED_THEME_COOKIE, resolved);
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    apply(theme);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => apply("system");
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    writeCookie(THEME_COOKIE, next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

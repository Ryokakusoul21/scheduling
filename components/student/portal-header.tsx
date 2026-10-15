"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";
import { Moon, SignOut, Sun } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme/theme-provider";

/** Header of the student portal: institution name, theme switch, and sign out. */
export function PortalHeader({ name }: { name: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 md:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
          <Image src="/branding/logo.jpg" alt="GRANBY COLLEGES OF SCIENCE & TECHNOLOGY Seal" fill sizes="40px" className="object-cover" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">GRANBY COLLEGES OF SCIENCE &amp; TECHNOLOGY</p>
          <p className="text-xs text-muted-foreground">Student Portal · {name}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/student/login" })}>
          <SignOut className="size-4" /> Sign out
        </Button>
      </div>
    </header>
  );
}

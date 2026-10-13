import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist_Mono, Poppins } from "next/font/google";
import { Providers } from "./providers";
import { parseTheme, RESOLVED_THEME_COOKIE, THEME_COOKIE } from "@/lib/theme/theme-cookies";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GRANBY COLLEGES OF SCIENCE & TECHNOLOGY Scheduling System",
  description: "AI-Powered Scheduling Management System for GRANBY COLLEGES OF SCIENCE & TECHNOLOGY",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render the theme class on the server from cookies, so no inline script is
  // needed to avoid a flash of the wrong theme.
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const isDark =
    theme === "dark" ||
    (theme === "system" && cookieStore.get(RESOLVED_THEME_COOKIE)?.value === "dark");

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased${isDark ? " dark" : ""}`}
    >
      <body className="min-h-full flex flex-col">
        <Providers initialTheme={theme}>{children}</Providers>
      </body>
    </html>
  );
}

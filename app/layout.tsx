import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "./providers";
import { parseTheme, RESOLVED_THEME_COOKIE, THEME_COOKIE } from "@/lib/theme/theme-cookies";
import "./globals.css";

// Inter for body text and tables; Plus Jakarta Sans for headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI-Driven Faculty and Room Scheduling System for GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY",
  description: "AI-Driven Faculty and Room Scheduling System of GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY",
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
      className={`${inter.variable} ${jakarta.variable} ${geistMono.variable} h-full antialiased${isDark ? " dark" : ""}`}
    >
      <body className="min-h-full flex flex-col">
        <Providers initialTheme={theme}>{children}</Providers>
      </body>
    </html>
  );
}

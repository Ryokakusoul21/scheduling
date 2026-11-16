import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the configured app host when testing development links from another device.
  allowedDevOrigins: process.env.NEXT_PUBLIC_APP_URL
    ? [new URL(process.env.NEXT_PUBLIC_APP_URL).hostname]
    : [],
  devIndicators: {
    position: "bottom-right",
  },
  // Load only the icons a file uses instead of the whole set of over 1,500 icons, so each page compiles faster.
  modularizeImports: {
    "@phosphor-icons/react/ssr": { transform: "@phosphor-icons/react/dist/ssr/{{member}}", skipDefaultConversion: true },
  },
  // Old routes merged into the Scheduler / Academic Years & Terms pages.
  async redirects() {
    return [
      { source: "/schedules", destination: "/scheduler", permanent: true },
      { source: "/ai-scheduler", destination: "/scheduler", permanent: true },
      { source: "/conflicts", destination: "/scheduler", permanent: true },
      { source: "/examinations", destination: "/scheduler?mode=examinations", permanent: true },
      { source: "/semesters", destination: "/academic-years", permanent: true },
    ];
  },
  experimental: {
    // Enables forbidden()/unauthorized() and the app/forbidden.tsx + app/unauthorized.tsx pages.
    authInterrupts: true,
    // Allow 2 MB department logos plus multipart form overhead; each upload validates its own size.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;

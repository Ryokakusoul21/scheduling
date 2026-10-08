import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  // Old routes merged into the Scheduler / Academic Years & Terms pages.
  async redirects() {
    return [
      { source: "/schedules", destination: "/scheduler", permanent: true },
      { source: "/calendar", destination: "/scheduler", permanent: true },
      { source: "/ai-scheduler", destination: "/scheduler", permanent: true },
      { source: "/conflicts", destination: "/scheduler", permanent: true },
      { source: "/semesters", destination: "/academic-years", permanent: true },
    ];
  },
  experimental: {
    // Enables forbidden()/unauthorized() and the app/forbidden.tsx + app/unauthorized.tsx pages.
    authInterrupts: true,
  },
};

export default nextConfig;

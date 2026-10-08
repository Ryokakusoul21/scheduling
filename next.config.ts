import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  experimental: {
    // Enables forbidden()/unauthorized() and the app/forbidden.tsx + app/unauthorized.tsx pages.
    authInterrupts: true,
  },
};

export default nextConfig;

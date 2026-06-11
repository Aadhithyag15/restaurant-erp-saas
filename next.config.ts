import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workers/OpenNext serves the app; keep the default output. Images stay
  // unoptimized until a real CDN loader is configured (free-tier friendly).
  images: { unoptimized: true },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // No next/image is used; skip the optimizer so `sharp` is not bundled.
  images: { unoptimized: true },
};

export default nextConfig;

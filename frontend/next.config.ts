import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev server is reached over Tailscale from the team's laptops.
  allowedDevOrigins: ["claudevps", "100.70.183.118", "**.ts.net"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

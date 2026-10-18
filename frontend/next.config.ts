import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev server is reached over Tailscale from the team's laptops.
  allowedDevOrigins: ["claudevps", "100.70.183.118", "**.ts.net"],
  cacheComponents: true,
  // No landing page: the train map is the entry point (a config redirect, so the prerenderer has nothing to validate).
  async redirects() {
    return [{ source: "/", destination: "/train", permanent: false }];
  },
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

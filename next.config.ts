import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Config redirect avoids rendering `/` with `redirect()`, which Cache
  // Components instant validation reports as a prerender failure.
  async redirects() {
    return [
      {
        source: "/",
        destination: "/login",
        permanent: false,
      },
      {
        // Promotion Review was removed from the Line Manager portal (BCMS manager review).
        source: "/manager/promotion",
        destination: "/manager",
        permanent: false,
      },
    ];
  },
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

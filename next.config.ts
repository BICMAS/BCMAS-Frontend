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

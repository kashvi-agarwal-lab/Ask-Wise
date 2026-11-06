import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Product photos live on Bodywise's image server; Next must be told it's allowed.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.mscwlns.co", pathname: "/**" },
    ],
  },
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

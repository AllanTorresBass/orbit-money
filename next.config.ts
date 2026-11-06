import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /health compares applied migrations with the files shipped here.
  outputFileTracingIncludes: {
    "/api/v1/health": ["./db/migrations/**/*.sql"],
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

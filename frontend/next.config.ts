import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist tries require("canvas") for a Node fallback path.
  // Browser bundle never executes it — alias to a tiny empty CommonJS file.
  turbopack: {
    resolveAlias: {
      canvas: "./src/lib/canvas-stub.js",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;

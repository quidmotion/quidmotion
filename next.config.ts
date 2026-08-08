import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite is built-in; no native addons required
  serverExternalPackages: [],
  // Default Server Action body limit is 1MB — too small for mobile camera photos.
  // App enforces 8MB per KYC file; 12MB covers multi-file multipart overhead.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;

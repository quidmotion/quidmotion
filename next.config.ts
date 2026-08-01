import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite is built-in; no native addons required
  serverExternalPackages: [],
};

export default nextConfig;

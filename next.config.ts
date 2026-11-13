import type { NextConfig } from "next";

function readHostList(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const allowedDevOrigins = readHostList("DEV_ALLOWED_ORIGINS");
const allowedServerActionOrigins = readHostList("DEV_SERVER_ACTION_ALLOWED_ORIGINS");

const nextConfig: NextConfig = {
  devIndicators: false,
  // Keep remote development limited to explicitly configured hosts.
  allowedDevOrigins: allowedDevOrigins.length ? allowedDevOrigins : undefined,
  experimental: {
    serverActions: {
      allowedOrigins: allowedServerActionOrigins.length
        ? allowedServerActionOrigins
        : undefined,
    },
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

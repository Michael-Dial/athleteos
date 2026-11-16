import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the runtime image small: only traced server files ship.
  output: "standalone",
  poweredByHeader: false,
  // pg is a Node-only driver; keep it out of the bundler so its native/optional
  // requires resolve at runtime instead of being traced into chunks.
  serverExternalPackages: ["pg"],
};

export default nextConfig;

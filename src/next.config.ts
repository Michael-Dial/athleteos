import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the runtime image small: only traced server files ship.
  output: "standalone",
  poweredByHeader: false,
  // pg is a Node-only driver; keep it out of the bundler so its native/optional
  // requires resolve at runtime instead of being traced into chunks.
  serverExternalPackages: ["pg", "web-push", "nodemailer"],
  async redirects() {
    return [
      {
        // The old combined OW page, split into Connected accounts (athlete) and
        // Data backend (admin). Provider OAuth flows started before the split
        // return here with ?connected=…; the query string is carried over.
        source: "/settings/connections",
        destination: "/settings/accounts",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or fixes to it would
        // take a browser-cache lifetime to reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AthleteOS",
    short_name: "AthleteOS",
    description: "Plan, training, wearables, wellness and readiness in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f6f4",
    theme_color: "#2a78d6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Morning check-in", url: "/wellness/morning-wellness" },
      { name: "Log a session", url: "/history#log" },
      { name: "Plan", url: "/plan" },
    ],
  };
}

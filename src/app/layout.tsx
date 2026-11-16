import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { PwaRegister } from "@/components/pwa";

// Barlow for reading, Barlow Condensed for figures and labels: compact,
// sporty numerals that keep big values readable on a phone. Self-hosted at build.
const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AthleteOS", template: "%s · AthleteOS" },
  description: "Personal athlete management: plan, training, wearables, wellness, readiness.",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "AthleteOS", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0c0d0f", viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("aos_theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme} className={`${body.variable} ${display.variable}`}>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

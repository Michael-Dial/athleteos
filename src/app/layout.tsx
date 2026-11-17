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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0f" },
    { media: "(prefers-color-scheme: light)", color: "#f3f3ef" },
  ],
  viewportFit: "cover",
};

// With no saved choice the theme follows the phone. This runs before first
// paint, so a light-mode phone never flashes the dark theme, and it keeps
// following the system while the app is open.
const FOLLOW_SYSTEM = `(function(){var d=document.documentElement;if(d.dataset.theme)return;var m=matchMedia("(prefers-color-scheme: light)");var s=function(){d.dataset.theme=m.matches?"light":"dark";d.dataset.themeSource="system"};s();m.addEventListener("change",function(){if(d.dataset.themeSource==="system")s()})})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const saved = (await cookies()).get("aos_theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : undefined;
  return (
    <html lang="en" data-theme={theme} className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOLLOW_SYSTEM }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

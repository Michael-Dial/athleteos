import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa";

export const metadata: Metadata = {
  title: { default: "AthleteOS", template: "%s · AthleteOS" },
  description: "Personal athlete management: plan, training, wearables, wellness, readiness.",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "AthleteOS", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

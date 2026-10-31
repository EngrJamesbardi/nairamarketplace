import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { PwaClient } from "@/components/PwaClient";
import { ImpressionTracker } from "@/components/ImpressionTracker";
import { DemoBanner } from "@/components/DemoBanner";
import { isDemoSite } from "@/lib/site-mode";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Naira Marketplace — Africa's Open Market", template: "%s · Naira Marketplace" },
  description: "Buy, sell and negotiate directly with traders, shops and individuals across Africa. Free to browse and list.",
  applicationName: "Naira Marketplace",
  appleWebApp: { capable: true, title: "Naira Market", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: { type: "website", siteName: "Naira Marketplace", locale: "en" },
  formatDetection: { telephone: false },
  ...(isDemoSite() ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = {
  themeColor: "#B84A24",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = (await cookies()).get("nm_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme} className={inter.variable}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-2">
          Skip to content
        </a>
        <DemoBanner />
        <Header />
        <PwaClient />
        <ImpressionTracker />
        <main id="main" className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}

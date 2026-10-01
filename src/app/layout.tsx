import type { Metadata, Viewport } from "next";
import { Karantina, Rubik, Unbounded } from "next/font/google";
import "./globals.css";

const rubik = Rubik({ subsets: ["hebrew", "latin"], variable: "--font-rubik", display: "swap" });
const karantina = Karantina({ subsets: ["hebrew", "latin"], weight: ["400", "700"], variable: "--font-karantina", display: "swap" });
const unbounded = Unbounded({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-unbounded", display: "swap" });

export const metadata: Metadata = {
  title: { default: "JARVIS", template: "%s · JARVIS" },
  description: "העוזר האישי שלך. פשוט מדברים.",
  applicationName: "JARVIS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "JARVIS", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#04050d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} ${karantina.variable} ${unbounded.variable}`} suppressHydrationWarning>
      <body>
        <div className="atmosphere" aria-hidden />
        <div className="grain" aria-hidden />
        {children}
      </body>
    </html>
  );
}

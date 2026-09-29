import type { Metadata, Viewport } from "next";
import "@fontsource-variable/heebo";
import "./globals.css";
import { Providers } from "@/client/providers";

export const metadata: Metadata = {
  title: { default: "NOVA", template: "%s · NOVA" },
  description: "מערכת הפעלה אישית: הרגלים, מטרות, נתונים ותובנות — במקום אחד, פרטי.",
  applicationName: "NOVA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "NOVA", statusBarStyle: "default" },
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

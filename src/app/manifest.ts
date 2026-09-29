import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NOVA — מערכת הפעלה אישית",
    short_name: "NOVA",
    description: "הרגלים, מטרות, נתונים ותובנות אישיות — במקום אחד, פרטי.",
    lang: "he",
    dir: "rtl",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#f6f5f2",
    theme_color: "#f6f5f2",
    categories: ["productivity", "health", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "צ׳ק־אין", short_name: "צ׳ק־אין", url: "/today?checkin=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "שאל את NOVA", short_name: "שאל", url: "/ask", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "היום", short_name: "היום", url: "/today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

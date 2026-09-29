"use client";
import {
  BookOpenText,
  CalendarCheck2,
  Database,
  Ellipsis,
  FlaskConical,
  History,
  House,
  Lightbulb,
  Library,
  MessageCircle,
  Plug,
  Repeat,
  Settings,
  Target,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  group?: "main" | "system";
}

export const NAV: NavItem[] = [
  { href: "/", label: "בית", icon: House, group: "main" },
  { href: "/today", label: "היום", icon: CalendarCheck2, group: "main" },
  { href: "/timeline", label: "ציר זמן", icon: History, group: "main" },
  { href: "/habits", label: "הרגלים", icon: Repeat, group: "main" },
  { href: "/goals", label: "מטרות", icon: Target, group: "main" },
  { href: "/insights", label: "תובנות", icon: Lightbulb, group: "main" },
  { href: "/ask", label: "שאל את NOVA", icon: MessageCircle, group: "main" },
  { href: "/journal", label: "יומן", icon: BookOpenText, group: "main" },
  { href: "/experiments", label: "ניסויים", icon: FlaskConical, group: "main" },
  { href: "/data", label: "הנתונים שלי", icon: Database, group: "system" },
  { href: "/integrations", label: "חיבורים", icon: Plug, group: "system" },
  { href: "/memory", label: "זיכרון", icon: Library, group: "system" },
  { href: "/settings", label: "הגדרות", icon: Settings, group: "system" },
];

export const MOBILE_NAV: NavItem[] = [
  { href: "/", label: "בית", icon: House },
  { href: "/today", label: "היום", icon: CalendarCheck2 },
  { href: "/insights", label: "תובנות", icon: Lightbulb },
  { href: "/ask", label: "AI", icon: MessageCircle },
  { href: "/more", label: "עוד", icon: Ellipsis },
];

/** Routes reachable from the mobile "עוד" screen, used to keep "עוד" highlighted. */
export const MORE_ROUTES = ["/more", "/timeline", "/habits", "/goals", "/journal", "/experiments", "/data", "/integrations", "/memory", "/settings"];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const PAGE_TITLES: [RegExp, string][] = [
  [/^\/$/, "בית"],
  [/^\/today/, "היום"],
  [/^\/timeline/, "ציר זמן"],
  [/^\/habits\/.+/, "הרגל"],
  [/^\/habits/, "הרגלים"],
  [/^\/goals\/.+/, "מטרה"],
  [/^\/goals/, "מטרות"],
  [/^\/insights\/.+/, "תובנה"],
  [/^\/insights/, "תובנות"],
  [/^\/ask/, "שאל את NOVA"],
  [/^\/journal/, "יומן"],
  [/^\/experiments\/.+/, "ניסוי"],
  [/^\/experiments/, "ניסויים"],
  [/^\/data/, "הנתונים שלי"],
  [/^\/integrations/, "חיבורים"],
  [/^\/memory/, "זיכרון"],
  [/^\/settings/, "הגדרות"],
  [/^\/more/, "עוד"],
];

export function pageTitle(pathname: string) {
  return PAGE_TITLES.find(([re]) => re.test(pathname))?.[1] ?? "NOVA";
}

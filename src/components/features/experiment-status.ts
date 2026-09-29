export const EXP_STATUS: Record<string, { label: string; tone: "accent" | "positive" | "neutral" | "info" }> = {
  planned: { label: "מתוכנן", tone: "info" },
  active: { label: "פעיל", tone: "accent" },
  completed: { label: "הסתיים", tone: "positive" },
  cancelled: { label: "בוטל", tone: "neutral" },
};

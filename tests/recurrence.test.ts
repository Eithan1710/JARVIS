import { describe, expect, it } from "vitest";
import { localParts } from "@/lib/dates";
import { describeRecurrence, describeWhen, nextOccurrence, parseLocalDateTime } from "@/lib/recurrence";

const TZ = "Asia/Jerusalem";
const local = (d: Date | null) => {
  if (!d) return null;
  const p = localParts(d, TZ);
  return `${p.date} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

describe("parseLocalDateTime", () => {
  it("reads local wall-clock time in the user's timezone", () => {
    expect(local(parseLocalDateTime("2026-09-30T20:00", TZ))).toBe("2026-09-30 20:00");
    expect(local(parseLocalDateTime("2026-09-30 7:05", TZ))).toBe("2026-09-30 07:05");
  });
  it("trusts explicit offsets", () => {
    expect(parseLocalDateTime("2026-09-30T17:00:00Z", TZ)?.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });
  it("rejects garbage", () => {
    expect(parseLocalDateTime("tomorrow", TZ)).toBeNull();
  });
});

describe("nextOccurrence", () => {
  const now = parseLocalDateTime("2026-09-30T21:30", TZ)!; // Wednesday evening

  it("daily: later today or tomorrow", () => {
    expect(local(nextOccurrence({ freq: "daily", time: "22:00" }, now, TZ))).toBe("2026-09-30 22:00");
    expect(local(nextOccurrence({ freq: "daily", time: "21:00" }, now, TZ))).toBe("2026-10-01 21:00");
  });

  it("weekly on chosen weekdays", () => {
    // Sunday (0) and Tuesday (2)
    expect(local(nextOccurrence({ freq: "weekly", days: [0, 2], time: "08:00" }, now, TZ))).toBe("2026-10-04 08:00");
  });

  it("every 2 weeks from the anchor week", () => {
    const rule = { freq: "weekly" as const, days: [3], time: "09:00", start: "2026-09-30", interval: 2 };
    const first = nextOccurrence(rule, parseLocalDateTime("2026-09-30T08:00", TZ)!, TZ);
    expect(local(first)).toBe("2026-09-30 09:00");
    expect(local(nextOccurrence(rule, first!, TZ))).toBe("2026-10-14 09:00");
  });

  it("monthly clamps to the end of short months", () => {
    const rule = { freq: "monthly" as const, time: "10:00", start: "2026-01-31" };
    expect(local(nextOccurrence(rule, parseLocalDateTime("2026-02-01T00:00", TZ)!, TZ))).toBe("2026-02-28 10:00");
  });

  it("respects until", () => {
    expect(nextOccurrence({ freq: "daily", time: "22:00", until: "2026-09-30T10:00:00Z" }, now, TZ)).toBeNull();
  });

  it("stays at the same wall-clock time across the DST change", () => {
    // Israel leaves DST on the last Sunday of October 2026 (Oct 25).
    const before = parseLocalDateTime("2026-10-24T09:00", TZ)!;
    const next = nextOccurrence({ freq: "daily", time: "08:00" }, before, TZ);
    expect(local(next)).toBe("2026-10-25 08:00");
    expect(local(nextOccurrence({ freq: "daily", time: "08:00" }, next!, TZ))).toBe("2026-10-26 08:00");
  });
});

describe("Hebrew descriptions", () => {
  const now = parseLocalDateTime("2026-09-30T10:00", TZ)!;
  it("describes when", () => {
    expect(describeWhen(parseLocalDateTime("2026-09-30T20:00", TZ)!, now, TZ)).toBe("היום ב־20:00");
    expect(describeWhen(parseLocalDateTime("2026-10-01T09:00", TZ)!, now, TZ)).toBe("מחר ב־09:00");
    expect(describeWhen(parseLocalDateTime("2026-10-02T09:00", TZ)!, now, TZ)).toBe("ביום שישי ב־09:00");
  });
  it("describes recurrence", () => {
    expect(describeRecurrence({ freq: "daily", time: "21:00" })).toBe("כל יום ב־21:00");
    expect(describeRecurrence({ freq: "weekly", days: [0, 1, 2, 3, 4], time: "07:30" })).toBe("בימים א׳–ה׳ ב־07:30");
  });
});

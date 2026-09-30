import { describe, expect, it } from "vitest";

const { htmlToText, isFetchableUrl } = await import("@/server/tools/builtin/web");
const { searchTerms } = await import("@/server/services/text");

describe("fetch_url safety", () => {
  it("blocks private and non-http addresses", () => {
    for (const u of ["http://localhost:3000", "http://127.0.0.1/", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest", "file:///etc/passwd", "http://user:pw@example.com"]) {
      expect(isFetchableUrl(u)).toBeNull();
    }
    expect(isFetchableUrl("https://example.com/a")).not.toBeNull();
  });
  it("turns HTML into readable text", () => {
    const { title, text } = htmlToText("<html><head><title>Hi</title><style>x{}</style></head><body><p>שלום &amp; ברוך</p><script>evil()</script></body></html>");
    expect(title).toBe("Hi");
    expect(text).toBe("שלום & ברוך");
  });
});

describe("searchTerms", () => {
  it("drops stopwords and strips Hebrew prefixes", () => {
    expect(searchTerms("מה אמרתי לך על הפרויקט בגיטהאב?")).toEqual(["אמרתי", "פרויקט", "גיטהאב"]);
  });
});

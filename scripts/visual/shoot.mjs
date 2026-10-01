// Visual check (CI): captures the main states on an iPhone-sized and a desktop viewport.
// Usage: node scripts/visual/shoot.mjs <outDir>
import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const targets = [
  { name: "iphone", ctx: { ...devices["iPhone 13"], locale: "he-IL", colorScheme: "dark" } },
  { name: "desktop", ctx: { viewport: { width: 1440, height: 900 }, locale: "he-IL", colorScheme: "dark" } },
];

const line = (o) => JSON.stringify(o) + "\n";
const fakeTurn = [
  line({ type: "meta", conversationId: "11111111-1111-4111-8111-111111111111", userMessageId: "u-live" }),
  line({ type: "step", step: { id: "s1", kind: "tool", label: "יוצר תזכורת", state: "done", detail: "create_reminder · 41ms" } }),
  line({ type: "chip", chip: { icon: "bell", text: "להתקשר לאמא · היום ב־20:00" } }),
  line({ type: "step", step: { id: "s2", kind: "tool", label: "פותח את Spotify", state: "done", detail: "open_spotify · 2ms" } }),
  line({ type: "action", action: { type: "open_url", url: "https://open.spotify.com/search/lofi", label: "Spotify · lofi beats", icon: "music" } }),
  line({ type: "reply", messageId: "a-live", text: "סגור. **ב־20:00** אזכיר לך להתקשר לאמא, ובינתיים הנה lofi לעבודה — לחיצה אחת והוא מתנגן.", createdAt: new Date().toISOString() }),
  line({ type: "done" }),
].join("");

let seeded = false;
for (const t of targets) {
  const context = await browser.newContext({ ...t.ctx, permissions: ["microphone"] });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && console.log(`[${t.name}] console:`, m.text()));
  await page.goto(`${base}/`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${t.name}-1-empty.png` });

  if (!seeded) {
    execSync(`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/visual/seed.sql`, { stdio: "inherit" });
    seeded = true;
  }
  await page.goto(`${base}/?c=11111111-1111-4111-8111-111111111111`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${t.name}-2-conversation.png` });
  await page.click('button:has-text("מה עשיתי")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${t.name}-3-details.png` });

  await page.click('button[aria-label="שיחות"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${t.name}-4-drawer.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // A live turn with a scripted stream: thinking state, then the result with an action card.
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route("**/api/chat", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: fakeTurn });
  });
  await page.fill("textarea", "תזכיר לי ב־20:00 להתקשר לאמא ותשים לי lofi");
  await page.click('button[aria-label="שלח"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${t.name}-5-thinking.png` });
  release();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${t.name}-6-reply.png` });

  // Voice mode (fake microphone).
  await page.click('button[aria-label="דבר עם JARVIS"]');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${t.name}-7-voice.png` });
  await context.close();
}
await browser.close();
console.log("screenshots saved to", out);

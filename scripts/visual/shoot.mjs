// Visual check (CI): logs in, captures the empty state, a seeded conversation and the drawer
// on an iPhone-sized and a desktop viewport. Usage: node scripts/visual/shoot.mjs <outDir>
import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const targets = [
  { name: "iphone", ctx: { ...devices["iPhone 13"], locale: "he-IL", colorScheme: "dark" } },
  { name: "iphone-light", ctx: { ...devices["iPhone 13"], locale: "he-IL", colorScheme: "light" } },
  { name: "desktop", ctx: { viewport: { width: 1440, height: 900 }, locale: "he-IL", colorScheme: "dark" } },
];

let seeded = false;
for (const t of targets) {
  const context = await browser.newContext(t.ctx);
  const page = await context.newPage();
  await page.goto(`${base}/unlock`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${t.name}-0-unlock.png` });
  await page.fill("#code", process.env.APP_PASSCODE ?? "1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${base}/`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${t.name}-1-empty.png` });

  if (!seeded) {
    execSync(`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/visual/seed.sql`, { stdio: "inherit" });
    seeded = true;
  }
  await page.goto(`${base}/?c=11111111-1111-4111-8111-111111111111`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${t.name}-2-conversation.png` });
  await page.click('button:has-text("פרטים")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${t.name}-3-details.png` });

  await page.click('button[aria-label="שיחות"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${t.name}-4-drawer.png` });
  await page.keyboard.press("Escape");

  // A live turn without AI keys: shows the thinking state and the "no brain yet" reply.
  await page.fill("textarea", "היי ג׳רוויס");
  await page.click('button[aria-label="שלח"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/${t.name}-5-thinking.png` });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${t.name}-6-after.png` });
  await context.close();
}
await browser.close();
console.log("screenshots saved to", out);

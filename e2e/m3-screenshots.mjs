import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "/tmp/m3_shots";
mkdirSync(OUT, { recursive: true });
const URL = process.env.M3_URL || "http://localhost:5175/";
const TABS = ["wishlist", "bucket", "countdowns", "mood", "qotd", "gifts"];

async function shoot(colorScheme) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const msgs = [];
  page.on("console", (m) => msgs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => msgs.push(`pageerror: ${e.message}`));

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.locator("nav ul li button").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);

  const navButtons = page.locator("nav ul li button");
  const count = await navButtons.count();

  // Full-page shot of the initial tab.
  await page.screenshot({ path: `${OUT}/${colorScheme}-00-wishlist.png`, fullPage: true });

  for (let i = 0; i < count; i++) {
    await navButtons.nth(i).click();
    await page.waitForTimeout(450);
    const name = TABS[i] ?? `tab${i}`;
    await page.screenshot({ path: `${OUT}/${colorScheme}-${String(i).padStart(2, "0")}-${name}.png` });
  }

  // Capture a modal (open the add modal on wishlist).
  await navButtons.nth(0).click();
  await page.waitForTimeout(300);
  const addBtns = page.getByRole("button", { name: /\+/ }).or(page.locator("header button").last());
  await addBtns.first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${colorScheme}-modal.png` });

  await browser.close();
  return msgs.slice(0, 10);
}

const lightErrs = await shoot("light");
const darkErrs = await shoot("dark");
console.log("light console:", JSON.stringify(lightErrs));
console.log("dark console:", JSON.stringify(darkErrs));
console.log("DONE");

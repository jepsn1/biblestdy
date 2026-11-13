// UI review evidence pack: screenshots of every screen/overlay + axe-core audit.
// Usage (from a dir with `npm i playwright axe-core`): see docs/REVIEW-PROCESS.md.
// Env: BASE (dev web url), COOKIES (curl cookie jar with better-auth.session_token), OUT (output dir).
// Seeds are not created here — run seed.sh first. Shots that fail print FAIL and are skipped.
import { chromium } from "playwright";
import fs from "node:fs";
const OUT = process.env.OUT ?? "./review-out", BASE = process.env.BASE ?? "http://localhost:5173", WEB = "9879dbb7cfe39e4d-01";
const token = fs.readFileSync(process.env.COOKIES ?? "cookies.txt", "utf8").split("\n").find((l) => l.includes("session_token")).split("\t")[6];
const axeSrc = fs.readFileSync(new URL(import.meta.resolve("axe-core/axe.min.js")).pathname, "utf8");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const audits = {};
async function ctxFor({ w = 1440, h = 900, theme = "light", lang = "en", auth = true, style = "paper" }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 640 ? 2 : 1, hasTouch: w < 640, locale: lang === "da" ? "da-DK" : "en-US" });
  if (auth) await ctx.addCookies([{ name: "better-auth.session_token", value: token, domain: "localhost", path: "/" }]);
  await ctx.addInitScript(([theme, lang, style, WEB]) => { localStorage.setItem("translationId", WEB); localStorage.setItem("theme", theme); localStorage.setItem("i18nextLng", lang); localStorage.setItem("lang", lang); localStorage.setItem("readerStyle", style); }, [theme, lang, style, WEB]);
  return ctx;
}
async function shot(name, opts, path, steps = async () => {}, audit = false) {
  const ctx = await ctxFor(opts); const page = await ctx.newPage();
  try {
    await page.goto(BASE + path); await page.waitForTimeout(2500);
    await steps(page); await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (audit) {
      await page.addScriptTag({ content: axeSrc });
      const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, targets: v.nodes.slice(0, 4).map(n => n.target.join(" ")) })));
      audits[name] = r;
    }
    console.log("ok", name);
  } catch (e) { console.log("FAIL", name, e.message.split("\n")[0]); }
  await ctx.close();
}
const click = (label) => async (p) => { await p.getByRole("button", { name: label }).first().click(); await p.waitForTimeout(800); };
const R = "/read/JHN/3";
await shot("01-signin-desktop", { auth: false }, "/signin", undefined, true);
await shot("02-signin-phone", { auth: false, w: 390, h: 844 }, "/signin");
await shot("03-reader-desktop-paper", {}, R, undefined, true);
await shot("04-reader-desktop-clean-dark", { theme: "dark", style: "clean" }, R, undefined, true);
await shot("05-reader-da", { lang: "da" }, R);
await shot("06-sidebar-closed", {}, R, click(/books sidebar|Toggle Sidebar/i));
await shot("09-jump-box-suggestions", {}, R, async (p) => { await p.keyboard.press("/"); await p.keyboard.type("joh"); await p.waitForTimeout(600); });
await shot("10-selection-menu", {}, R, async (p) => { const a = await p.locator('[data-verse="20"][data-word="1"]').first().boundingBox(); const b = await p.locator('[data-verse="20"][data-word="6"]').first().boundingBox(); await p.mouse.move(a.x + 4, a.y + 6); await p.mouse.down(); await p.mouse.move(b.x + 8, b.y + 6, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(800); }, true);
await shot("12-connections-panel", {}, R, click(/connections panel/i), true);
await shot("13-settings-open", {}, R, click(/Account & settings/i), true);
await shot("14-keyboard-focus", {}, R, async (p) => { for (let i = 0; i < 6; i++) { await p.keyboard.press("Tab"); await p.waitForTimeout(120); } });
await shot("15-topic-page", {}, "/topic/new-birth", undefined, true);
await shot("16-privacy", {}, "/privacy", undefined, true);
await shot("17-zoom-200-equiv", { w: 720, h: 450 }, R);
await shot("20-phone-reader", { w: 390, h: 844 }, R, undefined, true);
await shot("21-phone-menu-sidebar", { w: 390, h: 844 }, R, click(/books sidebar|Toggle Sidebar/i));
await shot("22-phone-jump", { w: 390, h: 844 }, R, click(/Go to reference/i));
await shot("23-phone-settings", { w: 390, h: 844 }, R, click(/Account & settings/i));
await shot("25-phone-connections", { w: 390, h: 844, theme: "dark", style: "clean" }, R, click(/connections panel/i));
await shot("26-phone-annotations-toggle", { w: 390, h: 844 }, R, click(/annotation boxes/i));
await shot("27-phone-selection", { w: 390, h: 844 }, R, async (p) => { await p.locator('[data-verse="16"][data-word="3"]').first().tap(); await p.waitForTimeout(800); });
await shot("28-tablet-landscape", { w: 1180, h: 820 }, R);
const combo = (label) => async (p) => { await p.getByRole("combobox", { name: label }).first().click(); await p.waitForTimeout(800); };
const note = async (p) => { await p.getByTitle("The bronze serpent").first().click(); await p.waitForTimeout(1200); };
await shot("07-chapter-select-open", {}, R, combo(/^Chapter/i), true);
await shot("08-translation-select-open", {}, R, combo(/^Translation/i));
await shot("11-note-open", {}, R + "?v=14", note, true);
await shot("24-phone-note", { w: 390, h: 844 }, R + "?v=14", async (p) => { await p.getByRole("button", { name: /annotation boxes/i }).first().click(); await p.waitForTimeout(600); await note(p); });
fs.writeFileSync(`${OUT}/axe.json`, JSON.stringify(audits, null, 1));
await browser.close();


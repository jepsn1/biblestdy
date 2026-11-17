// #230 regression check (phone): open + close every drawer N times, then a tap on a word must
// still start a selection (two handles + the pill). iOS and Android UA, real touch events.
// Usage (from a dir with `npm i playwright`), after seed.sh:
//   BASE=http://localhost:5173 COOKIES=cookies.txt node tools/review/tap-after-drawers.mjs
// Words tapped (12:3, 7:2, 30:2) are clear of seed.sh's ink, so a tap is a plain tap-select.
// Env: N (cycles per drawer, default 4), UAS (default ios,android), CLIENT_IP (own rate-limit bucket).
//
// Tap a word only once it is on screen and the text has settled. Playwright's locator.tap()
// scrolls an off-screen word in and touches it the same millisecond, and the tap rule (#195,
// app/reader/tap-rule.ts) reads a touch that soon after a scroll as stopping a fling — no tap.
// That, not a drawer, is what #230 saw: opening a note scrolls the text to it, the next
// locator.tap() on a word above had to scroll back, and the "tap" was refused. The last check
// here pins that down so it is not mistaken for a bug again.
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:5173";
const N = Number(process.env.N ?? 4);
const token = fs.readFileSync(process.env.COOKIES ?? "cookies.txt", "utf8").split("\n").find((l) => l.includes("session_token")).split("\t")[6];
const UA = {
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};
const browser = await chromium.launch();
let fails = 0;
const ok = (cond, msg) => { if (!cond) fails++; console.log(cond ? "PASS" : "FAIL", msg); };
const word = (v, w) => `[data-verse="${v}"][data-word="${w}"]`;

for (const ua of (process.env.UAS ?? "ios,android").split(",")) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: UA[ua], ...(process.env.CLIENT_IP ? { extraHTTPHeaders: { "X-Forwarded-For": process.env.CLIENT_IP } } : {}) });
  await ctx.addCookies([{ name: "better-auth.session_token", value: token, url: BASE }]);
  await ctx.addInitScript(() => { localStorage.setItem("translationId", "9879dbb7cfe39e4d-01"); localStorage.setItem("firstUseHintDone", "1"); localStorage.setItem("supportSnoozedUntil", String(Date.now() + 9e9)); });
  await ctx.request.patch(BASE + "/api/preferences", { data: { readerStyle: "paper", textSize: 100 }, headers: { Origin: process.env.ORIGIN ?? BASE } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/read/JHN/3");
  await p.waitForSelector("[data-verse][data-word]", { timeout: 30000 });
  await p.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pt) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pt ? [pt] : [] });
  const dialogs = () => p.getByRole("dialog").count();
  const centre = (s) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, s);
  /** A fingertip tap: down, ~80ms, up — on a word already in view and settled. */
  async function tapWord(v, w, { settle = true } = {}) {
    await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), word(v, w));
    if (settle) await p.waitForTimeout(400);
    const at = await centre(word(v, w));
    await touch("touchStart", at); await p.waitForTimeout(80); await touch("touchEnd");
    await p.waitForTimeout(700);
  }
  const selected = () => p.evaluate(() => ({
    handles: document.querySelectorAll("body > [data-selection-ui].fixed.-translate-x-1\\/2").length,
    pill: !!document.querySelector("[role=group][data-selection-ui]"),
  }));
  const letGo = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(400); };
  const pillMore = () => p.locator("[role=group][data-selection-ui] button", { hasText: "More" }).tap();
  const navBtn = (name) => p.getByRole("button", { name }).first().tap();
  const inMore = async (name) => { await navBtn(/^More$/); await p.waitForTimeout(800); await p.getByRole("dialog").getByRole("button", { name }).tap(); };
  const DRAWERS = {
    book: () => navBtn(/choose book and chapter/),
    translation: () => navBtn(/^Translation:/),
    search: () => navBtn(/^Search or go to/),
    more: () => navBtn(/^More$/),
    account: () => inMore(/^Settings/),
    notesPanel: () => inMore(/^Notes/),
    selection: async () => { await tapWord(7, 2); await pillMore(); },
    compare: async () => { await tapWord(7, 2); await pillMore(); await p.waitForTimeout(800); await p.getByRole("button", { name: "Compare translations" }).tap(); await p.waitForTimeout(1200); },
    note: async () => { const b = p.getByRole("button", { name: /^Open note/ }).first(); await b.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await b.tap(); await p.waitForTimeout(1500); },
  };
  let k = 0;
  async function closeAll() {
    for (let i = 0; i < 4 && (await dialogs()); i++) {
      const how = ["button", "backdrop", "escape", "swipe"][k++ % 4];
      if (how === "escape") await p.keyboard.press("Escape");
      else if (how === "backdrop") await p.touchscreen.tap(195, 15);
      else if (how === "swipe") {
        const r = await p.evaluate(() => { const d = [...document.querySelectorAll('[data-slot="drawer-popup"]')].pop()?.getBoundingClientRect(); return d && { x: d.x + d.width / 2, y: d.y + 30 }; });
        if (!r) await p.keyboard.press("Escape");
        else { await touch("touchStart", r); for (let s = 1; s <= 12; s++) { await touch("touchMove", { x: r.x, y: r.y + s * 40 }); await p.waitForTimeout(16); } await touch("touchEnd"); }
      } else {
        const c = p.getByRole("dialog").last().getByRole("button", { name: /^Close/ }).first();
        if (await c.count()) await c.tap(); else await p.keyboard.press("Escape");
      }
      await p.waitForTimeout(700);
    }
  }

  await tapWord(12, 3);
  ok((await selected()).handles === 2, `[${ua}] baseline: tap selects`);
  await letGo();
  for (const [name, open] of Object.entries(DRAWERS)) {
    let opened = 0;
    for (let i = 0; i < N; i++) {
      await open().catch((e) => console.log("  could not open", name, e.message.split("\n")[0]));
      await p.waitForTimeout(800);
      if (await dialogs()) opened++;
      await closeAll();
    }
    await tapWord(12, 3);
    const s = await selected();
    ok(opened === N && s.handles === 2 && s.pill, `[${ua}] ${name} opened+closed ${opened}/${N}x → tap selects (${JSON.stringify(s)})`);
    await letGo();
  }
  // The #230 cause: a touch the instant the text scrolled is refused (it stops a fling)…
  await p.evaluate(() => document.querySelectorAll('[data-slot="scroll-area-viewport"]').forEach((e) => (e.scrollTop = 0)));
  await p.waitForTimeout(500);
  await tapWord(30, 2, { settle: false });
  ok((await selected()).handles === 0, `[${ua}] touch right after a scroll is no tap (#195, by design)`);
  // …and the same word, once settled, selects
  await tapWord(30, 2);
  ok((await selected()).handles === 2, `[${ua}] same word once settled → selects`);
  await letGo();
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);

// #251 safe-area evidence: iPhone 15 viewports with simulated insets.
// Technique: the app reads every inset through the app.css tokens --safe-top/right/bottom/left
// (= env(safe-area-inset-*)); this script overrides those tokens with an injected stylesheet
// (html:root beats :root) and draws the iPhone's hardware zones on top (red-tinted status bar /
// Dynamic Island / notch / home-indicator strips + a home-indicator pill), pointer-events none.
// The dark frame is the screen's ~55pt corner radius. Anything interactive inside a red strip is a bug.
// Usage (from a dir with `npm i playwright`), after seed.sh:
//   BASE=http://localhost:5173 COOKIES=cookies.txt OUT=shots node tools/review/safe-area-shots.mjs
// Env: ONLY (surfaces, e.g. reader,palette), SCEN (p-app,p-notch,p-safari,l-app,l-safari), THEMES, TAG.
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "./shots";
const token = fs.readFileSync(process.env.COOKIES ?? "cookies.txt", "utf8").split("\n").find((l) => l.includes("session_token")).split("\t")[6];
fs.mkdirSync(OUT, { recursive: true });
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

// iPhone 15 (393x852 pt). Standalone = home-screen app / native shell (runs under the
// status bar: worst case). Safari = toolbars visible (portrait: no insets; landscape: sides).
export const SCEN = {
  "p-app": { w: 393, h: 852, top: 59, right: 0, bottom: 34, left: 0, island: "top" },
  "p-notch": { w: 390, h: 844, top: 47, right: 0, bottom: 34, left: 0, island: "notch" },
  "p-safari": { w: 393, h: 659, top: 0, right: 0, bottom: 0, left: 0 },
  "l-app": { w: 852, h: 393, top: 0, right: 59, bottom: 21, left: 59, island: "left" },
  "l-safari": { w: 852, h: 342, top: 0, right: 59, bottom: 21, left: 59, island: "left" },
};

const browser = await chromium.launch();
let fails = 0;
async function page(s, { theme = "light", auth = true, lang = "en", style = "paper", textSize = 100, init = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: UA, locale: lang === "da" ? "da-DK" : "en-US" });
  if (auth) await ctx.addCookies([{ name: "better-auth.session_token", value: token, url: BASE }]);
  await ctx.addInitScript(([s, theme, lang, style, textSize, init]) => {
    localStorage.setItem("theme", theme); localStorage.setItem("i18nextLng", lang); localStorage.setItem("lang", lang);
    localStorage.setItem("readerStyle", style); localStorage.setItem("textSize", String(textSize));
    localStorage.setItem("firstUseHintDone", "1"); localStorage.setItem("supportSnoozedUntil", String(Date.now() + 9e9));
    for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v);
    const css = `html:root{--safe-top:${s.top}px!important;--safe-right:${s.right}px!important;--safe-bottom:${s.bottom}px!important;--safe-left:${s.left}px!important}`;
    const add = () => {
      const st = document.createElement("style"); st.textContent = css; document.head.append(st);
      const z = document.createElement("div"); z.id = "__insets";
      z.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
      const strip = (css) => { const d = document.createElement("div"); d.style.cssText = `position:absolute;background:rgba(255,0,0,.18);${css}`; z.append(d); };
      if (s.top) strip(`left:0;right:0;top:0;height:${s.top}px`);
      if (s.bottom) strip(`left:0;right:0;bottom:0;height:${s.bottom}px`);
      if (s.left) strip(`left:0;top:0;bottom:0;width:${s.left}px`);
      if (s.right) strip(`right:0;top:0;bottom:0;width:${s.right}px`);
      const pill = (css) => { const d = document.createElement("div"); d.style.cssText = `position:absolute;background:#000;border-radius:99px;${css}`; z.append(d); };
      if (s.bottom) pill(`left:50%;bottom:8px;width:${s.w > s.h ? 200 : 134}px;height:5px;transform:translateX(-50%);opacity:.8`);
      if (s.island === "top") pill("left:50%;top:11px;width:125px;height:37px;transform:translateX(-50%)");
      if (s.island === "notch") pill("left:50%;top:-2px;width:160px;height:34px;transform:translateX(-50%);border-radius:0 0 20px 20px");
      if (s.island === "left") pill("left:11px;top:50%;width:37px;height:125px;transform:translateY(-50%)");
      // The screen's rounded corners (~55pt on iPhone 15): what lies outside is not on the glass
      const W = s.w, H = s.h, R = 55;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", W); svg.setAttribute("height", H); svg.style.cssText = "position:absolute;inset:0";
      svg.innerHTML = `<path fill="rgba(0,0,0,.85)" fill-rule="evenodd" d="M0 0H${W}V${H}H0Z M${R} 0H${W - R}A${R} ${R} 0 0 1 ${W} ${R}V${H - R}A${R} ${R} 0 0 1 ${W - R} ${H}H${R}A${R} ${R} 0 0 1 0 ${H - R}V${R}A${R} ${R} 0 0 1 ${R} 0Z"/>`;
      z.append(svg);
      document.documentElement.append(z);
    };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  }, [s, theme, lang, style, textSize, init]);
  if (auth) await ctx.request.patch(BASE + "/api/preferences", { data: { readerStyle: style, textSize }, headers: { Origin: BASE } });
  return { ctx, p: await ctx.newPage() };
}

/** Interactive elements whose box reaches into a hardware zone (status bar, home indicator, notch side). */
const intrusions = (p, s) => p.evaluate((s) => {
  const out = [];
  const sel = "button,a[href],input,textarea,select,[role=button],[role=menuitem],[role=tab],[role=option],[role=radio],[contenteditable=true]";
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || e.closest("[inert],[aria-hidden=true]")) continue;
    // visible on screen and topmost somewhere in its box
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(e === hit || e.contains(hit))) continue;
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    const z = [];
    if (s.top && r.top < s.top - 0.5) z.push("top");
    if (s.bottom && r.bottom > innerHeight - s.bottom + 0.5) z.push("bottom");
    if (s.left && r.left < s.left - 0.5) z.push("left");
    if (s.right && r.right > innerWidth - s.right + 0.5) z.push("right");
    if (z.length) out.push({ z: z.join("+"), el: (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 40), r: [r.left, r.top, r.right, r.bottom].map(Math.round) });
  }
  return out;
}, s);

const R = "/read/JHN/3";
const ONLY = process.env.ONLY?.split(",");
const tap = async (p, sel) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await p.waitForTimeout(450); await l.tap(); await p.waitForTimeout(900); };
const btn = (name) => async (p) => { await p.getByRole("button", { name }).first().click(); await p.waitForTimeout(900); };
const word = (v, w) => `[data-verse="${v}"][data-word="${w}"]`;

export const SURF = {
  reader: { path: R },
  selection: { path: R, steps: (p) => tap(p, word(1, 2)) },
  palette: { path: R, steps: async (p) => { const b = p.locator("[data-bar-search]"); if (await b.count() && await b.first().isVisible()) await b.first().click(); else await p.keyboard.press("Control+k"); await p.waitForTimeout(1200); } },
  compare: { path: R, steps: async (p, s) => { if (s.w < 640) { await tap(p, word(1, 2)); await p.getByRole("button", { name: /^More$/ }).last().click(); await p.waitForTimeout(800); await p.getByRole("menuitem", { name: /^Compare/ }).or(p.getByRole("button", { name: /^Compare/ })).first().click(); } else { await p.keyboard.press("Control+k"); await p.waitForTimeout(800); await p.keyboard.type("compare"); await p.waitForTimeout(800); await p.getByRole("option", { name: /^Compare/ }).first().click(); } await p.waitForTimeout(1800); } },
  settings: { path: R, steps: async (p) => { const chip = p.getByRole("button", { name: /Account & settings/i }).first(); if (await chip.isVisible()) { await chip.click(); } else { await p.getByRole("button", { name: /^More$/ }).first().click(); await p.waitForTimeout(800); await p.getByRole("button", { name: /^Settings/ }).first().click(); } await p.waitForTimeout(1000); } },
  more: { path: R, steps: btn(/^(More|Mere)$/) },
  translation: { path: R, steps: btn(/^Translation:/i) },
  signin: { path: "/signin", auth: false },
  landing: { path: "/", auth: false },
  notes: { path: "/notes" },
  notice: { path: R, steps: async (p) => { await p.evaluate(() => import("/app/lib/notify.ts").then((m) => m.notifyUndo("Highlight removed", async () => {}))); await p.waitForTimeout(1200); } },
  tour: { path: "/notes", init: { notesTourDone: "" }, steps: async (p) => { await p.waitForTimeout(800); } },
  privacy: { path: "/privacy", auth: false },
};

const scens = (process.env.SCEN ?? Object.keys(SCEN).join(",")).split(",");
const themes = (process.env.THEMES ?? "light,dark").split(",");
const report = {};
for (const [name, surf] of Object.entries(SURF)) {
  if (ONLY && !ONLY.includes(name)) continue;
  for (const sc of scens) for (const theme of themes) {
    const s = SCEN[sc];
    const id = `${name}-${sc}-${theme}${process.env.TAG ? "-" + process.env.TAG : ""}`;
    const { ctx, p } = await page(s, { theme, auth: surf.auth !== false, init: surf.init ?? {}, lang: process.env.LANG2 ?? "en", textSize: Number(process.env.TEXT ?? 100) });
    try {
      await p.goto(BASE + surf.path); await p.waitForTimeout(2200);
      if (surf.steps) await surf.steps(p, s);
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${OUT}/${id}.png` });
      const hits = await intrusions(p, s);
      report[id] = hits;
      if (hits.length) { fails++; console.log("FAIL", id, JSON.stringify(hits)); } else console.log("ok  ", id);
    } catch (e) { fails++; console.log("ERR ", id, e.message.split("\n")[0]); }
    await ctx.close();
  }
}
fs.writeFileSync(`${OUT}/intrusions${process.env.TAG ? "-" + process.env.TAG : ""}.json`, JSON.stringify(report, null, 1));
await browser.close();
console.log(fails ? `${fails} with intrusions/errors` : "all clear");

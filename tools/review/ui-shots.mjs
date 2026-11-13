// UI review evidence pack: screenshots of every screen/overlay + axe-core audit.
// Usage (from a dir with `npm i playwright axe-core`): see docs/REVIEW-PROCESS.md.
// Env: BASE (dev web url), COOKIES (curl cookie jar with better-auth.session_token), OUT (output dir),
// ONLY (optional comma list of shot-name prefixes, e.g. ONLY=34,35 — re-shoot a few after a fix),
// CLIENT_IP (optional, e.g. 203.0.113.7: sent as X-Forwarded-For so a parallel run gets its own
// auth rate-limit + reading-quota IP bucket instead of draining localhost's).
// Selection shots drag across words on the CURRENT page: words on later pages have off-screen
// boxes (the paged sheet translates them out), so a drag there selects nothing.
// Every reader shot also runs a collision check (#63): no note chip / annotation box
// ([data-ink-box]) may overlap a visible word — results in collisions.json, FAIL lines on stdout.
// Seeds are not created here — run seed.sh first. Shots that fail print FAIL and are skipped.
import { chromium } from "playwright";
import fs from "node:fs";
const OUT = process.env.OUT ?? "./review-out", BASE = process.env.BASE ?? "http://localhost:5173", WEB = "9879dbb7cfe39e4d-01";
const token = fs.readFileSync(process.env.COOKIES ?? "cookies.txt", "utf8").split("\n").find((l) => l.includes("session_token")).split("\t")[6];
const axeSrc = fs.readFileSync(new URL(import.meta.resolve("axe-core/axe.min.js")).pathname, "utf8");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const audits = {};
async function ctxFor({ w = 1440, h = 900, theme = "light", lang = "en", auth = true, style = "paper", textSize = 100 }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 640 ? 2 : 1, hasTouch: w < 640, locale: lang === "da" ? "da-DK" : "en-US", ...(process.env.CLIENT_IP ? { extraHTTPHeaders: { "X-Forwarded-For": process.env.CLIENT_IP } } : {}) });
  if (auth) await ctx.addCookies([{ name: "better-auth.session_token", value: token, domain: "localhost", path: "/" }]);
  await ctx.addInitScript(([theme, lang, style, WEB, textSize]) => { localStorage.setItem("translationId", WEB); localStorage.setItem("theme", theme); localStorage.setItem("i18nextLng", lang); localStorage.setItem("lang", lang); localStorage.setItem("readerStyle", style); localStorage.setItem("textSize", String(textSize)); }, [theme, lang, style, WEB, textSize]);
  return ctx;
}
const ONLY = process.env.ONLY?.split(",");
const collisions = {};
/** Ink boxes vs words actually on screen (inside the clipped sheet / scroll viewport). */
const collide = (page) => page.evaluate(() => {
  const text = document.getElementById("chapter-text");
  if (!text) return null;
  let clip = text.parentElement;
  while (clip && getComputedStyle(clip).overflow === "visible") clip = clip.parentElement;
  const c = (clip ?? document.body).getBoundingClientRect();
  const inClip = (r) => r.width > 0 && r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom;
  const words = [...text.querySelectorAll("[data-word]")].map((e) => e.getBoundingClientRect()).filter(inClip);
  const hits = [];
  for (const e of document.querySelectorAll("[data-ink-box]")) {
    const b = e.getBoundingClientRect();
    if (b.width === 0 || b.bottom < 0 || b.top > innerHeight) continue;
    const w = words.find((w) => Math.min(b.right, w.right) - Math.max(b.left, w.left) > 0.5 && Math.min(b.bottom, w.bottom) - Math.max(b.top, w.top) > 0.5);
    if (w) hits.push({ box: (e.getAttribute("aria-label") ?? e.textContent).slice(0, 40), at: [Math.round(b.left), Math.round(b.top)] });
  }
  return hits;
});
async function shot(name, opts, path, steps = async () => {}, audit = false) {
  if (ONLY && !ONLY.some((o) => name.startsWith(o))) return;
  const ctx = await ctxFor(opts); const page = await ctx.newPage();
  try {
    // The account's saved style + text size win over localStorage, so set them server-side per shot.
    if (opts.auth !== false) await ctx.request.patch(BASE + "/api/preferences", { data: { readerStyle: opts.style ?? "paper", textSize: opts.textSize ?? 100 }, headers: { Origin: process.env.ORIGIN ?? BASE } });
    await page.goto(BASE + path); await page.waitForTimeout(2500);
    await steps(page); await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (path.startsWith("/read")) {
      const hits = await collide(page);
      collisions[name] = hits;
      if (hits?.length) console.log("FAIL collision", name, JSON.stringify(hits));
    }
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
// #62: "Connections" is now "Notes & topics"; on phones it and the margin-notes
// toggle live in the labelled "More" sheet.
const PANEL = /^(Notes & topics|Noter og emner)$/;
const more = (row) => async (p) => { await p.getByRole("button", { name: /^(More|Mere)$/ }).first().click(); await p.waitForTimeout(700); await p.getByRole("button", { name: row }).first().click(); await p.waitForTimeout(800); };
const phonePanel = more(/^(Notes & topics|Noter og emner)/);
const phoneBoxes = async (p) => { await more(/^(Margin notes|Randnoter)/)(p); await p.keyboard.press("Escape"); await p.waitForTimeout(600); };
await shot("01-signin-desktop", { auth: false }, "/signin", undefined, true);
await shot("02-signin-phone", { auth: false, w: 390, h: 844 }, "/signin");
await shot("03-reader-desktop-paper", {}, R, undefined, true);
await shot("04-reader-desktop-clean-dark", { theme: "dark", style: "clean" }, R, undefined, true);
await shot("05-reader-da", { lang: "da" }, R);
await shot("06-sidebar-closed", {}, R, click(/books sidebar|Toggle Sidebar/i));
await shot("09-jump-box-suggestions", {}, R, async (p) => { await p.keyboard.press("/"); await p.keyboard.type("joh"); await p.waitForTimeout(600); });
/** Drag-select words on the visible page (see header), then wait for the menu. */
const drag = (verse, from, to) => async (p) => { const a = await p.locator(`[data-verse="${verse}"][data-word="${from}"]`).first().boundingBox(); const b = await p.locator(`[data-verse="${verse}"][data-word="${to}"]`).first().boundingBox(); await p.mouse.move(a.x + 4, a.y + a.height / 2); await p.mouse.down(); await p.mouse.move(b.x + b.width - 4, b.y + b.height / 2, { steps: 8 }); await p.mouse.up(); await p.getByRole("menu").waitFor({ timeout: 3000 }); };
await shot("10-selection-menu", {}, R, drag(4, 1, 6), true);
await shot("12-connections-panel", {}, R, click(PANEL), true);
await shot("13-settings-open", {}, R, click(/Account & settings/i), true);
await shot("14-keyboard-focus", {}, R, async (p) => { for (let i = 0; i < 6; i++) { await p.keyboard.press("Tab"); await p.waitForTimeout(120); } });
await shot("15-topic-page", {}, "/topic/new-birth", undefined, true);
await shot("16-privacy", {}, "/privacy", undefined, true);
await shot("17-zoom-200-equiv", { w: 720, h: 450 }, R);
await shot("20-phone-reader", { w: 390, h: 844 }, R, undefined, true);
await shot("21-phone-menu-sidebar", { w: 390, h: 844 }, R, click(/books sidebar|Toggle Sidebar/i));
await shot("22-phone-jump", { w: 390, h: 844 }, R, click(/Go to reference/i));
await shot("23-phone-settings", { w: 390, h: 844 }, R, click(/Account & settings/i), true);
await shot("25-phone-connections", { w: 390, h: 844, theme: "dark", style: "clean" }, R, phonePanel, true);
await shot("26-phone-annotations-toggle", { w: 390, h: 844 }, R, phoneBoxes);
await shot("27-phone-selection", { w: 390, h: 844 }, R, async (p) => { await p.locator('[data-verse="16"][data-word="3"]').first().tap(); await p.waitForTimeout(800); });
await shot("28-tablet-landscape", { w: 1180, h: 820 }, R);
// Accessibility (#61): skip link, real-button annotations, text size 200% (zoom lock stays), more themes audited
await shot("29-skip-link-focus", {}, R, async (p) => { await p.keyboard.press("Tab"); }, true);
await shot("30-skip-link-activated", {}, R, async (p) => { await p.keyboard.press("Tab"); await p.keyboard.press("Enter"); await p.waitForTimeout(300); if ((await p.evaluate(() => document.activeElement?.id)) !== "chapter-text") throw new Error("skip link did not focus the text"); });
await shot("31-annotation-enter", {}, R, async (p) => { const b = p.getByRole("button", { name: "water + Spirit?" }).first(); await b.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(400); if (!(await p.locator("[data-annotation-editing]").count())) throw new Error("Enter did not open the annotation"); });
await shot("32-reader-paper-dark", { theme: "dark" }, R, undefined, true);
await shot("33-reader-clean-light", { style: "clean" }, R, undefined, true);
await shot("34-text-200-desktop", { textSize: 200 }, R, undefined, true);
await shot("35-text-200-phone", { textSize: 200, w: 390, h: 844 }, R, undefined, true);
await shot("36-text-200-settings", { textSize: 200 }, R, click(/Account & settings/i), true);
await shot("37-text-200-phone-settings", { textSize: 200, w: 390, h: 844 }, R, click(/Account & settings/i), true);
await shot("38-text-200-connections", { textSize: 200 }, R, click(PANEL), true);
await shot("39-text-200-phone-sidebar", { textSize: 200, w: 390, h: 844 }, R, click(/books sidebar|Toggle Sidebar/i));
await shot("40-text-150-tablet", { textSize: 150, w: 1180, h: 820 }, R);
await shot("41-signin-da", { auth: false, lang: "da" }, "/signin", undefined, true);
const combo = (label) => async (p) => { await p.getByRole("combobox", { name: label }).first().click(); await p.waitForTimeout(800); };
const note = async (p) => { await p.getByTitle("The bronze serpent").first().click(); await p.waitForTimeout(1200); };
await shot("07-chapter-select-open", {}, R, combo(/^Chapter/i), true);
await shot("08-translation-select-open", {}, R, combo(/^Translation/i));
await shot("11-note-open", {}, R + "?v=14", note, true);
await shot("24-phone-note", { w: 390, h: 844 }, R + "?v=14", async (p) => { await phoneBoxes(p); await note(p); }, true);
await shot("42-text-200-note-open", { textSize: 200 }, R + "?v=14", note, true);
await shot("43-text-200-phone-note", { textSize: 200, w: 390, h: 844 }, R + "?v=14", async (p) => { await phoneBoxes(p); await note(p); });
// #62 overlays & settings: chooser Dialog, settings ToggleGroups, delete AlertDialog, tooltips, phone More sheet.
// Keyboard shots throw (FAIL) when focus doesn't move in / Esc doesn't close / focus doesn't return.
const PH = { w: 390, h: 844 };
const SETTINGS = /^(Account & settings|Konto og indstillinger)$/;
const chooser = async (p) => { await p.route("**/api/preferences", async (r) => { if (r.request().method() !== "GET") return r.continue(); const res = await r.fetch(); const j = await res.json(); await r.fulfill({ response: res, json: { ...j, readerStyle: null } }); }); await p.reload(); await p.waitForTimeout(2500); };
const active = (p) => p.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, label: a?.getAttribute("aria-label") ?? a?.textContent?.trim().slice(0, 40), inDialog: !!a?.closest("[role=dialog],[role=alertdialog]"), inPanel: !!a?.closest("aside") }; });
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const openSettings = async (p) => { await p.getByRole("button", { name: SETTINGS }).first().click(); await p.waitForTimeout(700); };
const askDelete = async (p) => { await openSettings(p); await p.getByRole("button", { name: /^(Delete account|Slet konto)/ }).click(); await p.waitForTimeout(700); };
const hover = (name) => async (p) => { await p.getByRole("button", { name }).first().hover(); await p.waitForTimeout(900); };
await shot("44-chooser-desktop", {}, R, chooser, true);
await shot("44b-chooser-phone-da", { ...PH, lang: "da" }, R, chooser, true);
await shot("44c-chooser-clean-dark", { theme: "dark", style: "clean" }, R, chooser, true);
await shot("45-settings-da", { lang: "da" }, R, openSettings, true);
await shot("45b-settings-clean-dark", { theme: "dark", style: "clean" }, R, openSettings, true);
await shot("45c-phone-settings-da-dark", { ...PH, lang: "da", theme: "dark" }, R, openSettings, true);
await shot("45d-settings-system-theme", { theme: "system" }, R, openSettings);
await shot("46-delete-alert", {}, R, askDelete, true);
await shot("46b-phone-delete-alert-da", { ...PH, lang: "da" }, R, askDelete, true);
await shot("47-tooltip-sidebar", {}, R, hover(/books sidebar/i));
await shot("47b-tooltip-next-page", {}, R, hover(/^Next page/));
await shot("47c-wide-labels-1180", { w: 1180, h: 820 }, R);
await shot("47d-tablet-icons-900", { w: 900, h: 820 }, R, hover(PANEL));
await shot("48-phone-more", PH, R, async (p) => { await p.getByRole("button", { name: /^More$/ }).click(); await p.waitForTimeout(800); }, true);
await shot("48b-phone-more-da-dark", { ...PH, lang: "da", theme: "dark", style: "clean" }, R, async (p) => { await p.getByRole("button", { name: /^Mere$/ }).click(); await p.waitForTimeout(800); }, true);
await shot("49-translation-select-da", { lang: "da" }, R, combo(/^Oversættelse/i));
await shot("49b-chapter-grid-phone", PH, R, combo(/^Chapter/i));
await shot("49c-connections-da-dark", { lang: "da", theme: "dark" }, R, click(PANEL), true);
await shot("49d-note-clean-dark", { theme: "dark", style: "clean" }, R + "?v=14", note, true);
await shot("49e-phone-note-da", { ...PH, lang: "da" }, R + "?v=14", async (p) => { await phoneBoxes(p); await note(p); }, true);
await shot("K1-settings-keyboard", {}, R, async (p) => { await p.getByRole("button", { name: SETTINGS }).focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(700); must((await p.locator("[data-slot=popover-content]").count()) === 1, "settings did not open"); await p.keyboard.press("Tab"); const a = await active(p); must(await p.evaluate(() => !!document.activeElement?.closest("[data-slot=popover-content]")), `focus not in settings: ${JSON.stringify(a)}`); await p.keyboard.press("Escape"); await p.waitForTimeout(500); must((await p.locator("[data-slot=popover-content]").count()) === 0, "Esc did not close settings"); must(SETTINGS.test((await active(p)).label ?? ""), `focus did not return to chip: ${JSON.stringify(await active(p))}`); });
await shot("K2-chooser-keyboard", {}, R, async (p) => { await chooser(p); must((await active(p)).inDialog, "focus not in chooser"); for (let i = 0; i < 8; i++) { await p.keyboard.press("Tab"); await p.waitForTimeout(150); must((await active(p)).inDialog, "Tab escaped the chooser"); } await p.getByRole("radio").first().focus(); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(200); must(await p.getByRole("radio").nth(1).getAttribute("aria-checked") === "true", "arrow did not move the choice"); await p.keyboard.press("Escape"); await p.waitForTimeout(800); must((await p.getByRole("dialog").count()) === 0, "Esc did not close chooser"); });
await shot("K3-delete-keyboard", {}, R, async (p) => { await askDelete(p); const a = await active(p); must(a.tag === "INPUT" && a.inDialog, `focus not in confirm field: ${JSON.stringify(a)}`); await p.keyboard.press("Escape"); await p.waitForTimeout(600); must((await p.getByRole("alertdialog").count()) === 0, "Esc did not close"); must(SETTINGS.test((await active(p)).label ?? ""), `focus did not return: ${JSON.stringify(await active(p))}`); });
await shot("K4-panel-keyboard", {}, R, async (p) => { const b = p.getByRole("button", { name: PANEL }).first(); if ((await b.getAttribute("aria-pressed")) === "true") { await b.click(); await p.waitForTimeout(500); } await b.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(800); must((await active(p)).inPanel, `focus not in panel: ${JSON.stringify(await active(p))}`); await p.keyboard.press("Escape"); await p.waitForTimeout(600); must((await p.locator("aside h2", { hasText: PANEL }).count()) === 0, "Esc did not close panel"); must(PANEL.test((await active(p)).label ?? ""), `focus did not return: ${JSON.stringify(await active(p))}`); });
await shot("K5-more-keyboard", PH, R, async (p) => { const m = p.getByRole("button", { name: /^More$/ }); await m.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(800); must((await active(p)).inDialog, "focus not in More sheet"); await p.keyboard.press("Escape"); await p.waitForTimeout(800); must(/^More$/.test((await active(p)).label ?? ""), `focus did not return: ${JSON.stringify(await active(p))}`); });
await shot("K6-segmented-arrows", {}, R, async (p) => { await openSettings(p); const url = p.url(); await p.getByRole("button", { name: /^Paper$/ }).focus(); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(300); must(/^Clean$/.test((await active(p)).label ?? ""), `arrow did not move: ${JSON.stringify(await active(p))}`); must(p.url() === url, "arrow turned the page behind settings"); await p.keyboard.press("Escape"); });
// Annotations off the text + highlight action menu (#63)
const tapHighlight = async (p) => { await p.locator('[data-verse="3"][data-word="8"]').first().click(); await p.waitForTimeout(700); };
await shot("54-highlight-menu", {}, R, async (p) => { await tapHighlight(p); if (!(await p.getByRole("menu").count())) throw new Error("no highlight menu"); }, true);
await shot("55-highlight-menu-keyboard", {}, R, async (p) => { await tapHighlight(p); await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown"); }, true);
await shot("56-annotate-composer", {}, R, async (p) => { await drag(4, 1, 6)(p); await p.getByRole("menuitem", { name: /Annotate/ }).click(); await p.waitForTimeout(600); }, true);
await shot("57-note-link-list", {}, R, async (p) => { await drag(4, 1, 6)(p); await p.getByRole("menuitem", { name: /note link/i }).click(); await p.waitForTimeout(600); }, true);
await shot("58-phone-highlight-drawer", { w: 390, h: 844 }, R, async (p) => { await p.locator('[data-verse="3"][data-word="8"]').first().tap(); await p.waitForTimeout(900); }, true);
await shot("59-phone-note-marker", { w: 390, h: 844 }, R + "?v=13", undefined, true);
await shot("60-phone-annotation-lines", { w: 390, h: 844, textSize: 150 }, R, async (p) => { await phoneBoxes(p); await p.locator('[data-verse="5"][data-word="0"]').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(400); });
await shot("61-text-200-inline-annotation", { textSize: 200 }, R + "?v=5", undefined, true);
await shot("62-text-150-note-rail", { textSize: 150 }, R + "?v=14");
await shot("63-clean-dark-highlight-menu", { theme: "dark", style: "clean" }, R, tapHighlight, true);
// Leave the account at the default size
{ const ctx = await ctxFor({}); await ctx.request.patch(BASE + "/api/preferences", { data: { readerStyle: "paper", textSize: 100 }, headers: { Origin: process.env.ORIGIN ?? BASE } }); await ctx.close(); }
fs.writeFileSync(`${OUT}/axe${ONLY ? "-partial" : ""}.json`, JSON.stringify(audits, null, 1));
fs.writeFileSync(`${OUT}/collisions${ONLY ? "-partial" : ""}.json`, JSON.stringify(collisions, null, 1));
await browser.close();


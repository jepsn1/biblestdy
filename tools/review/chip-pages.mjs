// Note chips page with their words (#164): pages through WEB John 3 and checks every
// margin chip sits on a page that shows its mark's words, level with them, and that every
// note gets its chip somewhere — two-column spread, Notes panel open (single-column pages),
// the panel opened/closed on each page, and 200% text.
// Usage (from a dir with `npm i playwright`): run seed.sh first (the 3:14-15 word note), then
//   BASE=http://localhost:5173 COOKIES=cookies.txt node tools/review/chip-pages.mjs
// Adds three temporary notes (home words 3:20, an NIV anchor on 3:31 = verse level in WEB,
// an inline ref to 3:27) and deletes them after. OUT (optional) = screenshot dir.
// Exit 1 + FAIL lines on any misplaced or missing chip.
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:5173", OUT = process.env.OUT;
const WEB = "9879dbb7cfe39e4d-01", NIV = "78a9f6124f344018-01";
const token = fs.readFileSync(process.env.COOKIES ?? "cookies.txt", "utf8").split("\n").find((l) => l.includes("session_token")).split("\t")[6];
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const api = (page, path, method = "GET", body) =>
  page.evaluate(async ([path, method, body]) => {
    const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return r.headers.get("content-type")?.includes("json") ? r.json() : null;
  }, [path, method, body]);

const ctxOf = async ({ w = 1440, h = 900 } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "better-auth.session_token", value: token, domain: "localhost", path: "/" }]);
  await ctx.addInitScript((WEB) => localStorage.setItem("translationId", WEB), WEB);
  return ctx;
};
const setupCtx = await ctxOf();
const s = await setupCtx.newPage();
await s.goto(`${BASE}/`);
const at = { book: "JHN", chapter: 3 };
const temp = [
  await api(s, "/api/notes", "POST", { ...at, translationId: WEB, startVerse: 20, startWord: 0, endVerse: 20, endWord: 5, title: "chip-pages: home words", body: "-" }),
  await api(s, "/api/notes", "POST", { ...at, translationId: NIV, startVerse: 31, startWord: 0, endVerse: 31, endWord: 4, title: "chip-pages: other translation", body: "-" }),
  await api(s, "/api/notes", "POST", { title: "chip-pages: inline ref", body: "See [John 3:27](bible:JHN.3.27)." }),
];
// Every note touching John 3, by title: the verses its chip may stand by
const ranges = {};
for (const n of await api(s, "/api/notes")) {
  const title = n.title || null;
  if (!title) continue;
  for (const a of n.anchors) if (a.book === "JHN" && a.chapter === 3) (ranges[title] ??= []).push([a.startVerse, a.endVerse]);
  for (const r of n.refs ?? []) if (r.book === "JHN" && r.chapter === 3 && r.verse) (ranges[title] ??= []).push([r.verse, r.endVerse ?? r.verse]);
}
let fails = 0;
const fail = (msg) => { fails++; console.log(`FAIL ${msg}`); };

async function run(name, { textSize = 100, mode }) {
  await api(s, "/api/preferences", "PATCH", { textSize });
  const ctx = await ctxOf();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/read/JHN/3`);
  await p.waitForSelector("#chapter-text [data-verse]", { timeout: 30000 });
  await p.waitForTimeout(1200);
  const style = p.getByRole("button", { name: /^(Continue|Fortsæt)$/ });
  if (await style.count()) { await style.click(); await p.waitForTimeout(500); }
  const toggle = async () => { await p.locator("[data-panel-toggle=connections]").first().click(); await p.waitForTimeout(1000); };
  if (mode === "panel") await toggle();
  const seen = new Set();
  const check = async (label) => {
    const chips = await p.evaluate((ranges) => {
      const box = document.getElementById("chapter-text").parentElement.getBoundingClientRect();
      return [...document.querySelectorAll("button[data-note-opener][data-ink-box]")].map((e) => {
        const title = e.getAttribute("title");
        const c = e.getBoundingClientRect();
        // The first of the mark's words on this page (a span split across pages repeats its chip)
        const word = (ranges[title] ?? []).flatMap(([from, to]) => {
          const els = [];
          for (let v = from; v <= to; v++) els.push(...document.querySelectorAll(`#chapter-text [data-verse="${v}"][data-word]`));
          return els.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.left + 1 >= box.left && r.right - 1 <= box.right);
        })[0];
        return { title, y: c.top + c.height / 2, wordY: word ? word.top + word.height / 2 : null };
      });
    }, ranges);
    for (const c of chips) {
      seen.add(c.title);
      if (c.wordY === null) fail(`${name} ${label}: chip "${c.title}" on a page without its words`);
      else if (Math.abs(c.y - c.wordY) > 40) fail(`${name} ${label}: chip "${c.title}" ${Math.round(c.y - c.wordY)}px off its line`);
    }
    if (OUT) await p.screenshot({ path: `${OUT}/chip-pages-${name}-${label}.png` });
  };
  const pages = Number((await p.evaluate(() => document.body.innerText.match(/(?:Page|Side) \d+ (?:of|af) (\d+)/)?.[1])) ?? 1);
  for (let i = 0; i < pages; i++) {
    if (i) { await p.getByRole("button", { name: /^(Next|Næste)/ }).last().click(); await p.waitForTimeout(900); }
    await check(`p${i + 1}`);
    if (mode === "toggle") { await toggle(); await check(`p${i + 1}-open`); await toggle(); await check(`p${i + 1}-closed`); }
  }
  for (const title of Object.keys(ranges)) if (!seen.has(title)) fail(`${name}: no chip for "${title}" on any page`);
  console.log(`${name}: ${pages} pages, chips for ${seen.size}/${Object.keys(ranges).length} notes`);
  await ctx.close();
}

try {
  await run("spread", { mode: "spread" });
  await run("panel", { mode: "panel" });
  await run("toggle", { mode: "toggle" });
  await run("text200", { mode: "spread", textSize: 200 });
} finally {
  await api(s, "/api/preferences", "PATCH", { textSize: 100 });
  for (const n of temp) if (n?.id) await api(s, `/api/notes/${n.id}`, "DELETE");
  await browser.close();
}
console.log(fails ? `${fails} FAIL` : "all chips on their pages");
process.exit(fails ? 1 : 0);

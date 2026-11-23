// OTA end to end, simulated on Linux (#19): Playwright plays the phone.
//
// A local server stands in for both biblestdy.com/ota (the real publisher's
// output) and the native side of @capgo/capacitor-updater: download (checked
// with capgo-mirror.mjs, as the plugin does), set, notifyAppReady, and the
// roll-back of a bundle that never calls notifyAppReady. The page gets a
// window.Capacitor whose CapacitorUpdater calls go to that server.
//
//   node apps/mobile/e2e/ota-sim.mjs <work-dir>
//   (PLAYWRIGHT=<path to playwright package> if it isn't resolvable here)
//
// It builds the web app twice (the "native build" and a later deploy with
// a visible change), publishes with the real ota.mjs, and walks through:
// launch → deploy → resume → new text; typing defers the switch; stable is
// untouched; a broken bundle rolls back and isn't retried; tampered,
// replayed and native-incompatible manifests are refused; rollback restores.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { capgoVerify } from "../scripts/capgo-mirror.mjs";

const work = path.resolve(process.argv[2] ?? "ota-sim");
const PORT = Number(process.env.PORT ?? 5919);
const ORIGIN = `http://localhost:${PORT}`;
const REPO = path.resolve(import.meta.dirname, "../../..");
const WEB = path.join(REPO, "apps/web");
const OTA = path.join(work, "ota");
const SHOTS = path.join(work, "shots");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");
const publicKey = fs.readFileSync(path.join(REPO, "apps/mobile/ota-public-key.pem"), "utf8");

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

// ---- builds -----------------------------------------------------------------

const MARK_FILE = path.join(WEB, "app/locales/en.ts");
const MARK_FROM = 'title: "Sign in",';
function build(name, { version, channel, mark }) {
  const original = fs.readFileSync(MARK_FILE, "utf8");
  if (mark) {
    if (!original.includes(MARK_FROM)) throw new Error("marker string not found in en.ts");
    fs.writeFileSync(MARK_FILE, original.replace(MARK_FROM, `title: ${JSON.stringify(mark)},`));
  }
  try {
    execFileSync("pnpm", ["build"], {
      cwd: WEB,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        OTA_VERSION: version,
        VITE_OTA_ORIGIN: ORIGIN,
        VITE_SHELL_API_ORIGIN: ORIGIN,
        ...(channel ? { VITE_OTA_CHANNEL: channel } : { VITE_OTA_CHANNEL: "" }),
      },
    });
  } finally {
    fs.writeFileSync(MARK_FILE, original);
  }
  const dir = path.join(work, name);
  fs.cpSync(path.join(WEB, "build/client"), dir, { recursive: true });
  return dir;
}

console.log("building the native build's web app (A) and a later deploy (B)…");
const A = build("a", { version: "sim-a", channel: "dev" });
const B = build("b", { version: "sim-b", mark: "Sign in (deploy B)" });
// C: a deploy whose JS dies before it renders (never calls notifyAppReady)
const C = path.join(work, "c");
fs.cpSync(B, C, { recursive: true });
for (const f of fs.readdirSync(path.join(C, "assets")).filter((f) => /^entry\.client-.*\.js$/.test(f))) {
  fs.writeFileSync(path.join(C, "assets", f), 'throw new Error("broken deploy C");');
}
const setInfo = (dir, patch) => {
  const f = path.join(dir, "ota-build.json");
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, "utf8")), ...patch }));
};
setInfo(C, { version: "sim-c" });
// D: built against other native plugins
const D = path.join(work, "d");
fs.cpSync(B, D, { recursive: true });
setInfo(D, { version: "sim-d", native: "0000000000000000" });

const ota = (...args) =>
  execFileSync(process.execPath, [path.join(REPO, "apps/mobile/scripts/ota.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, OTA_DIR: OTA, OTA_BASE_URL: `${ORIGIN}/ota` },
  }).trim();

// ---- the "phone": static app + native updater -------------------------------

const native = { bundles: { builtin: { version: "sim-a", dir: A, status: "success" } }, current: "builtin", fallback: "builtin", n: 0 };
const events = [];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".zip": "application/zip" };

function serveFile(res, file, headers = {}) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, headers).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store", ...headers });
  fs.createReadStream(file).pipe(res);
}

const body = (req) => new Promise((r) => {
  let s = "";
  req.on("data", (c) => (s += c));
  req.on("end", () => r(s ? JSON.parse(s) : {}));
});

async function nativeCall(method, opts) {
  events.push(`${method}${opts.id ? ` ${opts.id}` : opts.version ? ` ${opts.version}` : ""}`);
  switch (method) {
    case "download": {
      const res = await fetch(opts.url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      const zip = capgoVerify(publicKey, { data: Buffer.from(await res.arrayBuffer()), checksum: opts.checksum, sessionKey: opts.sessionKey });
      const id = `b${++native.n}`;
      const dir = path.join(work, "native", id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${dir}.zip`, zip);
      execFileSync("unzip", ["-q", `${dir}.zip`, "-d", dir]);
      native.bundles[id] = { version: opts.version, dir, status: "pending" };
      return { id, version: opts.version, status: "pending" };
    }
    case "set": {
      if (!native.bundles[opts.id]) throw new Error("no such bundle");
      if (native.bundles[native.current].status === "success") native.fallback = native.current;
      native.current = opts.id;
      return {};
    }
    case "notifyAppReady":
      native.bundles[native.current].status = "success";
      return { bundle: { id: native.current } };
    case "delete":
      if (opts.id !== native.current) delete native.bundles[opts.id];
      return {};
    case "checkRevert": {
      const cur = native.bundles[native.current];
      if (native.current !== "builtin" && cur.status !== "success") {
        cur.status = "error";
        events.push(`ROLLBACK ${cur.version} -> ${native.bundles[native.fallback].version}`);
        native.current = native.fallback;
        return { reverted: true };
      }
      return { reverted: false };
    }
    default:
      return {};
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  try {
    if (url.pathname.startsWith("/__native/")) {
      const out = await nativeCall(url.pathname.slice(10), await body(req));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
      return;
    }
    if (url.pathname.startsWith("/ota/")) return serveFile(res, path.join(OTA, "public", url.pathname.slice(5)), { "access-control-allow-origin": "*" });
    if (url.pathname.startsWith("/api/")) return res.writeHead(503).end();
    const root = native.bundles[native.current].dir;
    const file = path.join(root, path.normalize(url.pathname));
    serveFile(res, fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, "index.html"));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: String(e.message ?? e) }));
  }
});
await new Promise((r) => server.listen(PORT, r));

// window.Capacitor as the native bridge injects it, CapacitorUpdater → server
const BRIDGE = `(() => {
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  const promise = (...names) => names.map((name) => ({ name, rtype: "promise" }));
  let cb = 0;
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    PluginHeaders: [
      { name: "CapacitorUpdater", methods: promise("download", "set", "notifyAppReady", "delete", "list", "current", "next", "reload") },
      { name: "Keyboard", methods: [...promise("setAccessoryBarVisible", "setStyle", "setResizeMode", "hide", "show"), { name: "addListener", rtype: "callback" }, ...promise("removeListener", "removeAllListeners")] },
      { name: "SecureStorage", methods: promise("internalGetItem", "internalSetItem", "internalRemoveItem", "clearItemsWithPrefix", "getPrefixedKeys", "setSynchronize", "getSynchronize", "setDefaultKeychainAccess") },
      { name: "Haptics", methods: promise("impact", "notification", "vibrate", "selectionStart", "selectionChanged", "selectionEnd") },
    ],
    nativeCallback: () => String(++cb),
    nativePromise: async (plugin, method, options) => {
      if (plugin === "SecureStorage" && method === "internalGetItem") return { data: null };
      if (plugin !== "CapacitorUpdater") return {};
      const res = await fetch("/__native/" + method, { method: "POST", body: JSON.stringify(options ?? {}) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      // the native side reloads the web view onto the new bundle
      if (method === "set") setTimeout(() => location.reload(), 50);
      return out;
    },
  };
  // appReadyTimeout (15 s in the app; 4 s here): no notifyAppReady → roll back
  setTimeout(async () => {
    const r = await fetch("/__native/checkRevert", { method: "POST", body: "{}" }).then((r) => r.json());
    if (r.reverted) location.reload();
  }, 4000);
})();`;

// ---- the walk ---------------------------------------------------------------

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.addInitScript(BRIDGE);
const logs = [];
page.on("console", (m) => m.text().startsWith("[ota]") && logs.push(m.text()));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const heading = () => page.locator("h1").first().innerText({ timeout: 10000 }).catch(() => "(none)");
const running = () => native.bundles[native.current].version;
const resume = async () => {
  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
};
const settle = (ms = 2500) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

// The deploy of the native build's own commit: same version, nothing to do
console.log(ota("publish", "--channel", "dev", "--from", A));
await page.goto(`${ORIGIN}/signin`);
await settle();
check("launch: the native build's own web app runs", running() === "sim-a" && (await heading()) === "Sign in", `${running()} / "${await heading()}"`);
check("notifyAppReady called on boot", events.includes("notifyAppReady"));
await shot("1-launch-a");

console.log(ota("publish", "--channel", "dev", "--from", B));
// Mid-edit: something typed into the focused field
await page.locator("input").first().fill("reader@example.com");
await resume();
await settle();
check("typing: B downloaded but not switched to (never mid-edit)", running() === "sim-a" && events.some((e) => e.startsWith("download sim-b")), events.slice(-3).join(", "));
await page.locator("input").first().fill("");
await page.locator("input").first().blur();
await resume();
await settle(3500);
check("deploy → resume → the change is on screen", running() === "sim-b" && (await heading()) === "Sign in (deploy B)", `${running()} / "${await heading()}"`);
check("B confirmed (notifyAppReady) so it stays", native.bundles[native.current].status === "success");
await shot("2-after-deploy-b");

const stable = await fetch(`${ORIGIN}/ota/stable.json`);
check("stable untouched by a dev publish", stable.status === 404);

const devSigned = fs.readFileSync(path.join(OTA, "public/dev.json"), "utf8");

console.log(ota("publish", "--channel", "dev", "--from", C));
await resume();
await settle(9000); // download + switch + 4 s timeout + rollback reload + boot
check("broken deploy C rolled back natively to B", running() === "sim-b" && events.some((e) => e.startsWith("ROLLBACK sim-c")), events.filter((e) => e.startsWith("ROLLBACK")).join(", "));
check("…and the app knows C failed", logs.some((l) => l.includes("sim-c failed to start")));
const downloadsOfC = () => events.filter((e) => e === "download sim-c").length;
await resume();
await settle();
check("C is not downloaded again", downloadsOfC() === 1 && running() === "sim-b", `downloads of C: ${downloadsOfC()}`);
await shot("3-after-broken-c");

// The operator pulls C: dev back to B (the phone already runs it)
console.log(ota("rollback", "--channel", "dev"));
await resume();
await settle();
check("rollback of C: phone stays on B", running() === "sim-b");

// Tampered: same signature, edited payload
const signed = JSON.parse(fs.readFileSync(path.join(OTA, "public/dev.json"), "utf8"));
fs.writeFileSync(path.join(OTA, "public/dev.json"), JSON.stringify({ ...signed, payload: signed.payload.replace("sim-b", "sim-x") }));
await resume();
await settle();
check("tampered manifest refused", logs.some((l) => l.includes("signature invalid")));
fs.writeFileSync(path.join(OTA, "public/dev.json"), JSON.stringify(signed));

console.log(ota("publish", "--channel", "dev", "--from", D));
await resume();
await settle();
check("bundle for another native build refused", running() === "sim-b" && logs.some((l) => l.includes("sim-d: incompatible")), logs.filter((l) => l.includes("sim-d")).join(" | "));
console.log(ota("rollback", "--channel", "dev"));

// Replay: an older signed dev.json served again
const current = fs.readFileSync(path.join(OTA, "public/dev.json"), "utf8");
fs.writeFileSync(path.join(OTA, "public/dev.json"), devSigned);
await resume();
await settle();
check("replayed older manifest refused", logs.some((l) => l.includes("stale")));
fs.writeFileSync(path.join(OTA, "public/dev.json"), current);

// Roll dev back one more: B → A, and the phone follows
console.log(ota("rollback", "--channel", "dev"));
await resume();
await settle(3500);
check("rollback reaches the phone: back to A's text", running() === "sim-a" && (await heading()) === "Sign in", `${running()} / "${await heading()}"`);
await shot("4-after-rollback");
console.log(ota("status"));

fs.writeFileSync(path.join(work, "events.json"), JSON.stringify({ events, logs, results }, null, 2));
await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed — screenshots in ${SHOTS}`);
process.exit(failed.length ? 1 : 0);

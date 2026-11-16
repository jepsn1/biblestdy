// Reader bundle budget: the JS a cold /read load needs before first paint —
// the client entry + every route module on the /read match (root → read)
// with their static imports, deduped — gzipped, from React Router's build
// manifest. Lazy chunks (note editor, command palette, …) don't count:
// they load after first paint. Fails (exit 1) over budget.
// Run after `pnpm build`: `pnpm --filter @biblestdy/web bundle:check`.
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 350;
const ROUTE = "routes/read";
const client = path.resolve(import.meta.dirname, "../build/client");
const assets = path.join(client, "assets");
const file = fs.readdirSync(assets).find((f) => /^manifest-[\w-]+\.js$/.test(f));
if (!file) {
  console.error("bundle-budget: no build manifest — run `pnpm build` first");
  process.exit(2);
}
const src = fs.readFileSync(path.join(assets, file), "utf8");
const manifest = JSON.parse(src.slice(src.indexOf("=") + 1).replace(/;\s*$/, ""));

// The route chain: read → … → root
const chain = [];
for (let id = ROUTE; id; id = manifest.routes[id]?.parentId) {
  if (!manifest.routes[id]) {
    console.error(`bundle-budget: route "${id}" not in the manifest`);
    process.exit(2);
  }
  chain.unshift(manifest.routes[id]);
}
const modules = new Set();
for (const part of [manifest.entry, ...chain]) {
  for (const m of [part.module, ...(part.imports ?? [])]) if (m) modules.add(m);
}
const sizes = [...modules].map((m) => {
  const bytes = fs.readFileSync(path.join(client, m));
  return { m, gz: gzipSync(bytes).length };
});
const totalKb = sizes.reduce((s, x) => s + x.gz, 0) / 1024;
const top = [...sizes].sort((a, b) => b.gz - a.gz).slice(0, 8);
console.log(`/read first-paint JS: ${totalKb.toFixed(1)} KB gz (${sizes.length} files) — budget ${BUDGET_KB} KB`);
for (const { m, gz } of top) console.log(`  ${(gz / 1024).toFixed(1).padStart(6)} KB  ${m}`);
if (totalKb > BUDGET_KB) {
  console.error(`bundle-budget: over by ${(totalKb - BUDGET_KB).toFixed(1)} KB — lazy-load what first paint doesn't need`);
  process.exit(1);
}

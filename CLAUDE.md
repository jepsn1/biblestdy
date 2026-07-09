# biblestdy — agent notes

Product vision: `VISION.md` (manifesto — stick to it). Stack + rationale: `STACK.md`. v1 PRD: issue #1; slices: issues #2–#13 (#2, #3 done).

**Sign-off ritual:** when Marcus signs off (or asks to wrap up), update `NEXT-STEPS.md` (state line, homework, queue, watch-outs) and this file if conventions changed, commit + push everything. `NEXT-STEPS.md` is the session-to-session baton — keep it current.

## Dev

- Node ≥22.22 required (`nvm use`; system node 20 breaks React Router 8). pnpm 10 workspace.
- `pnpm dev` — builds shared, runs web (5173) + api (3001, prefix `/api`, proxied in dev). Port 3000 is often taken by another project.
- Dev server reachable from LAN (`http://192.168.18.7:5173`) and WAN at **https://dev.biblestdy.com** behind caddy basic_auth (user `marcus`, password: `/srv/infra/compose/.dev-password`). Vite binds 0.0.0.0; UFW walls off WAN.
- `pnpm test` / `pnpm typecheck` / `pnpm lint` — must be green before commit. CI mirrors these.
- `packages/shared` emits CJS to `dist/` — **rebuild (`pnpm --filter @biblestdy/shared build`) after editing it**, or api/web see stale exports. Vite prebundles it (`optimizeDeps.include`).

## Prod

- Self-hosted at **biblestdy.com** (see STACK.md Deploy; server manual = jepsn1/infra AGENTS.md). Deploy: `make deploy` in `/srv/apps/biblestdy`.
- API = container `biblestdy-api` on docker network `web`, no published ports; SPA = static `apps/web/build/client` served by infra Caddy (`/api/*` proxied to the container).
- Envs: root `.env` = prod (compose env_file), `apps/api/.env` = dev. DBs on shared postgres: prod `biblestdy`, dev `biblestdy_dev` — dev `db:push` can never touch prod.
- No email service yet: magic link/OTP print to `docker logs biblestdy-api`.

## Conventions

- Commits: author `jepsn1 <jepsn1@users.noreply.github.com>` via `git -c user.name=... -c user.email=...` (gh CLI v2.4 = single account; owner login is jepsn1, work login mk-logbuy gets overwritten — see memory).
- Deep modules (Reference, Anchor, Annotation graph, Connections, Scripture provider) live behind small interfaces with isolated Vitest behavior tests — no browser/DB/live API in tests.
- shadcn here is the **Base UI** variant: components use `render={<Link…/>}` not `asChild` (Button still has asChild-style usage via render). Add components: `pnpm dlx shadcn@latest add <name>` in `apps/web`.
- Design system: dark-first tokens in `apps/web/app/app.css` (warm charcoal / parchment / gold). Scripture = Literata (`font-serif`), UI = Geist, data-readouts = Geist Mono. Light theme = future `.light` override.
- Annotations must anchor to `(translation, passage, word-span)` of verse text only — section headings (`Chapter.sections`) are editorial and never anchorable.

## Scripture

- Provider seam: `apps/api/src/scripture/provider.ts`. No `API_BIBLE_KEY` env → FakeScriptureProvider (real WEB fixtures: JHN.3, GEN.1, PSA.23 + sample sections). With key → ApiBibleProvider + 24h cache.
- API.Bible: Starter tier non-commercial, 5k calls/mo. Modern Danish (Bibelen 2020/1992) is NOT publicly on API.Bible — path is Det Danske Bibelselskab license → DBL access linked to API.Bible account (email drafted to rettigheder@bibelselskabet.dk). Bibelen på hverdagsdansk also absent from public picks.

## No body scroll

Reader is paginated (`PaginatedChapter`): fixed-height CSS columns, translateX per spread. Keep it that way — any new reader UI must fit the viewport.

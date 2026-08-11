# Next steps

**2026-08-11: v1 COMPLETE.** All slices #1–#13 closed. Live at biblestdy.com — real NIV/WEB/NKJV (API.Bible), full annotation system, notes w/ multi-anchor + references, connections, tags/topics, i18n da+en, PWA + mobile (drawers, tap-select). Mobile + desktop selection both word-snapped. What's next = pick from: licensing follow-ups (`docs/LICENSING.md`), open product questions below, ideas (annotation layers), or v2 PRD.

2026-08-11 (night): **DEPLOYED TO PROD** — `make deploy` (make installed on the box now), API container rebuilt to HEAD, SPA rebuilt; api healthy, real NIV/WEB/NKJV live at biblestdy.com, JHN 3 verified. Prod fully caught up: #8-#12 features + API.Bible + both migrations. Remaining: #13 phone check → close #13 + #1.

2026-08-11 (evening): **#11 closed** — real API.Bible text live in dev, picker shows abbr+name (trigger + content-sized dropdown), verse-marker parse fix, annotation arrow center-drop fix. Remaining eyeballs: #13 (phone). #9 #10 #12 closed same evening (side-slot unify fix along the way).

2026-08-11 (later): **prod deploy prepped, one command from Marcus** — `migrations/run.mjs` (idempotent runner, schema_migration ledger; dev seeded), prod dry-run confirms both migrations pending, API_BIBLE_KEY added to prod root `.env`. Agent blocked from prod DB writes; Marcus runs:
`cd /srv/apps/biblestdy && DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/@infra-postgres:/@localhost:/') node apps/api/migrations/run.mjs && make deploy`
Then smoke-check biblestdy.com. Licensing parked in `docs/LICENSING.md`.

2026-08-11: **API.Bible key live in dev** — real NIV/WEB/NKJV in the picker, fixture provider now only without key. BPH licensing researched: closed (see homework).

State as of 2026-07-08: #2 ✓ #3 ✓ #4 ✓ (auth: Better Auth magic-link + OTP, all routes gated). Plus design system, paginated reader, books sidebar + filter, section headings. CI green, 26 tests.

2026-07-09 (later): **#8 multi-anchor built** — note↔passage M:N via `note_anchor` join table, NoteStore seam (Drizzle + in-memory for tests), attach/detach endpoints, +Note… picker in selection menu, anchor chips in note panel (click = read there, × = detach, last anchor locked). 76 tests green.

2026-07-13: **#8 done + closed** — dev DB migration applied (turned out already applied; NEXT-STEPS was stale), verified E2E against dev API (attach → listed in both chapters w/ all anchors; detach → drops from that chapter only; last anchor 400). **PROD migration still pending: run `migrations/2026-07-09-note-multi-anchor.sql` on prod before next `make deploy`.**

2026-07-13 (later): **#9 connections panel built** — `GET /api/connections` (ConnectionsService over NoteStore: notes-here in text order, also-appears-in grouped per passage in canonical order, recent 5), Vitest'd in-memory (83 tests total); panel beside the reader (Waypoints toggle in nav, sticky via localStorage; open note takes the slot, closing it brings connections back; notes-here/recent open the note, elsewhere-notes navigate with `?note=`, passage links navigate). E2E-verified against dev API. UI needs Marcus eyeball, then close #9. No DB change — nothing new to migrate.

2026-07-14: **#13 PWA + mobile built** — installable PWA (manifest + gold open-book icons incl. maskable, apple-touch-icon, theme-color; SW precaches NOTHING — install-only, no offline per PRD; sw.js copied into build/client by the build script), and the mobile pass: viewports <640px scale the print-fixed sheet to fit (transform + height compensation — never reflows), all mark layers/drag/page-jump measure scale-aware, sheet re-centers when scale lands, jump box hidden on phones. Verified with headless-Chromium screenshots (phone 390x844 + desktop 1440x900): sheet scaled+centered, highlight wash + ink circle land on the right words at scale, desktop untouched. Reworked same day after Marcus's phone feedback (font too small, h-scroller, no touch marking): sheet is now the SAME fixed 2-col folio at every viewport; phones read ONE column per page scaled up (~20px text), viewport pinned to the column slot (no scroller), touch marking via debounced selectionchange, undragged annotation boxes drop under their anchor on phones. Screenshot-verified incl. simulated touch selection. Re-check on phone, then close #13.

2026-07-13 (night): **#12 i18n built** — react-i18next, every UI string in `apps/web/app/locales/en.ts` + `da.ts` (da typed `typeof en`, so a missing key is a type error; new locale = new file + one line in `lib/i18n.ts`), sticky EN/DA toggle in reader nav + signin, `<html lang>` follows, loader errors translated. UI locale (`uiLanguage`) independent of Scripture translation (`translationId`) — Danish UI + English Bible works. 96 tests. Danish copy is mine — Marcus should proofread. UI eyeball pending.

2026-07-13 (later still): **#11 translation switcher built** — fake provider gained WEB2 (same fixture text, distinct id — switcher exercisable keyless), sticky picker in reader nav (localStorage + loader revalidate), marks render only on home translation (per-translation queries, by construction), `GET /api/notes/other-versions` per-verse counts + ⁘N verse badge. Cross-version correlation Vitest'd (96 tests). E2E-verified. Real translations still gated on Marcus homework (API.Bible key). UI eyeball pending.

2026-07-13 (later still): **#10 tags + topics built** — tag/note_tag/passage_tag tables (dev pushed; **PROD: run `migrations/2026-07-13-tags.sql` before next deploy, plus the #8 one**), TagStore seam + TagsService (names normalized lowercase, get-or-create, last-use deletes orphan tag, ownership checks), topics in connections payload (`onPassage` marks chapter's own tags), tag chips on note panel + connections Topics section (add = tags the passage), `/topic/:name` page (tagged notes + passages, links navigate). 93 tests. E2E-verified (tag/untag note+passage, topic aggregation, orphan cleanup, 404). UI eyeball pending like #9.

2026-07-09: **deployed to prod** on own server (see CLAUDE.md Prod) — blocked on Parknet public IP (CGNAT; ordered), then it's live at biblestdy.com. Resend auth emails wired (prod+dev) ✓. Same day: paper theme (default) + charcoal toggle; full hand-drawn annotation system (scribble circles / brackets by span geometry, draggable+resizable boxes, under-text arrows with live Excalidraw-style binding, wobbly marker highlights, overlap/nesting support); **#7 full notes shipped + closed** (WYSIWYG markdown editor in a resizable panel); data layer on TanStack Query; terminology settled (annotation/note, see Conventions).

## Pilot-time (before real users)

- [x] **Email service** ✓ 2026-07-09 — Resend wired (`apps/api/src/auth/email.ts`), link + OTP coalesced into one email; no key (dev) -> console log. BLOCKED on: verify biblestdy.com at resend.com/domains → add their DNS records (SPF/DKIM/MX) at simply.com. Until then Resend returns 403 (logged, not sent).
- [x] Fresh `BETTER_AUTH_SECRET` in production ✓ 2026-07-09.

## Marcus (homework, unblocks work below)

- [x] **DB switched Neon → local Postgres** ✓ 2026-07-09 — dev env live on the server: `/srv/apps/biblestdy`, `apps/api/.env` set (fresh BETTER_AUTH_SECRET), `db:push` applied, 6 tables, all tests green. See `.env.example`.
- [ ] **Old Neon project**: if it has data worth keeping, dump it (`pg_dump <neon-url> | psql <local-url>`), then delete the project either way.
- [x] **API.Bible key** ✓ 2026-08-11 — dev live on real text (NIV/WEB/NKJV). Key also needed in PROD root `.env` before deploy.
- [ ] **Licensing (BPH, Bibelen 2020, more English versions)** → all parked in `docs/LICENSING.md` (state + todos, BPH request draft ready to submit).
- [ ] (someday) upgrade gh CLI ≥2.40 for multi-account (`jepsn1` overwrote `mk-logbuy`)

## Build queue (agreed order)

1. ~~**#4 Sign in**~~ ✓ done — Better Auth magic-link + OTP, Neon, guard, all routes gated.
2. ~~#5 Highlight a span~~ ✓ done.
3. ~~#6 Inline note~~ ✓ → ~~#7 Full md note~~ ✓ → ~~#8 multi-anchor~~ ✓ done → ~~#9 connections panel~~ ✓ CLOSED 2026-08-11 (side slot unified) → ~~#10 tags/topics~~ ✓ CLOSED 2026-08-11 → ~~#11 translation switcher~~ ✓ CLOSED 2026-08-11 (real NIV/WEB/NKJV, picker polish) → ~~#12 i18n da+en~~ ✓ CLOSED 2026-08-11 → ~~#13 PWA/mobile~~ ✓ CLOSED 2026-08-11 (drawers, tap-select, zoom off). **Queue done — all v1 slices built.** Next: Marcus eyeballs #9-#13 on dev.biblestdy.com (+ phone), closes issues; then prod deploy (run BOTH pending migrations first).

## Postponed deliberately (Marcus, 2026-08-11)

- **Markdown export/import** — wait until note linking/relations design settles; export format should capture links between notes, not just bodies. Don't build naively.
- **Shadow notes** (reading other-version notes from the ⁘N badge) — wait until the note structure is where Marcus wants it.

## Ideas (someday)

- **Annotation layers** (Marcus, 2026-07-09): clickable layers of annotations — e.g. one layer focused on Jesus, another on moral principles; flip between them to read the same text through different lenses. Likely builds on #10 tags/topics (a layer ≈ filter marks by topic).

## Open product questions (from VISION.md)

- Credit pricing + starting balance?
- Topics: user-authored only, or AI-suggested from day one?
- ~~Deploy targets~~ resolved 2026-07-09: self-host on own server (biblestdy.com, Caddy + Docker, local Postgres — see STACK.md Deploy).

## Watch-outs

- **Prod SPA is served from the live working tree** (`apps/web/build/client` via infra Caddy) — any dev-machine `pnpm web build` mutates prod frontend immediately, and can desync it from the older API container (seen 2026-08-11). Fix someday: build SPA into the container or a versioned release dir that deploy swaps atomically.

- Anchor design: anchor to verse-relative word offsets, NOT rendered-DOM offsets; sections are never anchorable.
- **Page geometry is print-fixed.** Hand-placed annotations (dragged note boxes, gutter glosses) assume word positions never move. NEVER reflow the text in response to UI state — panels must overlay, not squeeze (doc panel does this); column count/width/font are fixed on desktop. Mobile pass (#13): SCALE the page down like a printed sheet, don't reflow it.
- Long chapters (Ps 119) paginate fine but col-flow within spread — revisit if annoying.
- API.Bible Starter = non-commercial; Pro $29/mo when charging. 24h cache keeps quota low.

# Next steps

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
- [ ] **API.Bible key** → `apps/api/.env`: `API_BIBLE_KEY=...`
  Picks: NIV + 2 of NLT/CSB/NASB. (ESV not on API.Bible; no Danish in public picks.)
- [ ] **Send Bibelselskabet email** (rettigheder@bibelselskabet.dk) — free non-commercial pilot license for Bibelen 2020, delivered via DBL key → API.Bible. Danish draft: session 2026-07-08 / ask Claude to re-draft.
- [ ] (someday) upgrade gh CLI ≥2.40 for multi-account (`jepsn1` overwrote `mk-logbuy`)

## Build queue (agreed order)

1. ~~**#4 Sign in**~~ ✓ done — Better Auth magic-link + OTP, Neon, guard, all routes gated.
2. ~~#5 Highlight a span~~ ✓ done.
3. ~~#6 Inline note~~ ✓ → ~~#7 Full md note~~ ✓ → ~~#8 multi-anchor~~ ✓ done → ~~#9 connections panel~~ ✓ built (UI eyeball pending) → ~~#10 tags/topics~~ ✓ built (UI eyeball pending) → ~~#11 translation switcher~~ ✓ built (WEB2 fixture; real versions need API.Bible key) → ~~#12 i18n da+en~~ ✓ built (proofread da copy) → ~~#13 PWA/mobile~~ ✓ built (needs real-phone touch check). **Queue done — all v1 slices built.** Next: Marcus eyeballs #9-#13 on dev.biblestdy.com (+ phone), closes issues; then prod deploy (run BOTH pending migrations first).

## Ideas (someday)

- **Annotation layers** (Marcus, 2026-07-09): clickable layers of annotations — e.g. one layer focused on Jesus, another on moral principles; flip between them to read the same text through different lenses. Likely builds on #10 tags/topics (a layer ≈ filter marks by topic).

## Open product questions (from VISION.md)

- Credit pricing + starting balance?
- Topics: user-authored only, or AI-suggested from day one?
- ~~Deploy targets~~ resolved 2026-07-09: self-host on own server (biblestdy.com, Caddy + Docker, local Postgres — see STACK.md Deploy).

## Watch-outs

- Anchor design: anchor to verse-relative word offsets, NOT rendered-DOM offsets; sections are never anchorable.
- **Page geometry is print-fixed.** Hand-placed annotations (dragged note boxes, gutter glosses) assume word positions never move. NEVER reflow the text in response to UI state — panels must overlay, not squeeze (doc panel does this); column count/width/font are fixed on desktop. Mobile pass (#13): SCALE the page down like a printed sheet, don't reflow it.
- Long chapters (Ps 119) paginate fine but col-flow within spread — revisit if annoying.
- API.Bible Starter = non-commercial; Pro $29/mo when charging. 24h cache keeps quota low.

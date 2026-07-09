# Next steps

State as of 2026-07-08: #2 ✓ #3 ✓ #4 ✓ (auth: Better Auth magic-link + OTP, all routes gated). Plus design system, paginated reader, books sidebar + filter, section headings. CI green, 26 tests.

2026-07-09 (later): **#8 multi-anchor built** — note↔passage M:N via `note_anchor` join table, NoteStore seam (Drizzle + in-memory for tests), attach/detach endpoints, +Note… picker in selection menu, anchor chips in note panel (click = read there, × = detach, last anchor locked). 76 tests green. **NOT yet live in dev: DB migration pending** (agent blocked from touching live DB) — run `cd /srv/apps/biblestdy/apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -f migrations/2026-07-09-note-multi-anchor.sql`, then verify in browser + close #8. Same file must run on PROD before next `make deploy`.

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
3. ~~#6 Inline note~~ ✓ → ~~#7 Full md note~~ ✓ → ~~#8 multi-anchor~~ ✓ built (pending dev DB migration + browser check, see above) → **#9 connections panel** (next) → **#10 tags/topics** → **#11 translation switcher** → **#12 i18n da+en** → **#13 PWA/mobile** (scale the fixed sheet, don't reflow — see watch-outs).

## Open product questions (from VISION.md)

- Credit pricing + starting balance?
- Topics: user-authored only, or AI-suggested from day one?
- ~~Deploy targets~~ resolved 2026-07-09: self-host on own server (biblestdy.com, Caddy + Docker, local Postgres — see STACK.md Deploy).

## Watch-outs

- Anchor design: anchor to verse-relative word offsets, NOT rendered-DOM offsets; sections are never anchorable.
- **Page geometry is print-fixed.** Hand-placed annotations (dragged note boxes, gutter glosses) assume word positions never move. NEVER reflow the text in response to UI state — panels must overlay, not squeeze (doc panel does this); column count/width/font are fixed on desktop. Mobile pass (#13): SCALE the page down like a printed sheet, don't reflow it.
- Long chapters (Ps 119) paginate fine but col-flow within spread — revisit if annoying.
- API.Bible Starter = non-commercial; Pro $29/mo when charging. 24h cache keeps quota low.

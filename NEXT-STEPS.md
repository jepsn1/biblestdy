# Next steps

State as of 2026-07-08: #2 ✓ #3 ✓ #4 ✓ (auth: Better Auth magic-link + OTP, Neon, all routes gated). Plus design system, paginated reader, books sidebar + filter, section headings. CI green, 26 tests.

## Pilot-time (before real users)

- [ ] **Email service** — auth currently logs magic link + OTP to the api console (no email sent). For real users, wire Resend (or Postmark/SES) into `sendMagicLink`/`sendVerificationOTP` in `apps/api/src/auth/auth.ts`, one email w/ both link + code. Domain picked: **biblestdy.com** — still needs DNS verification for deliverability.
- [ ] Fresh `BETTER_AUTH_SECRET` in production.

## Marcus (homework, unblocks work below)

- [x] **DB switched Neon → local Postgres** ✓ 2026-07-09 — dev env live on the server: `/srv/apps/biblestdy`, `apps/api/.env` set (fresh BETTER_AUTH_SECRET), `db:push` applied, 6 tables, all tests green. See `.env.example`.
- [ ] **Old Neon project**: if it has data worth keeping, dump it (`pg_dump <neon-url> | psql <local-url>`), then delete the project either way.
- [ ] **API.Bible key** → `apps/api/.env`: `API_BIBLE_KEY=...`
  Picks: NIV + 2 of NLT/CSB/NASB. (ESV not on API.Bible; no Danish in public picks.)
- [ ] **Send Bibelselskabet email** (rettigheder@bibelselskabet.dk) — free non-commercial pilot license for Bibelen 2020, delivered via DBL key → API.Bible. Danish draft: session 2026-07-08 / ask Claude to re-draft.
- [ ] (someday) upgrade gh CLI ≥2.40 for multi-account (`jepsn1` overwrote `mk-logbuy`)

## Build queue (agreed order)

1. ~~**#4 Sign in**~~ ✓ done — Better Auth magic-link + OTP, Neon, guard, all routes gated.
2. **#5 Highlight a span** — Anchor module in shared: selection → `(translation, passage, word-span)` → render spans. Pure, heavily tested. User-scoped persistence (needs #4).
3. **#6 Inline note** → **#7 Full md note** → **#8 multi-anchor** → **#9 connections panel** → **#10 tags/topics** → **#11 translation switcher** → **#12 i18n da+en** → **#13 PWA/mobile**.

## Open product questions (from VISION.md)

- Credit pricing + starting balance?
- Topics: user-authored only, or AI-suggested from day one?
- ~~Deploy targets~~ resolved 2026-07-09: self-host on own server (biblestdy.com, Caddy + Docker, local Postgres — see STACK.md Deploy).

## Watch-outs

- Anchor design: anchor to verse-relative word offsets, NOT rendered-DOM offsets; sections are never anchorable.
- Long chapters (Ps 119) paginate fine but col-flow within spread — revisit if annoying.
- API.Bible Starter = non-commercial; Pro $29/mo when charging. 24h cache keeps quota low.

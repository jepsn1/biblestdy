# Scripture licensing — state + todos

Everything license-related parked here. NEXT-STEPS points at this file.

## Where we stand (2026-08-11, updated 2026-10-29)

| Translation | Status |
|---|---|
| **NIV 2011** | ✓ live via API.Bible key (Starter tier: non-commercial, 5k calls/mo, 24h cache keeps quota low; Pro $29/mo when we charge) |
| **WEB, NKJV** | ✓ live, same key (WEB is public domain) |
| **NLT / CSB / NASB** | not on the key — request per-publisher in the API.Bible dashboard |
| **ESV** | not on API.Bible. Crossway's own ESV API (api.esv.org): free key for non-commercial, individuals OK. Needs a second provider + ESV-only cache ≤500 verses/half a book, "ESV" label, copyright page, esv.org link on every page showing ESV. 5k/day, 1k/h, 60/min. |
| **BPH (Bibelen på hverdagsdansk)** | ✅ **licensed 2026-11-13** via API.Bible (Biblica Global Bible Bundle, added to our Starter key on support's advice; id `20c3695eb7339cca-01`, © 2015 Biblica). Express licensing terms: free only while non-commercial + no AI/ML. Starter = max 3 licensed translations (NIV, NKJV, BPH; WEB is PD). Auto-surfaced by the `dan` language filter in the API.Bible provider. Direct-license fallback: `biblica-bph-permission-request.md` |
| **Bibelen 2020 / 1992 (Bibelselskabet)** | not publicly licensable; needs direct license → DBL → API.Bible. Email to rettigheder@bibelselskabet.dk pending (Danish draft: session 2026-07-08, or ask Claude to re-draft) |
| **Danish 1931/33** | public domain (the "old" one on YouVersion) — could self-host if we ever want a keyless Danish fallback |

Facts that matter:
- Biblica gratis quota = 500 verses — never enough for a reader; a license is genuinely required.
- Biblica licenses only *finished* products (pilot counts), display-only; audio + offline explicitly not licensable.
- Direct Biblica full-text licenses go to a **registered legal entity only**, not individuals → use the holding company if we go direct. Express route (via platforms) has no such note.
- Express licensing requires **no AI/ML features** and no monetization. VISION's AI credits would break it for NIV + BPH (and make ESV "commercial"). Decide before shipping AI.
- API.Bible: cached text must be refreshed every 30 days; max 500 consecutive verses displayed (our 24h cache + chapter pages fit).
- Any Danish bible that ever lands on our API.Bible key auto-surfaces in the picker (`apibible.provider.ts` language filter).

## API.Bible compliance (Starter plan) — how biblestdy meets it (2026-11-16)

| Rule | Where |
|---|---|
| FUMS on every chapter shown (ToS §3.3) | web `lib/fums.ts` reports shown chapters' `fumsToken` → `POST /api/fums/views` → `apps/api/src/fums` relays to `https://fums.api.bible/f3` (server-side: no device storage, no reader IP to a third party; dId/sId = HMAC of the sign-in session, no uId). Token cached with the chapter. |
| Citation + link to api.bible (Starter) | reader running foot ("… · API.Bible"), Settings footer, landing footer, copyright page |
| Copyright page linked from every page with Bible text (§7) | `/copyright` (public; lines verbatim from `GET /api/copyright` = API.Bible metadata, holders in `TRANSLATION_INFO.holder`); credit line, palette + note references, landing quote link there |
| Cache ≤ 30 days, changes within 24 h (§11) | `CachingScriptureProvider`: 24 h TTL, hard ceiling 25 days. Purge one translation: `tools/purge-scripture-cache.sh <bibleId>` (prod container; `API_PORT=3001` for dev). Restart purges all. |
| Copy/print ≤ 100 verses (§12) | `reader/copy-attribution.ts` `canCopy` + toast; `lib/print-limit.ts` blanks the text in print over 100 |
| Donations only as minor, non-intrusive links | support pop-up removed; quiet "Support biblestdy" links in Settings; "☕ Buy me a coffee" as plain muted text in the landing footer and the reader's running foot (end of the credit line where it fits, else its own third line under it — always shown, never displaces the credit or source; phones: own line under the chapter's foot) |
| No AI/LLM/TTS on licensed text (§9) | none in the codebase (checked 2026-11-16). VISION's AI credits would break NIV/BPH/NKJV terms. |

Open: highlight/annotation `quote` columns store marked words of licensed text in our DB (palette search) — not refreshed by the 30-day rule; ask API.Bible or recompute from the cache.

## Third-party data (not Scripture)

- **Versification map** (`packages/shared/src/versification-data.ts`, #166): verse counts + English↔original mapping lines derived from `eng.vrs` / `org.vrs` of SIL libpalaso (github.com/sillsdev/libpalaso), **MIT**, © 2007-2026 SIL Global. MIT requires the notice in copies: it sits in that file's `/*! … */` header (kept by minifiers) and in `tools/versification/LICENSE-libpalaso.txt`. Regenerate with `tools/versification/build-data.mjs`.
- **Verse-number fixture** (`packages/shared/src/fixtures/verse-numbers.json`): verse numbers + bridge positions only, never text — read once from API.Bible by `tools/versification/verse-counts.mjs` (2026-11-16, ~1,100 calls on the shared key).

## Licensing todos

- [ ] **ESV**: get key at api.esv.org → `ESV_API_KEY` in dev + prod `.env`; then build ESV provider (issue #39).
- [x] BPH: added via API.Bible Global Bible Bundle 2026-11-13 (support@api.bible guided). Biblica form only needed if we go commercial / add AI.
- [ ] **Send Bibelselskabet email** (rettigheder@bibelselskabet.dk) — free non-commercial
      pilot license for Bibelen 2020, delivered via DBL → API.Bible.
- [ ] (when wanted) Request NLT/CSB/NASB access in the API.Bible dashboard.
- [ ] (when charging) API.Bible Pro $29/mo + revisit NIV/BPH terms commercially.

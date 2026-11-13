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

## Licensing todos

- [ ] **ESV**: get key at api.esv.org → `ESV_API_KEY` in dev + prod `.env`; then build ESV provider (issue #39).
- [x] BPH: added via API.Bible Global Bible Bundle 2026-11-13 (support@api.bible guided). Biblica form only needed if we go commercial / add AI.
- [ ] **Send Bibelselskabet email** (rettigheder@bibelselskabet.dk) — free non-commercial
      pilot license for Bibelen 2020, delivered via DBL → API.Bible.
- [ ] (when wanted) Request NLT/CSB/NASB access in the API.Bible dashboard.
- [ ] (when charging) API.Bible Pro $29/mo + revisit NIV/BPH terms commercially.

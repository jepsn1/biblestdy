# Scripture licensing — state + todos

Everything license-related parked here. NEXT-STEPS points at this file.

## Where we stand (2026-08-11, updated 2026-10-29)

| Translation | Status |
|---|---|
| **NIV 2011** | ✓ live via API.Bible key (Starter tier: non-commercial, 5k calls/mo, 24h cache keeps quota low; Pro $29/mo when we charge) |
| **WEB, NKJV** | ✓ live, same key (WEB is public domain) |
| **NLT / CSB / NASB** | not on the key — request per-publisher in the API.Bible dashboard |
| **ESV** | not on API.Bible. Crossway's own ESV API (api.esv.org): free key for non-commercial, individuals OK. Needs a second provider + ESV-only cache ≤500 verses/half a book, "ESV" label, copyright page, esv.org link on every page showing ESV. 5k/day, 1k/h, 60/min. |
| **BPH (Bibelen på hverdagsdansk)** | closed (Biblica, © all rights reserved; NOT in their open.bible CC set; not on API.Bible public catalog; YouVersion app = distribution deal). **Free route likely exists:** Biblica "express licensing" = royalty-free for truly non-commercial apps with no AI, via API.Bible (or YouVersion — ruled out by Marcus 2026-10-29). BPH not in API.Bible public catalog → ask support@api.bible to add it under express licensing, in parallel with the direct request → `biblica-bph-permission-request.md` |
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
- [ ] **Submit BPH request** (after throttling #25 is deployed; apply as the holding company — direct licenses need a legal entity): paste `docs/biblica-bph-permission-request.md` into
      https://www.biblica.com/permission-request-form/ (fill in your email). ~10 business days.
- [ ] Ask Biblica if BPH is on "express licensing" (non-commercial, no-AI apps can start immediately via ministry partners) — we have no AI today.
- [ ] (parallel) Email support@api.bible: "can BPH (Biblica) be added to our key under express licensing?"
- [ ] **Send Bibelselskabet email** (rettigheder@bibelselskabet.dk) — free non-commercial
      pilot license for Bibelen 2020, delivered via DBL → API.Bible.
- [ ] (when wanted) Request NLT/CSB/NASB access in the API.Bible dashboard.
- [ ] (when charging) API.Bible Pro $29/mo + revisit NIV/BPH terms commercially.

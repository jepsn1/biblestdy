# Scripture licensing — state + todos

Everything license-related parked here. NEXT-STEPS points at this file.

## Where we stand (2026-08-11)

| Translation | Status |
|---|---|
| **NIV 2011** | ✓ live via API.Bible key (Starter tier: non-commercial, 5k calls/mo, 24h cache keeps quota low; Pro $29/mo when we charge) |
| **WEB, NKJV** | ✓ live, same key (WEB is public domain) |
| **NLT / CSB / NASB** | not on the key — request per-publisher in the API.Bible dashboard; ESV not on API.Bible at all |
| **BPH (Bibelen på hverdagsdansk)** | closed (Biblica, © all rights reserved; NOT in their open.bible CC set; not on API.Bible public catalog; YouVersion "free" = distribution deal). Request drafted → `biblica-bph-permission-request.md` |
| **Bibelen 2020 / 1992 (Bibelselskabet)** | not publicly licensable; needs direct license → DBL → API.Bible. Email to rettigheder@bibelselskabet.dk pending (Danish draft: session 2026-07-08, or ask Claude to re-draft) |
| **Danish 1931/33** | public domain (the "old" one on YouVersion) — could self-host if we ever want a keyless Danish fallback |

Facts that matter:
- Biblica gratis quota = 500 verses — never enough for a reader; a license is genuinely required.
- Biblica licenses only *finished* products (pilot counts), display-only; audio + offline explicitly not licensable.
- Any Danish bible that ever lands on our API.Bible key auto-surfaces in the picker (`apibible.provider.ts` language filter).

## Licensing todos

- [ ] **Submit BPH request**: paste `docs/biblica-bph-permission-request.md` into
      https://www.biblica.com/permission-request-form/ (fill in your email). ~10 business days.
- [ ] (parallel, optional) Email support@api.bible: "help us pursue BPH (Biblica) on our key".
- [ ] **Send Bibelselskabet email** (rettigheder@bibelselskabet.dk) — free non-commercial
      pilot license for Bibelen 2020, delivered via DBL → API.Bible.
- [ ] (when wanted) Request NLT/CSB/NASB access in the API.Bible dashboard.
- [ ] (when charging) API.Bible Pro $29/mo + revisit NIV/BPH terms commercially.

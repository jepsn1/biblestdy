# Licence chrome review — 2026-11-16

**Scope:** where/how biblestdy shows what API.Bible's Starter plan requires (api.bible citation + link, copyright page linked from every page with Bible text, 100-verse copy/print cap, support only as a quiet link) — compliant, calm, accessible, en + da.
**Panel:** Pastor Ruth, Mads, Sofie, Birthe, Jonas. Evidence: reader (paged/phone, Paper/Clean, light/dark, 150 %, da/BPH), /copyright, /privacy, Settings, palette, landing.

## Findings → decisions

| # | Finding | Raised by | Decision |
|---|---|---|---|
| 1 | Credit not visibly a link on touch (hover-only underline) | Birthe, Sofie | **Fixed:** faint permanent underline on touch (`pointer-coarse:`), hover-only with a mouse (Mads' calm desktop kept) |
| 2 | No way back at the top of /copyright; Back doesn't say where | Sofie, Birthe | **Fixed:** "← Back to John 3" at top + bottom (44 px), name passed from the credit link |
| 3 | Arriving at #NIV: no "you are here", focus lost | Mads, Sofie, Jonas | **Fixed:** entry marked with an accent rule; its heading takes focus (screen readers start there) |
| 4 | "In the holder's own words" over our own sentences; holder line indistinct | Ruth, Mads, Birthe | **Fixed:** intro reworded; holder line verbatim as an indented `lang="en"` quotation in foreground colour; template's "All rights reserved" not doubled |
| 5 | Name said twice / credit differs by width | Ruth, Mads, Sofie | **Fixed:** name prefix only when the notice lacks it (BPH, WEB) |
| 6 | Bare "API.Bible" cryptic; four wordings | Sofie, Birthe, Mads, Jonas | **Fixed:** "Text via API.Bible" everywhere a line stands alone and in the foot |
| 7 | Citation hinged on the FUMS token | Jonas | **Fixed:** explicit `Chapter.source = 'api.bible'` |
| 8 | Print cap only on `beforeprint` | Jonas | **Fixed:** page flag kept current from each Scripture block; beforeprint re-checks the DOM; Ps 119 PDF verified blank + note |
| 9 | Bad hash crashes /copyright; offline fallback wrong for WEB | Jonas | **Fixed** |
| 10 | Phones: source link glued to credit (mis-tap leaves app); Settings footer split/no focus ring | Jonas, Sofie, Mads | **Fixed:** source on its own line on phones; footer items nowrap, focus ring, phone padding |
| 11 | Copy-limit toast too short / blames "licence" for PD | Jonas, Ruth | **Fixed:** 8 s; "the terms for the Bible text here allow no more" |
| 12 | FUMS counted background tabs; dedup map unbounded | Jonas | **Fixed** |
| 13 | Support link labels don't say Instagram | Sofie | **Fixed** |
| 14 | Privacy section dense; good news buried | Birthe, Mads | **Fixed:** plain lead sentence, split paragraphs, link on its own line |
| 15 | Notice vanished with Settings open | Mads, Sofie, Birthe, Jonas | Stale v1 capture (before the "source rides on the last part" fix); v5 shows it intact |

## Conflicts
- **Credit size at large text** — Birthe: let it grow with text size; Mads: grow at half rate, cap ~14 px. Unchanged here (pre-existing behaviour, out of scope); owner to decide.
- **Hover-only vs always-underlined credit** — resolved as touch-only underline.

## Later
- Palette results: show the translation abbreviation per quote; footer link to that translation's entry (Ruth).
- Print over 100 verses: offer "Print verses 1–88 · 89–176" (Ruth).
- Danish landing quote is English WEB (Birthe) — a BPH quote needs Biblica's OK for marketing use.
- "Bibelen på hverdagsdansk" vs metadata "Hverdagsdansk" capitalisation (Mads) — owner/Biblica.
- Folio–credit gap consistency in Clean (Mads).
- Server-side rate limit for `/api/fums/views` beyond session + 20 tokens/request (Jonas).

# Persona panel — navigation follow-ups (2026-11-16)

**Scope:** design choices in the six follow-ups the 2026-11-15 navigation review filed (#142, #143, #144, #146, #147, #148; #145 was already done). One question brief with the builder's proposal per choice, one "before" evidence pack (scratchpad `navfu/before-*.png`), one read-only agent per persona answering only its issues' questions.
**Panel per issue (3–6, `REVIEW-PROCESS.md`):** #142 Sofie, Freja, Kasper, Birthe, Ruth, Jonas · #143 Ruth, Mads, Sofie, Birthe, Elias · #144 Birthe, Sofie, Jonas, Mads, Elias · #146 Sofie, Ruth, Mads, Birthe · #147 Birthe, Sofie, Elias, Mads, Jonas · #148 Birthe, Sofie, Kasper, Freja.

## #142 Recent passages + good places to start

| Question | Decision | Who |
|---|---|---|
| Storage: account or this device | **This device** (localStorage, as before; no migration). Account sync comes with reading progress (#139); the privacy page will need a line then. | 6 of 6 (Jonas: zero server cost; Ruth/Freja/Birthe/Kasper: reading history stays private) |
| What a row remembers | Book, chapter **and the page last open** (written where lastRead is, on every turn, not only on open — Ruth). A stale page clamps like any `?p` (Jonas). | all |
| "Continue" row | First row = the newest place that isn't the chapter you're on: "Fortsæt: Johannes 3, side 2" / "Continue: John 3, page 2". No row when there is no such place (Jonas, Freja). | 5 of 6 |
| Where | Top of the chooser's books step while the filter is empty; on phones also above the chapter grid (Freja, Birthe, Sofie). One quiet line of worded serif links, eyebrow "Senest læst på denne enhed" / "Recent on this device" (Sofie: say it's per device, one line). Same rows in the empty palette after the commands. | all |
| Good places to start | Shown while fewer than 3 chapters were read (the list is distinct chapters and never shrinks, so its length is the counter Jonas asked for). 1 Mosebog 1 / Salmerne 23 / Markus 1 / Johannes 1, canonical order, each with a plain line that quotes the text or names the kind of book (Ruth): "Begyndelsen", "Herren er min hyrde", "Jesus' liv, kort fortalt", "Ordet blev kød". Not the chapter you're on. Recent comes first when both show (Kasper). | 5 of 6 for lines (Kasper indifferent) |

**Conflict:** Sofie: "Continue" over-promises ("the place before this one") — label it "Tilbage til …". Kept "Fortsæt"/"Continue" (Kasper, Birthe, Ruth, Freja, Jonas ok; it's the word people use for resuming). Sofie's ask to test the wording with 3 people is recorded for the owner.
**Not adopted:** Freja's first-time hint explaining "Continue" (more chrome than the problem).

## #143 Canonical sub-groups

| Question | Decision | Who |
|---|---|---|
| Groups + labels | 8 groups, no further splits. en: **Books of Moses**, Historical books, Wisdom, Prophets · Gospels, Acts, Letters, Revelation. da: Mosebøgerne, Historiske bøger, Visdomsbøger, Profeter · Evangelierne, Apostlenes Gerninger, Breve, Åbenbaringen. "Law" dropped: Genesis is mostly narrative (Ruth), "Law and Prophets" collides (Elias), churchy to newcomers (Sofie). | all 5 |
| One-book groups | No visible heading over Acts / Revelation, just the same gap as the others (Mads); the label stays for screen readers (the group's name). | all 5 |
| Look | 12 px muted label, regular weight, quieter than the testament eyebrow but not fainter than Birthe can read; books still read down the columns, no forced column tops (Mads); filtered, only groups with matches, with their label. | all 5 |

## #144 Nav at large text

| Question | Decision | Who |
|---|---|---|
| Shed order | One order, CSS container queries on the nav row in rem (no JS; nav-fit.ts deleted): wordmark (< 56 rem) → search field becomes worded "Search" (< 48 rem) → **Notes + Settings into a worded "⋯ More"** (< 36 rem; phones always) → translation drops its chevron, keeps "BPH" (< 28 rem). The book name truncates first throughout, down to 5 em. Search never goes into More (Elias, Sofie, Jonas). Wrapping stays only as the true last resort (a 390 px phone at 200 %, ~12 rem), never an icon alone. | Birthe, Sofie, Jonas, Mads ok; Elias ok with the change adopted (Search never in More) |
| Desktop More | A small panel under the button (phones keep the sheet), same rows and strings as the phone sheet (Jonas: no second copy): Notes on this chapter (state "Vises/Skjult" + Ctrl+. on keyboards), margin notes (only where the text scrolls), All notes, Settings — each a word + a short line (Birthe, Sofie). | 4 of 5 |
| Account circle | Leaves the row with Settings; "Logget ind som …" heads the More panel instead (Sofie, Jonas, Mads). Settings opened from More sits under More and returns focus to it. | all 5 |

**Conflicts:** Elias: shed Settings before Notes (two steps). Not adopted: one step keeps the order simple and both land in one labelled place (Birthe, Sofie, Jonas). Elias/Jonas/Mads: plain words on non-toggle rows; Birthe/Sofie: an explanation on each. Took the phone sheet's rows as they are (one copy). Sofie: a dot/count on More when this chapter has notes — **later** (needs the notes count in the nav).
**Found on the way:** between 640 and 767 px the settings chip was a lone initial (the phone variant); it now carries "Settings"/"Indstillinger" like the desktop one.

## #146 Spread awareness

| Question | Decision | Who |
|---|---|---|
| Address | "Salmerne 23–24" (en dash, no spaces) while the spread runs on; screen readers hear "Salmerne 23 til 24". The translation shifts ~2 characters on that page — accepted, not reserved (Mads: a hole on every other page is worse; no animation). | all 4 |
| Strip | Every chapter on the spread gets the same mark (ink + 2 px gold rule; a fainter one reads as an error — Mads). The opened chapter is "current" for screen readers, the others "Chapter 24, also on this page". | all 4 |
| Clicking 24 | Opens Salme 24 from its start. | all 4 |

## #147 Strip

| Question | Decision | Who |
|---|---|---|
| "All chapters" | The words "Alle kapitler" / "All chapters", **always** at the strip's right end (all 5: a control that comes and goes reads as a bug), ~24 px from the numbers, muted until hover. Opens the address chooser on this book's chapters (focus on this chapter, back on the button when it closes) — one grid in the app; the strip's own dropdown grid (chapter-select.tsx) is deleted. | all 5 |
| Targets | 40 px on touch screens (`pointer: coarse`); mouse unchanged (text size already scales it). | all 5 |
| Cross-book foot | Only when Next/Previous leaves the book: "Næste: Johannes 1 ›" / "‹ Forrige: Lukas 24"; its accessible name is the same words (Jonas). Inside a book: "Næste"/"Forrige". | all 5 |

## #148 Back from All notes

| Question | Decision | Who |
|---|---|---|
| The link | "← Tilbage til Salme 23" / "← Back to Psalm 23", to the page last read (lastRead: survives a reload — Kasper). Phones: "← Salme 23" (the book name may truncate, the number never — Freja, Sofie). Nothing read yet: "Bibelen"/"Bible" as before. | all 4 |

## Evidence
Scratchpad `navfu/` (not committed): `before-*.png`, `after-*.png` (1280, 1440, 1024, iPad, 700, phone; en + da; light + dark; 175/200 %), `after-*-mid.png` (mid-turn: strip + foot stay put, only the text slides), `after-axe.json` (only the intentional `meta-viewport`).

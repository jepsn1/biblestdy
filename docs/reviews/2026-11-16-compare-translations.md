# Compare translations — persona panel, 2026-11-16

Scope: a new reader feature. Select a passage → "Compare translations" → a
dialog with the reading translation at the top and 2–3 others ticked → the
passage in each, stacked. Settle entry points, memory, limits, layout, verse
alignment, loading/licensing, copy, jump, strings and a11y so it can be built
without owner input.

Panel: **all 8**. The feature is both "Study features" (Elias, Ruth, Sofie,
Kasper) and "UI chrome: overlays, a11y" (Sofie, Mads, Jonas, Birthe, Freja,
Elias) in `REVIEW-PROCESS.md` §1; the union is all 8.

Evidence: dev server (wt-comparescope, user `delivered+cmp`), seeded WEB John
3, shots of today's selection menu (desktop en/da dark, phone da, phone 150%),
translation sheet (08c, 49b), keyboard selection, and BPH Psalm 51 / John 3.
Live API checks of verse numbering in all 4 translations (below). One brief
with a lean proposal per question (P1–P14); each persona gave findings + ok /
objection / pick.

## What the live API showed (verified 2026-11-16)

BPH uses the Hebrew ("original") numbering in the OT. The English three use
English numbering. Matching by verse number alone shows the **wrong verse** for
every titled psalm in BPH.

| Passage | NIV / WEB / NKJV | BPH |
|---|---|---|
| Ps 51:1 "Have mercy…" | 51:1 | 51:3 (title = verse "1–2") |
| Ps 3:1 | 3:1 | 3:2 |
| Mal 4:1–6 | 4:1–6 | 3:19–24 (BPH has no Mal 4: 404) |
| Joel 2:28–32 / Joel 3 | 2:28–32 / 3 | 3:1–5 / **4** |
| Jonah 1:17 · Isa 9:1 · Dan 5:31 | – | 2:1 · 8:23 · 6:1 |
| Exod 8:1–4 · Gen 31:55 | – | 7:26–29 · 32:1 |
| John 3:14–15 · Acts 8:10–11 · Isa 9:13–14 | separate | one bridge unit each |
| Acts 8:37 | NKJV only | absent (NIV, WEB, BPH also lack it) |
| Rom 16:24 | NKJV, WEB | absent in NIV, BPH |
| Rom 16:25–27 doxology | NIV, NKJV | WEB: at Rom 14:24–26 |

Two bugs that already exist (not part of this scope): **BPH Joel 4 cannot be
reached** (the API caps Joel at 3 chapters, so it returns 400). **Switching
translation keeps the verse number** (WEB Mal 4 → BPH returns 404; Ps 51:1
lands on the title).

## Decisions

| # | Question | Decision | Who |
|---|---|---|---|
| P1 | Entry points | Item "Compare translations" with icon + words in the **selection, highlight and mark** menus, in the Copy group right after Copy (no new divider). **Phone drawer:** the Copy group (Copy + Compare) moves up to sit right after the colours, so it shows without scrolling at 150%. Overflowing drawers show a fade at the bottom. Key **`p`** on a focused verse or in its menu (shown in the row and in the `?` list; off with the single-key switch). **Palette:** the action "Compare translations · {ref}" uses the selection, then the focused verse, then the first verse on the page. A typed reference adds "Compare {ref}" under the passage result (`compare rom 8:28`, `sammenlign …`). **Translation sheet:** a last row "Compare with other translations…". No new global key. | all; Birthe, Freja, Sofie (phone placement); Kasper (fallback order); Elias (typed ref); Sofie (sheet row); Jonas (mark menu) |
| P2 | Top of the dialog | Eyebrow "Compare translations", title = the reference in the reading translation's own style ("Salme 51,3" / "Psalm 51:1"). The reading translation is a **plain highlighted row**: "You're reading: WEB · World English Bible". It is not a locked checkbox. Under it, "Compare with:" holds real checkboxes styled as chips. Each chip shows the abbreviation plus the plain-language line from the catalog ("NIV · Modern, readable English"). Ticking shows the text at once; there is no Show button. | Sofie F3, Birthe F3, Jonas F9 (row); Mads F3, Freja F2/F6 (chips + description); Mads F8, Ruth F10 (title) |
| P3 | First open | **Tick all the others (up to the cap) and load them.** The picker stays visible, so "first you pick" is just an untick away. Later opens restore the last picks. Empty state (only after unticking all): "Choose at least one translation above". | Kasper F1, Sofie F2, Freja F5 (Birthe, Ruth, Jonas: ok with empty) |
| P4 | Memory | **Per device** (localStorage `compareTranslations`, an array of ids). Stored in the shape an account preference would use; unknown ids and the current id are dropped on read. | 7 of 8 (Elias wants account sync, see Later) |
| P5 | Max | Cap = `min(3, available − 1)`. The "You can compare up to 3 at a time" line shows only when the cap actually limits something (never with today's 4). | Sofie F4, Elias F8, Jonas |
| P6 | Layout | **Stacked everywhere.** Desktop: a modal Dialog with fixed geometry (`top: 8dvh`, `height: min(84dvh, 56rem)`, `width: min(40rem, 100vw − 2rem)`) and text capped at `62ch`. Phone: a Drawer with a fixed `92dvh` height, no snap points, swipe handle on the header only. The body is a **ScrollArea**. At ≤125% text the picker is pinned; at ≥150% it scrolls with the content. Worded "Close" / "Luk" button in the header. | Mads F2, Jonas F6, Birthe F2/F4, Sofie F9 (Elias: side by side, see Conflicts) |
| P7 | What text | The **whole verse units** the selection touches. The range is widened to the **union of bridges across all ticked translations**, so every block covers the same text ("Shown: 3:14–15 · one verse unit in BPH"). Verse numbers and bridge labels as in the reader. Poetry keeps the reader's hanging indents. Section headings and footnote markers are left out; no highlights or margin marks. A muted line "Whole verses are shown" when the selection was part of a verse. | Ruth F3/F7, Mads F5/F6, Sofie F6, Jonas F7 |
| P8 | Alignment | A **versification map** (Issue A) maps through English numbering as the pivot. Each block header gives that translation's own reference. When it differs, a muted header line reads "Verse numbers differ here: 51:1 in WEB". Text placed elsewhere: "Placed at Romans 14:24–26 in this translation". Absent verse: "This translation has no verse 37", with the neighbouring verses shown so the gap sits in place. Psalm title with no number: "The psalm title has no verse number in this translation". No match in the map: "Couldn't match the verses in this translation" + Continue in. **Never fall back silently to the same number.** These notes sit in the header in the UI sans, never in the text flow, and are never copied. | Ruth F1/F2/F4/F5/F8, Jonas F1/F7, Sofie F5, Freja F3, Birthe F8 |
| P9 | Loading / limits | Fetch only ticked translations, through `chapterQuery` + `retryWhenLimited` (shared cache and quota). Nothing is fetched on selection or hover. Each block has a skeleton sized in lines from its verse count. Short wait: "Loading NKJV — a few seconds". Long or daily wait: "NKJV can't be shown right now. Try again in about {{wait}}" (or "tomorrow"), and the others keep working. Failure: "NKJV didn't load" + **Try again** (worded button). A typed `blockError()` helper. A polite live region announces only problems, always naming the translation. | Jonas F2/F3, Sofie F8, Birthe F6, Kasper F5 |
| P10 | Licensing | Each block ends with its chapter's verbatim `copyright` (0.75rem, muted, ≥4.5:1 contrast). The foot has `ScriptureCredit` once. **FUMS: one `useFumsView` per (translation, chapter) slice, only once its text is on screen.** A cross-chapter block reports 2 tokens; a translation unticked before it arrives reports 0. | Jonas F4, Mads F7, Ruth |
| P11 | Copy | Per block: "Copy" (today's format, verses in that translation's own numbering). Foot: "Copy all", which gives a header line `John 3:16 — NIV · NKJV · BPH`, then one paragraph per translation `NIV: …` (`BPH (Salme 51,3): …` when the number differs), then each copyright line once at the end. The ≤100 cap counts verses across all translations (bridges via `anchorVerseCount`). The visible disabled reason reads "Too long to copy at once (128 verses, max 100)". Numbering notes are never copied. | Elias F5, Ruth F8, Jonas, Sofie (Freja: one button with options, not taken) |
| P12 | Jump | A ghost button "Continue in NIV" / "Læs videre i NIV" in each block header, with accessible name "Continue reading in New International Version, Salme 51,3". It switches the translation, goes to the **mapped** chapter + verse, and closes. The toast "Now reading NIV · Back to WEB" stays ≥10 s and pauses while hovered or focused. **Back restores the original translation, chapter and verse.** | Sofie F7, Birthe F4, Kasper F3, Jonas F9 |
| P13 | A11y | Base UI modal (focus trap). Initial focus on the title (a heading with `tabIndex=-1`), so no keyboard pops up on phones. Every close (Esc, outside, Close, swipe) keeps the selection, page and scroll, and returns focus to the selected verse (explicit `finalFocus`, because the menu trigger is gone). Each block is a `<section aria-labelledby>` with an h3 (abbr + name), and its text has `lang` from `Translation.language`. Order: reading row → picker → blocks → foot. Verse numbers read "verse 16"; bridges read "verses 14 to 15". Chips are real checkboxes, ≥44px on touch. Works at 200%. `p`, arrows and page keys never reach the reader behind. axe clean. | Jonas F9, Kasper F2, Birthe, Ruth |
| P14 | Strings | See the table below. "Reading now/Læser nu" is replaced by "You're reading / Du læser i"; "Sæt flueben…" is replaced by "Vælg mindst én…". | Birthe F5, Sofie, Freja, Ruth |

Typography (Mads F1/F4/F7/F9). Header line 1: abbreviation in sans 0.75rem
600, 0.06em tracking, plus the full name muted. Header line 2: own reference in
sans 0.8125rem 500, plus any numbering note. Text: the reader's own face, size
and leading (Paper serif / Clean sans, following text size). Blocks are
separated by 1.75rem + a 12%-ink hairline + 1.75rem (1.5rem on phone); no
cards, and no tint on the current block. No filled accent buttons: the dialog
is a reading surface.

### Strings (en / da)

| Key | en | da |
|---|---|---|
| menu item / title eyebrow | Compare translations | Sammenlign oversættelser |
| menu hint | See the same verses in other translations | Se de samme vers i andre oversættelser |
| reading row | You're reading: {{abbr}} · {{name}} | Du læser i: {{abbr}} · {{name}} |
| group | Compare with: | Sammenlign med: |
| cap line | You can compare up to {{n}} at a time | Du kan sammenligne op til {{n}} ad gangen |
| empty | Choose at least one translation above | Vælg mindst én oversættelse ovenfor |
| whole verses | Whole verses are shown | Hele vers vises |
| bridge widen | Shown: {{ref}} · one verse unit in {{abbr}} | Vist: {{ref}} · ét vers i {{abbr}} |
| numbering | Verse numbers differ here: {{ref}} in {{abbr}} | Versene har andre numre her: {{ref}} i {{abbr}} |
| moved | Placed at {{ref}} in this translation | Står i {{ref}} i denne oversættelse |
| absent | This translation has no verse {{n}} | Denne oversættelse har intet vers {{n}} |
| psalm title | The psalm title has no verse number in this translation | Salmens overskrift har intet versnummer i denne oversættelse |
| no match | Couldn't match the verses in this translation | Versene kunne ikke findes i denne oversættelse |
| loading | Loading {{abbr}} — a few seconds | Henter {{abbr}} — et øjeblik |
| limited | {{abbr}} can't be shown right now. Try again in about {{wait}}. | {{abbr}} kan ikke vises lige nu. Prøv igen om cirka {{wait}}. |
| daily | {{abbr}} can't be shown right now. Try again tomorrow. | {{abbr}} kan ikke vises lige nu. Prøv igen i morgen. |
| failed / retry | {{abbr}} didn't load. / Try again | {{abbr}} kunne ikke hentes. / Prøv igen |
| copy / copied | Copy / Copied {{ref}} ({{abbr}}) | Kopiér / Kopieret {{ref}} ({{abbr}}) |
| copy all | Copy all | Kopiér det hele |
| copy cap | Too long to copy at once ({{count}} verses, max 100) | For langt til at kopiere på én gang ({{count}} vers, højst 100) |
| jump | Continue in {{abbr}} | Læs videre i {{abbr}} |
| jump toast | Now reading {{abbr}} · Back to {{prev}} | Du læser nu {{abbr}} · Tilbage til {{prev}} |
| close | Close | Luk |
| palette | Compare translations · {{ref}} / Compare {{ref}} | Sammenlign oversættelser · {{ref}} / Sammenlign {{ref}} |
| sheet row | Compare with other translations… | Sammenlign med andre oversættelser… |
| shortcut list | Compare translations | Sammenlign oversættelser |

## Conflicts

1. **First open: preselect, or start empty?** Kasper, Sofie and Freja say an
   empty picker means 3 clicks of homework before any reward; with only 3
   others, picking is a formality. Birthe, Ruth and Jonas are ok with empty,
   and it is the owner's literal "first you pick". **Decision: preselect all
   (≤ cap), picker visible.** The owner can flip it to empty with one constant.
2. **Current translation: locked checkbox or plain row?** The owner said
   "highlighted at the top". Sofie, Birthe and Jonas say a checked, disabled
   box reads as broken and is skipped by Tab. **Decision: a highlighted plain
   row**, which still meets "highlighted at the top".
3. **Stacked vs side by side.** Elias: a 40rem strip wastes a 27" screen, and
   comparison is columns. Mads, Ruth, Kasper and Jonas: stacked keeps the
   measure and needs one renderer and no column-sync code; the owner said
   "underneath each other". **Decision: stacked in v1.** "By verse" grouping
   and columns go on the Later list.
4. **Memory: device vs account.** Elias uses two machines, and the other
   reader prefs follow the account. Everyone else is fine with device, and the
   reading translation itself is per device. Account sync = a DB migration.
   **Decision: device**, with the storage shape ready for an account
   preference.
5. **Picker: chips vs full rows.** Mads and Freja want chips (a short pinned
   zone). Birthe and Sofie want words and big targets. **Decision: chips that
   carry the plain-language line, ≥44px, wrapping; not pinned at ≥150%.**

## Issues

- **#166 (A) — Versification map (shared)**: data + mapping pipeline + verification
  fixture + API accepts Hebrew-numbered chapters (BPH Joel 4). No UI.
- **#167 (B) — Compare translations dialog** (depends on #166): everything above.
  Files do not overlap with A except reading `packages/shared/src/index.ts`
  exports.

## Later

- Side-by-side columns / "By verse" grouping on wide screens (Elias F3, Ruth F9).
- Account-synced picks (Elias F4).
- "Show surrounding verses" ±2 toggle (Ruth F6, Elias F10).
- Previous / Next verse and an editable reference inside the dialog (Elias F2).
- New note / Link to a note from the dialog; `?compare=` deep link (Elias F6).
- "Back to comparison" toast action; Alt+1…4 chip toggles (Elias F7, F9).
- A one-time explainer line ("why compare") (Freja F1). Not taken: Sofie's
  rule against explaining instead of showing; the catalog lines carry it.
- Reuse the map for: translation switch landing (Mal 4, Ps titles), the
  "notes in other translations" counts, and reaching BPH Joel 4 in the reader.
- Check the stray raised mark after "14–15" in BPH John 3 (C6) in the reader (Mads F5).

## Owner questions (defaults decided; build goes ahead on them)

1. First open: preselect all others? **Default: yes** (guess; flips "first you pick").
2. Picks per device or per account? **Default: device.**
3. Side-by-side columns on wide screens? **Default: no, later.**
4. Phone menu: move Copy + Compare up, right after the colours? **Default: yes** (guess).
5. Typed "compare rom 8:28" in the palette in v1? **Default: yes.**
6. Fix the existing BPH Joel 4 / translation-switch numbering bugs as their own issue? **Default: yes, after A** (not filed).
7. "Show surrounding verses" in v1? **Default: no, later.**

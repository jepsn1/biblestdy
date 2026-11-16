# Persona panel: one language for notes ↔ passages ↔ marks (2026-11-16)

**Scope:** how every link between a note and the Bible should look and behave on the reader page, whichever direction it was made from (selection → note, or note → `@`/"+ Bibelvers"), in four states (resting, note open, spotlit, hover/focus). Also: is "tag a mark" worth building, and how should the build be split?
**Owner's brief (voice notes, 2026-11-16):** (1) unify; (2) note open = its passages fully highlighted; (3) separate "note open" from the spotlight; (4) a connector from bracket to label; (5) tag a mark from `@`; (6) know plain passage vs highlight vs pen mark vs annotation; (7) "it takes me here and not there".
**Panel: all 8** (owner's call, per REVIEW-PROCESS). Round 1: full findings from each persona. Round 2: one ping-pong round on a decisions draft. Every persona answered ok, objection or pick on 11 decisions and 7 conflicts.
**Evidence:** dev server on `d01c23b` (worktree, ports 3998/5998), test user `delivered+unify@resend.dev`, WEB John 3 seeded with three notes:
- "The bronze serpent": selection, 3:14–15
- "Born again": inline chips 3:3, 3:16 and Rom 8:14
- "God so loved": selection over the gold highlight on 3:16

The seed also has the standard highlights and pen marks. 27 custom shots plus a subset of the standard pack: desktop 1440, tablet 1024, phone 390, Paper/Clean, light/dark, da, 200%. Axe found only pre-existing violations (chapter numeral name mismatch; viewport zoom lock is a product decision). The shots are in the scratchpad and are not committed.

## What exists today (verified in code and on screen)

- **Two link types.** An anchor is a `note_anchor` row: word offsets in one translation, made from a selection. An inline ref is a `note_ref` row: canonical verses, rebuilt from the body's `bible:` links **on every save**, so the row ids change. Marks are separate per-translation rows (highlight, annotation) and are soft-deleted.
- **Resting.** Anchor: bracket (2+ lines) or circle (1 line) in `--note-ink`, plus a label chip in the margin rail. Inline ref, and anchors from another translation: label only, "its words carry no ink and open nothing" (`note-marks.ts`, the #159 decision). At 3:16, "Born again"'s label stacks beside "God so loved"'s bracket and reads as belonging to it (U01).
- **No connector exists.** Annotation boxes already have hand-drawn leaders.
- **Note open has no page state at all.** `openNoteId` never reaches the marks.
- **Two different spotlights for one idea:**
  - **A**, `selectedMarkId`, from an anchor's overview row or `?mark=`. Rest of the page muted by colour. **All** highlights, pen marks and other notes are hidden. Bracket 1.7→2.2. No tint (U04/U41). It also mutes the tail of a partly selected verse ("…should | not perish", U04).
  - **B**, `flash`, from an inline ref's "Read here", its row, `?v=` or the Notes page. Gold `--selection` tint, nothing muted, all ink stays (U12).
- **"Show in text"** on an inline row tints the **chip in the note**, not the Bible (U14).
- **Chip in the editor:** a mouse click places the caret; Ctrl/Cmd+click or Enter opens the preview (U11). The chip is gold `--primary`; the page link is blue `--note-ink`.
- **"It takes me here and not there", reproduced (U03, U81).** Opening a note from its label narrows the sheet to one column and re-paginates to the old spread's first verse. The note's own passage ends up on another page. Cause: `onOpenNote(noteId)` carries no mark, and the reflow restores `readingVerse` (`paginated-chapter.tsx` ~1176–1192).
- **Click priority (U30).** Clicking a word that is both highlighted and under a note anchor opens the note. The highlight's recolour/remove menu is unreachable by click (`onWordClick` checks `note:` before highlights). Inline-ref words open nothing. U30 also shows the "@" typed during the U21 run, which was autosaved.
- **Phone bug, new (U60/U66, persists after 8 s and a resize):** the highlight wash is shifted by the inline note icon's width. The blue on 3:3 covers "tainly I tell you, unless o" instead of "you, unless one is born", and the gold wash paints a box over the 3:16 marker (U61).
- **Phone drawer:** a row tap spotlights under a drawer that covers about 90% of the screen, so nothing is visible (U64). "Read here" instead closes the drawer and navigates after 500 ms, a third behaviour.
- **`@` "On this page"** lists the whole chapter's marks (the page showed 3:1–8). Picking one inserts a plain verse chip, so the mark is lost (U21).
- **Bundle:** `scripts/bundle-budget.mjs` reports /read at 346.2 / 350 KB gz. `lib/i18n.ts` imports both locales eagerly (~11–12 KB gz each).

## Findings (merged, ranked)

| # | Finding | Sev. | Raised by |
|---|---|---|---|
| 1 | Opening a note lands on a page without its passage (U03, U81) | blocker | all 8 (Jonas: cause traced, S) |
| 2 | Phone: spotlight fires under a 90% drawer; nothing visible (U64) | blocker | Freja, Birthe, Sofie, Kasper, Elias, Jonas, Ruth, Mads |
| 3 | Phone: highlight wash sits on the wrong words (offset by the note icon), and the gold paints over the marker (U60/U61/U66) | blocker | Ruth, Sofie, Mads, Jonas, Freja, Kasper (verified) |
| 4 | Four looks for "show me this ref" (spotlight A, gold flash B, chip tint, popover) | major | all 8 |
| 5 | Inline refs have no bracket; their label sits on another note's bracket (3:16) | major | all 8 (Mads: blocker) |
| 6 | Note open leaves no trace on the page | major | all 8 |
| 7 | Spotlight hides the reader's own marks, even those on the spotlit words | major | Ruth, Birthe, Kasper, Sofie, Elias, Mads, Jonas, Freja |
| 8 | Note-anchor words swallow the click on a highlight beneath them; inline-ref words do nothing | major | Jonas, Sofie, Elias, Mads, Birthe, Ruth, Kasper, Freja |
| 9 | "Text" means two things: "Show in text"/"Vis i teksten" acts on the note; "Insert in text" is jargon | major | Sofie, Birthe, Freja, Kasper, Elias |
| 10 | Spotlight cuts a verse mid-sentence (3:15 "should \| not perish") | major | Ruth |
| 11 | One relation, two inks: gold chip in the note, blue bracket on the page | major | Mads (round 2: all 8 agree) |
| 12 | Phone: identical icons per note, no names; gutter bracket unexplained | major | Freja, Birthe, Mads, Sofie |
| 13 | Chip click only places the caret; Ctrl+click is undiscoverable (iPad has none) | major | Sofie, Birthe, Freja (Kasper, Elias object) |
| 14 | No hover/focus link between chip and passage, either way | major | Elias, Ruth, Mads, Sofie, Jonas |
| 15 | Refs on other pages or chapters give no hint ("p. 3", "Rom 8", "1 more on p. 2 →") | major | Elias, Sofie, Ruth |
| 16 | Spotlight has no visible exit (Esc / click-anywhere only) | major | Birthe, Sofie |
| 17 | Labels: tiny, truncated ("The bronz…"), switch side, slide under the tool rail at 200% (U50) | major | Birthe, Mads |
| 18 | Screen reader: label doesn't name its passage, spotlight is silent, verse doesn't say it's linked | minor | Jonas |
| 19 | Deleting is asymmetric: typed rows have no ×, removing a chip is silent, the eraser over a note bracket silently does nothing | minor | Sofie |
| 20 | `@` "On this page" lists the whole chapter; picking a mark drops the mark | minor | Elias, Sofie, Freja, Kasper |
| 21 | Bridges/renumbering: label says "John 3:16" while BPH prints 3,15–16 with no explanation | minor | Ruth |
| 22 | Keyboard: chip → passage takes 3+ keys; no next/prev ref | minor | Elias |
| 23 | Bundle headroom 3.8 KB; both locales eager | minor | Jonas |
| 24 | Wide screens: panel takes half, spread collapses at any width | minor | Elias |
| 25 | Plain-text refs in a note ("**Numbers 21:4-9**") aren't links; suggest linking | polish | Ruth |

## Recommended unified model

One link = one look, whatever its origin. The bracket is the link. The label names the note. The connector only appears when it helps. Emphasis is one rising ladder: rest → open → spotlit. Each step adds one thing, and nothing is ever louder than the scripture. Words carry the reader's own ink; the margin carries the note's ink. The two never merge.

### States

| Element | Resting (note closed) | Note open (all its refs on the visible page) | Spotlit (one ref) | Hover / focus (chip ↔ passage) |
|---|---|---|---|---|
| **Bracket** | `--note-ink` 1.7, round caps, for **every** link. Selection anchor: its words' lines. Inline ref, other-translation anchor, or picked mark: whole verse(s)/bridge unit. Overlaps nest in lanes 5 px outward (shortest nearest the text), max 2 lanes. 3+ notes on overlapping lines: one bracket + a "3 notes" label → list | 2.2 | 2.4 | 2.2 for that ref |
| **Label** | Typeset tab: transparent fill, 45% ink border, `--note-ink-text`, level with the top hook of its own bracket. Min rail 7.5rem before icon-only; single column always uses the right margin; scales with text size, never under the tool rail | Filled (`--note-ink` bg, `--background` text), `aria-expanded` | Only this note's label shown, filled | Filled for that ref |
| **Connector** | Only when stacking pushed the label more than half a line from its hook: typeset straight elbow, 1 px, 40% ink, `aria-hidden`, still layer (fades on page turns) | Always for this note's refs, 1.25 px, full ink | This ref's only | This ref's |
| **Passage text** | Untouched | `--link-wash` over whole touched verses (~10% Paper light, 12% Paper dark, 9% Clean light, ≤14% Clean dark). Skipped on words under a highlight (blue over gold turns muddy). **No dimming** of the rest | `--link-wash-strong` (~1.6×) over whole touched verses; every other word stepped to `--muted-foreground` (colour, keeps 4.5:1). Never mute words inside a touched verse; the word-precise part is shown by the bracket only | `--link-wash` for that ref; no muting |
| **Reader's own marks** | Normal | Normal | Inside touched verses: full strength. Outside: one opacity on the wash/pen layers, ~35%. Never hidden | Normal |
| **Other notes** | Normal | Labels and brackets step back by colour (`--border` + `--muted-foreground`), not opacity; still clickable at 4.5:1 | Hidden labels, brackets at 35% | Normal |
| **Chip in the note** | `--note-ink` (was gold): transparent bg, 45% ink hairline, `--note-ink-text`. Contrast checked in dark | Same | Strong wash on the chip(s) of this ref | Outlined |
| **Fixed chrome** | none | none | Footer line, in the still layer: "Showing John 3:14–15 · Show all" / "Viser Joh 3,14–15 · Vis alt". Quiet text, 44 px hit area, user text size. `role=status` announce. Esc and click-anywhere still end it | none |

Spotlight outranks note open. They differ in three ways: muting (spotlit mutes the rest, note open never does), scope (one ref vs all of the note's refs), and duration (until the next click vs while the note is open). The gold `--selection` flash stays **only** for a plain go-to-verse `?v=` from search or the jump box; nothing that comes from a note uses it. The spotlight is keyed by canonical href, never by `note_ref.id`.

Hover runs both ways. Hover/focus a chip or overview row → its ref on the page. Hover a bracket or label of the **open** note → its chip(s) and row (Kasper: only for the open note, so the margin doesn't flicker). It takes 120 ms, with no motion and no muting, and is never the only cue (Birthe has no mouse).

Reduced motion: every state changes at once. Print: brackets 0.75 pt at 60% black; labels as small titles; no washes, connectors or muting; spotlight never prints.

### Click map (after)

| Target | No tool | Pen/highlight tool | Eraser |
|---|---|---|---|
| Label (tab) | Open note, **turn to this ref**, note-open state | same | same |
| Bracket (12 px invisible hit strip) | same as label | same | Hint toast: "Linked to the note 'Born again', remove it there · Open note". Never erases a link |
| Connector | decoration, no target | – | – |
| Words with only a note link | Open that note (the selection's quick path kept) | Tool acts on the words | nothing (hint as above) |
| Words with a mark and a note link | The mark's own menu, with "Open note: X" row(s) on top | Tool acts on the mark | Erases the mark |
| Words with only a mark | The mark's menu (as today) | as today | as today |
| Phone marker | One per verse: icon + ~12-character title, or icon + "2 notes" → keyboard-navigable list | – | – |
| Chip in the note | Single click/tap opens the preview, caret after the chip (see C6). Enter opens; **Alt+Enter = spotlight directly** | – | – |
| Preview "Show in Bible" | Spotlight on this page/chapter, or navigate there with the note kept open, then spotlight | – | – |
| Overview row, any kind | Spotlight (same as above), toggles on a second click | – | – |
| Overview "Find in note" | Selects and tints the chip in the note | – | – |
| Notes page row / palette ref | Navigate with `?note=&mark=` → the same spotlight | – | – |
| `]` / `[` (lib/shortcuts.ts) | Next/prev ref of the open note, across pages and chapters | – | – |

Naming:
- To the page: **"Show in Bible" / "Vis i Bibelen"**, with "(BPH)" when the reader is in another translation than the ref's snippet (Ruth).
- To the chip: **"Find in note" / "Find i noten"**.
- "Insert in text" → **"Add to note" / "Tilføj i noten"**.
- `@` heading → **"In this chapter" / "I dette kapitel"**.

Overview rows gain a location tag: "this page", "p. 3", "Rom 8". With a note open, the footer says "1 more on p. 2 →".

### Phone

There is no margin, so the gutter bracket (1.5 px, 4 px from the text, every link) plus one marker per verse replace the bracket, label and connector. The marker always sits on the page background, never under a wash, and the wash is measured after the markers are placed (finding 3). The drawer snaps to [45%, full] (base-ui `snapPoints`, overlay opacity 0 at the peek, focus not trapped there). Opening a note from a marker, and any spotlight, snaps it to 45% and scrolls the passage into the visible top. The peek keeps the title and the tapped row visible, plus a "Back to note" handle. Never spotlight under a full drawer; never close the drawer to show text. While the drawer is full, the passage above it shows the note-open wash.

### Unaffected

The Notes page keeps its list and navigates into the same spotlight. The compare dialog is unchanged: no note ink, since its blocks are per-translation text.

## Round 2: decisions draft (ok / objection / pick)

All 11 decisions (D1–D11) were accepted, with these riders adopted:
- Jonas: recede by colour, not opacity.
- Mads: skip the wash under highlights; no second darker wash for the word part; lanes.
- Kasper, Mads: the exit is a quiet footer line, not a banner.
- Sofie, Birthe: the exit has a 44 px target in the user's text size.
- Sofie: "Back to note" handle on the peek; "2 notes" in words.
- Freja: a single-note marker shows its short title.
- Kasper: closing the note returns to the same verse.
- Elias: Alt+Enter, `]`/`[`, and the location tags.
- Ruth: name the translation.

| Conflict | Picks | Decision |
|---|---|---|
| C1 Spotlight vs the reader's other marks | (b) fade ~35%: **8/8** | Fade outside the touched verses, keep inside at full |
| C2 Connector | (b) only when the label stacked away, always for the open note: **8/8** | Adopted; typeset elbow, never hand-drawn (Ruth, Mads: hand-drawn = the reader's own writing) |
| C3 Word click | (a) only a note → open it; mark + note → the mark's menu + "Open note" rows: **8/8** | Adopted; must ship **before** any mark tagging (Jonas) |
| C4 Tag a mark | (a) live mark link: Jonas, Elias, Ruth, Freja. (b) copy the mark's words as an ordinary word-precise link: Sofie, Mads, Birthe, Kasper | **4–4, owner decides** (see below) |
| C5 Phone gutter bracket | (a) keep: 7. (b) drop: Freja ("reads as a scroll bar") | Keep; Freja's and Elias's riders: start it level with the marker, hide it while the drawer is full |
| C6 Chip click in the editor | (a) single click opens the preview: Ruth, Sofie, Freja, Birthe, Mads, Jonas (conditional). (b) caret, Ctrl+click follows: Kasper, Elias | (a), **if** a drag-selection across a chip and arrow keys still work (Lexical test), else (b). Owner may overrule |
| C7 Chip colour | (a) note-blue: **8/8** | Adopted; contrast-check `--note-ink-text` on the chip in dark |

## Tag a mark: verdict

All 8 agree it is **not** worth a new visual dialect. A mark-linked ref looks exactly like any word-precise link: bracket beside the colour, never wrapping or replacing it; the mark keeps its colour on the words; no swatch on the page label. The disagreement is only about **storage**.

- **(a) Live link** (Jonas's design). Store the mark id in the link **title**: `[John 3:16](bible:JHN.3.16 "mark:hl:<uuid>")`. The shared `LINK` regex already accepts titles. An href suffix (`#hl-…`) would fail `parseScriptureHref`, and old tabs would save it as `about:blank`, which is data loss. Add nullable `note_ref.mark_kind`/`mark_id` columns (migration before deploy). While the mark exists in this translation, the page draws word-precise from the mark's current words and follows edits; undo of an erase brings it back.
  - Otherwise it falls back to verse level, **not silently** (Ruth's condition): the overview row says "marked in WEB" / "mark removed".
  - Optional glyph on the chip in the note (Elias; Mads objects).
  - Wins: colour as code (Elias: gold = promise) and "this circled word". Effort M.
- **(b) Copy the words.** Picking a mark creates an ordinary word-precise link over the mark's words. Nothing depends on the mark later, so recolouring or erasing changes nothing. Wins: nothing can break behind the reader's back (Birthe, Sofie, Kasper); one mode fewer (Mads). It still needs somewhere to store word offsets on an inline ref (a title attribute `words:<translation>:<range>`, or a `note_anchor` row created alongside, which Jonas dislikes: two rows for one ref).
- Both camps: build it **last**, after C3. Freja: add an entry point **from the mark** too ("Add to note…" in the highlight and pen-mark menus; highlights already have "Create note").
- Cut either way: carrying marks across translations, keeping links alive through erase without undo, and mark-shaped page visuals.

**Recommendation:** ship the honest interim now (finding 20: rows say "John 3:16 · gold highlight", a plain verse ref, "In this chapter"). Then build (a) with Ruth's visible fallback, because it is a superset of (b)'s look and needs the same storage slot. Choose (b) if the owner rates "can't break" above "follows my colour".

## Proposed build issues (not created)

Each issue is one agent with its own files. The order is the dependency order. "‖" = can run in parallel.

1. **Phone ink drift**: the highlight wash is offset by the inline note marker, and the wash paints over the marker. Measure after the markers are placed / exclude `[data-ink-box]`; a test that a highlight's first and last word match between phone and desktop layouts. Files: `highlight-marks.tsx` (+ the marker's spot in `chapter-text.tsx`). S. ‖ 2, 3.
2. **Note open keeps its passage**: `onOpenNote(noteId, markId?)`, set `readingVerse`/`wantedVerse` before the reflow, and return to the same verse on close. From the Notes page/palette, land on the first ref in this chapter. Test beside `turn-still.test.ts`. Files: `paginated-chapter.tsx` (open/close + reflow), `annotation-marks.tsx`/`chapter-text.tsx` call sites (one arg). S. ‖ 1, 3.
3. **Bundle headroom**: lazy-load the inactive locale (~11 KB gz). Files: `lib/i18n.ts`. S. ‖ 1, 2. Unblocks the rest of /read growth.
4. **One spotlight**: every ref path (overview rows of both kinds, chip "Show in Bible", Notes page, palette) → `selectedMarkId`, keyed by canonical href. Whole touched verses lit; marks inside kept and outside faded ~35%; `data-flash` only for `?v=`; footer exit line + `role=status`; print rules; inline "Read here" in the drawer uses the same path. Files: `spotlight.ts`, `paginated-chapter.tsx` (showAnchor/readRef/flash), `app.css`, `page-foot.tsx`, `highlight-marks.tsx`/`annotation-marks.tsx` (the fade prop only), `routes/notes.tsx`. M. After 2 (shared file), 1.
5. **One mark for every link + note-open state**:
   - Brackets for verse-level marks (drop #159's no-ink rule).
   - Lanes; "3 notes" collapse.
   - Note-open wash + bracket 2.2 + filled label; other notes recede by colour.
   - Connector rule (C2).
   - Label typesetting: transparent tab, min rail, single column → right margin, scales with text size, never under the tool rail.
   - `--link-wash*` tokens.
   - SR names: label "Note 'X', John 3:14–15", `aria-expanded`; verse label ", note: X".
   Files: `note-marks.ts`, `annotation-marks.tsx`, `ink-geometry.ts`, `scribble.ts`, `app.css` tokens, one prop line in `paginated-chapter.tsx` (`openNoteId`). M. After 4.
6. **Word-click rule (C3) + eraser hint**: words with mark + note → the mark's menu with "Open note: X" rows; words with only a note → open it; eraser over a note link → hint toast with "Open note". Add "Add to note…" to the highlight and pen-mark menus (Freja). Files: `chapter-text.tsx` (onWordClick, menus), locales. S–M. After 1. ‖ 5.
7. **Chip ↔ page, editor side**:
   - Chip in note-blue (C7).
   - Single click opens the preview, guarded by a Lexical drag/arrow test, else keep Ctrl+click (C6).
   - Alt+Enter = spotlight; `]`/`[` next/prev ref (via `lib/shortcuts.ts`, shortcuts sheet).
   - Hover/focus both ways (event bridge like `ref-bridge.tsx`, drawn from `geo`, no re-measure).
   Files: `scripture-chip.tsx`, `ref-bridge.tsx`, `scripture-ref-node.tsx` (styles only), `lib/shortcuts.ts`, `shortcuts-dialog.tsx`. M. After 5.
8. **Overview + words**:
   - Verbs: "Show in Bible"/"Vis i Bibelen" (+translation), "Find in note"/"Find i noten", "Add to note"/"Tilføj i noten".
   - Ref labels in note-blue.
   - Location tags ("this page / p. 3 / Rom 8") + footer "1 more on p. 2 →".
   - × with Undo for typed rows (removes the chip) + toast on chip removal.
   - Bridge note "John 3:16 = BPH 3,15–16".
   - Row actions visible at rest.
   - `@` heading "In this chapter"; honest mark rows (finding 20 interim).
   Files: `references-overview.tsx`, `ref-typeahead.tsx`, `mark-row.tsx`, locales. M. After 4.
9. **Phone drawer + markers**:
   - Drawer snaps [45%, full], overlay 0 at the peek, focus not trapped.
   - Open-from-marker and any spotlight snap to 45% and scroll the passage into view; "Back to note" handle; never close the drawer to show text.
   - One marker per verse: short title, or "2 notes" → list.
   - Gutter bracket starts level with the marker and hides while the drawer is full.
   Files: `paginated-chapter.tsx` (drawer block), `components/ui/drawer.tsx`, `chapter-text.tsx` (markers), `annotation-marks.tsx` (compact gutter). M. **After #195** (drawer work in flight) and 4, 6.
10. **Tag a mark (C4, owner's pick)**, last:
    - Storage, for (a) or (b): title attribute on the `bible:` link, `ScriptureRefNode.__mark` (exportJSON v2, import reads the title), `refsInMarkdown` returns it.
    - Additive `note_ref.mark_kind/mark_id` (run before deploy).
    - Reader resolution with the visible fallback line.
    - `@` picking a mark stores it; optional chip glyph.
    Files: `packages/shared/scripture-href.ts`, `scripture-ref-node.tsx`, `ref-typeahead.tsx`, `use-page-marks.ts`, `note-marks.ts`, API notes store + migration. M. After 6, 7, 8.

**Later (not in this batch):**
- Wide screens: panel capped ~640 px, two-column spread kept at ≥1900 px (Elias).
- "Link Numbers 21:4–9?" suggestion for plain-text refs in a note (Ruth).
- `n` to cycle notes on a focused verse (Elias).

## Open questions for the owner

1. Tag a mark: (a) live link that follows the mark, or (b) copy its words? (panel 4–4)
2. Desktop chip click: open the preview (6 of 8) or caret (Kasper, Elias)?
3. OK to drop #159's "inline refs get no ink", so every link gets a bracket?
4. OK to turn chips from gold to note-blue?
5. Spotlight exit wording: "Vis alt" ok?
6. Lazy-load the inactive locale to free bundle room?

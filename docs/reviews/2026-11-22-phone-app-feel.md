# Phone app feel: every control thumb-sized (#262)

**Date:** 2026-11-22. **Panel:** Sofie, Mads, Jonas, Birthe, Freja, Elias (the UI chrome / a11y / overlays row). One findings round on a builder's brief with 13 proposals (each with a lean), then one ok/objection round on a decisions draft with 8 open points (C1–C8).

**Owner (binding):** "most of the app is very very web-like even on mobile … please do a pass on all UI elements on mobile and make them feel more like an app and less like a web thing … you're using your thumbs". Thumb-sized (≥44pt) everything, icons instead of words where the panel agrees (accessible names kept), tap anywhere in the note body focuses the editor, big formatting buttons.

**Owner principle (new standing rule, also in `docs/REVIEW-PROCESS.md`):** biblestdy is a **phone app first, scaled up to desktop**, not a web app condensed down. Each surface is designed for thumbs first, then adapted to desktop. Screenshots and panel judgement go phone-first.

**Evidence:**
- Dev server from worktree `wt-262` (main `f3ec810`), API without `API_BIBLE_KEY` (fixture chapters), test user `delivered+262`, WEB John 3 seeded.
- Playwright at 390×844, iPhone UA, touch, @2x. 19 surfaces (reader, reader end, More, Settings, search empty/typed, bottom-bar Find, book/chapter chooser, translation chooser, selection pill, selection drawer, highlight drawer, note peeked/expanded/new, Notes panel, compare, Notes page, Notes page note, sign-in, landing), each light, dark and 200% text.
- A target inventory per surface: every visible control under 44px in either direction.
- Screenshots are in the session scratchpad, not committed (`262/before`, `262/pr*`).

## What the walk found (before)

- **Button sizes were desktop sizes on every device:** default 32px, sm 28, icon 32, icon-sm 28. Nothing grew on touch.
- **Top bar:** "John 3 ⌄" 87×28, "WEB" 39×28, "🔍 Search" 80×28, "⋯ More" 67×28. At 200% the row wrapped to two lines, costing about 45–60px of reading height on every page.
- **Every sheet's ×** (PanelHeader, dialog, sheet) was 32×32; the note's expand icon too.
- **Settings:** segmented controls 36px tall with 12px text; "Show the tour again" and the support links are plain ~20px text links.
- **Note editor:** undo, redo, B, I, U and the three list toggles are 20×20; "+ Verse" 66×28; "+ Add topic" 82×22. The editable body is only as tall as its text, so on a new note only the first line takes a tap (the owner's bug). In the verses list, "Add to note" is a 12px text link next to a small ×.
- **Notes page:** "📖 Bible" 71×40, "+ New note" 99×40, search 40, topic select 28, Recent / Bible order 36. At 200% "+ New note" and "+ Verse" shrink to a lone "+".
- **Sign-in:** field and "Send code" 32px; footer links 24px. Landing header links 32px.
- **Tap feedback:** buttons nudged 1px on press (a desktop idiom); the grey iOS tap flash wasn't suppressed. Tailwind 4 already gates `hover:` on a hovering pointer, so sticky hover was mostly not real; the one raw `:hover` left is the editor toolbar's in `app.css` (Jonas).
- **Bug:** the Notes panel shows "Written in 9879dbb7cfe39e4d-01" (a raw translation id) for a note written in a fixture translation (Freja, Elias, Sofie).
- **Already fine:** bottom bar thirds (119×52), More sheet rows (48+), search rows (~56), place and translation chooser rows, selection pill buttons (44).

## Decisions (6/6 unless noted)

- **D1 (P1) A 44px floor on touch.** On a coarse pointer (phone or iPad) every Button, Input and Select trigger is at least 44px. Button heights live in a `--btn-h` variable, so a call site's own `h-*` still wins (a link-styled Button inside a line stays in its line, Jonas). The floor is in px, so 200% text doesn't double it. Things inside the running text (the note chip) keep their look and get an invisible hit area (Mads). Dense lists on an iPad grow their hit area, not their look, where that is possible (Elias).
- **D2 (P2) Pressed, not hover.** On touch every control darkens while the finger is on it: an 8% ink overlay, so it shows in dark mode and on filled buttons (Mads). The grey iOS tap flash goes in the same change (Jonas: never neither), the 1px nudge stays on mouse only, `touch-action: manipulation` on controls.
- **D3 (P3 + C1, C2) Top bar on phones:** "John 3 ⌄" and "WEB" keep their words (they are the place and the edition). **Search and More become 44px round icon chips** (🔍 20px, ⋯ 22px, growing with text size to 28/30, muted ink), with the accessible names "Search or go to…" and "More". The row is 48px tall and never wraps on a phone: the book name gives way (ellipsis), never the icons (Jonas, Sofie). Measured: one row at 100–200%, en and da, 390 and 320 wide. The worded "🔍 Find" in the bottom bar keeps the word for search; the sheet keeps the title "More".
  - C1, ⋯ alone: **6/6 in round 2.** Birthe objected in round 1 ("three dots look like a smudge") and accepted once the facts were in: "⋯ More" with its word wraps the row at 200%. Her conditions: the round fill (C2) and the sheet titled "More".
  - C2, look: **faint round fill**, 6% ink on light, 10% on dark (Sofie's values). **3–3** (Freja, Sofie, Birthe for the fill; Mads, Jonas, Elias for a bare glyph with the pressed tint only). Tie broken by Birthe's condition on C1: the 6/6 for ⋯ alone rests on it. Owner may overrule; it is one class on two buttons.
- **D4 (P4) Search screen keeps "Cancel" / "Annullér"** (iOS's own search says it; a ← beside a field with its own ⓧ is two ways out). It grows with the text size, ≥16px, weight 600 (Birthe, Mads, Sofie).
- **D5 (P5) Sheet headers:** × 44px (glyph stays 16–20px), always visible. Titles wrap to two balanced lines at large text instead of "…" (Mads, Sofie, Birthe).
- **D6 (P6) Selection pill keeps "Highlight · Note · More"** (verbs, decided 8/8 on 2026-11-17). At 200% it stays one row, 44 tall, words capped at 18px; icons go before words (Mads F7).
- **D7 (P7 + C6) Settings and More like iOS Settings:** segmented controls 44px with 14px text; "Show the tour again", Buy me a coffee, Share and the Instagram links become full-width 48px rows. One trailing glyph per kind: › stays in the app, ↗ leaves it, never both (Mads). More's Notes / Margin notes rows get a real on/off switch (the Single-key shortcuts one) instead of the grey word "Hidden" (Birthe, Sofie; C6 6/6).
- **D8 (P8 + C5) Note editor:**
  - **Tap anywhere in the body area focuses the editor.** CSS only: the editable fills the area down to the verses list, so a tap lands in the real contenteditable and iOS opens the keyboard inside the tap (Jonas F1). A tap below the last line puts the caret at the end, synchronously in the pointer handler (Jonas F2).
  - Toolbar: 44px hit, glyphs 20px stroke 1.5 in muted ink (Mads), gap 0. "+ Verse" appears once (Freja).
  - When it doesn't fit (large text): **one row that scrolls sideways** with an edge fade (C5, **4–2**: Freja, Elias, Jonas, Mads; Sofie and Birthe wanted two rows: a sideways scroll is a hidden gesture). Jonas: wrapping changes the toolbar's height while you type, so the text jumps under the thumb. `touch-action: pan-x`, tested against the drawer's drag.
  - Redo stays, last in the row (Elias, Sofie; the others were fine dropping it, so keeping it costs nobody).
  - No keyboard-docked toolbar in this pass (all ok; Elias wants it on the later list).
  - The editor toolbar's raw `:hover` moves under `(hover: hover)` (Jonas F4).
- **D9 (P9 + C4) Note verses list:** "Add to note" → **"Quote in note" / "Citér i noten"** (Sofie, Freja; 6/6). The × stays an × with the accessible name "Remove John 3:12 from note" and a 44px hit area (**5–1**; Birthe wanted the word "Fjern": an unexplained × next to her verse scares her. The others: a second word in a row that already says "Quote in note" turns it into a toolbar). Credit links keep their quiet 12px look and get a 44px hit band (a pseudo-element, not padding; bands must not overlap).
- **D10 (P10 + C3) Notes page:** header, search, topic select, Recent / Bible order all 44. The back link names where it goes: **"‹ John 3"** (the chapter you came from), "‹ Bible" only on a deep link (C3 6/6, Elias's round-1 objection). "+ New note" keeps its word at every size (Sofie, Mads). The Notes drawer's footer ("+ New note", "All notes ›") becomes two 48px buttons (Elias F2). The raw translation id is fixed: show the abbreviation, or leave "Written in" out (bug).
- **D11 (P11) Sign-in and landing:** email field and "Send code" 48px with 16px text (iOS zooms below 16px, Jonas). Footer and header links 44 hit. The sign-in honours the text size like the landing does (Birthe F1); on phones the card loses its border and goes full width (Freja F6).
- **D12 (P13 + C8) Bottom bar:** words unchanged, pressed state added. At 200% "‹ 2" becomes "‹ Ch. 2" / "‹ Kap. 2" if it fits in Danish without truncating; else it stays "‹ 2" (6/6).
- **D13 (P12 + C7) The icon rule on phones** (replaces "never an icon alone" on phones; desktop keeps the old rule). An icon may stand alone only if:
  1. it is on this closed list: search 🔍, more ⋯, close ×, back ‹ (only paired with its destination word, e.g. "‹ John 3"), selected ✓, the editor's B / I / U / lists / undo / redo;
  2. it has an accessible name, and that name starts with the visible word wherever there is one (Sofie);
  3. its hit area is at least 44px;
  4. it is never the only way to a feature (search keeps the worded bottom-bar "Find", Jonas);
  5. a control that has a word at 100% never loses it at a larger text size, including in container-query shed rules (Sofie, Jonas: today's lone "+" on the Notes page);
  6. one glyph means one thing and looks the same everywhere (Elias, Mads).
  "+" is not on the list.
- **Unchanged:** zero toasts on phone, the zoom lock with in-app text size, controls near the text never slide with page turns, safe-area tokens, ScrollArea, /read ≤350 KB gz (everything here is CSS or class changes; the caret handler sits in the lazy editor chunk).

## Owner directions after the panel (binding, 2026-11-22, real iPhone)

- **O1, no note footer.** The note's footer row ("✓ Saved … Close note") goes everywhere it rendered (reader drawer and the Notes page note): "this footer has no justification for even existing". Close is the header's ×; saving is silent; a failed save still shows "Not saved · Retry" in the note's notice line. (#265)
- **O2, rounded corners.** Nothing interactive may enter the glass's ~55pt corner arcs. Every bottom edge pads by `--corner-bottom` (≥24px on touch phones, because Safari reports no bottom inset while its toolbar is collapsed), bottom-row content ≥12px in from the sides, and `tools/review/safe-area-shots.mjs` fails `corner-*` (standing rule in `REVIEW-PROCESS.md`). The reader's chapter bar is fine on the home screen and keeps its look there. (#265)
- **O3, labels tab-bar style.** On phones controls are icon-first like native apps. Where a word is kept, it sits small and muted *under* the icon (≥12px, capped 15px), not beside it (`tab-label`); the accessible name is unchanged. Applied to the note header's "⋯ More" / "× Close" (#265) and to every remaining phone toolbar in this pass. This supersedes D2-style "icon + word on one line" on phones; desktop keeps one line. It does not change D13: words a control has keep showing, just under the icon.
- #263 (#261) shipped the word "Remove"/"Fjern" on a note's verse rows before this panel's C4 (× named); that stands (Birthe's preference, and O3 allows a kept word).

## Earlier rules this reverses (recorded)

- **2026-11-15 navigation, 2026-11-16 nav follow-ups:** "words never go … never an icon alone", the worded "Search" button and worded "⋯ More" on phones. **Reversed on phones only** for 🔍 and ⋯ in the top bar (D3), under the closed list in D13. Desktop and tablet rows keep the shed order and their words. Birthe's original blocker (words vanishing at 175–200%) is kept as rule D13.5: no control loses a word it has at 100%; Search and More simply never had a word on phones now.
- **2026-11-17 selection pill:** "words only, no lone icons" stays; the pill's × was already a lone icon and is now within D13.
- **2026-11-17 omnisearch:** "Cancel" stays; it now grows with text size (D4).

## Surface by surface (before → decision → PR)

| # | Surface (before shot) | What was wrong | Decision | PR |
|---|---|---|---|---|
| 1 | Reader top bar (`01-reader`) | 28px words; wraps at 200% | D3: icon chips, 48px row, never wraps | 1 (#264) |
| 2 | All Buttons / inputs / selects | 28–32px on touch | D1, D2 | 1 (#264) |
| 3 | Sheet headers (`03`, `04`, `08`, `09`, `15`) | × 32px | D5: × 44 (via D1); titles wrap | 1 (×), 4 (titles) |
| 4 | Reader end / note credits (`02`, `13`) | "WEB copyright and sources" / "Text via API.Bible" 12px links, 16 tall | 44px hit band, look unchanged (D9) | 3 |
| 5 | Bottom bar (`01`, big) | "‹ 2" at 200% | D12 — **held**: the owner says the bar is fine; left as is | — |
| 6 | More sheet (`03-more`) | "Hidden" word reads as a warning | D7: switch | 3 |
| 7 | Selection pill (`10`, big) | becomes a vertical card over the text at 200% | D6: one row | 3 |
| 8 | Highlight drawer (`12`, big) | purple swatch clipped at 200% | 44px swatches, row fits the width (Mads F6) | 3 |
| 8b | Note footer; every bottom edge | footer redundant; corners clip | O1, O2 | 2 (#265) |
| 9 | Settings (`04-settings`) | 36px segments, 20px text links | D7 | 4 |
| 10 | Search (`05`–`07`) | "Cancel" stays 13px at 200% | D4 | 4 |
| 11 | Translation chooser (`09`, big) | "✓ Selected" squeezes the name to 3 lines | trailing ✓ only, named "Selected" (Mads F5) | 4 |
| 12 | Compare (`16`) | "Translations 2" chip 28px | 44 via D1; 48px rows (Elias F3) | 1 (chip), 4 (rows) |
| 13 | Notes panel (`15`) | tiny footer links; raw id | D10 | 5 |
| 14 | Notes page (`17`, `17b`) | 36–40px controls, lone "+" at 200% | D10 | 5 |
| 15 | Sign-in, landing (`18`, `19`) | 32px field/button, 24px links, ignores text size | D11 | 5 |
| 16 | Note editor (`13b`, `14`, `17b`) | 20px toolbar, one-line tap target, unclear verse row | D8, D9 | 6 (after #261) |

## Later / not now

- A keyboard-docked editor toolbar (Elias; Birthe against anything that jumps).
- Untitled notes in lists show their first line instead of "Untitled note" (Freja F4, Elias F4).
- "Commands" in search reads as developer jargon; "Choose translation…" needs a hint (Freja F2). "WEB" as a mystery word; the translation sheet could say "Bible version" (Freja F3).
- Hide "‹ Chapter 0" on chapter 1 rather than show it disabled (Freja; unchecked).

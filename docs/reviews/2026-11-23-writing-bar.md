# The app's writing bar and "+ Verse" (#277)

**Date:** 2026-11-23. **Panel:** Sofie, Mads, Jonas, Birthe, Freja, Elias (the UI chrome / a11y / overlays row). One round on a builder's brief with 9 questions (each with a lean), measured DOM facts and iOS references.

**Review sentence:** In the iPhone app, while writing a note with the keyboard up, how should the docked format bar be grouped, ordered and sized, and how should "+ Verse" work, so the bar reads like a native iOS keyboard bar (not a broken toggle group) and inserting a verse never loses the note or the keyboard?

**Owner (binding, real iPhone, TestFlight 1.0.0 (3)):** "decent but the bible verse popover thing is a mess, and the formatting buttons are messed up — it looks like it's supposed to be a toggle group but the order is messed up, yet some buttons don't look like they belong in the same group regardless. Also they seem a little small." Stays a web bar riding the keyboard; a native bar is a recommendation only.

**Evidence:** dev server from `wt-277`, API without `API_BIBLE_KEY` (fixtures), user `delivered+277`. Playwright at 390×844 (iPhone UA, touch, @3x) with `window.Capacitor` + the WebKit bridge stubbed, the Keyboard plugin's events fired by hand and a grey box for the 336 px keyboard (as in #273). Before: 17 states (bar light/dark, 320, 200 %, da, Bold + list on, Notes page; + Verse open → typed → inserted, dark/da, 200 %, 320, Notes page), each with measured positions. Screenshots stay in the session scratchpad (`277/before`, `277/after`).

## What was wrong (measured)

- **The bar is a toggle group with non-toggles in it, literally.** MDXEditor renders each of B, I, U as its own one-item `radiogroup` with `role="radio"`; the lists as a radiogroup named "toggle group" (English, in Danish too); **undo/redo as `role="radio"`** — VoiceOver: "Undo, radio button, not checked". No `aria-pressed`.
- **Spacing inverted the groups** (Mads): ~50 px of air between U and "+ Verse", 8 px between "Verse" and •. ☑ sat under the hide key's fade at 390 (x 318), and under the hide key itself in Danish (x 340 vs 346); undo/redo off-screen at every width (x 370+).
- **"+ Verse" made the note vanish.** The picker is a Base UI drawer nested on the note sheet; our stacked-drawer styling (`components/ui/drawer.tsx`: `data-nested-drawer-open:h-(--stack-height)` and the content's `opacity-0`) shrank the note sheet to the picker's height — **top 677, height 143, all of it under the keyboard (top 508)**. Reader text showed behind (reader), or a blur (Notes page). The card: centred title, a description, boxed field + outlined Insert, a hint line, no Cancel; at 200 % it filled the screen.
- Moving focus to the picker's field and back happened after renders/animation frames (outside the tap), which iOS may answer by dropping the keyboard (Jonas F2).

## Votes

| Q | Proposal | Result |
|---|---|---|
| Q1 Layout | A "Notes": `Aa · Verse ··· ↶ ↷ · ⌄`, toggles behind Aa / B "toggles in sight" / C today tidied | **A, 6/6** (Birthe: undo always in sight; Elias: on condition that Markdown shortcuts keep working — they do, `markdownShortcutPlugin`) |
| Q2 Format panel | Text style `[B I U]` + Lists `[• 1. ☑]`, aria-pressed, stays open, closes by Aa / hide / tap in text, shows the caret's state | **6/6 ok.** Jonas: it pushes the text up, not over it (built). Sofie wanted visible row labels — see conflicts |
| Q3 Aa's look | (a) glyph alone, on D13's list / (b) "Format" under it | **(a), 4–2** (Mads, Jonas, Freja, Elias; Sofie and Birthe wanted the word) |
| Q4 Verse's look | (a) book-plus glyph, "Verse"/"Bibelvers" small under it (O3) / (b) one-line capsule | **(a), 6/6** (Mads: on condition the glyphs share one line — built, measured) |
| Q5 Order | Aa · Verse left, ↶ ↷ right of centre, ⌄ far right | **6/6 ok** |
| Q6 Size + look | 22 px glyphs at 1.75, 44+ targets, groups as rounded platters, pressed = ink on a 14 % tint, disabled 40 % | **6/6 ok.** Mads: concentric radii 14/10, 8 % tint on dark (built). Birthe wanted glyphs to grow at 200 % — see conflicts |
| Q7 Verse flow | V-A search row on the keyboard / V-B form sheet / V-C today fixed | **V-A, 6/6** |
| Q8 Row details | field 16 px, one placeholder, Insert filled, Cancel as a word or × | **6/6 ok, "Cancel"/"Annullér" as a word 6/6.** Jonas: autocorrect/capitalise off, `enterkeyhint=go` (built) |
| Q9 Native inputAccessoryView | not now | **4/4 ok, not now** (Birthe, Freja: no opinion). See recommendation |

## Findings beyond the questions (merged)

| # | Finding | Raised by | Decision |
|---|---|---|---|
| F1 | The note vanishes under "+ Verse" | all 6 | **Fixed** by V-A: no nested drawer in the app; the note stays above the search row |
| F2 | No visible way out of the picker | Sofie, Birthe, Freja | **Fixed:** "Cancel"/"Annullér" always on the row; Esc too |
| F3 | Radio semantics, English "toggle group" | Sofie, Jonas | **Fixed:** our own buttons on MDXEditor's cells (`currentFormat$`, `applyFormat$`, `currentListType$`, `applyListType$`, `activeEditor$` + CAN_UNDO/REDO); toggles `aria-pressed`, actions plain buttons, groups named (en + da), Aa `aria-expanded` |
| F4 | Tools hidden off the right edge | Sofie, Birthe, Elias, Freja | **Fixed:** 5 controls, no sideways scroll; measured at 390/320, 100/200 %, en/da (below) |
| F5 | The chip glued to the word before it ("believing.Romans 8:28") | Elias, Birthe, Mads | **Fixed:** a space before the chip after a word or full stop (unit-tested). It was always inline at the caret; the shot's caret was at the line's end |
| F6 | Book names are hard; suggestions as you type | Freja | **Built:** "roma" → "Romans · Add a chapter" fills the field; the parsed passage leads |
| F7 | "In this chapter" never showed | Sofie, Elias | **Not a bug:** the brief's seed marks used the real WEB id while the fixtures' id is `WEB`. With an empty field the row lists the chapter's marks (built, ≤ 4) |
| F8 | One example everywhere, no description line | Sofie, Elias, Mads | **Fixed:** placeholder "e.g. Rom 8:28" / "fx Rom 8,28", no title or description |
| F9 | iOS autocorrects "rom" to "Rome" | Jonas | **Fixed:** `autocorrect`/`autocapitalize` off, `spellcheck=false` |
| F10 | Panel/list could hide the caret's line | Jonas, Elias | **Fixed:** a ResizeObserver on the editable re-reveals the caret; opening the verse row scrolls the saved caret's line into sight |
| F11 | The chip looks like a web link | Freja, Mads | **Later** (chip style: the note's serif, accent ink on a tint) |
| F12 | Several references at once ("Rom 8:28; Gen 50:20") | Elias | **Later** |
| F13 | Note title cut at 200 % | Birthe | **Later** (still #273 F13) |
| F14 | Web/Safari phones still nest the picker drawer on the note sheet (same collapse) | Jonas F5 | **Later, separate issue:** an opt-out of the stacked-drawer height/opacity for the note sheet (`drawer.tsx`) — not built here, the app no longer nests |

## Conflicts

- **Aa alone (4) vs. "Format" under it (Sofie, Birthe).** Sofie: Aa is the only way to formatting, so it can't be icon-only; Birthe: "Aa means nothing to me". Majority: Apple's own glyph for exactly this; a word under only Aa and Verse would make the bar's least important control the loudest, and B/I/U are on D13's list already. **Decision: Aa alone, added to D13's closed list** as "format" (accessible name "Format"/"Formatering", `aria-expanded`), only on the docked bar. Watch it in the next usability test (Sofie); the owner may overrule — the label is one `<span>` in `dock-bar.tsx`.
- **Visible row labels in the panel (Sofie) vs. none (Mads).** Built: none visible; each row is a named group for VoiceOver and Aa shows pressed while the panel is open. B I U and the list glyphs explain themselves.
- **Glyphs growing at 200 % (Birthe) vs. fixed 22 px (Mads, Jonas, Q6).** Fixed in px (touch floors in px, #262 lesson); the Verse label grows to 15 px at most. Kept.

## What was built

- `reader/dock-bar.tsx`: the docked bar `[Aa] [Verse] ··· [↶ ↷] [⌄]`, each group one rounded platter on a faint tint (iOS 26's shared background, drawn in the page's paper — no imitation glass, Mads), 48×48 targets, 22 px glyphs at stroke 1.75 on one line (centre 21 px from the platter top in every control, measured), "Verse"/"Bibelvers" 12–15 px under its glyph. Aa opens the format panel: Text style `[B | I | U]` and Lists `[• | 1. | ☑]` side by side in one row (fits 320: 6 × 48 + 8), segments 52 tall, on = full ink on a 14 % tint inset 4 px (radii 14/10); the lit list turns the list off. The panel is a sibling in the note's column (it takes room, the caret stays in sight) and gives way before the bar could be pushed under the keyboard on a short screen.
- `reader/verse-row.tsx` + `verse-suggest.ts` (unit-tested): "+ Verse" in the app turns the bar into a search row on the keyboard — `[🔍 e.g. Rom 8:28] [Insert] [Cancel]` — with ≤ 4 suggestions above it (the parsed passage first = what Insert/Enter takes, tinted; a book alone fills the field; "Whole chapter" / "Closest match" notes; the chapter's marks with an empty field). `combobox` + `listbox` with `aria-activedescendant` (focus never leaves the field), `role="search"`, problems in a polite live region ("Add a chapter, e.g. Psalm 23"). The field is mounted and focused inside the tap (`flushSync`); Insert, a row or Cancel put focus back in the text inside the tap, the chip at the caret. Web and desktop keep the dialog/drawer.
- Haptic tick on every bar, panel and row tap except Cancel and Hide keyboard (logged: `Haptics.impact LIGHT`).
- Chips get a space after a word or a full stop (`scripture-ref-node.tsx`).
- **Bundle:** the address chooser's panel (filter, books, chapters, recent places) moved into its own chunk, fetched when idle or on the trigger's first touch: **/read first paint 349.9 → 347.0 KB gz** (budget 350). The new bar lives in the editor chunk.

Measured after (390 en): Aa x 8–56, Verse 64–113, ↶ 230–278, ↷ 278–326, ⌄ 334–382, all 48 tall, glyph centres all at y 477. 320: ⌄ ends at 316. Danish: "Bibelvers" 64–132. 200 %: Verse 64–118, bar 57 px. axe on the bar + panel and the verse row: 0 violations besides the known `meta-viewport` (the zoom lock). Tap-after-drawers: all pass (one cold-start flake on the first of four runs).

## Native iOS inputAccessoryView (recommendation, not built)

**Not now.** `@capacitor/keyboard` already swizzles `WKContentView.inputAccessoryView` (`Keyboard.m`) to return nil and hide ‹ › ✓; a native bar means forking the plugin or swizzling the same method, sending the bar's state (Bold lit, can undo, list type) over the bridge on every selection change, and the verse search would stay web anyway — a second codebase for one bar. What it would buy: glued to the keyboard during the slide (not just following its events), real Liquid Glass, hardware-keyboard/iPad handling. **Revisit only if** the real-device test shows the web bar lagging the keyboard's slide or jumping on an older phone (Jonas, Sofie, Elias, Mads agree).

## Needs the real iPhone

- "+ Verse": the keyboard stays up into the field (no down-up flash), QuickType gone in the field, "rom" not corrected; Insert / a suggestion / Cancel go back into the text with the keyboard up and the caret where it was; the chip has a space before it.
- Aa: the panel opens over the bar, B/I/U/lists keep the keyboard, Bold lights inside bold text, a tap in the text closes it; Hide keyboard closes both.
- Undo/redo dim at 40 % with nothing to undo, light after typing.
- Haptic tick light on each tap, none on Cancel / Hide keyboard / disabled undo.
- The bar rides the keyboard's slide up and down (as #273); emoji / taller keyboards refit the bar and the verse list.
- VoiceOver: "Formatting, toolbar"; "Format, toggle button, collapsed"; "Bold, toggle button"; "Undo, button" (not radio); "Insert verse, search"; the suggestion read as the active option.
- iPhone SE / mini and 200 % text: the bar never under the keyboard; the panel/list give way first.
- Dark app: platters not muddy (8 % tint).

## Later

- Chip style in the note's serif with an accent tint (F11); several references in one go (F12); the title at large text (F13).
- Web/Safari phones: the nested picker drawer still collapses the note sheet (F14) — a separate issue for `drawer.tsx`.

## Lessons

- Read the semantics, not just the pixels: the DOM dump (one-item radiogroups, undo as radio) turned the owner's "looks like a broken toggle group" into a fact all six could vote on.
- Seed review data with the provider's own ids: the fixture translation is `WEB`, not the API.Bible id, or "In this chapter" stays empty and reads as a bug.
- Shoot the tight case (320 × 640, 200 %, 260 px keyboard) before stating "fits": the first build pushed the bar under the keyboard there; the one-row panel and shrink order fixed it.

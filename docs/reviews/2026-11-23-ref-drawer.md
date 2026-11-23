# A chip's preview as a drawer on phones (#281)

**Date:** 2026-11-23. **Panel:** Sofie, Mads, Jonas, Birthe, Freja, Elias (the UI chrome / a11y / overlays row). One round on a builder's brief with 9 questions (each with a lean), measured DOM facts, then a re-shoot of the fixes.

**Review sentence:** On a phone (iPhone app and phone-width web), when a reader taps a scripture-reference chip inside a note, how should the bottom drawer that shows the verse look and behave, so it reads like a native iOS sheet, never collapses the note under it, and hands the reader back to the note exactly where they were?

**Owner (binding):** "tapping a scripture chip in a note should definitely be a drawer on the phone app, not a popover." Desktop/iPad keep the popover. The content stays the same: label · translation, mark line, verse text, "Show in Bible →", "Remove". It must not shrink the note's sheet (#277 F14). It must clear the home indicator and corners (`--corner-bottom`), have targets ≥ 44 px, keep the keyboard off it, return to the note with the caret where it was, and use no toasts. Focus lands on "Show in Bible" (the brief's a11y rule).

**Evidence:** web from `wt-281` (`vite preview` of the build on :5181), API from `wt-281` on :3081 with no `API_BIBLE_KEY` (fixtures: `WEB`), user `delivered+281`, two notes (one short with 3 chips, one long with a chip on its last line). Playwright, iPhone 15 frame 393×852 @2x with simulated insets and corner arcs, plus 320×640 at 200 % text (Danish), Safari with its toolbar collapsed, landscape 852×393, the Notes page and desktop 1280×800. Each shot logs the note sheet's rect before and after, the focused element, the dialog's name and the button rects. Screenshots stay in the session scratchpad (`281/r1` = round 1, `281/r3` = after the fixes).

## What was wrong before

- `RefPreview` was always a `Popover` anchored to the chip. On a phone that's a small floating card beside a 16 px chip, with 44 px buttons squeezed in.
- Any drawer opened on the note's sheet (the web phone's "+ Verse" picker) was a Base UI *nested* drawer. Our stacked-drawer styles (`drawer.tsx`: `data-nested-drawer-open:h-(--stack-height)`, content `opacity-0`, scale/peek, `brightness-95`) shrank the note to the child's height and faded it (#277 F14).
- **Found while building:** at large text, tapping a chip in a note that wasn't focused opened nothing. The press focused the note, the topics row folded, the chip moved up under the finger, and the click that followed landed on the line (`click: P`, logged). This affected the popover too.

## Votes

| Q | Proposal | Result |
|---|---|---|
| Q1 Header | title left, visible "× Close"/"Luk" right | **ok 6/6** |
| Q2 Verse text | Literata 18/1.6, whole passage scrolls, cap min(45 %, 20 rem), no fade | **ok 6/6**. Mads wanted a fade only when it overflows; see conflicts |
| Q3 Actions | "Show in Bible →" tinted and row-wide, "Remove" quiet text at the right | **ok 6/6**, red rejected 6/6. Sofie's condition: ≥ 16 px between the two touch areas (built) |
| Q4 Backdrop | (a) 10 % dim, no blur / (b) stronger / (c) blur | **stronger dim, no blur, 6/6** (blur 0/6). Amount: see decisions |
| Q5 Return to the note | writing → caret + keyboard back, reading → keyboard stays down | **ok 6/6** |
| Q6 Keyboard while writing | (a) put it down on open / (b) float above it | **(a) 6/6** |
| Q7 Open on the finger's lift | a tap never focuses the note | **ok 6/6**. Conditions: a drag that starts on a chip still scrolls (Sofie), and a slow tap mustn't fall back to the old path (Jonas F1) — both built |
| Q8 Height / large text | content-sized, wraps at 200 % | **objection 6/6**: the title broke inside the reference ("Sl 23,1–" / "4"). Fixed |
| Q9 Missing | — | findings below |

## Findings (merged)

| # | Finding | Raised by | Decision |
|---|---|---|---|
| F1 | Drawer and note look like one surface (dark worst). Two "Close" buttons read as equals | all 6 | **Fixed.** The nested backdrop now renders (Base UI renders a nested drawer's backdrop only with `forceRender`: the round-1 "10 %" was the note's own overlay). It is `bg-black/20`, `dark:bg-black/40`, no blur, with a lifted top edge (shadow 0 −6 20 at 8 % light / 45 % dark). The note's Close now reads as "behind" |
| F2 | Title breaks inside the reference at 200 % | all 6 | **Fixed:** the reference is one `nowrap` unit; only "· WEB" wraps |
| F3 | "Sl", "1 Mos" mean nothing to a newcomer; read aloud as "S L … dot W E B" | Freja, Sofie, Birthe, Elias | **Fixed:** the drawer title uses the full name ("Salme 23,1–4 · WEB", "1. Mosebog 1,1"); the chip stays short. Spoken name: "Salme 23,1–4, World English Bible"; Close is "Luk Salme 23,1–4" |
| F4 | A chip low in a long note opens under the drawer | Elias | **Fixed:** the note scrolls the chip to 16 px above the drawer (measured: chip bottom 393, drawer top 409), adding room below the text if the chip is on the last line, and scrolls back on close. No scroll when the drawer is at full height (large text): there is nowhere to show the chip |
| F5 | A tap that isn't a "tap" (slow, or a small drift) fell back to the click: focus, keyboard and the moving-chip bug | Jonas | **Fixed:** every finger lift on a chip is final (a click within 800 ms is ignored). A finger that stayed put (tap or long press) has its default held back. Unit-tested (`chip-click.test.ts`) |
| F6 | VoiceOver's double tap is a bare click and opened nothing | Jonas | **Fixed:** a click with `detail 0` opens it, leaving the caret alone. Whether VoiceOver can reach a chip inside the contenteditable at all needs the real iPhone (the note's references list offers the same preview and "Show in Bible") |
| F7 | A tap that stops a fling opened a chip | Jonas | **Fixed:** a press within 150 ms of a scroll doesn't open (unit-tested) |
| F8 | Remove has no visible way back | Birthe, Sofie | **Already there:** Remove posts the note's inline "Psalm 23:1–4 removed from the note · Undo" line (`ref-removal.tsx`), with no toast (shot `remove-…-3-removed`). **Fixed alongside:** Remove in a note only being read no longer focuses the note (Lexical `skip-dom-selection`), so no keyboard |
| F9 | Remove's label is 32 px from the edge, Close's 18 px | Mads | **Fixed:** `-mr-2`, so the labels share an edge; the row gap is 16 px (Sofie) |
| F10 | At 200 %, "Fjern" alone right-aligned on its own row eats the passage | Mads, Elias | **Fixed:** it wraps from the left under the primary, and the row is tightened (py 10 px, row gap 4 px) |
| F11 | The Notes page fetched the drawer's chunk only on the first tap | Jonas | **Fixed:** a phone chip preloads it when idle (`preloadDrawer`, handed over in the editor kit) |
| F12 | Landscape not shot | Sofie, Mads, Elias, Jonas | **Shot** (`land-l-app-light-…-1-drawer`): full passage, both actions and Close in view |
| F13 | `stack={false}` caveat for content-sized parents | Jonas | **Documented** in the prop's comment |
| F14 | The open chip's ring overprints its neighbours (":" and the "e" of "Compare") | Mads | **Later** (chip style, with #277 F11) |
| F15 | The chip itself is a 16 px target | Sofie | **Later**: an invisible 44 px hit area inside running text needs its own look at line spacing and chips on neighbouring lines |
| F16 | Bare "Remove"/"Fjern" could read as removing the verse | Mads | **Not built** (1/6). The inline "… removed from the note · Undo" says what happened |
| F17 | No `aria-modal` on the dialog | Sofie, Elias | **Verified, then fixed:** nested in the note's dialog, Base UI hides neither the note (no `inert`/`aria-hidden` on it, measured) nor sets `aria-modal`, so VoiceOver could wander into the note. The drawer now sets `aria-modal="true"`. Focus is trapped (Base UI); axe: 0 violations. VoiceOver swipe-out goes on the device list |

## Conflicts

- **Focus on "Show in Bible" (owner's brief) vs. the title/popup (Jonas F3, Sofie F3).** Their argument: a VoiceOver user lands on the action and skips the verse, and a habitual double tap leaves the note. The brief's a11y rule names "Read in the Bible" as the focus target, so it stays. The dialog's spoken name (full reference and translation) is read on entry. **Owner may overrule:** it is one `initialFocus` in `RefDrawer`.
- **Dim amount.** Light: 15 % (Mads), 20 % (Birthe, Sofie, Elias), 10 % (Freja, Jonas). Dark: 20–25 % (Birthe, Freja, Jonas, Elias), 35–40 % (Sofie, Mads). Built **20 % light (the light majority) / 40 % dark plus the lifted edge**. Dark took the upper side: black over near-black changes little, and the two-Close confusion (F1, all six) is worst there. Shot at 40 %, the layers separate clearly (`ref-p-app-dark-…-1-drawer` in `281/r3`); 20–25 % was not shot. One class in `scripture-chip.tsx` if the device disagrees.
- **Hard cut vs. a fade on overflow (Mads F3).** Birthe, Freja and Sofie read the half-cut line as an honest "there's more"; a fade reads as the end. Kept the hard cut.

## What was built

- `reader/scripture-chip.tsx`: `RefPreview` shares its body (title, status, verse, actions) between the desktop Popover and a new phone `RefDrawer`. The drawer is the reader's code-split drawer, handed over in the editor kit. It has a swipe handle; a header with the full-name title (one unit) and "× Close" (≥ 44 px); the mark line; the verse in a `ScrollArea` (Literata 18/1.6, capped at min(45dvh, 20 rem)); and an action row with "Show in Bible →" (48 px, link-wash, stronger wash when pressed) and "Remove" (48 px, quiet, accent when pressed), 16 px apart. Bottom padding is `--corner-bottom` (drawer.tsx), and the max height stays under the status bar. A dialog (`aria-modal`) named by its spoken title; focus on "Show in Bible"; Esc / swipe / tap above / Close all return to the note.
- Taps: a chip opens at the finger's lift (`chip-click.ts`: `touchTapOpens`, `touchStayed`), never via the click after it. The note isn't focused by the tap. VoiceOver's bare click opens it.
- Keyboard: on open, `hideKeyboard()` (blur + `Keyboard.hide` in the app). On close, the caret is restored (`$restoreSelection`) only if the note was being written in; a note only being read stays unfocused. Remove behaves the same way.
- `components/ui/drawer.tsx`: `DrawerContent` gets `stack={false}`, so a drawer opened on this one leaves it alone (no shrink, fade, scale, peek offset or dimming), and `overlay="force"` renders a nested drawer's backdrop. The note's sheet (`paginated-chapter.tsx`) opts out of stacking. That also fixes the web phone's "+ Verse" picker (#277 F14): the note measured 96/756 before and after.
- `tools/review/safe-area-shots.mjs`: a `refDrawer` surface.
- **Bundle:** /read first paint 347.2 KB gz (budget 350; was 347.0).

**Measured after** (393×852 app): note sheet 96/756 before = after in every phone shot. Drawer top 409, height 443. Close 44 tall; actions 48 tall, 16 px apart. At 320/200 % Danish the drawer is at full height (77/563), the title wraps only before "· WEB", and "Fjern" wraps under. axe on the drawer: 0 violations (light, dark). Safe-area check (`refDrawer`, app/notch/Safari-collapsed, light/dark): nothing in the home indicator or past a corner arc.

## Needs the real iPhone

- The app: tap a chip while writing → the keyboard goes down (no flash), the drawer slides up, nothing jumps. Close / Esc (hardware) / swipe / tap above → caret back where it was **and** the keyboard up (iOS raises it only inside a gesture; all four close paths run in one, but WebKit's timing isn't measured).
- Reading (not writing): a tap opens with no keyboard at any point; Remove leaves the keyboard down.
- Large text (200 %), SE/mini: the drawer at full height, the verse scrolls, swipe down closes only from the verse's top.
- A scroll that starts on a chip scrolls; a tap that stops a fling doesn't open; a long press doesn't open or place a caret.
- VoiceOver: can a chip be reached inside the note text? Double tap opens; the drawer reads "Salme 23,1–4, World English Bible"; swipe can't leave the drawer.
- Safari phone: "+ Verse" over the note leaves the note as it is.
- Dark: the 40 % dim and the edge read as a sheet, not muddy.

## Later

- The open chip's ring overprints its neighbours (F14); a 44 px hit area for chips in running text (F15).
- Drawer transitions have no reduced-motion variant (predates #281, Jonas).

## Lessons

- A nested Base UI drawer renders **no backdrop** unless forced. The round-1 "10 % dim" the panel judged was the parent's overlay, so read the DOM (`[data-slot=drawer-overlay]` count) before tuning a value.
- Test chips with the finger's real sequence: Playwright's `tap()` scrolls the target into view in the same moment, which the fling rule rightly refuses. Scroll, wait, then tap. A REMOVE shot autosaves the note, so restore its body before the next run.
- Log the click's target, not just the outcome: `click: P` (not the chip) turned "nothing happens at 200 %" into a fact in one run.

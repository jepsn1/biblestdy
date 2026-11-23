# Native writing: the keyboard-docked format bar (#273, #256)

**Date:** 2026-11-23. **Panel:** Sofie, Mads, Jonas, Birthe, Freja, Elias (the UI chrome / a11y / overlays row). One round on a builder's brief with 9 questions (each with a lean) and measured code facts.

**Review sentence:** In the iPhone app, how should the note editor's formatting bar look and behave while the keyboard is up (docked on the keyboard, like Apple Notes), and should iPhone Safari / the home-screen web app get it too, so that writing feels native, the caret never hides and nothing jumps?

**Owner (binding, 2026-11-23):** hide the accessory bar (#256); a format bar docked on the keyboard while editing a note (B/I/U, lists, + Verse, undo/redo), 44pt, following the keyboard, hidden when it's down; web keeps today's toolbar; caret never hidden, no jumping; light haptics, native only.

**Evidence:** dev server from `wt-273`, API without `API_BIBLE_KEY` (fixtures), user `delivered+273`. Playwright at 390×844 (iPhone UA, touch, @3x) with `window.Capacitor` + the WebKit bridge stubbed, the Keyboard plugin's events fired by hand and a grey box standing in for the 336 px keyboard; Safari simulated by a shrinking `visualViewport` with its ‹ › ✓ row drawn. 18 states (keyboard down/up, light/dark, en/da, 200 % text, 320 wide, long note, Bold tap, Hide keyboard, Insert verse, topic input, Notes page) plus measured positions per shot. Screenshots stay in the session scratchpad (`273/before`, `273/shots`).

## Code facts given to the panel (verified)

- `@capacitor/keyboard` hides the accessory bar from launch and **removes WKWebView's own keyboard handling** (`Keyboard.m` load: `removeObserver:self.webView` for the keyboard notifications), so the web view neither pans nor shrinks `visualViewport` any more. The app reports the keyboard itself from `keyboardWillShow`, which arrives as the slide starts, with the final height.
- Resize **none**. "native" and "body" both apply the new size only after the keyboard's animation + 0.2 s (`setKeyboardHeight … delay: duration + 0.2`): a jump once it's up. "native" also re-lays the paginated reader under the note each time.
- Safari can't hide its accessory bar; a docked bar there would be a second row above it, and Safari reports the keyboard after its slide.

## Votes

| Q | Proposal | Result |
|---|---|---|
| Q1 Web/PWA | App only; Safari and the home-screen app keep the toolbar above the text | **6/6 ok** |
| Q2 Keyboard down (app) | No format bar at all; a tap in the body brings keyboard + bar | **6/6 ok** (Sofie: watch discoverability in the next usability test) |
| Q3 Order | B I U · • 1. ☑ · + Verse · ↶ ↷ … ⌄ | **Changed:** B I U · **+ Verse** · • 1. ☑ · ↶ ↷ … ⌄ (Mads; the clip at the row's edge then always falls on a glyph, never the bar's one word — what all 6 flagged as F1). Birthe objected to undo off-screen (see conflicts) |
| Q4 Contents | Same set as today's phone toolbar incl. ☑ | **5/6 ok** (Birthe: would let ☑ be the one that scrolls away — it now is, with undo/redo) |
| Q5 Hide-keyboard key | (a) ⌄ / (b) keyboard-with-⌄ glyph / (c) "Done"/"Færdig" | **(b), 5–1** (Sofie, Mads, Jonas, Freja, Elias: a bare ⌄ beside "+ Verse" read as its dropdown; Birthe wanted the word) |
| Q6 Held at the end, fade before it | ok | **6/6 ok on the idea**, with the condition that no word is ever cut under it (fixed by Q3) |
| Q7 Haptics | Light tick on B/I/U, lists, + Verse, undo, redo; none on Hide keyboard or disabled buttons | **6/6 ok** |
| Q8 Motion | The writing area eases with the keyboard (250 ms), header still; reduced motion at once | **5/6 ok.** Jonas: only the way up was animated, the way down snapped — **fixed** (eases both ways). "Follows the keyboard", not "glued to it", until seen on a device |
| Q9 Look | Paper colour + hairline, 20 px muted glyphs, on-state in full ink | **6/6 ok** (Mads: the hide key was in full ink — now muted) |

## Findings beyond the questions (merged)

| # | Finding | Raised by | Decision |
|---|---|---|---|
| F1 | "+ Verse" cut to "+ Ver⌄" / "+ Bib⌄" at 390; gone at 320 and 200 % | all 6 | **Fixed:** moved after B I U (Q3). Measured: whole at 390 (x 154–226), 320 (154–226, hide key at 276) and 200 % (168–274) |
| F2 | ⌄ beside "+ Verse" reads as one dropdown control | Sofie, Mads, Freja, Elias, Birthe | **Fixed:** keyboard-with-⌄ glyph (Q5), muted, hairline + 24 px fade before it |
| F3 | Nothing shows that the row scrolls | Sofie, Freja, Birthe | **Fixed for what matters:** the cut now falls on a half-shown list glyph (a peek), fade widened to 24 px (Mads); everything a word labels is in sight. Undo/redo stay reachable by the sideways scroll (D8 C5) |
| F4 | VoiceOver reads "Undo Ctrl+Z" | Sofie, Jonas, Elias | **Fixed:** "Undo"/"Fortryd", "Redo"/"Gentag" on touch (unit-tested) |
| F5 | Hide keyboard may leave DOM focus in the editor (the next tap may not bring the keyboard back) | Jonas | **Fixed:** blur first, then the plugin's `hide()`; on the real-device list |
| F6 | The shim's import raced the first effects | Jonas | **Fixed:** awaited with the token read, inside the same 3 s limit |
| F7 | Two thresholds for "keyboard up" (sheets lifted for a hardware keyboard's slim bar, no format bar) | Jonas | **Fixed:** one rule (>150 px) |
| F8 | The page lift for a covered field (sign-in, margin note) came 300 ms late and unanimated | Jonas | **Fixed:** in step with the slide (after the sheets' frame), eased 250 ms. Reporting it as `visualViewport.offsetTop` is *later* (nothing that follows the viewport sits on a lifted page today) |
| F9 | First haptic tick late (chunk fetch) | Jonas | **Fixed:** haptics chunk fetched when the bar mounts |
| F10 | Bold on-state a grey slab flush with the bar | Elias | **Fixed:** rounded tint inset 4 px in the 44 px button, full ink |
| F11 | Groups split two ways (gaps and hairlines) | Mads | **Fixed:** gaps only (8 px) |
| F12 | "+ Verse" at 200 % the heaviest thing on screen | Mads | **Fixed:** muted ink, label capped at 20 px |
| F13 | Titles cut with no "…" at 200 % / 320 | Freja, Sofie, Birthe, Mads, Elias | **Fixed:** ellipsis. Wrapping the title / a smaller header while writing (Mads F7, Elias F6, Birthe F4) is **later** |
| F14 | A hardware keyboard on iPhone: no bar | Elias | **Later** (real-device first): docking at the bottom edge needs the shortcut bar's height measured on a phone. ⌘B/I/U work (Lexical) |
| F15 | The topics row comes back when the keyboard goes down: the text moves one line | Birthe | **Later:** #261 behaviour; reserve its space or fade it in |
| F16 | Insert verse sheet shows no Cancel/× | Sofie | **Later** (unchanged sheet; swipe down / Esc close it) |
| F17 | Lines 2+ indented 4 px more than line 1 | Mads, Elias | **Not a bug:** the test typed a leading space |

## Conflicts

- **Undo in sight (Birthe) vs. writing first (5).** Birthe: "undo is my 'oops' button; off to the right I'd think it was gone." The others: B I U and "+ Verse" are what you reach for while writing; undo is also a shake (iOS) and ⌘Z. Decision: majority order; undo/redo come into sight with one short swipe. **Owner may overrule** — swapping undo in front of the lists is one line in `note-editor.tsx`.
- **Q5 glyph (5) vs. the word "Færdig" (Birthe).** The word is what iOS writes; #261 showed 5/6 read it as "drop the keyboard". But O3 (phones icon-first) and the closed icon list favour the glyph, and the glyph names the object. **Added to D13's closed list:** "hide keyboard" (keyboard with ⌄), accessible name "Hide keyboard" / "Skjul tastatur", only on the docked bar.

## What was built

- `@capacitor/keyboard` 8.0.6 (resize **none**, accessory bar hidden, keyboard in the app's theme) and `@capacitor/haptics` 8.0.2; `cap sync` committed (`ios/App/CapApp-SPM/Package.swift`, Android gradle).
- `lib/native-shell.ts` (shell only, from `sessionReady()`): `visualViewport` fed by the plugin; `--kb-h` / `data-kb-open`; bottom sheets sit on the keyboard; a covered field lifts the page by just enough; the sheet fitting eases both ways.
- The note's format bar docks on the keyboard in the app on phones, only while writing the text (not the title or a topic): B I U · + Verse · • 1. ☑ · ↶ ↷ … Hide keyboard. The editable is the scroller, so the caret Lexical keeps in sight is above the bar; when the keyboard comes up over the caret it's scrolled into sight. Bar taps keep the keyboard; light haptic on each.
- The Notes page fits the keyboard like the reader's note sheet. A topic being typed no longer vanishes with the keyboard up. The web toolbar sits on the page colour (text no longer shows through it while scrolled).
- /read first paint 349.85 KB gz (was 349.73): only the one dynamic import and a class.

## Needs the real iPhone (Playwright can't raise the iOS keyboard)

- `window.visualViewport` is the shim (Safari Web Inspector) and WKWebView doesn't still pan its scroll view to the field.
- The bar rides the keyboard's top during the slide (up and down), not only at rest; check bridge lag on an older phone.
- Tap B, I, U, a list, undo: keyboard and caret stay, no down-up flash. Haptic ticks feel light; none on disabled undo/redo.
- Hide keyboard, then tap the body: the keyboard comes back. Same after Close.
- Emoji keyboard, a taller language keyboard, QuickType on/off, dictation: a new `keyboardWillShow` each time and the bar follows (else also listen to `keyboardDidShow`).
- "+ Verse" from the bar → Insert verse sits on the keyboard → Insert → back in the note with keyboard and caret.
- Swipe-to-dismiss, backgrounding with the keyboard up: `--kb-h` resets.
- Dark app on a light phone: dark keyboard; change theme with the keyboard up.
- Landscape, iPhone SE / mini, iPad (keeps the top toolbar, Stage Manager).
- VoiceOver: bar named "Formatting", order, the hide key reachable.
- Sign-in field and a margin note low on the page lift into sight; the palette and `@` menu still follow the keyboard.

## Later

- Hardware keyboard on iPhone: dock at the bottom edge (F14).
- A smaller header / wrapped title while writing at large text (F13).
- Topic row space reserved when the keyboard goes down (F15); Insert verse Cancel (F16); a 44 px topic field (Freja).
- The lift as `visualViewport.offsetTop` (F8).

## Lessons

- Read the plugin's native source before choosing a mode: the decisive fact (the plugin unhooks WKWebView's keyboard handling and delays every resize by the animation + 0.2 s) is in `Keyboard.m`, not the README.
- Put measured x-positions of every button in the brief: all six caught the clipped word from the numbers and the shots, and Mads's reorder fixed it at every width in one move.

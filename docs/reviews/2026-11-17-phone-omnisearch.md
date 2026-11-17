# Phone omnisearch: a full-screen search view (#243)

**Date:** 2026-11-17. **Panel:** all 8 personas (owner's call). One findings round, then one ok/objection round on a decisions draft.

**Question:** on a phone (<768px), how should the omnisearch (command palette) look and behave so it reads as a full-screen search screen, not a dialog? What causes the blur and scroll bug when the keyboard is up? This informs #243 step 2. Desktop is in scope only as "unchanged or not".

**Evidence:**
- Dev server from worktree `wt-243-panel` (main `d338ed5`), WEB John 3 seeded.
- Playwright at 390×844 with an iPhone UA, light and dark, da and en, plus desktop at 1440×900.
- Chromium can't open an iOS keyboard. To stand in for one, the script overrode `window.visualViewport`: height 464 and layout 844 (a 336px keyboard plus a 44px accessory bar). A pan was simulated with `offsetTop` 300, and a translucent strip was painted where the keyboard goes, to show what sits behind it.
- Screenshots are in the session scratchpad, not committed: `01-03` (keyboard down), `04-kb-*` (keyboard up), `05-kb-panned-*` (after a pan), `06-kb-typed-*`, `07-short-viewport-464` (Android "resize content"), `08-desktop`.
- axe on today's phone palette: 0 violations.

## Root cause of the blur/scroll bug (verified in code and on screen)

1. **The sheet ignores where the visible area is.**
   - `command-palette.tsx` (~L326–339, L625) sizes the phone sheet to `visualViewport.height` but keeps its `inset-0` top at layout 0. `offsetTop` is never used.
   - The `scroll` listener only re-sets the height.
   - Measured with the keyboard up: popup `{top 0, height 464}`.
2. **The backdrop fills the layout viewport, not the visible area.**
   - `components/ui/dialog.tsx` L35 gives every Dialog a backdrop of `fixed inset-0 bg-black/10 backdrop-blur-xs` (blur 4px), measured at `{top 0, height 844}`.
   - The 380px under the sheet is that dimmed, blurred reader.
   - The iOS 26 keyboard and accessory bar are translucent, so you see the blur through them (shot `04-kb-*`).
   - In dark mode it is a cooler grey slab under a warm near-black sheet (Kasper, Mads).
3. **Nothing stops iOS panning.**
   - `app.css` sets `html, body { overflow: hidden }`, so base-ui's scroll lock bails out (`ScrollLocker.lock` respects an html that is already hidden).
   - Neither lock can stop iOS panning the visual viewport inside the layout viewport while the keyboard is up.
   - A drag pans down past the sheet's bottom into the blur (shot `05-kb-panned-*`).

A real short viewport (Android "resizes content", shot `07`) has no gap, which confirms the cause. Chrome on Android defaults to `resizes-visual`, so it likely shows the same gap without the translucency. That is not tested on a device.

Other facts:
- The phone sheet also zooms in (`zoom-in-95`).
- The way out is a full-width outline button on its own row, "Luk — tilbage til Johannes 3", above the field.
- The input has `enterkeyhint="go"` and no `inputmode`.
- There is no history/back handling anywhere in the app (no `popstate`).
- The empty state opens with 4 actions, and the first row is pre-highlighted.
- Recents skip the chapter you are on. A new user gets "Gode steder at begynde" instead, which is why the shots show no "Senest læst".
- The reference parser already accepts `rom 8 28`, `rom8,28`, `rom 8.28` and `rom 8:28` (probed).
- The palette can't search Bible text yet, so a placeholder like "fx kærlighed" (Freja) would mislead. Rejected.

## Can a website hide the iOS accessory bar (↑ ↓ ✓)?

**No.** Safari gives web pages no supported way to hide it: no attribute, meta tag or API. The known tricks (`inputmode` games, older UIWebView subview removal) are unreliable hacks.

**A native shell can.** The Capacitor Keyboard plugin has `Keyboard.setAccessoryBarVisible({ isVisible: false })`, iPhone only (capacitorjs.com/docs/apis/keyboard, checked 2026-11-17).
- Our shell (`apps/mobile`, Capacitor 8) doesn't have `@capacitor/keyboard` installed yet.
- The plugin also has `autoBackdropColor` (iOS, 8.0.4+), which tints the area behind the keyboard from the DOM body background. That could be worth using in the shell.

Once D6 is built, the bar sits over the sheet's own colour, so on the web it looks native rather than broken.

## Votes

| Item | Result |
|---|---|
| D1, D3, D5, D7, D9–D11 | ok from everyone with a view |
| D2 cancel styling | 7 ok; Birthe objected (accent text with no border doesn't look like a button). Resolved in spec 2: ink colour, weight 600 |
| D4 empty state | ok, with Sofie's guard and Jonas's a11y note (in spec) |
| D6 bug fix | ok, with Jonas's transform and change-only writes and Sofie's tap guard (in spec) |
| D8 close paths | Jonas objected (Esc and non-navigating actions must also unwind history). Sofie: close directly if our entry is missing. Ruth and Elias added E2Es. All folded into spec 8 |
| C1 cancel word | **"Annullér" 8/8.** Birthe accepts it on condition that it looks like a button |
| C2 visible "back to Johannes 3" | **none, 5–3** (Mads, Jonas, Elias, Kasper, Freja) vs an empty-state row (Sofie, Ruth; Birthe picked a line, then a row as second choice) |
| C3 header Søg on phone after #242 | **keep for now 8/8**; Freja and Mads want it dropped after #242 ships |
| C4 clear recents | **"Ryd" + undo 8/8** |

## Decided spec (for the builder, #243 step 2)

All of this is phone only (`useIsMobile`, <768px). Desktop stays pixel-unchanged (spec 10).

1. **Layout**
   - One bar, pinned at the top, `padding-top: env(safe-area-inset-top)`, 16px side padding, about 56px tall.
   - The bar holds a filled field and, 8px to its right, a text button.
   - Field:
     - 44px tall, radius 10px, `--muted` fill, a 🔍 18px `--muted-foreground` inside on the left, 16px text.
     - No accent underline. Focus is a subtle ring.
     - Field fill and ring must be at least 3:1 against `--background` in both themes.
   - Clear button ⓧ:
     - Our own `<button type="button" aria-label="Ryd søgning">` (en "Clear search"), shown only when there is text.
     - 18px glyph in `--muted-foreground`, 44px hit area.
     - `onPointerDown` preventDefault so the keyboard stays up; focus stays in the field.
   - The "Luk — tilbage til …" row is removed.
   - Sheet: opaque `--background` edge to edge, no radius, ring or shadow.
   - A 1px `--border` hairline under the bar appears only once the list has scrolled, fading in over ≤120ms.
2. **Cancel**
   - Text **"Annullér"** (en "Cancel"), 16px, weight 600, `--foreground` (ink, not accent; Birthe's "looks like a button" rider, Jonas's contrast check). No border, 44×44px hit area.
   - Accessible name: "Annullér – tilbage til Johannes 3" (en "Cancel – back to John 3").
   - No ×.
3. **No visible "where you came from" line** (C2). The aria-label carries it. The existing "Fortsæt i …" row and the same-spot return do the rest.
4. **Empty state, in this order**
   - **Senest læst**: up to 5, with today's "Fortsæt i …" first; the current chapter is excluded.
     - A quiet **"Ryd"** sits at the right end of the heading: 13px, weight 400, `--muted-foreground`, not a button shape.
     - Ryd clears the list and shows a Danish undo toast for ≥6s ("Senest læst er ryddet · Fortryd").
   - **Gode steder at begynde**: for newcomers, as today, and also whenever Senest læst is empty (Sofie: the top is never only actions).
   - **Handlinger**: at most 3.
   - **"Søgetips"**: the last item *inside* the scrolling list, not a pinned footer. 13px `--muted-foreground`, 16px inset, 20px space above, no rule.
   - Scripture credit line: scrolls with the results after the last group, at the same style. It shows only when verse text is quoted.
   - On touch, no row is highlighted until text is typed. `aria-activedescendant` is absent then, not pointing at -1.
5. **Keyboard**
   - Keep `type="text"`. `type=search` brings WebKit's own cancel button and Esc-clears.
   - Add `inputmode="search"` and `enterkeyhint="search"` (the blue "Søg" key).
   - Keep autocorrect, autocapitalize, spellcheck and autocomplete off.
   - Enter / Søg opens the top row immediately. Don't debounce the passage group. With an empty field, Enter does nothing on phone. Ignore Enter while `isComposing`.
   - A finger drag on the list of more than 10px blurs the input so the keyboard drops. The palette's own `scrollIntoView` never does.
   - The hidden proxy input gets the same attributes, 16px text, and stays at `top: 0`.
6. **The bug fix**
   - The phone sheet is `fixed inset-0`, opaque `--background`, over the whole layout viewport. Whatever iOS shows behind the keyboard or after a pan is then sheet colour, and the bug can't come back.
   - Its content column follows the visual viewport: `transform: translate3d(0, var(--vvTop), 0)` and `height: var(--vvH)`.
     - The CSS vars are written in one rAF on `visualViewport` resize and scroll, only when the values change.
     - Use transform, not `top`, so it doesn't re-lay out every frame.
   - No backdrop on phone: no dim, no blur.
   - No zoom: at most a 100ms fade, and none with reduced motion.
   - Pan guard: while open, a `document` `touchmove` listener with `{ passive: false }`.
     - It calls preventDefault unless the touch is in the list viewport and that viewport can still scroll in the drag's direction.
     - Never inside the input. It must not swallow taps on Søgetips or the credit links (test a slow, fat-finger drag).
     - Add `overscroll-behavior: contain` on the list viewport.
     - The list must still scroll with momentum on iOS.
   - `dialog.tsx` defaults stay as they are for every other dialog and for desktop. Add props or variants rather than changing the defaults.
7. **Opening**
   - Header Søg and #242's bottom-bar Søg both call one shared helper in `open-palette.ts`: focus the proxy inside the same tap, then open.
   - Same view either way: keyboard up at once, focus in the field, type-ahead kept.
   - The header Søg stays on phone for now; revisit after #242 ships (C3).
8. **Close paths**
   - Opening pushes `history.pushState({ ...history.state, palette: 1 }, "")`.
   - One `closeVia(reason)` helper owns every close. Annullér, Esc (after Esc has cleared any text), and a non-navigating action (e.g. "Skift tema") all go through it.
     - If our entry is on top, it calls `history.back()` and lets `popstate` close.
     - If our entry is missing (deep link, entry lost), it closes directly so Annullér never leaves the site.
   - Android back and the iOS edge swipe arrive as `popstate`, which closes.
   - Picking a result navigates with `replace` over our entry.
   - A reload never reopens the palette.
   - Closing never moves the reading position or page.
   - Focus returns to the Søg button that opened it (else `#chapter-text`). After a jump, focus goes to the new chapter's text.
   - In the Capacitor shell, Android's hardware back would need `App.addListener("backButton")` (`@capacitor/app` is not installed). Note it, don't add it here.
9. **Screen readers**
   - `role=dialog`, `aria-modal`, sr-only title "Søg eller gå til".
   - Combobox and listbox as today.
   - Names as in spec 1 and spec 2.
   - The live region says "N resultater" or "Ingen resultater" after 400ms, as today.
   - axe 0.
10. **Desktop:** unchanged: centred card with blur, "Luk", kbd hints, 40px rows, today's empty-state order. Screenshot diff at 1440×900 and 1024 in the PR.
11. **Verify**
    - 390×844 and 320 wide; da and en; light and dark; 100–200% text; iOS and Android UAs.
    - A simulated-keyboard shot in **dark** proving nothing but sheet colour sits behind the keyboard (Kasper).
    - Tests:
      - Vitest: "rom 8:28" makes Rom 8,28 the first selectable row.
      - E2E: open → back → still on Johannes 3, same page, palette closed.
      - E2E: open → "Skift tema" → back → still on Johannes 3.
      - E2E: "joh 3 16" → Enter → Johannes 3 with v16 marked → back → the chapter you were on.
      - E2E: Annullér in a fresh tab → stays on the chapter.
    - Bundle ≤350 KB gz (/read about 342 now; the palette is its own lazy chunk).
    - Check on a real iPhone if one is available.

## Conflicts (owner may overrule)

| # | Topic | Sides | Decision |
|---|---|---|---|
| C1 | Cancel word | Annullér: all 8. Birthe's round-1 view: "Annullér" sounds like cancelling a subscription and × is a guess; she prefers Tilbage or Luk | **Annullér**, styled in ink at weight 600 so it reads as a button (Birthe's condition) |
| C2 | Visible "back to Johannes 3" | **None, 5:** every pixel above the keyboard is a result row, and Annullér always lands on the same spot. **Empty-state row "Tilbage til Johannes 3", 3:** Sofie and Ruth; Birthe prefers a line under the field. Sofie's fallback is a 60+ usability test after ship | **None** (aria-label only). If the owner wants it visible, the row (empty state only) beats a line |
| C3 | Header Søg on phone after #242 | All say keep for now. Freja and Mads want it dropped after #242 ships (two Søg buttons is double chrome); Sofie wants evidence first | **Keep**, revisit after #242 |
| C4 | Clear recents | All say Ryd + undo, kept quiet (Mads, Birthe) | **Ryd + undo** (spec 4) |

## Later (not #243)

- **Credit line names the translation** wherever its words are quoted, e.g. "WEB · public domain · via API.Bible" (Ruth F3). Ruth objected to filing this under "Later": she calls it a licensing and faithfulness duty. Recommendation: its own issue now, prioritised above the restyles. Owner to decide.
- Hide the accessory bar in the Capacitor shell: `@capacitor/keyboard` with `setAccessoryBarVisible(false)`, maybe also `autoBackdropColor: "dom"`. Low priority; Sofie says only if users are confused by it.
- Group-heading restyle: no icons, 13px muted, counts only on typed results, space instead of rules (Mads F4). Until then, no more coloured heading icons.
- A distinct icon per action row (Sofie, Birthe).
- Topic chips in the empty state (Freja), once Bible-text search exists.
- Placeholder naming a book a newcomer knows, e.g. "Søg, eller gå til fx Markus 1" (Freja).
- Caps per group with "Vis alle" (Ruth F6).
- Android hardware back in the Capacitor shell (`@capacitor/app`).

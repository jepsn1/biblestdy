# Phone selection: when does the menu open? (#206)

**Date:** 2026-11-17. **Panel:** all 8 personas (owner's call). One findings round, then one ok/objection round on a decisions draft. No screenshots: the question was about behaviour, and the code was enough evidence.

**Question:** on a phone, tapping a plain word will select it with drag handles and won't open the selection drawer. When should the drawer open: (a) when a handle drag ends, (b) on a second tap, (c) from a floating pill, or (d) something else?

## Facts checked in code (main `7d0e7db`)

- Native selection is off on phones (`select-none`, `-webkit-touch-callout:none`, contextmenu suppressed). The iOS and Android Copy / Look Up callouts never show on the text, so a pill of our own has nothing native to fight with.
- The handles' hit area is 36×36px (`chapter-text.tsx` `h-9 w-9`), under the 44px minimum. A handle drag uses pointer capture plus `touch-none`, so nothing scrolls during a drag and nothing auto-scrolls at the edge. The handle rects are measured only when the selection changes, not on scroll. A selection that stays up while the reader scrolls would leave the handles stranded. Today the handles show only while the drawer is open.
- Whatever we pick, a selection can't be longer than one screen. That is a separate gap, but this change has to close it.
- `da.ts` glossary: "Markér" means *select* and "Fremhæv" means *highlight*. A button labelled "Markér" would be wrong.
- The last-used colour is already saved per user (`defaultHighlightColor`). Toasts (sonner) and base-ui Popover are already in the /read bundle, so the pill costs about 0.5 KB gz against 346–347 / 350 KB.

## Votes

| Round 1 pick | Who |
|---|---|
| (c) pill | Jonas, Sofie, Mads (one chip), Ruth, Birthe, Elias, Freja (7) |
| (d) bottom peek bar | Kasper (1; fallback (c)) |

In round 2, Kasper dropped (d): the pill appears where the thumb just lifted, and "Note" on the pill covers his quick-capture case. **Result: (c), 8/8.** Every objection below was resolved in the spec, except the pill position (C1), which is the owner's call.

## Decision: (c), a pill with word buttons

Rejected: **(a)** cuts long passages off partway (Ruth: blocker). **(b)** alone is a hidden gesture (Sofie: almost no first-time or 60+ user finds it), so it stays only as a silent shortcut. **(d)** adds a second bottom surface that competes with the drawer, the Back-to-note bar (#195) and the planned [45%, full] snap.

### Behaviour spec (for the builder)

1. **Tap a plain word** (passes `tap-rule.ts`): select that word, show the handles and the pill. The drawer never opens by itself, neither on the tap nor when a drag ends. Words with a note, mark or highlight keep today's behaviour.
2. **Pill buttons**, left to right. Words only, no lone icons. Each hit area is at least 44px tall, 13px UI face:
   - **"● Fremhæv"**: an 8px dot in the last-used colour, label in plain ink. One tap highlights in that colour. Then a 4s toast "Fremhævet · Fortryd" appears, and Fortryd removes the highlight.
   - **"Note"**: opens the note editor directly (today's "Create note").
   - **"Mere"**: opens today's drawer, with the colours first and Copy and Compare right after.
   - **"Luk"**: clears the selection.
   - en: "● Highlight · Note · More · Close".
   - After any action, clear the selection and hide the pill.
3. **Second tap on the selection** opens the drawer. This is a silent shortcut and isn't advertised.
4. **Timing:** the pill hides while a handle is held. On release it comes back with the new range. Motion: fade over 120ms with a 4px rise; with reduced motion it appears instantly. The pill never takes focus (`initialFocus={false}`, `finalFocus={false}`, non-modal), or iOS jumps the scroll.
5. **Position:** below the selection's last line, clear of the end handle (last-line bottom + handle + 8px, about 28px), centred on the end word, clamped 16px from the screen edges.
   - If there's no room below, flip above the first line, leaving one line-height + 8px.
   - The bottom limit is the base-ui `collisionBoundary`: the area above the Back-to-note bar and above any open drawer.
   - The pill never covers selected words.
   - It anchors to the selection's union rect, using the existing `virtualAnchor` pattern.
   - Surface: raised theme tokens with a hairline rule border, no accent fill and no more than a small shadow, so it stays quieter than the highlight wash. Paper and Clean, light and dark.
   - Tapping the text under the pill clears the selection.
   - Position is still open; see C1.
6. **Reference:**
   - When the selection spans more than one verse, the pill shows the range as a small 12px line above the buttons (e.g. "Rom 8:28–39"). It is always part of the pill's accessible name.
   - While a handle is held, a 12px reference tag sits about 56px above the touch point, clamped 16px from the screen edges, on the pill's surface.
   - The drawer title also carries the reference.
7. **Long selections:**
   - While a handle is dragged within 48px of the scroll viewport's top or bottom edge, auto-scroll via rAF, ramping from 2 to 14 px/frame, and re-run `dragHandle` every frame.
   - Paged mode clips its overflow, so there the drag stops at the page edge. No automatic page turn.
   - Re-measure the handles and the pill on every scroll (`watchScroll`).
8. **Scroll keeps the selection.** This overrides #206's "scroll → selection clears":
   - The pill hides while the reader scrolls and comes back when scrolling settles, but only if the selection is at least partly on screen (Kasper's rider).
   - The selection clears only on a tap on plain text outside it, on Luk, on an action, on a page or chapter change, or on Esc with a keyboard.
   - Our own scrolls (auto-scroll, lifting the selection above the drawer) never clear it.
9. **Handles:** 44×44px hit area, extending downward so it doesn't swallow taps on the line above. The visible knob stays as it is.
10. **Screen readers:** if a click has `detail === 0`, or there was no pointerdown on the words in the 500ms before it, treat it as a VoiceOver/TalkBack double-tap. Open the drawer directly as today, with no pill. When a selection is made, a polite live region says "Markeret: <ref>. Fremhæv, Note, Mere, Luk." It doesn't announce on every drag release. Keyboard and desktop behaviour is unchanged.
11. **Hint (phone):** "Tryk på et ord for at fremhæve det eller tilføje en note. Træk i prikkerne for at vælge flere ord." (en: "Tap a word to highlight it or add a note. Drag the dots to select more words.") Sofie's coach bubble is in "Later".
12. **Verify:** 390×844 with real touch events (tap, handle drag with edge auto-scroll, second tap, scroll after a tap, Luk, Fortryd), iOS and Android UAs. Check that desktop and tablet are unchanged and the bundle stays at or under 350 KB. Test a real iPhone with VoiceOver if one is available.

## Conflicts

| # | Topic | Sides | Recommendation |
|---|---|---|---|
| C1 | Pill above or below the selection | **Below:** Sofie, Birthe, Elias, Kasper, Freja (grudgingly). Their arguments: thumb reach, it sits where the thumb just lifted, and with a long selection a pill above the first line can be a screen away. **Above:** Mads (objection), who argues below covers the next lines the eye goes to, and iOS puts its bar above. Jonas suggested above in round 1 and was ok with below in round 2. Ruth was ok either way. | **Below**, with Mads's rider of a small shadow and a tap through to clear. Owner may overrule. |
| C2 | What goes in the pill | Mads wanted one "Markér ▸" chip. Elias showed that makes a highlight 3 taps, worse than today. Freja wants "Kopiér" on the pill. | Four buttons as in spec item 2. Mads accepted. Kopiér stays the second item in "Mere" (a 5th button doesn't fit at 390px with "Luk"). Freja is ok if Copy is one step away. Owner may swap Note and Kopiér. |
| C3 | Scroll clears the selection (#206 says yes) | All 8 say keep it: multi-screen passages need it (Ruth, Elias, Sofie). Kasper's rider: no pill while the selection is off screen. | Keep the selection (spec item 8). Needs the owner's OK because it changes the issue text. |

## Later

- Sofie's one-time coach bubble at the end handle: "Træk i prikken for at vælge flere ord", dismissed after the first drag or after 6s.
- Long-press on "● Fremhæv" to pick another colour (Elias).

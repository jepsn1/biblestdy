# Compare: compact translations picker (#258)

**Date:** 2026-11-21. **Panel:** Sofie, Mads, Jonas, Birthe, Freja, Elias (the "UI chrome" row in REVIEW-PROCESS.md). There was one findings round on before/after screenshots and the built code. Desktop was settled by the issue. The panel voted on the phone flow.

**Owner's ask:** "the translations selection on compare still takes up too much space, make it a dropdown or combobox that has a count for selected translations".

**Question:** should phones keep the two-step flow from #218 (pick screen, then texts, with "‹ Change translations"), option **A**? Or should they use the same compact dropdown as desktop, option **B**?

## What was built

- **The button.** The dialog's top row has one button: "Translations" + count + ▾. The phone drawer header has the same button, with Close beside it. The texts start directly under it.
- **The list.** The button opens a popover (base-ui via `components/ui/popover`) with a list of real checkboxes:
  - The reading translation comes first, ticked and fixed ("You're reading this one").
  - The other translations follow (abbreviation · name · description).
  - The cap of 3 is unchanged. The note "You can compare up to 3 at a time" sits at the foot of the list.
  - A filter appears when there are 7 or more other translations.
  - The list scrolls in a `ScrollArea`, up to min(18rem, 40dvh).
- **Keyboard.** Tab reaches the button and Enter opens the list. Focus lands on the filter, or on the first checkbox when there is no filter or on touch. Up, Down, Home and End move between checkboxes, and Space ticks. Escape closes the list and focus returns to the button. A second Escape closes Compare.
- **Screen readers.** The button's name is "Compare translations, N selected". Danish: "Sammenlign oversættelser, N valgt".
- **Unchanged.** Remembered picks (localStorage `compareTranslations`) and the first-open default (all others ticked, up to the cap) work as before.

## Votes

| Pick | Who |
|---|---|
| **B**, same dropdown on phones | Sofie, Mads, Jonas, Freja, Elias (5) |
| **A**, keep two steps | Birthe (1). She would switch to B "if the button always showed a whole word, even at big text". |

**Result: B, 5 of 6.** Birthe's condition was met too (see F1 below). The step machine is removed: `firstStep`, the pick step, the "Choose translations" / "Compare" / "Change translations" strings, and about 150 lines.

## Findings and what happened

| # | Finding | Raised by | Outcome |
|---|---|---|---|
| F1 | At 200% text on a 390px phone, the label truncated to "Tran…" | all 6 | **Fixed.** The header uses `flex-wrap-reverse`: when the label and Close don't fit on one row, Close moves up a row and the label stays whole. At normal sizes it is one row. |
| F2 | The count "1" while two texts show was ambiguous ("1 total or 1 extra?") | Freja, Mads, Sofie, Elias | **Fixed.** The count is now the number of texts shown, including the reading one, so it matches the ticks in the list. The screen-reader name follows it. |
| F3 | The open list covers the texts, so you can't see a tick take effect | Sofie, Mads, Freja, Elias, Birthe | **Partly fixed.** The list is capped at 40dvh. Tapping outside closes it (base-ui default), and so does Escape. "Done" button: later idea. |
| F4 | The filter autofocus raises the iOS keyboard over the list | Jonas, Mads | **Fixed.** On `pointer: coarse`, focus goes to the first checkbox. The Input is 16px on phones (`text-phone`), so iOS does not zoom. |
| F5 | The fixed reading row looked disabled (pale tick) | Mads, Sofie, Freja, Birthe | **Fixed.** The tick is at full strength. The row stays non-interactive. |
| F6 | Several shots were the sign-in page | Freja, Mads, Sofie, Elias, Birthe | **Evidence gap, re-shot.** The shot run overlapped the keyboard script, and localhost's auth rate limit (100/min) signed the shots out. Each shot context now has its own `X-Forwarded-For`. |
| F7 | Every tick on a phone now fetches a chapter at once (A only fetched on "Compare") | Jonas | **Accepted.** At most 3 fetches (the cap), through the shared chapter cache and reading quota, the same as desktop since #167. |
| F8 | Escape and outside taps with the list nested in the drawer | Jonas | **Verified in Playwright** (desktop and phone): Escape closes only the list, and focus returns to the button. Not yet smoke-tested on a real iOS device. |
| F9 | Pointer-fine touch laptops get 40px rows | Jonas | Accepted (tablets settled). |

## Later ideas (not built)

- A "Done" button at the foot of the list on phones (Sofie, Birthe).
- A one-time hint pointing at the button for first-time users (Freja, Birthe).
- The reading row could be a one-line "Reading" tag instead of a two-line row (Elias, Mads).
- A per-row loading state while a newly ticked translation fetches (Elias).

## Evidence

Screenshots were taken with Playwright against the fixture provider (WEB and WEB2 only; no API.Bible calls). An 8-translation list was stubbed by intercepting `/api/translations` and serving the WEB fixture for every stub id. Shot names: `d-*` desktop 1440×900, `p-*` phone 390×844, `-dark`, `-200-` (200% text), `-open`, `d8`/`p8` (8 translations), `-da` (Danish). axe-core: 0 violations on the dialog, closed and open, desktop and phone (meta-viewport excluded: the zoom lock is a recorded product decision).

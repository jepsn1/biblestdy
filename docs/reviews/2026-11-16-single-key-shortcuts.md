# Single-key shortcuts switch (#145) — persona panel, 2026-11-16

Scope: default, wording and placement of a switch that turns off the reader's
single-character shortcuts (WCAG 2.1.4), and which keys it covers.
Panel: Sofie, Birthe, Elias, Jonas. Evidence: current settings screenshots
(desktop + phone da) and a written key inventory.

| Question | Decision | Who |
|---|---|---|
| Default | **On** — off would break learned keys; the switch meets 2.1.4 either way | all 4 |
| Label | **"Single-key shortcuts" / "Genveje med én tast"** — "letter-key" misses 1–6 and [ ]; "without Ctrl" misreads Shift+H; plain Danish over "Enkelttast" | Sofie, Birthe (Elias, Jonas: en same, da "Enkelttast-genveje") |
| Description | Says when to turn off; changes to what still works when off | Sofie F2, Birthe F2 |
| Placement | Own switch row in Settings under "Keyboard shortcuts", **every device** (an iPad with a keyboard fires them); same switch atop the `?` list | all 4 |
| `?` list when off | Only the keys that still work, plus a line saying single-key shortcuts are off, with the switch | Birthe, Jonas (Sofie/Elias wanted greyed rows — the switch right there covers "how do I get them back") |
| Phone Settings hint | "…, shortcuts and your account" / "…, genveje og din konto" | Sofie F3, Birthe F1 |

## Conflict: focus-scoped keys (h/n/m/c on a focused verse / in its menu)

- Jonas: keep — 2.1.4 exempts keys active only while their component has focus.
- Sofie, Birthe, Elias: turn off too — the switch says "single-key"; a half-off
  switch can't be diagnosed, and dictation into a focused verse still fires them.

Decision: **off with the rest** (3 of 4, and the issue's "single-character
keys do nothing"). Menu items stay clickable; Enter/Space/menu key still
open the actions menu; inside the menu the letters fall back to its typeahead.

## Not done

- Per-device setting (Elias F3): kept per account, as the issue asks.
- Remapping keys: not needed for 2.1.4 once they can be turned off.

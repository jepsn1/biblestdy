# One drawer for all drawers (#283)

**Review:** every phone drawer now opens and closes with the same slide, backdrop and lifted edge, the chip's preview and the "+ Verse" picker over the note included. The panel picks the one dim value per theme and whether it blurs. The owner already settled consistency ("it should just be the same drawer for all drawers").

**Panel (UI chrome / overlays):** Sofie, Mads, Jonas, Birthe, Freja, Elias. One round, with a question brief and the builder's lean on each question.

**Evidence:** Playwright, iPhone 390×844, light and dark. The scratch pack is `wt283/shots/`:
- `panel/`: the same screen with only the backdrop changed. Chip preview over the note and the translation drawer, light 10/15/20/30 %, dark 25/40/55 %, and 4px blur.
- `after-{light,dark}-*`: every drawer open.
- `mid-*`: frames taken 110 ms into a slide.
- `safe/`: the corner and safe-area check.

## Root cause: why the chip's drawer didn't animate

Base UI animates a drawer only when `open` changes. In `useTransitionStatus`, `data-starting-style` is set only when `open` turns true while the drawer isn't mounted. A drawer that mounts with `open` already true gets no starting state, so it just appears. On close, the parent unmounted it in the same render, so `data-ending-style` never ran either.

- **The chip preview (`RefDrawer`):** rendered `<Drawer open>` under `{open && <RefPreview/>}`, so it mounted open and unmounted on close. Measured before the fix: 1 distinct position across 50 frames on open, and on Esc the drawer was gone within 0 frames.
- **The same trap elsewhere:**
  - the palette's verse picker (`note-panel.tsx`, `{picking && <VersePicker open/>}`)
  - any lazy drawer asked open before its chunk arrived (lazy-drawer, compare dialog): `ui.Drawer` mounts already open.

## Fix

- **`components/ui/drawer.tsx` `Drawer`:** a drawer mounted open renders closed once, then opens. It slides in from `data-starting-style` like the rest. This covers every mounted-open case in one place, including late lazy chunks.
- **Chip:** the drawer stays mounted until `onOpenChangeComplete(false)`.
  - The caret and keyboard come back in the tap itself, `close(true)` at once. iOS raises the keyboard only inside a gesture, so after the slide would be too late.
  - Remove moves the caret in the tap. The chip leaves the text after the slide, since the drawer lives inside the chip. A tap on the chip during that slide doesn't reopen it.
- **Palette verse picker:** always mounted, `open={picking}`.
- **One look, defined once in `drawer.tsx`:**
  - the backdrop (below)
  - `forceRender` on every modal drawer, so nested drawers dim what's under them
  - one lifted edge: 0 −6px 20px, 8 % black light, 45 % black dark
  - one radius, `rounded-t-xl`
- **Removed:**
  - the chip drawer's own overlay, blur and shadow
  - the note's `backdrop-blur-none`
  - the `overlay` and `overlayClassName` props
  - the stacked parent's `brightness-95` (the child's backdrop dims it now)
- **Kept:**
  - the note's `stack={false}` (#277 F14)
  - the non-modal peek and selection menu, with no backdrop
- **Reduced motion:** no slide. Drawers fade in place over 150 ms, and a drag still follows the finger. This is an unlayered block in `app.css`.

Measured after the fix, light and dark: place, translation, more and note (top level), and the chip preview and verse picker (nested over the note). Every one shows 19–24 distinct positions in and out. The cold first open with a late chunk slides too. Reduced motion holds one position with opacity going 0→1 and 1→0.

## Decisions

| Q | Options | Panel | Built |
|---|---|---|---|
| Q1 Light dim | 10 / 15 / 20 / 30 % | **20 %, 6/6** (10 merges the layers, 30 looks broken or muddy) | `bg-black/20` |
| Q2 Dark dim | 25 / 40 / 55 % | **40 %, 6/6** (25 does nothing on near-black, 55 loses the note and the chip ring) | `dark:bg-black/40` |
| Q3 Blur | none / 4px | **none, 6/6**: the note and the tapped chip must stay readable. Jonas adds that an animated full-screen `backdrop-filter` is costly on older iPhones and doubles when nested | no blur anywhere |
| Q4 Lifted edge on every drawer | ok / objection | **ok, 6/6** | as above |
| Q5 Reduced motion = 150 ms fade | ok / objection | **ok, 6/6** | as above |

## Findings

| # | Finding | Who | Outcome |
|---|---|---|---|
| F1 | Remove, then a tap on the chip during the slide, reopened it with the removal still pending. It then ran on the next close | Jonas | **Fixed:** no reopen while a removal is pending |
| F2 | After Remove the caret moved only after the slide, so typing in that window landed in the old place | Jonas | **Fixed:** caret and focus move in the tap, the node goes later |
| F3 | Pending removal runs in an unmount cleanup if the note closes mid-slide | Jonas | Kept. The modal backdrop blocks the note, so this is only reachable in the ~400 ms exit. Noted |
| F4 | "+ Verse" picker has no Close button with a word; the others do | Sofie, Birthe | **Later:** goes with the header unification (F5) |
| F5 | Drawer headers differ: centred "Insert verse", left "Translation" with a bare ×, the chip's "× Close" | Mads (+ Birthe F4) | **Later:** one header and one "× Close" for every drawer, a separate issue |
| F6 | Dark: the chip drawer's top edge is faint on the dimmed note | Elias, Freja, Birthe (3/6) | **Open:** no majority. Mads says the edge plus surface carry it. Proposal: a dark-only 1px top hairline, not more dim. For the owner |
| F7 | The strip above the note is dimmed twice (about 36 % light, 64 % dark) under a nested drawer | Jonas, Sofie, Freja | **Accepted as intended:** reads as "two layers deep". "John 3" stays legible in dark |
| F8 | "shepherd;I": the poetry line break loses its space in the chip preview | Mads, Freja | **Later:** separate bug in how verse text is joined. Not this change |
| F9 | The slide (450 ms in, 400 ms out) feels slow when hopping chip to chip | Elias (1/6) | **Later idea:** one token if the owner wants it shorter |
| F10 | The note's Close looks pressable under the chip preview | Birthe | Checked: the chip drawer is modal, so its backdrop takes the tap. Only the top drawer closes |

## Keep (panel)

- One definition, and every drawer slides. The chip preview "finally feels part of the app".
- No blur, so the note stays readable under the preview.
- The peek and the selection menu stay non-modal with no backdrop.
- The tapped chip keeps its ring under the dim.

## Lessons

- A Base UI popup has to mount closed to animate in. "Mount when wanted" (`{x && <Drawer open/>}`) silently drops both transitions. Measure with a per-frame `getBoundingClientRect().top` sampler (an `addInitScript` rAF loop) rather than eyeballing.

# Persona review — reader navigation (2026-11-15)

**Panel:** all 8 personas from `docs/PERSONAS.md` — Jonas (frontend), Sofie (UX research), Mads (typography), Pastor Ruth (scripture), Birthe (71, iPad, large text), Elias (power student), Kasper (desk reader), Freja (phone newcomer). `REVIEW-PROCESS.md` says 3–6 by default; the owner asked for all 8 here.
**Process:** one evidence pack (`before-*.png`, axe), 8 parallel read-only reviews, synthesis, one ping-pong round on 4 conflicts → all 8 accepted the final positions below.
**Question:** how does a reader get to a book/chapter (and the rest of the site); which routes stay, which go; what becomes of the sidebar.

## Final routes

| Route | Job no other route does |
|---|---|
| **Address button "Salmerne 23 ⌄"** (top bar, every screen) | Says where you are (book + chapter, always), and is the one pointer route to *any* book and chapter: filter → book → chapter in one chooser, nothing loads until a chapter is picked. |
| **Chapter strip** (desktop paged reader only) | One click to a neighbouring chapter, always visible; shows the book's length and your place in it. |
| **Command palette** (Ctrl/⌘K, `/`, Alt+/, search field) | Typed route to a verse, plus searching notes, highlights, topics and running actions. |
| **Previous/Next + page keys + `[` `]`** | Reading on without choosing anything; flows across chapter and book ends. |
| **Translation ⌄** (quiet, right after the address) | The only way to change the edition; part of the citation ("Salmerne 23 · BPH"). `t` opens it. |
| **Ctrl/⌘B** (key, not a surface) | Opens the address chooser with the filter focused — keeps the old "Ctrl+B = books" habit; "rom 8" ↵ from the keyboard. |

The chooser opens on the **books** step where the strip shows (chapters are already on the page) and on **this book's chapters** where it doesn't (phones, short windows), with "← All books" and the filter on top in both — so phones keep their two-tap chapter change.

## Removed, and why

| Removed | Why (who) |
|---|---|
| **Books sidebar** (list, filter, Notes link, email/Log out, ☰ button) | A second copy of the book list behind an unlabelled icon, closed by default (owner) → a hidden duplicate. Its filter is folded into the address chooser (with the palette's parser), its look into the chooser (Mads's spec), its width no longer squeezes the top bar (the 1280/150 % wrap). 7 of 8 for removal in round 1–2; Mads and Kasper accepted in round 2 once the chooser got filter + chapter step + the typeset look. |
| **Top-bar Book ⌄ grid** (book-select) | Replaced by the address chooser (same grid, now with filter + chapter step). |
| **Top-bar Chapter ⌄** (where the strip is hidden) | Step 2 of the address chooser; the address now always shows the chapter. |
| **Bare "Notes" link to /notes** | Two things called "Notes" (Sofie, Birthe, Kasper, Freja, Ruth, Elias). The page is now always "All notes / Alle noter" (Notes panel link, palette, settings). Top-bar "Notes" stays the panel for this chapter; its tooltip/SR name says "Notes on this chapter". |
| **Icon-only top bar at 175–200 %** | Birthe's blocker (Sofie, Mads agree): words never go. When room runs out the search field becomes a worded "Search" button; the translation shows its abbreviation; the row may wrap as the last resort (WCAG 1.4.10), never icons alone. |

## Moved
- **Log out** → Settings, under "Signed in as <email>", behind the existing confirm (all 8).
- **Shadcn sidebar component + `--sidebar*` tokens** deleted (Jonas: no dead code).

## Not adopted
- **"Just start typing" / F / G to search** — 8 of 8 in the end: letters are already reader keys (t, v, h/n/m/c, 1–6; "mat", "1 mos" would fire tools), it adds to the WCAG 2.1.4 single-key debt, F = browser find. Instead the search field shows **Ctrl+K** and **/** (Kasper: Ctrl+K first — "/" is Shift+7 on Danish keyboards).
- **Hover flyouts** — fail on touch, keyboard and screen readers (all).
- **Translation alone in the far corner** (owner's idea; Kasper, Birthe, Freja leaned that way) — it stays right after the address but borderless and muted ("BPH ⌄", full name in its menu and as its accessible name), with a clear gap (Mads 12 px; Birthe: no mis-taps).

## Later (GitHub issues)
1. #142 Recent passages / "continue where you left off" + "good places to start" in the chooser and the empty palette (Freja, Kasper, Ruth, Birthe, Sofie).
2. #143 Canonical sub-groups in the chooser (Law, History, Wisdom, Prophets; Gospels, Acts, Letters, Revelation) (Ruth).
3. #144 Labels at large text: one container-query shed order; at 175 %+ Notes + Settings into a worded "More" on desktop (Birthe, Sofie, Jonas — "next, not later").
4. #145 Single-key shortcuts off switch (WCAG 2.1.4) (Jonas, Elias).
5. #146 Spread awareness: strip marks every visible chapter, address shows "23–24" (Sofie, Ruth).
6. #147 Strip: "All chapters" as a word, bigger targets; cross-book "Next: Johannes 4" (Birthe, Elias, Sofie).
7. #148 /notes page: "← Back to Salme 23" (Birthe, Sofie).

## Findings (round 1, merged)
| Sev | Finding | Raised by | Outcome |
|---|---|---|---|
| blocker | Words vanish at 175–200 % (icon-only Search/Notes/Settings) | Birthe, Sofie | Words kept at every size; row wraps as last resort; #144 |
| major | Two "Notes" going to different places | Kasper, Freja, Sofie, Ruth, Birthe, Elias | Page = "All notes" only |
| major | Two book lists (sidebar + grid) for one job | all 8 | One address chooser; sidebar removed |
| major | Picking a book drops you on chapter 1 | Kasper, Ruth, Birthe, Sofie, Elias, Jonas, Freja | Book → chapter step in the same chooser |
| major | Address shows the book but not the chapter | Ruth, Sofie, Birthe, Freja | "Salmerne 23 ⌄" everywhere |
| major | Top bar wraps at 1280/150 % | Kasper, Ruth, Jonas, Mads, Birthe | No sidebar; search field by container width (`@container/nav`) |
| major | Log out only in a closed-by-default sidebar | Sofie, Birthe, Kasper, Freja | Settings, behind the confirm |
| major | Sidebar = stock grey panel, 12 px names | Mads, Jonas | Chooser in Mads's spec: serif names, one current mark, underline filter, no fills |
| minor | Filter matches mid-word ("sal" → Thessalonikerbrev) | Kasper, Ruth, Sofie, Birthe, Elias | Shared prefix matcher (suggestBooks) + palette parser |
| minor | Ctrl+B ignored editors (bold) | Jonas | `opensPlaceChooser` bails in editors (tested) |
| minor | Book grid arrows didn't follow its columns; axe "region" | Jonas | Columns read downwards; ↑/↓ = DOM order = visual; axe clean |
| minor | Phone sheet opened mid-list, focus on the logo | Freja, Sofie | Phone opens on this book's chapters, focus on the current chapter |

## Evidence
Before/after screenshots and axe JSON: scratchpad `nav2/` (not committed). axe after: only the intentional `meta-viewport` (zoom lock, #61).

# Persona panel — inline scripture references in notes (2026-11-16)

**Scope:** how a note puts scripture references *inline* in its text (`@` + a toolbar button), what the bottom references list becomes, how references behave across translations, and how a notes tour teaches it — so builders can start without guessing.
**Owner's request (transcribed):** (1) `@` + text opens a search for any reference; picking inserts it inline and adds it to the note's list; (2) a button for it, since `@` isn't discoverable; (3) remove the bottom "Add passage" area — the list becomes an overview "of all references without having to read the note"; (4) references are translation-agnostic (book/chapter/verse) and resolve in the reader's translation; a combined verse (BPH 14–15) is simply picked up; (5) a click-through tooltip tour for the whole notes section; (6) anything else the panel adds.
**Panel (6, `REVIEW-PROCESS.md`: study features + onboarding + engineering):** Elias, Ruth, Sofie, Jonas, Birthe, Freja. Not on it: Mads (no typographic question beyond the chip), Kasper (quick capture unaffected).
**Evidence:** dev server on the branch base (658867f), seeded WEB John 3 note "The bronze serpent" on 3:14–15; shots in scratchpad `inlinerefs-pack/` (reader note panel, reader Notes panel in WEB and BPH/da, Notes page en/da, phone list/editor/drawer). Not committed (BPH text on screen).

## What exists today (verified)

- `note_anchor` = translationId + book + chapter + start/end verse **+ word offsets in that one translation** (`apps/api/src/db/schema.ts`, `packages/shared/src/anchor.ts`). Both the reader selection ("Create note") and the typed "Add passage" make one; typed ones are whole verses in the reading translation.
- **A note disappears when you change translation.** `notesWithAnchorIn` filters on `translationId` (`notes.store.ts`), so the BPH reader panel for John 3 says "Ingen noter til dette kapitel endnu" while the WEB note exists; the only trace is a grey `⁘1` with a hover-only title (`chapter-text.tsx`, `otherVersionNoteCounts`). All six flagged this, four as a blocker.
- **Bridges fail when typed.** BPH stores John 3:14–15 under 14 with label "14–15"; `anchorForReference` (`notes/note-list.ts`) looks for verse 15 exactly → "noVerse". The reader's `targetVerses` (`chapter-nav.ts`) already resolves a verse inside a bridge to the bridge.
- **Versification differs:** BPH has no Malachi 4 (404; Danish Bibles: Mal 3:19–24); same family of differences for Joel 2:28ff/3:1ff and psalm titles.
- **Lexical blanks custom URL schemes:** `LinkNode.sanitizeUrl` (`@lexical/link@0.35.0`) only allows http/https/mailto/sms/tel; `[x](bible:…)` imported by `linkPlugin` becomes `about:blank`. An inline reference needs its own node.
- The editor's block-type menu says "Paragraph" in the Danish UI (MDXEditor gets no `translation`); the snippet credit line doesn't name the translation quoted.
- `@` already means "notes" in the command palette; #116 plans `[[` for note links.
- Typed "Add passage" refuses cross-chapter ranges (an anchor sits in one chapter).

## Findings (merged, ranked)

| # | Finding | Sev. | Raised by |
|---|---|---|---|
| 1 | Notes vanish in another translation; `⁘1` is unreadable and hover-only | blocker | all 6 |
| 2 | The reference button must carry a word ("+ Bibelvers"), first in the toolbar, on phones too, 44 px; `@` is AltGr+2 / symbols layer on Danish keyboards | major | Birthe, Freja, Sofie, Elias, Jonas, Ruth |
| 3 | Inline ref as a markdown link needs a custom Lexical node (LinkNode blanks `bible:`) | blocker (build) | Jonas (verified) |
| 4 | Picker must take typing like the palette (`rom 8:28-30`, `joh 3,16`, da+en abbreviations, `,` or `:`), preview the resolved label + first words, Enter inserts | major | Elias, Ruth, Freja, Sofie |
| 5 | Inline chip must look tappable, show a labelled preview (verse text + translation + "Læs her"), never jump on a plain click while editing | major | Elias, Sofie, Freja, Birthe, Jonas, Ruth |
| 6 | Chip shows a label only, in the UI font — never scripture text inside commentary | major | Ruth, Jonas |
| 7 | Bridges resolve to the whole unit, visibly ("Joh 3,15 · i BPH 3,14–15") | major | Ruth, Elias, Sofie, Jonas |
| 8 | Versification mismatch must never resolve silently to a wrong verse; say so plainly, offer the right place | major | Ruth, Sofie, Birthe, Freja, Elias, Jonas |
| 9 | Removing "Add passage" leaves no visible way to add when the list is empty — empty state with the button | major | Sofie, Elias, Birthe, Freja |
| 10 | Every quoted snippet names its translation; credit line names the translation(s) quoted | major | Ruth, Birthe |
| 11 | One source of truth: inline refs derived from the body on save, not a second write that undo/drafts can desync | major | Jonas |
| 12 | Tour: short (≤ 3–4 steps per place), task-triggered, skip + "1 af 3", replay from Settings/palette; empty states carry most teaching; button is taught, `@` as the shortcut | major | Sofie, Freja, Birthe, Elias, Ruth, Jonas |
| 13 | Cross-chapter ranges are normal (John 7:53–8:11, Isa 52:13–53:12) — accept them in inline refs from day one | minor | Ruth, Elias |
| 14 | Overview rows: where it came from ("i teksten" / "markeret i Bibelen"), × always visible and 44 px on touch, Undo | minor | Sofie, Freja, Birthe, Jonas |
| 15 | Overview cost: 20–30 refs = 20–30 chapter fetches (quota + FUMS) for snippets | minor | Jonas |
| 16 | "Paragraph" untranslated in da | polish | Birthe, Sofie |
| 17 | Phone: overview collapses to one line while typing | polish | Freja |
| 18 | Note chip on page 1 sits by verse 3 while its passage (3:14–15) is on a later page (`reader-panel-desktop`) — cause not traced | polish (bug?) | Ruth |

## Decisions (recommended defaults; ★ = a guess, owner may overrule)

**Storage + model**
- Inline reference = markdown link `[Joh 3,16](bible:JHN.3.16)` in the body. Grammar (USFM ids): `bible:JHN.3.16`, `bible:JHN.3.16-18`, `bible:ROM.8.28-9.5`, `bible:PSA.23`. Parser/formatter in `packages/shared` (web + API share it). Markdown stays the DB format; export (#121) and the plain-text fallback editor keep working. (Elias, Sofie, Jonas, Ruth)
- No translation in the href (owner, Elias, Jonas). Ruth asked for `?from=<translation>`; not adopted for verse references — they quote no words, so there is nothing translation-bound to record. Her concern is kept where it matters: word-precise anchors keep their home translation and are labelled.
- New table `note_ref` (book, chapter, verse?, end_chapter?, end_verse?, origin, position?, created_at; indexes `(book, chapter)`, `(note_id)`), canonical English versification. The server rebuilds a note's `origin='inline'` rows from the body on every PATCH (same transaction). `note_anchor` stays as the word-precise reader selection; **no data migration** of existing anchors. Also add the missing `note_anchor(book, chapter)` index. (Jonas)
- Wire `Note` gains `refs`; the web builds the overview from the local body optimistically with the same shared parser (no 800 ms lag).

**Inline chip + picker**
- Custom Lexical DecoratorNode (MDXEditor `realmPlugin`: `addLexicalNode$`, import visitor ahead of the link visitor, export visitor back to an mdast link). The label is generated from the href in the UI language ("Joh 3,16" / "John 3:16"); the stored link text is only a fallback. Sans UI font, label only, `contenteditable=false`, accessible name "Johannes 3,16, skriftsted". (Jonas, Ruth)
- Plain click in the editor places the caret. Opening the chip: tap on touch, Enter when selected, Ctrl/Cmd+click → a popover with the verse text in the **current translation, labelled** ("Num 21,4–9 · BPH"), "Læs her" and "Fjern". The preview fetches the chapter only when opened. (Elias, Sofie, Freja, Jonas, Ruth)
- `@` opens the picker only at the start of a word (emails untouched), inside the editor only. The palette keeps `@` = notes, and `[[` stays for note links (#116). (all; Q4)
- Toolbar button with a word: **da "+ Bibelvers", en "+ Verse"** ★ (name guessed; Sofie wanted "+ Skriftsted", Jonas "Passage"; the readers asked for the plain word). First after undo/redo, desktop and phone, 44 px on touch; tooltip "eller skriv @" teaches the shortcut. It opens a Dialog (desktop) / Drawer (phone) holding the existing forgiving input; it saves and restores the Lexical selection (iOS drops focus on a toolbar tap). (Jonas, Sofie, Birthe, Freja)
- One resolver behind both: `findPassages` (da+en, `,` or `:`), parsed match first with label + first ~8 words, book-name suggestions below; ↑↓/Enter/Tab/Esc; Esc or a space with no hit leaves the literal `@text`. Cross-chapter ranges accepted. (Elias, Ruth, Freja)
- Bridges: any verse inside a bridge resolves to the whole bridge; the chip keeps what the author cited ("Joh 3,15"); the preview and overview add "i BPH: 3,14–15". Reuse `targetVerses`. (Ruth, Elias, Jonas)
- Versification: **now** a clear message — "Malakias 4 findes ikke i BPH. I danske bibler: Mal 3,19–24" where known, else "Læs i WEB" — never a guess. **Later** a small mapping table (Mal 3–4, Joel 2–3 first; psalm titles need data checking per translation). (Ruth wanted the table sooner; all others later)

**When a chip is deleted (Q2) — conflict**
- Jonas/Elias: the body is the truth, the ref leaves the list, undo brings both back. Sofie/Freja/Birthe: don't let the list change silently. Ruth: ask with a toast.
- **Decision ★:** the list follows the body (one truth), and deleting the *last* mention of a reference shows one toast "Joh 3,16 fjernet fra noten · Fortryd". Word-precise reader anchors never disappear this way (they aren't in the body).

**Overview (bottom list)**
- "Add passage" field goes (owner). The section stays: heading with count ("Bibelvers · 4" ★ name follows the button), a small "+ Bibelvers" in the heading row (same dialog), and an empty state "Ingen bibelvers endnu. Brug + Bibelvers, eller markér ord i Bibelen." with that button. (Sofie, Elias, Birthe, Freja — the owner asked for no add *area*; a button is not one, but see owner Q1)
- Order: references in text order first, then reader selections ("markeret i Bibelen"). Each row: label · translation (for word-precise) · snippet ending on a word boundary; click reads there (as today); "i teksten" jumps to and flashes the chip; reader-made rows get "Indsæt i teksten". (Elias, Ruth, Sofie, Freja)
- Snippets: whole-verse refs quote the **current** translation, word-precise anchors their **home** translation, always labelled; credit names the translation(s) quoted. Fetch cap: snippets for the first 10 distinct chapters ★, label only beyond ("Vis tekst"). (Ruth, Jonas)
- × always visible on touch, 44 px; removing a reader anchor shows Undo. Phone: list collapses to one line ("Bibelvers (4)") while the editor has focus. (Birthe, Freja, Sofie, Jonas)

**Across translations**
- Reader panel lists every note with an anchor **or** a ref in this chapter, whatever translation it was written in; notes from another translation carry "Skrevet i WEB". (all)
- Marks: word-precise on the home translation; elsewhere a verse-level mark (whole verse / whole bridge, never word-mapped). Inline refs get the same verse-level mark. The `⁘` badge and `/api/notes/other-versions` go. (Ruth, Jonas, Elias)
- #117's "translation label" item is done by this.

**Tour (Q7) — conflict**
- Owner: a click-through tooltip tour of the whole notes section. Sofie/Jonas: tours get skipped; teach with empty states and contextual hints. Freja/Birthe/Elias/Ruth: a tour is fine if short.
- **Decision:** two mini-tours, each started by the task, not the visit: **note** (first time a note opens: write here → "+ Bibelvers", which waits until one is inserted → the overview) and **Notes page** (first visit: search → sort → "+ Ny note"). ≤ 4 steps each, "1 af 3", "Næste" + "Spring over" with words, Esc closes, focus moves to the target, no motion under reduced motion, never under the phone keyboard, steps with no visible target are skipped. Replay: Settings ("Vis rundvisningen igen") and a palette action. Teaches the button; `@` only as "eller skriv @". Built on the existing Popover, no tour library, lazy chunk. "Seen" stored on this device ★ (localStorage; account sync later). Empty states carry the rest.

## Not adopted / later

- Freja: book → chapter → verse grid picker inside the dialog — later (typing + suggestions first; reuse the place chooser when it comes).
- Sofie: offer "Gør til bibelvers?" when someone hand-types a reference — later idea.
- Elias: Notes search by reference overlap ("rom 8" finds every note citing it) + "Cited in" — later issue (the `note_ref` index makes it cheap).
- Birthe: confirm dialog on "Slet note" — not adopted; Undo toast exists (#64).
- Ruth: `?from=` on hrefs — not adopted (see Storage).
- #117 reorder: inline refs follow text order; reorder only matters for reader anchors — keep in #117, lower priority. #117 edit-range-in-place: chip popover "Rediger" later.

## Owner questions (with the default builders use)

1. Keep a small "+ Bibelvers" in the overview heading and empty state? **Default: yes** (no input field).
2. Deleting a chip removes the reference from the list (with an Undo toast)? **Default: yes** ★.
3. Button/list name: "+ Bibelvers" / "+ Verse"? **Default: yes** ★ (alt. "Skriftsted").
4. Tour as two short task-triggered mini-tours rather than one long tour on first visit? **Default: yes.**

## Issues

| # | Slice | Blocked by |
|---|---|---|
| #158 | 1/5 Foundation: shared `bible:` href grammar + bridge resolver, `note_ref` table derived from the body, chapter queries across translations | — |
| #159 | 2/5 Reader shows notes from every translation (verse-level marks, "Skrevet i WEB", drop `⁘`) | #158 |
| #160 | 3/5 Inline chip node, `@` typeahead, "+ Bibelvers" button, bridge fix, da editor strings | #158 |
| #161 | 4/5 Bottom list becomes the overview (no add field, text order, tags, labelled snippets) | #160, #159 |
| #162 | 5/5 Notes tour: two task-triggered mini-tours + replay | #160, #161 |
| #163 | Later: versification mapping (Mal 3–4, Joel 2–3, psalm titles) | #158, #160 |
| #164 | Check: note chip shown on a page without its anchor | — (not alongside #159) |

File overlap: `note-panel.tsx` (#160 wiring, #161 owner, #162 attributes) → serialized by the deps; `connections-panel.tsx` (#159 owner, #161 one line); `chapter-text.tsx`/`annotation-marks.tsx` (#159, #164); locales in every slice (append, rebase). #117 commented with what this covers (translation label, cross-chapter for inline refs).

# Notes as a first-class citizen — audit, panel, plan

2026-11-15. Marcus: the notes feature is confusing (topics, "notes in this chapter", "latest notes", "also points to" side by side), has no real home, and must grow (sermon mode #112). This doc records the audit, the panel debate and the phased plan. Phase 1 ships with this doc.

## Audit (before)

Data (`apps/api/src/db/schema.ts`): `note` (title, markdown body, soft delete) M:N `note_anchor` (word span in one translation + chapter); `tag` + `note_tag` + `passage_tag` (chapter-level tags). No note↔note links, no ordering of anchors, no source field.

API: `/api/notes` (list all / list for chapter / CRUD / restore / attach + detach anchor; the last anchor can't be removed), `/api/connections` (one chapter: notes here, also-appears-in, 5 recent, topics), `/api/tags` (note tags, passage tags, topic page).

Web: notes live only inside the reader. The "Notes & topics" side panel (⌘.) stacks four sections — Topics (chapter tags with add/remove, plus "topics from your notes" as plain text), Your notes on this chapter, Your notes also point to, Recent notes (5, unrelated to the chapter). A note opens in the side editor (title, topic chips, MDXEditor, references table with quoted words). `/topic/:name` is a bare page. Palette `@` searches notes.

Problems found:

1. **No home.** No notes route, no list of all notes beyond 5 "recent" ones and the palette. Opening any note moves your reading place to its first passage.
2. **A note can't exist without a passage.** Creating one needs a text selection; the last reference can't be removed. Drafting a sermon outline first and linking passages later is impossible.
3. **Adding a reference needs the reader.** Select words in the other chapter → "Create note link…" → pick from an unsearchable flat list of every note. No way to type "Rom 8:28" from the note.
4. **Two kinds of topics.** Adding a topic in the panel tags the chapter; topics in the note tag the note; both appear in one panel with different rules (removable / not, chip / plain text).
5. **Sections overlap.** The same note appears under "on this chapter" and "recent"; "also points to" repeats what each note row's references already say.
6. **English book names in Danish UI** in references ("John 3:16" next to "Johannes" in the nav).
7. **Untitled notes** show as "Untitled note" everywhere, though the palette already falls back to the first line.
8. Topic page: no way back except "back to reading" (to `/`), notes on it jump into the reader.
9. Trash: undo toast only.

## Panel

Sofie (book designer), Birthe (68, low vision), Jonas (a11y), Mads (interaction), Elias (heavy study user, preaches), Ida (design system), Theo (architect).

**Where do notes live?** Mads: two places with one model — a Notes page (library + editor, like Apple Notes / Obsidian) and the reader's side panel (notes for the passage you're reading, editor beside the text). Elias: "I write the sermon first, then hang passages on it; when I read, I want my notes on that chapter next to the text" — both directions must be one click. Birthe: the word on the button must be "Notes", and I must always see how to get back to the Bible. Sofie: two calm pages, not one busy panel. → **`/notes` (list + editor) and the reader panel, same editor component.**

**One model.** Theo: a note has references (0..n) and topics; that's all the reader needs to know. "In this chapter" = notes with a reference here. "Recent" belongs to the Notes page (sorted by last edit). "Also points to" folds into each row (its other references). Elias objected to losing "also points to" as a cross-reference list; the panel agreed each row's other references give the same jumps, and a real cross-chapter view is the graph (Phase 3).

**Notes without references.** Theo + Elias for (sermon drafts, #112 transcripts arrive before references are resolved). Sofie worried about orphan notes; answer: the Notes page is their home, and the list labels them "No passages yet". The last-anchor guard goes.

**Topics.** Mads: topics belong to notes. Chapter tags (passage_tag) are a second concept nobody can explain. Theo: don't drop data in Phase 1 — stop creating chapter tags in the reader, keep showing existing ones, and decide migration later. Topic chips filter the Notes page (`/notes?topic=x`); `/topic/:name` redirects there and the filtered view lists the chapters tagged with it (removable).

**Adding references.** Elias: type it — "rom 8:28-30", Danish or English, same forgiving parser as the palette, in the reading translation. Whole verses (word 0 → last word); a chapter alone = the whole chapter; cross-chapter ranges are refused for now (an anchor sits in one chapter). Jonas: the parsed result is announced (live region) before Enter adds it; errors are announced too. Selecting words in the reader stays the precise way.

**Quoted text.** Ida + Theo: the opened note shows each reference with its words (already fetched per chapter, cached hard); the list shows references only — fetching every chapter for a list would burn reading quota. Licensing: text is displayed only, never sent anywhere new.

**Graph.** Mads wants an Obsidian-style canvas; Sofie and Birthe say it's decoration for most readers; VISION says "graph as engine, not interface". Agreed: Phase 3, opt-in view from the Notes page (notes ↔ books/chapters ↔ topics), not in the reader.

**Note-to-note links / backlinks.** Elias: needed for sermon series. Phase 2: `[[`-style links in the body, stored as edges, "Linked from" section in the editor.

**Phone.** Birthe/Jonas: list and editor are separate screens on phones (back button), 44px rows, no hover-only controls. Reader panel stays a bottom drawer.

**Keyboard / a11y (Jonas).** List is a real list of links with `aria-current`; search is a labelled input; ⌘. still toggles the reader panel; Notes page reachable from the sidebar and the palette; all scroll regions use ScrollArea; focus moves to the editor title when a note opens from the list.

**Naming (Birthe, Ida).** "Notes & topics" → **Notes** (da: Noter). Book names in references follow the UI language with the Danish comma ("Rom 8,28").

## Plan

### Phase 1 — this PR
- API: notes may have zero references (create without anchor, remove last anchor); wire `Note` carries `updatedAt` and `tags`.
- `/notes` + `/notes/:id`: list (search over title/body/references/topics, topic filter, sort by last edit or Bible order) + editor; phones: list → editor screens. "New note" creates a note without passages.
- Editor (shared with the reader panel): references section with typed "Add passage", localized labels, quoted words, read-in-context links; "Open in Notes" from the reader panel; untitled notes named by their first line.
- Reader panel "Notes": notes on this chapter (with their other references), topics touched here as links, "All notes" link; no more Recent / Also points to / chapter-tag adding.
- Topic chips → `/notes?topic=`; `/topic/:name` redirects; chapter tags listed (and removable) in the filtered view.
- Entry points: sidebar "Notes" link, palette "All notes" action.

### Phase 2 — linking (issues)
- Note-to-note links + backlinks ("Linked from") — #116.
- Reference editing: reorder (position column), edit a range, translation shown per reference, cross-chapter ranges, searchable "Create note link…" picker — #117.
- Trash view for deleted notes (restore within the purge window) — #118.
- Retire chapter tags: migrate `passage_tag` into notes or keep as "chapter topics" — decide with data — #119.

### Phase 3 — seeing the web of study
- Graph view (opt-in, from the Notes page) — #120.
- Markdown export (includes references + links), per VISION — #121.

### Sermon mode (#112) prerequisites
- Note `source` (manual / sermon) + transcript attachment, AI-proposed references kept as suggestions the user accepts. Only audio/transcript goes to the model, never Bible text — #122.

Also found: editor placeholder fails AA contrast (pre-existing) — #123.

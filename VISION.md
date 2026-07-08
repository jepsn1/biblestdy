# biblestdy — Product Vision

*The manifesto. Every decision checks against this doc.*

---

## What is it?

A Bible study app where **Scripture and notes are equal first-class entities**, connected through a knowledge graph — but the graph is the *engine*, not the interface. What the user feels is: **your study never gets lost, and connections surface themselves.**

## Who is it for?

**Devoted laypeople** who study the Bible seriously but have no formal training. Piloting in **Denmark first**. Not scholars, not primarily pastors — if a choice pleases scholars but confuses a layperson, the layperson wins.

## What problem does it solve?

- Bible apps treat notes as throwaway annotations.
- Note apps treat Scripture as an external reference.
- **Existing tools study *badly on the web*** — cramped, shallow, no real study surface.

biblestdy treats Scripture and notes as peers, gives study a real web-class surface, and makes study **compound** over time instead of scattering.

## What makes it different?

1. **A genuinely good web study surface** — Scripture and margin-scribed notes side by side. The web study experience others do poorly is our opening.
2. **The graph as invisible engine** — connections power "related notes," resurfacing, backlinks, topic pages. No intimidating graph canvas by default. Power disclosed only to those who seek it.
3. **Study compounds** — the more you study, the more the app connects and resurfaces. This is the promise.

---

## The core loop — margin-scribing

The atomic action mirrors scribing in a physical Bible's margin:

1. Read Scripture (centered or side-by-side).
2. Mark a span — one word to many.
3. Attach an artifact of **variable weight**, all first-class:
   - **Highlight** (no text)
   - **Inline note / post-it** (short)
   - **Full note** (standalone markdown document)

The `passage ↔ note` link is created **automatically by the act of marking** — no manual linking, no cold-start.

## What makes it a graph (connections across passages)

- **Shared notes (many-to-many)** — one full note anchors to many passages. The note *is* the edge.
- **Topics / tags** — connective tissue across the whole corpus; topic pages aggregate everything tagged.
- **AI-suggested links** — a later, paid layer. Deepens the graph automatically.

---

## Principles

**Notes are truly first-class.** Highlight, inline note, and full note are peers — full notes are *not* a lesser tier. Full notes are **markdown**, and **always one-click exportable**. Open formats, no lock-in — portability is a promise, not a filing chore.

**Annotations live on the translation they were made on.** An annotation anchors to the marked words in a *specific* translation: `(translation, passage, word-span)`. The canonical verse reference is the *bridge*, not the home.

**Shadow notes.** When reading a different translation, notes made on other versions appear alongside as references — surfaced by verse-reference mapping — but they remain owned by their origin version. You see across; the note still lives where it was born.

**AI connects, never interprets.** AI suggests links, surfaces related notes, powers semantic search, auto-suggests topics, and summarizes *your* notes. It **never** asserts what a verse means, never makes doctrinal claims. The user always interprets. This protects trust across every denomination.

**Private. No sharing, ever.** Single-user study sanctuary. Accounts exist only for the user's own multi-device sync. No collaboration, no groups, no social, no publishing.

**Translation-agnostic by architecture.** A `Translation` is data; verses key to a canonical reference; annotations anchor to word-spans within a translation. Any translation — public-domain or licensed — is just data we load.

---

## Scripture strategy

**Ship on a Bible API for now** (e.g. API.Bible) — consume translations rather than parse and self-host text. Fastest path; no Scripture-data pipeline for the pilot. Self-hosting parsed public-domain text (1931, WEB, KJV) is a known later option, kept in mind.

- Translation-agnostic architecture holds regardless of source — API text is **displayed/cached, not our system of record**. Annotations anchor to `(translation, passage, word-span)` and survive a source swap.
- Constraints, eyes-open: API.Bible free tier is **non-commercial** (5k calls/mo), Pro ~$29/mo for commercial. Modern **Danish is not on API.Bible** — Bibelen 2020 / 1992 remain **direct license** from Det Danske Bibelselskab (`rettigheder@bibelselskabet.dk`), pursued in parallel, **not a gate**.
- Consequence: first build likely reads WEB/KJV (or available Danish); Bibelen 2020 swaps in once licensed.

## Platform

**Web-first, responsive, installable (PWA).** One codebase.
- Desktop / tablet: full study surface (side-by-side Scripture + margin notes).
- Phone: read + quick highlight / note.
- **No offline reading yet** — online-only for the pilot.

## Language

**Internationalized (i18n) from day one — Danish + English UI.** UI strings live in translation packages; adding a locale is data, not code. Scripture translations are independent of UI language (read English Bible with Danish UI, etc.).

## Storage

**Cloud DB** (enables sync, graph queries, AI, multi-device) with **markdown note bodies** and **one-click .md export/import**.

## Business model

**Credits — pay for what costs us, no subscription tier.**
- **Free forever:** read + highlight + inline & full notes + manual topics + markdown export on public-domain text. The whole core study loop is free.
- **Credits** are spent only on **metered-cost features** — chiefly AI (link suggestions, semantic search, summaries of your notes). Buy credits, spend as you go. No recurring lock-in; no artificial paywall on core study.
- Credits align price directly with our real variable cost (AI/compute). Licensing/hosting funded from the same pool.

---

## North star

**Compounding return.** The pilot works when users come back weekly *and* their graph keeps growing — notes and links accumulate, old notes get revisited. That proves the core promise: **study compounds instead of scattering.**

Every feature is judged by: *does this make study compound, or just add surface area?*

---

## Explicitly NOT this

- Not a graph-canvas tool users must wrangle (Obsidian/Roam).
- Not a theological authority or AI commentary.
- Not a scholar's workbench (original-language apparatus, exegesis tooling).
- Not social — no sharing, groups, feeds, or publishing.
- Not a lock-in silo — data always exports.
- Not native mobile (v1).
- Not offline (v1).
- Not a subscription paywall — core study is free; credits meter only AI.

---

## Open questions

- Credits — price per credit, and what starting balance (if any) for new users?
- Topics — user-authored only, or AI-suggested from day one (vs "AI later")?
- Auth/sync stack — build vs managed (e.g. hosted auth)?

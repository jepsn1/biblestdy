# Persona review — reading experience (2026-11-13)

Panel: all 8 personas in `docs/PERSONAS.md`, reviewing the reader after #44 (layout) + #45 (Paper/Clean). Input: 12 screenshots of the dev server (desktop 1440/1280/1024, phone 390; Paper/Clean; light/dark; WEB + BPH; first-visit chooser) + read-only code.

Caveats: headless browser ran with English UI (complaints about English labels partly an artefact); the selection-menu screenshot didn't capture the menu.

## Consensus
| # | Problem | Raised by | Direction |
|---|---|---|---|
| 1 | Arrows don't say where they go; same `›` = page on desktop, chapter on phone; last page silently jumps chapter; 3 redundant controls (edge strips, fake kbd hints, footer) | all 8 | One quiet control `‹ 1 / 3 ›`; at boundaries labelled `‹ John 2` / `John 4 ›`; drop edge strips + kbd-hint boxes (→ tooltips) |
| 2 | Chapter has no ending | Freja, Birthe, Sofie, Mads, Ruth, Jonas | "Continue to John 4 →" after last verse |
| 3 | Horizontal scrollbar at 1024/1280 (`min-w-[67rem]`) | Kasper, Sofie, Elias, Ruth, Jonas, Mads, Birthe | Drop min-width; one column below threshold |
| 4 | Columns ~35 chars: 27rem reserved for empty annotation lanes | Mads, Elias | Lanes only when the chapter has annotations; target ~55 chars/line |
| 5 | Lost place: no heading after p.1, footer "JHN.3", sidebar doesn't mark book | Sofie, Birthe, Ruth, Mads, Jonas, Freja | Running head "John 3 · page 2 of 3"; human footer; mark current book |
| 6 | ← into previous chapter lands on its first page; page not remembered | Kasper, Elias, Jonas | Land on last page; page in URL; cross book boundaries |
| 7 | Text lost its shape: no paragraphs/poetry; headings look like UI labels | Ruth, Mads, Freja | Honour source paragraphs/poetry; serif headings |

## Bugs found
- **BPH verse bridges** (confirmed): API.Bible verse `14-15` → `Number()` NaN → its text appended to v13 (`apibible.provider.ts`). BPH John 3 shows 34 verses.
- **Shortcuts fire while typing**: ←/→ and `/` handlers only ignore INPUT/TEXTAREA, not the MDXEditor contenteditable; also fire with modifiers and behind the modal chooser (Jonas).
- **Jump box drops the verse**: "rom 8:28" opens Romans 8 p.1 (Elias).

## Disagreements → decisions
- Desktop scroll vs pages: Ruth wants scroll; others keep the spread → keep spread, scroll option later if asked.
- Words vs icons: Birthe wants words, Mads calm icons → words only at chapter boundaries, tooltips elsewhere.
- Chooser: Sofie — don't preselect a style that differs from the page behind; say it can be changed later.

## Later
Parallel translations (Elias, Ruth), full-text search (Elias), newcomer "start here" (Freja), Danish book names (Birthe, Jonas), recently-read list (Ruth), keyboard chapter shortcuts `[`/`]` (Elias), Clean dark foreground 0.985 → 0.9 (Mads), faster first verse by parallel loading (Jonas).

# Persona review process

How we run a design review with the personas in `docs/PERSONAS.md`. Same steps every time, so results are comparable and cost stays predictable.

## 0. Standing rule: phone first (owner, 2026-11-22)

biblestdy is a **phone app first, scaled up to desktop**, not a web app condensed down. Design each surface for thumbs first (44px targets, pressed states, sheets and list rows), then adapt it to desktop. Evidence packs lead with phone shots (390×844, light, dark, 200% text), and panels judge the phone version first. See `docs/reviews/2026-11-22-phone-app-feel.md` for the phone icon rule (D13).

## 1. Scope + panel (pick 3–6, never all 8 by default)

Write one sentence: what is being reviewed and what decision it should inform. Then pick the personas whose angle matters for it:

| Review type | Panel |
|---|---|
| Reading / text presentation | Mads, Ruth, Birthe, Elias |
| Navigation / information architecture | Sofie, Birthe, Elias, Kasper |
| UI chrome: sizing, icons, labels, a11y, overlays | Sofie, Mads, Jonas, Birthe, Freja, Elias |
| Onboarding / first use | Sofie, Freja, Birthe |
| Study features (notes, tags, connections) | Elias, Ruth, Sofie, Kasper |
| Performance / technical | Jonas (+ one reader persona as sanity check) |

More than 6 mostly repeats findings. Use all 8 only for a full product review.

## 2. Evidence pack (built once, shared by every persona)

Reviewers never browse on their own: one pack, same evidence for everyone.

1. Dev server running (see memory/`biblestdy-deploy-migrations`); never against prod.
2. Seed realistic study data: `tools/review/seed.sh cookies.txt` (WEB John 3: highlights, a margin annotation, a note, a tag). Dev Resend key is live: only `delivered@resend.dev`.
3. Screenshots + accessibility scan: `tools/review/ui-shots.mjs` (Playwright + axe-core) — every screen and overlay, desktop/tablet/phone, Paper/Clean, light/dark, en/da, keyboard focus, 200% zoom equivalent. Add shots for the feature under review. Run from a scratch dir with `npm i playwright axe-core`:
   `BASE=http://localhost:5173 COOKIES=cookies.txt OUT=<dir> node tools/review/ui-shots.mjs`
   Safe areas and **rounded corners** (standing rule, owner 2026-11-22): `tools/review/safe-area-shots.mjs` on every phone surface, standalone (`p-app`) and Safari with its toolbar collapsed (`p-safari-full`, no bottom inset but the page meets the glass). It fails any control reaching into the status bar / home indicator or past the ~55pt corner arcs (`corner-*`). Every bottom edge pads by `--corner-bottom` (≥24px on touch phones, never just `--safe-bottom`), and bottom-row content sits ≥12px in from the sides.
   Phone tap checks: `tools/review/tap-after-drawers.mjs` (every drawer opened/closed N times, then tap-select; iOS + Android UA). Phone taps on words: scroll the word in, wait ~400ms, then tap — `locator.tap()` on an off-screen word scrolls and touches in the same ms, which the tap rule (#195) refuses as a fling-stop (#230).
4. Open 2–3 shots yourself before handing out the pack (catch broken captures).
5. Add a short inventory to the prompt when relevant (e.g. which shadcn components exist).
6. Afterwards: delete the seeded data (keep the test user).

## 3. Prompt (one agent per persona, in parallel, read-only)

Each agent gets: its persona name + `docs/PERSONAS.md`, the review sentence, the evidence dir, `axe.json`, relevant code paths, and "read-only: no edits, builds, servers or git". It must stay in character (a reader doesn't talk CSS; the engineer doesn't guess theology).

Required output — a findings list, max ~10, in this exact shape so synthesis is mechanical:

```
### F<n>: <short title>
- severity: blocker | major | minor | polish
- where: <screenshot name and/or file:line>
- problem: <what I see / what goes wrong for me>
- why it matters: <the argument, in my voice>
- proposal: <concrete change; values where possible>
- effort (engineer only, else omit): S | M | L
```
Then: **Keep** (what I'd hate to lose, bullets) and **Verdict** (one line).

## 4. Synthesis

1. Merge duplicate findings across personas; record who raised each.
2. Rank: severity × number of personas × cheap-to-fix. Blockers and a11y failures from axe go first.
3. Conflicts: name both sides with their argument, then make a recommendation (the user decides).
4. Verify anything that claims a bug before reporting it (read the code / reproduce).
5. Separate: fix now / next round / later ideas.

## 5. Deliverables

1. `docs/reviews/<YYYY-MM-DD>-<topic>.md` — findings table, conflicts + decisions, later list.
2. An artifact page: findings with each persona's key argument, conflicts, and the proposed issue batches (for reading and sharing).
3. GitHub issues grouped so one agent can do one issue without touching another's files; label `agent-ready`, `blocked` where serialized.

## 6. Cost rules

- 3–6 personas; one evidence pack; persona agents read screenshots, not the live app.
- Builder agents: screenshots only for visible UI changes; logic changes need tests only.
- Group related changes in the same files into one issue/agent rather than a queue of small ones.
- Never commit licensed scripture text (NIV/NKJV/BPH) — public repo. WEB only, or redacted fixtures.

## 7. Lessons (update after each review)

- **2026-11-13 UI review:** the account's saved reader style overrides localStorage — the script now PATCHes `/api/preferences` per shot. Selection shots must drag words on the visible page (later pages' words sit off-screen) — fixed in #63. Capture sign-in in both locales (set `lang: "da"`), or reviewers flag English as a bug.
- Product decisions that override panel advice are recorded in the review file (e.g. zoom lock stays; in-app text size instead).
- **Parallel runs (#63):** give each worker its own user (`EMAIL=delivered+<label>@resend.dev tools/review/seed.sh`) and IP bucket (`CLIENT_IP=203.0.113.x` for ui-shots): the dev test user's reading quota and localhost's auth rate limit (100/min) are shared, and a drained bucket shows up as shots landing on /signin.
- **2026-11-15 navigation review (all 8, owner's call):** one ping-pong round on the 4 conflicts (draft synthesis file → each persona "ok / objection" on decisions, final position on conflicts) converged all 8 in ~10 s per persona. Readers' conditions ("no lone icons in THIS change") are worth asking for explicitly — they turned a "later" into a build requirement. Shots hit the reading quota when run back-to-back: rerun the "no words" ones after a minute.

- **2026-11-16 nav follow-ups (6 issues, 8 personas, 3–6 each):** one question brief with the builder's proposal per choice ("ok / objection / pick") and one agent per persona answering only its issues' questions — ~15 s each, mechanical to merge into one decisions file. Proposals with a lean get sharper objections than open questions.

- **2026-11-16 compare translations (all 8: study + overlay rows' union):** check the data before the panel. Live verse counts across the 4 translations turned up the Hebrew-vs-English numbering in BPH, which became the blocker issue and the panel's main topic. Evidence gaps: `ui-shots.mjs`'s `44*` "chooser" shots are the reading-style onboarding, not the translation chooser (08c/49b are), `09-palette-empty` captures blank, and some shot in the `44`/`K11` set signs the session out. Re-sign-in (OTP) before custom shots.
- **2026-11-16 notes inline refs (6 personas):** have the engineer persona read the library sources, not just our code — Jonas found that Lexical's LinkNode blanks custom URL schemes (`bible:` → `about:blank`), which would have sunk the obvious "store it as a link" build. Probing the API across translations (same chapter, other translation) surfaced the cross-translation blocker in minutes.
- **2026-11-16 unified note refs (all 8, 1 ping-pong round):** state-flow shots (click X → screenshot) beat static screens for "it takes me there" questions. Log `data-*` state per shot (spotlight, flash, visible chips, URL) so claims are checkable. Typing into a note autosaves: a later shot of the same note shows it (U30 showed U21's "@"), so type in a throwaway note. Compare the highlighted words in the phone and desktop shots: that turned up a wash drift nobody had reported.
- **2026-11-18 logo (all 8, one vote round):** a single comparison sheet at true pixels (16px icons rendered at 16, plus a pixel-for-pixel blow-up) let every persona judge the tab icon the same way. Six of eight flagged the same 16px problem unprompted. Check numeric claims before applying them: a stem-weight estimate (0.085em) was off, and measuring Geist Mono 600 gave 0.11em.
- **2026-11-21 no toasts (6 personas, 1 ping-pong round):** a tie in round 1 (3–3 on swapping the phone bar) broke 6/6 once the engineer's facts were in the draft (the swap unmounts a focused button; the bar is inert under a note drawer). Put verified code facts next to each conflict, not just the arguments. Fake-provider fixtures only have JHN 3, GEN 1 and PSA 23 — use those for multi-chapter flows (recents) without spending API.Bible calls. The notes tours block clicks: set `tour.note` / `tour.notes` = `seen` in localStorage for custom shots.
- **2026-11-22 phone app feel (6 personas, 1 ping-pong round):** a per-surface target inventory (every visible control under 44px, from the DOM) made the walk mechanical and gave the panel numbers instead of impressions. All six caught a draft claim ("fits on one row at 200%") that the attached shot contradicted: re-shoot after every measured fix before stating it. Remember the in-app text size scales the root font: a `rem` hit-area floor doubles at 200%, so touch floors are in px.

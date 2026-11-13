# Persona review process

How we run a design review with the personas in `docs/PERSONAS.md`. Same steps every time, so results are comparable and cost stays predictable.

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

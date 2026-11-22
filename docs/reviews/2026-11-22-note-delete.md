# Panel review — note Close / Delete and Recently deleted (#261), 2026-11-22

**Review sentence:** How should a note's Close and Delete look and behave (phone first, desktop too), and where do deleted notes and marks come back from, so that a note with content can't be deleted by a mistaken tap and Close is unmistakable and always reachable?

**Why:** On 2026-11-22 at church, the owner wrote a sermon note on an iPhone for 20 minutes. One second after the last autosave, the app received a delete. The note was purged after the old 1-hour restore window, and the draft on the device was cleared on delete, so the note is gone for good. The owner: "because I once tried to close the note, I might have deleted the whole thing instead".

**Panel (UI chrome row, 6):** Sofie, Jonas, Mads, Birthe, Freja, Elias. One brief with the builder's proposal for each question (ok / objection / pick) and one round.

**Evidence (before):** phone note drawer at full height and at peek, desktop panel, Notes page (Danish, light). Measured on the phone:
- The header × was a 32 × 32 px grey icon at the top right (y ≈ 116).
- The footer's **"🗑 Slet note"** sat bottom-left (y ≈ 795). It was the only button in the bottom row with a word on it, and it sat right where the thumb rests.

## Code facts put next to the questions
- "Slet note" deleted and closed at once, with no confirm. Undo was a 20-second line in the reader's bottom row after the drawer closed.
- The phone drawer is full height. On iOS the keyboard covers its lower part and iOS pans the page to show the caret, which can push the header (with ×) above the screen.
- Delete cleared the device draft and skipped the pending save.
- The server now keeps deleted notes, highlights and margin notes for 30 days (this was decided before the review).

## Votes

| Q | Proposal | Result |
|---|---|---|
| Q1 Close | A visible word "Luk"/"Close" with the × in the header (44 px target), and **"Luk note"** in the bottom row on the right | **6/6 ok.** Not "Færdig"/"Done": 5 of 6 said that on iOS it means "drop the keyboard" |
| Q2 Delete | Out of the bottom row, into a header **⋯ Mere** menu together with "Åbn i Noter" | **6/6 ok.** Conditions: the button carries the word "Mere" (Birthe, Sofie), Delete is last and the only red item (Elias), the menu works from the keyboard and Esc closes the menu before the panel (Elias, Jonas) |
| Q3 Confirm | A note with words asks first, **inline under the header** with its name, "can be restored for 30 days under Recently deleted". **Keep** is focused and filled. An empty note deletes without asking | **6/6 ok.** Enter/Esc on the row keeps the note (Elias). "Slet note" is plain red text, never the loudest thing on screen (Mads) |
| Q4 Keyboard up | The drawer fits the visible area: header and bottom row stay on screen | **6/6 ok on the goal.** Jonas objected to resizing the drawer popup itself (its height drives the snap points and has a 450 ms height transition) and asked to fit the *content* instead. Hide the topics row and passage list while writing |
| Q5 Restore place | A **"Senest slettet" / "Recently deleted"** link at the end of the Notes list, opening a page with what each item was, when it was deleted, days left and **Gendan** | **6/6 ok** (Jonas rejected a filter on the Notes list). Make it findable when the list is empty and whenever n > 0 (Sofie, Freja) |
| Q6 Blank new note | A blank "New note" closed while still blank is discarded silently and never listed | **6/6 ok** |
| Q7 Margin-note composer | Tapping outside or swiping it away saves. Only Cancel discards | **6/6 ok** (Birthe and Elias: "strongly") |

## Findings beyond the questions (merged)

| # | Finding | Raised by | Decision |
|---|---|---|---|
| F1 | **The × on a passage row looks like Close.** In the drawer, "Joh 3,14–15 · Tilføj i noten · ×" unlinks the passage, one row under the close × | all 6 | **Fix now:** the row's × becomes the word **"Fjern"/"Remove"** (same accessible name "Remove John 3:14–15 from this note"; it already had an in-place Undo). × now only means Close |
| F2 | ⤢ "Åbn i Noter" is a mystery icon next to Close | Sofie, Mads, Birthe, Freja | **Fix now:** moved into the Mere menu (Q2) |
| F3 | "Slet note" was the loudest thing in the bottom row, and "Gemt" was pale | Mads, Freja, Birthe | **Fix now:** the bottom row has grey "✓ Gemt" on the left and "Luk note" on the right in ink. Nothing in it deletes |
| F4 | Restoring must bring back everything | Elias | **Verified:** a soft delete keeps passages, topics and inline references. Restore clears `deleted_at` only (test: "a deleted note is invisible everywhere until restored, anchors intact") |
| F5 | The Undo line goes too fast (20 s on touch) | Birthe, Sofie, Freja (Mads: styling only) | **Partly.** The line now says where the note went ("Note slettet — gemt i Senest slettet"). Keeping it until the next action is a change to the shared notice system (#257), so it goes to **next round** (3/6, no majority) |
| F6 | Two "Mere" stacked (reader bar, note header) | Sofie, Freja | The note's button reads "Mere" next to "Luk" inside the note's header, and its accessible name is "Mere til noten" / "More for this note". Recheck in the next review |
| F7 | Recently deleted reachable from the reader too (reader Mere menu, palette) | Sofie, Elias | **Later** (2/6). The reader's bundle is at its budget |

## What was built (#261)
- Header: title · **⋯ Mere** (Åbn i Noter, Slet note…) · **× Luk**, both 44 px on touch. Bottom row: ✓ Gemt … **Luk note**. Peek bar: **× Luk**.
- Delete: a note with words gets an inline confirm (focus on Behold; Esc/Enter keep it). Pending text is saved before the delete. The device draft is kept until the note can no longer be restored.
- Keyboard up (phone): the drawer's content is padded to the visual viewport (`lib/keyboard-fit.ts`, popup untouched), and the topics row and passage list step aside while writing. **Not verified on a real iPhone**: Playwright can't raise the iOS keyboard. The geometry is unit-tested.
- Recently deleted at `/notes/deleted` (inside the Notes route). The Notes list ends with "Senest slettet (n)".
- Blank new notes are discarded on close. The margin-note composer saves when it's left by any route other than Cancel/Esc.

## Lessons
- Put the measured positions and sizes of the confusable controls in the brief. All 6 personas then also spotted the *third* × (the passage row) unprompted.
- The engineer's "don't resize the base-ui popup, fit its content" was the decisive fact for Q4. Ask for library-level constraints when a fix touches a shared primitive.

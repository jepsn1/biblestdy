/**
 * Unsaved note text, kept on this device while it is unsaved. Autosave is
 * debounced and a save can fail — and an expired session sends the reader
 * to sign-in with a full page load (query.ts sessionExpired), which no
 * unmount flush survives. So while a note has unsaved changes they live in
 * localStorage too; reopening the note brings them back (and saves them).
 *
 * Kept per user (`noteDraft:<user>:<note>`): on a shared device, whoever
 * signs in next never sees them. Cleared once saved, on sign-out, and when
 * orphaned (the note is gone, or the draft is older than DRAFT_MAX_AGE_MS).
 * A deleted note's draft stays (#261): the note can be restored for
 * TRASH_DAYS, and its unsaved words with it — it ages out like any other.
 */

const PREFIX = "noteDraft:";
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Who the drafts belong to — set from the session (require-auth). No
 * user: nothing is read or written. */
let user: string | null = null;
export function setDraftUser(id: string | null) {
  user = id;
}

const keyOf = (u: string, id: string) => `${PREFIX}${u}:${id}`;

export type NoteDraft = {
  title: string;
  body: string;
  /** The note's updatedAt the draft was written on top of. */
  base: string;
  at: number;
  /** The note was deleted with this unsaved (#261): kept while it can be
   * restored — not an orphan when the note leaves the live list. */
  deleted?: boolean;
};

/** What reopening a note does with a draft:
 * - "none": nothing kept, or it says what the note already says;
 * - "restore": written on this very version — put it back, autosave sends it;
 * - "offer": the note changed since (another device) — ask, never overwrite. */
export type DraftDecision = "none" | "restore" | "offer";

export function draftDecision(
  note: { title: string; body: string; updatedAt: string },
  draft: NoteDraft | null,
): DraftDecision {
  if (!draft) return "none";
  if (draft.title === note.title && draft.body === note.body) return "none";
  return draft.base === note.updatedAt ? "restore" : "offer";
}

/** Whether the editor's buffers may be kept as the note's draft: they must
 * be that note's own (`owner` — a panel switching notes still holds the
 * previous note's text for a render) and differ from what it says. */
export function shouldKeepDraft(
  owner: string,
  note: { id: string; title: string; body: string },
  buffers: { title: string; body: string },
): boolean {
  return owner === note.id && (buffers.title !== note.title || buffers.body !== note.body);
}

function parse(raw: string | null): NoteDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<NoteDraft>;
    if (typeof d.title !== "string" || typeof d.body !== "string" || typeof d.base !== "string") return null;
    return { title: d.title, body: d.body, base: d.base, at: Number(d.at) || 0, ...(d.deleted && { deleted: true }) };
  } catch {
    return null;
  }
}

export function readDraft(id: string): NoteDraft | null {
  if (!user) return null;
  try {
    return parse(localStorage.getItem(keyOf(user, id)));
  } catch {
    return null;
  }
}

export function writeDraft(id: string, draft: Omit<NoteDraft, "at">) {
  if (!user) return;
  try {
    localStorage.setItem(keyOf(user, id), JSON.stringify({ ...draft, at: Date.now() }));
  } catch {
    // storage blocked or full: the server save is still the real copy
  }
}

/** The note is being deleted (#261): its draft, if any, is kept until the
 * restore window is over, instead of pruned as an orphan. */
export function keepDraftThroughDelete(id: string) {
  if (!user) return;
  const d = readDraft(id);
  if (!d) return;
  try {
    localStorage.setItem(keyOf(user, id), JSON.stringify({ ...d, deleted: true }));
  } catch {
    // storage blocked: nothing was kept
  }
}

export function clearDraft(id: string) {
  if (!user) return;
  try {
    localStorage.removeItem(keyOf(user, id));
  } catch {
    // storage blocked: nothing was kept
  }
}

/** Every draft key in storage (any user). */
function draftKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return [];
  }
}

/** Sign-out: the next person on this device mustn't find any. */
export function clearAllDrafts() {
  for (const key of draftKeys()) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage blocked: nothing was kept
    }
  }
}

/** Drops orphans: any draft older than DRAFT_MAX_AGE_MS (or unreadable);
 * and, given the signed-in user's full list of notes (`liveIds`), their
 * drafts of notes that no longer exist. */
export function pruneDrafts(liveIds?: ReadonlySet<string>, now = Date.now()) {
  const mine = user && `${PREFIX}${user}:`;
  for (const key of draftKeys()) {
    try {
      const d = parse(localStorage.getItem(key));
      const stale = !d || now - d.at > DRAFT_MAX_AGE_MS;
      const gone = Boolean(liveIds && mine && key.startsWith(mine) && !liveIds.has(key.slice(mine.length)) && !d?.deleted);
      if (stale || gone) localStorage.removeItem(key);
    } catch {
      // storage blocked: nothing to prune
    }
  }
}

/** Whether a note has words in it (#261): a title or text. Its references
 * alone don't count — the one made from the selection comes by itself. A
 * note without asks no confirm to delete, and one made in this visit and
 * closed without is discarded. */
export function noteHasContent(n: { title: string; body: string }): boolean {
  return n.title.trim() !== "" || n.body.trim() !== "";
}

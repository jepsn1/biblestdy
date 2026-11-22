import { and, eq, lt, notExists } from 'drizzle-orm';
import { TRASH_MS } from '@biblestdy/shared';
import { db } from '../db';
import {
  annotation,
  highlight,
  note,
  noteTag,
  passageTag,
  tag,
} from '../db/schema';

/** How long a soft-deleted row (#64) can still be restored: 30 days, listed
 * under Recently deleted (#261). It was an hour — a note deleted by mistake
 * at church was gone before anyone noticed. */
export const RESTORE_WINDOW_MS = TRASH_MS;

/** Hard-deletes rows soft-deleted before the window: deleted study is really
 * gone after TRASH_DAYS. Notes cascade to their anchors and note_tag rows; a
 * tag left on nothing is dropped too (what untag does for live notes). */
export async function purgeDeleted(now = Date.now()): Promise<void> {
  const cutoff = new Date(now - RESTORE_WINDOW_MS);
  await db.delete(highlight).where(lt(highlight.deletedAt, cutoff));
  await db.delete(annotation).where(lt(annotation.deletedAt, cutoff));
  const purgedNotes = await db
    .delete(note)
    .where(lt(note.deletedAt, cutoff))
    .returning({ id: note.id });
  if (purgedNotes.length === 0) return;
  await db
    .delete(tag)
    .where(
      and(
        notExists(db.select().from(noteTag).where(eq(noteTag.tagId, tag.id))),
        notExists(
          db.select().from(passageTag).where(eq(passageTag.tagId, tag.id)),
        ),
      ),
    );
}

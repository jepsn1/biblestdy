import {
  isReaderStyle,
  isTextSize,
  parseHighlightLabels,
  type Preferences,
  type PreferencesPatch,
} from '@biblestdy/shared';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { userPreference } from '../db/schema';

/** Persistence for per-account preferences (#45, #61, colour names, #145). */
export interface PreferencesStore {
  /** Fields are null when there is no row / never chosen. */
  get(userId: string): Promise<Preferences>;
  /** Upserts only the given fields; others keep their stored value. */
  update(userId: string, patch: PreferencesPatch): Promise<void>;
  /** The translation holding most of the user's live marks (highlights +
   * annotations + note anchors); null when they have none. */
  markedTranslationId(userId: string): Promise<string | null>;
}

export class DrizzlePreferencesStore implements PreferencesStore {
  async get(userId: string): Promise<Preferences> {
    const [row] = await db
      .select({
        readerStyle: userPreference.readerStyle,
        textSize: userPreference.textSize,
        highlightLabels: userPreference.highlightLabels,
        singleKeyShortcuts: userPreference.singleKeyShortcuts,
      })
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .limit(1);
    return {
      readerStyle: isReaderStyle(row?.readerStyle) ? row.readerStyle : null,
      textSize: isTextSize(row?.textSize) ? row.textSize : null,
      // A stored map that no longer parses (a colour retired) reads as defaults
      highlightLabels: parseHighlightLabels(row?.highlightLabels ?? {}) ?? {},
      singleKeyShortcuts: row?.singleKeyShortcuts ?? true,
    };
  }

  async update(userId: string, patch: PreferencesPatch): Promise<void> {
    const cols = { ...patch };
    await db
      .insert(userPreference)
      .values({ userId, ...cols })
      .onConflictDoUpdate({
        target: userPreference.userId,
        set: { ...cols, updatedAt: new Date() },
      });
  }

  async markedTranslationId(userId: string): Promise<string | null> {
    // Asked only by a device with no stored translation (its first load), so
    // the scans by user_id stay rare. Ties: the id, so the answer is stable.
    const { rows } = await db.execute<{ translation_id: string }>(sql`
      select translation_id from (
        select translation_id from highlight
          where user_id = ${userId} and deleted_at is null
        union all
        select translation_id from annotation
          where user_id = ${userId} and deleted_at is null
        union all
        select a.translation_id from note_anchor a
          join note n on n.id = a.note_id
          where n.user_id = ${userId} and n.deleted_at is null
      ) marks
      group by translation_id
      order by count(*) desc, translation_id
      limit 1`);
    return rows[0]?.translation_id ?? null;
  }
}

import {
  isReaderStyle,
  isTextSize,
  type Preferences,
  type PreferencesPatch,
} from '@biblestdy/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { userPreference } from '../db/schema';

/** Persistence for per-account preferences (#45, #61). */
export interface PreferencesStore {
  /** Fields are null when there is no row / never chosen. */
  get(userId: string): Promise<Preferences>;
  /** Upserts only the given fields; others keep their stored value. */
  update(userId: string, patch: PreferencesPatch): Promise<void>;
}

export class DrizzlePreferencesStore implements PreferencesStore {
  async get(userId: string): Promise<Preferences> {
    const [row] = await db
      .select({
        readerStyle: userPreference.readerStyle,
        textSize: userPreference.textSize,
      })
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .limit(1);
    return {
      readerStyle: isReaderStyle(row?.readerStyle) ? row.readerStyle : null,
      textSize: isTextSize(row?.textSize) ? row.textSize : null,
    };
  }

  async update(userId: string, patch: PreferencesPatch): Promise<void> {
    await db
      .insert(userPreference)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: userPreference.userId,
        set: { ...patch, updatedAt: new Date() },
      });
  }
}

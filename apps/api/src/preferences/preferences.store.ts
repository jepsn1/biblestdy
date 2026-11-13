import { isReaderStyle, type ReaderStyle } from '@biblestdy/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { userPreference } from '../db/schema';

/** Persistence for per-account preferences (#45). */
export interface PreferencesStore {
  /** null = no row / never chosen. */
  readerStyle(userId: string): Promise<ReaderStyle | null>;
  setReaderStyle(userId: string, style: ReaderStyle): Promise<void>;
}

export class DrizzlePreferencesStore implements PreferencesStore {
  async readerStyle(userId: string): Promise<ReaderStyle | null> {
    const [row] = await db
      .select({ readerStyle: userPreference.readerStyle })
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .limit(1);
    return isReaderStyle(row?.readerStyle) ? row.readerStyle : null;
  }

  async setReaderStyle(userId: string, style: ReaderStyle): Promise<void> {
    await db
      .insert(userPreference)
      .values({ userId, readerStyle: style })
      .onConflictDoUpdate({
        target: userPreference.userId,
        set: { readerStyle: style, updatedAt: new Date() },
      });
  }
}

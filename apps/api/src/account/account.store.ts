import { eq } from 'drizzle-orm';
import { db } from '../db';
import { session, user } from '../db/auth-schema';
import { annotation, highlight } from '../db/schema';

/**
 * Persistence primitives for account deletion (issue #17). The cascade order
 * and tag-orphan rules live in AccountService — behavior-tested against the
 * in-memory stores; notes and tags are wiped through their own stores.
 */
export interface AccountStore {
  userExists(userId: string): Promise<boolean>;
  deleteHighlights(userId: string): Promise<void>;
  deleteAnnotations(userId: string): Promise<void>;
  /** Revokes every Better Auth session of the user. */
  deleteSessions(userId: string): Promise<void>;
  /** Deletes the user row itself (linked auth rows go with it). */
  deleteUser(userId: string): Promise<void>;
}

export class DrizzleAccountStore implements AccountStore {
  async userExists(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return Boolean(row);
  }

  async deleteHighlights(userId: string): Promise<void> {
    await db.delete(highlight).where(eq(highlight.userId, userId));
  }

  async deleteAnnotations(userId: string): Promise<void> {
    await db.delete(annotation).where(eq(annotation.userId, userId));
  }

  async deleteSessions(userId: string): Promise<void> {
    await db.delete(session).where(eq(session.userId, userId));
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(user).where(eq(user.id, userId));
  }
}

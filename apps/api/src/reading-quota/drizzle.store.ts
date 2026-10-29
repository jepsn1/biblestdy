import { and, count, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { readingQuota, readingQuotaDay } from '../db/schema';
import type { QuotaState } from './policy';
import type { ChapterRef, QuotaStore, QuotaTx } from './store';

/**
 * Postgres quota store: one transaction per decision. Missing subject rows are
 * inserted first (ON CONFLICT DO NOTHING) so there is always a row to lock,
 * then all rows are locked FOR UPDATE in subject order (no lock-order
 * deadlocks). Concurrent requests on a subject queue on that row lock.
 */
export class DrizzleQuotaStore implements QuotaStore {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  transact<T>(subjects: string[], fn: (tx: QuotaTx) => Promise<T>): Promise<T> {
    const keys = [...new Set(subjects)].sort();
    return this.db.transaction(async (tx) => {
      await tx
        .insert(readingQuota)
        .values(keys.map((subject) => ({ subject })))
        .onConflictDoNothing();
      const rows = await tx
        .select()
        .from(readingQuota)
        .where(inArray(readingQuota.subject, keys))
        .orderBy(readingQuota.subject)
        .for('update');
      const states = new Map<string, QuotaState | null>(
        rows.map((r) => [
          r.subject,
          r.tokens === null || r.refilledAt === null
            ? null
            : { tokens: r.tokens, refilledAt: r.refilledAt },
        ]),
      );
      const assertLocked = (subject: string) => {
        if (!states.has(subject))
          throw new Error(`quota subject ${subject} not locked`);
      };
      return fn({
        load: (subject) => {
          assertLocked(subject);
          return Promise.resolve(states.get(subject) ?? null);
        },
        save: async (subject, state) => {
          assertLocked(subject);
          states.set(subject, state);
          await tx
            .update(readingQuota)
            .set({
              tokens: state.tokens,
              refilledAt: state.refilledAt,
              updatedAt: sql`now()`,
            })
            .where(inArray(readingQuota.subject, [subject]));
        },
        dayReads: async (subject, day, chapter) => {
          assertLocked(subject);
          const [row] = await tx
            .select({
              count: count(),
              includes: sql<boolean>`coalesce(bool_or(${isChapter(chapter)}), false)`,
            })
            .from(readingQuotaDay)
            .where(
              and(
                eq(readingQuotaDay.subject, subject),
                eq(readingQuotaDay.day, day),
              ),
            );
          return { count: row.count, includes: row.includes };
        },
        recordRead: async (subject, day, chapter) => {
          assertLocked(subject);
          await tx
            .insert(readingQuotaDay)
            .values({ subject, day, ...chapter })
            .onConflictDoNothing();
        },
      });
    });
  }

  async prune(keepFromDay: string): Promise<void> {
    await this.db
      .delete(readingQuotaDay)
      .where(lt(readingQuotaDay.day, keepFromDay));
    // Lock placeholders that never got state (e.g. a subject whose request
    // another subject denied). Rows with state are kept: they may carry
    // strikes/cooldowns (#32) that must outlive a quiet spell.
    await this.db
      .delete(readingQuota)
      .where(
        and(
          isNull(readingQuota.tokens),
          lt(readingQuota.updatedAt, sql`${keepFromDay}::date`),
        ),
      );
  }
}

const isChapter = (c: ChapterRef) =>
  and(
    eq(readingQuotaDay.translationId, c.translationId),
    eq(readingQuotaDay.book, c.book),
    eq(readingQuotaDay.chapter, c.chapter),
  );

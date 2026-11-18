import { and, eq, gte, lt, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { scriptureCache, scriptureUpstreamCall } from '../db/schema';

/** One cached provider response (#248). */
export interface CacheEntry {
  kind: 'chapter' | 'translations';
  /** null for the translations list. */
  translationId: string | null;
  /** The Chapter / Translation[] without its FUMS token. */
  payload: unknown;
  fumsToken: string | null;
  /** Epoch ms the provider returned it. */
  fetchedAt: number;
}

/** Upstream calls so far: this UTC day and this UTC calendar month. */
export interface CallCounts {
  today: number;
  month: number;
}

/**
 * The persistent layer under the in-memory cache: shared by every API process
 * on one database, so a restart, a deploy or another dev server never starts
 * cold. Keys carry the provider source ('apibible' | 'fake').
 */
export interface ScriptureCacheStore {
  get(key: string): Promise<CacheEntry | null>;
  put(key: string, source: string, entry: CacheEntry): Promise<void>;
  /** Delete one translation's chapters (none given: every chapter) of
   * `source`, and the translations list either way. Returns chapters
   * deleted. */
  purge(source: string, translationId?: string): Promise<number>;
  /** Count one upstream call on `day` (YYYY-MM-DD, UTC). */
  countCall(source: string, day: string): Promise<CallCounts>;
  calls(source: string, day: string): Promise<CallCounts>;
}

const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

/** Tests and a database-less fallback. */
export class InMemoryCacheStore implements ScriptureCacheStore {
  readonly rows = new Map<string, CacheEntry & { source: string }>();
  readonly days = new Map<string, number>();

  get(key: string): Promise<CacheEntry | null> {
    const row = this.rows.get(key);
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      kind: row.kind,
      translationId: row.translationId,
      payload: row.payload,
      fumsToken: row.fumsToken,
      fetchedAt: row.fetchedAt,
    });
  }

  put(key: string, source: string, entry: CacheEntry): Promise<void> {
    this.rows.set(key, { ...entry, source });
    return Promise.resolve();
  }

  purge(source: string, translationId?: string): Promise<number> {
    let dropped = 0;
    for (const [key, row] of [...this.rows]) {
      if (row.source !== source) continue;
      if (row.kind === 'translations') this.rows.delete(key);
      else if (
        translationId === undefined ||
        row.translationId === translationId
      ) {
        this.rows.delete(key);
        dropped++;
      }
    }
    return Promise.resolve(dropped);
  }

  countCall(source: string, day: string): Promise<CallCounts> {
    const k = `${source}|${day}`;
    this.days.set(k, (this.days.get(k) ?? 0) + 1);
    return this.calls(source, day);
  }

  calls(source: string, day: string): Promise<CallCounts> {
    let month = 0;
    for (const [k, n] of this.days) {
      const [s, d] = k.split('|');
      if (s === source && d.slice(0, 7) === day.slice(0, 7) && d <= day)
        month += n;
    }
    return Promise.resolve({
      today: this.days.get(`${source}|${day}`) ?? 0,
      month,
    });
  }
}

/** Postgres: tables from migrations/2026-11-18-scripture-cache.sql. */
export class DrizzleCacheStore implements ScriptureCacheStore {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async get(key: string): Promise<CacheEntry | null> {
    const [row] = await this.db
      .select()
      .from(scriptureCache)
      .where(eq(scriptureCache.key, key));
    if (!row) return null;
    return {
      kind: row.kind,
      translationId: row.translationId,
      payload: row.payload,
      fumsToken: row.fumsToken,
      fetchedAt: row.fetchedAt.getTime(),
    };
  }

  async put(key: string, source: string, entry: CacheEntry): Promise<void> {
    const values = {
      source,
      kind: entry.kind,
      translationId: entry.translationId,
      payload: entry.payload,
      fumsToken: entry.fumsToken,
      fetchedAt: new Date(entry.fetchedAt),
    };
    await this.db
      .insert(scriptureCache)
      .values({ key, ...values })
      .onConflictDoUpdate({ target: scriptureCache.key, set: values });
  }

  async purge(source: string, translationId?: string): Promise<number> {
    const chapters = and(
      eq(scriptureCache.source, source),
      eq(scriptureCache.kind, 'chapter'),
      translationId === undefined
        ? undefined
        : eq(scriptureCache.translationId, translationId),
    );
    const deleted = await this.db
      .delete(scriptureCache)
      .where(
        or(
          chapters,
          and(
            eq(scriptureCache.source, source),
            eq(scriptureCache.kind, 'translations'),
          ),
        ),
      )
      .returning({ kind: scriptureCache.kind });
    return deleted.filter((r) => r.kind === 'chapter').length;
  }

  async countCall(source: string, day: string): Promise<CallCounts> {
    await this.db
      .insert(scriptureUpstreamCall)
      .values({ day, source, calls: 1 })
      .onConflictDoUpdate({
        target: [scriptureUpstreamCall.day, scriptureUpstreamCall.source],
        set: { calls: sql`${scriptureUpstreamCall.calls} + 1` },
      });
    return this.calls(source, day);
  }

  async calls(source: string, day: string): Promise<CallCounts> {
    const [row] = await this.db
      .select({
        today: sql<number>`coalesce(sum(${scriptureUpstreamCall.calls}) filter (where ${scriptureUpstreamCall.day} = ${day}), 0)::int`,
        month: sql<number>`coalesce(sum(${scriptureUpstreamCall.calls}), 0)::int`,
      })
      .from(scriptureUpstreamCall)
      .where(
        and(
          eq(scriptureUpstreamCall.source, source),
          gte(scriptureUpstreamCall.day, monthStart(day)),
          lt(scriptureUpstreamCall.day, sql`(${day}::date + 1)`),
        ),
      );
    return { today: row?.today ?? 0, month: row?.month ?? 0 };
  }
}

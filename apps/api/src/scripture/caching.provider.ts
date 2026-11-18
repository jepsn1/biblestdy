import type { Chapter, Translation } from '@biblestdy/shared';
import {
  InMemoryCacheStore,
  type CacheEntry,
  type CallCounts,
  type ScriptureCacheStore,
} from './cache-store';
import type { ChapterOptions, ScriptureProvider } from './provider';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/**
 * Hard ceiling on how old served text may be. API.Bible ToS §11: cached
 * content must be checked at least every 30 days and shown no more than 30
 * days out of date — 25 days leaves margin. Past it an entry is never served.
 */
export const MAX_AGE_MS = 25 * DAY_MS;
/** Default refresh age — the API.Bible developer FAQ (part of the ToS, §15)
 * recommends clearing cached content every 14 days or less. An entry older
 * than this is still served (never past MAX_AGE_MS) while one refetch runs
 * behind it. Upstream calls then scale with chapters read, not readers:
 * at most one per chapter read per 14 days. */
export const DEFAULT_TTL_MS = 14 * DAY_MS;
/** Memory entries are re-read from the shared store at least this often, so
 * a purge on one process reaches the others within the hour. */
const MEMORY_TTL_MS = 60 * MINUTE_MS;
const MAX_MEMORY_ENTRIES = 500;
/** After a failed background refresh, keep serving the stale entry this long
 * before trying again (an API.Bible outage must not mean a call per read). */
const REFRESH_BACKOFF_MS = 10 * MINUTE_MS;
/** Call counts are re-read from the store this often (other processes). */
const COUNTS_TTL_MS = MINUTE_MS;

/** Over the soft budget, a low-priority (prefetch) miss is not fetched. */
export class UpstreamDeferredError extends Error {
  constructor(key: string) {
    super(`Upstream deferred for ${key}: over the soft call budget`);
    this.name = 'UpstreamDeferredError';
  }
}

export interface SoftBudget {
  /** Upstream calls per UTC day after which prefetches stay cache-only. */
  daily: number;
  /** Same per UTC calendar month. */
  monthly: number;
}

export interface CachingOptions {
  /** Provider name the keys carry: 'apibible' | 'fake'. */
  source?: string;
  /** Persistent layer (Postgres in the app); default in memory. */
  store?: ScriptureCacheStore;
  /** Refresh age; clamped to MAX_AGE_MS. */
  ttlMs?: number;
  budget?: SoftBudget;
  now?: () => number;
  logger?: { log(msg: string): void; warn(msg: string): void };
}

export interface CacheStats extends CallCounts {
  source: string;
  day: string;
  softCap: SoftBudget | null;
  overSoftCap: boolean;
  ttlDays: number;
  maxAgeDays: number;
}

type EntryMeta = Pick<CacheEntry, 'kind' | 'translationId'>;

/**
 * Scripture cache (#248): memory → shared store (Postgres) → provider.
 * - An entry younger than the TTL is served as is; between the TTL and the
 *   25-day ceiling it is served while one refetch runs behind it; past the
 *   ceiling it is never served.
 * - Concurrent misses of one key make one upstream call (single flight).
 * - Every upstream call is counted per UTC day; over the soft budget,
 *   low-priority reads (the reader's read-ahead) never go upstream — real
 *   visits always do.
 * - A chapter keeps its FUMS token, so a view served from here still reports
 *   to API.Bible exactly as a fresh one.
 * - `purge` drops one translation (or all) from memory AND the store (ToS
 *   §10.3 removals within 72 h, §13.2 changes within 24 h of a request).
 */
export class CachingScriptureProvider implements ScriptureProvider {
  private readonly memory = new Map<
    string,
    { value: unknown; expires: number }
  >();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly refreshFailedAt = new Map<string, number>();
  private counts: { value: CallCounts; day: string; at: number } | null = null;
  readonly source: string;
  private readonly store: ScriptureCacheStore;
  private readonly ttlMs: number;
  private readonly budget: SoftBudget | null;
  private readonly now: () => number;
  private readonly logger: NonNullable<CachingOptions['logger']>;

  constructor(
    private readonly inner: ScriptureProvider,
    opts: CachingOptions = {},
  ) {
    this.source = opts.source ?? 'apibible';
    this.store = opts.store ?? new InMemoryCacheStore();
    this.ttlMs = Math.min(opts.ttlMs ?? DEFAULT_TTL_MS, MAX_AGE_MS);
    this.budget = opts.budget ?? null;
    this.now = opts.now ?? Date.now;
    this.logger = opts.logger ?? { log: () => {}, warn: () => {} };
  }

  listTranslations(): Promise<Translation[]> {
    return this.read<Translation[]>(
      `${this.source}:translations`,
      { kind: 'translations', translationId: null },
      () => this.inner.listTranslations(),
      false,
    );
  }

  getChapter(
    translationId: string,
    book: string,
    chapter: number,
    opts: ChapterOptions = {},
  ): Promise<Chapter> {
    return this.read<Chapter>(
      this.chapterKey(translationId, book, chapter),
      { kind: 'chapter', translationId },
      () => this.inner.getChapter(translationId, book, chapter),
      opts.lowPriority === true,
    );
  }

  /** True when a low-priority read of this chapter would be deferred: over
   * the soft budget and nothing servable cached. Never calls upstream. */
  async wouldDefer(
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<boolean> {
    if (!(await this.overSoftCap())) return false;
    const key = this.chapterKey(translationId, book, chapter);
    if (this.fromMemory(key) !== undefined) return false;
    const row = await this.fromStore(key);
    return !row || this.now() - row.fetchedAt >= MAX_AGE_MS;
  }

  /** Drop cached chapters of one translation (no id: all), in memory and
   * the store; the translations list goes either way (it carries copyright
   * lines). Returns how many chapters were dropped. */
  async purge(translationId?: string): Promise<number> {
    let dropped = 0;
    const prefix =
      translationId === undefined
        ? `${this.source}:chapter:`
        : `${this.source}:chapter:${translationId}/`;
    for (const key of [...this.memory.keys()]) {
      if (key.startsWith(prefix)) {
        this.memory.delete(key);
        dropped++;
      }
    }
    this.memory.delete(`${this.source}:translations`);
    // A purge that cannot reach the store fails loudly (the operator
    // retries): stale rows would come back on the next memory miss
    const stored = await this.store.purge(this.source, translationId);
    return Math.max(dropped, stored);
  }

  /** Upstream calls today / this month and the soft budget (admin). */
  async stats(): Promise<CacheStats> {
    const counts = await this.callCounts(true);
    return {
      source: this.source,
      day: this.day(),
      ...counts,
      softCap: this.budget,
      overSoftCap: this.isOver(counts),
      ttlDays: this.ttlMs / DAY_MS,
      maxAgeDays: MAX_AGE_MS / DAY_MS,
    };
  }

  private chapterKey(translationId: string, book: string, chapter: number) {
    return `${this.source}:chapter:${translationId}/${book}.${chapter}`;
  }

  private async read<T>(
    key: string,
    meta: EntryMeta,
    fetch: () => Promise<T>,
    lowPriority: boolean,
  ): Promise<T> {
    const mem = this.fromMemory(key);
    if (mem !== undefined) return mem as T;

    const row = await this.fromStore(key);
    if (row) {
      const age = this.now() - row.fetchedAt;
      const value = hydrate(row) as T;
      if (age < this.ttlMs) {
        this.remember(key, value, row.fetchedAt);
        return value;
      }
      if (age < MAX_AGE_MS) {
        // Stale but within the ToS window: serve it, refresh behind it
        if (!(lowPriority && (await this.overSoftCap()))) {
          this.refreshInBackground(key, meta, fetch);
        }
        return value;
      }
    }
    if (lowPriority && (await this.overSoftCap())) {
      throw new UpstreamDeferredError(key);
    }
    return this.upstream(key, meta, fetch);
  }

  /** One upstream call per key at a time; the result goes to memory and
   * the store. */
  private upstream<T>(
    key: string,
    meta: EntryMeta,
    fetch: () => Promise<T>,
  ): Promise<T> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const call = (async () => {
      await this.countCall(key);
      const value = await fetch();
      const fetchedAt = this.now();
      this.remember(key, value, fetchedAt);
      this.refreshFailedAt.delete(key);
      await this.persist(key, meta, value, fetchedAt);
      return value;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, call);
    return call;
  }

  private async persist(
    key: string,
    meta: EntryMeta,
    value: unknown,
    fetchedAt: number,
  ) {
    let payload = value;
    let fumsToken: string | null = null;
    if (meta.kind === 'chapter') {
      const { fumsToken: token, ...rest } = value as Chapter;
      payload = rest;
      fumsToken = token ?? null;
    }
    try {
      await this.store.put(key, this.source, {
        ...meta,
        payload,
        fumsToken,
        fetchedAt,
      });
    } catch (err) {
      this.logger.warn(`cache store write failed (${key}): ${String(err)}`);
    }
  }

  private refreshInBackground<T>(
    key: string,
    meta: EntryMeta,
    fetch: () => Promise<T>,
  ) {
    if (this.inflight.has(key)) return;
    const failed = this.refreshFailedAt.get(key);
    if (failed !== undefined && this.now() - failed < REFRESH_BACKOFF_MS) {
      return;
    }
    this.upstream(key, meta, fetch).catch((err: unknown) => {
      this.refreshFailedAt.set(key, this.now());
      this.logger.warn(`refresh failed (${key}): ${String(err)}`);
    });
  }

  private fromMemory(key: string): unknown {
    const hit = this.memory.get(key);
    if (!hit) return undefined;
    if (hit.expires > this.now()) return hit.value;
    this.memory.delete(key);
    return undefined;
  }

  private remember(key: string, value: unknown, fetchedAt: number) {
    this.memory.delete(key); // re-insert = newest
    if (this.memory.size >= MAX_MEMORY_ENTRIES) {
      // Drop the oldest entry; the store still has it
      const [oldest] = this.memory.keys();
      if (oldest !== undefined) this.memory.delete(oldest);
    }
    this.memory.set(key, {
      value,
      expires: Math.min(fetchedAt + this.ttlMs, this.now() + MEMORY_TTL_MS),
    });
  }

  private async fromStore(key: string): Promise<CacheEntry | null> {
    try {
      return await this.store.get(key);
    } catch (err) {
      // Reading must not fail with the store: fall through to upstream
      this.logger.warn(`cache store read failed (${key}): ${String(err)}`);
      return null;
    }
  }

  private day(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private async countCall(key: string) {
    const day = this.day();
    try {
      const value = await this.store.countCall(this.source, day);
      this.counts = { value, day, at: this.now() };
      this.logger.log(
        `upstream call ${key} (${this.source}: ${value.today} today, ${value.month} this month)`,
      );
    } catch (err) {
      this.logger.warn(`upstream call ${key} (not counted: ${String(err)})`);
    }
  }

  private async callCounts(fresh = false): Promise<CallCounts> {
    const day = this.day();
    const c = this.counts;
    if (!fresh && c && c.day === day && this.now() - c.at < COUNTS_TTL_MS) {
      return c.value;
    }
    try {
      const value = await this.store.calls(this.source, day);
      this.counts = { value, day, at: this.now() };
      return value;
    } catch {
      return c && c.day === day ? c.value : { today: 0, month: 0 };
    }
  }

  private isOver(counts: CallCounts): boolean {
    return (
      this.budget !== null &&
      (counts.today >= this.budget.daily || counts.month >= this.budget.monthly)
    );
  }

  private async overSoftCap(): Promise<boolean> {
    if (!this.budget) return false;
    return this.isOver(await this.callCounts());
  }
}

/** A stored entry back as the provider returned it (token re-attached). */
function hydrate(row: CacheEntry): unknown {
  if (row.kind !== 'chapter' || !row.fumsToken) return row.payload;
  return { ...(row.payload as object), fumsToken: row.fumsToken };
}

/** Defaults: ~5,000 calls/month on the shared Starter key (prod + dev). */
export const DEFAULT_SOFT_BUDGET: SoftBudget = { daily: 150, monthly: 4000 };

/** Cache settings from the environment: SCRIPTURE_CACHE_TTL_DAYS (refresh
 * age, ≤ 25), API_BIBLE_DAILY_SOFT_CAP, API_BIBLE_MONTHLY_SOFT_CAP. */
export function cacheEnv(
  env: Record<string, string | undefined>,
): Pick<CachingOptions, 'ttlMs' | 'budget'> {
  const num = (name: string): number | undefined => {
    const n = Number(env[name]);
    return env[name] !== undefined && env[name] !== '' && Number.isFinite(n)
      ? n
      : undefined;
  };
  const days = num('SCRIPTURE_CACHE_TTL_DAYS');
  return {
    ttlMs: days !== undefined && days > 0 ? days * DAY_MS : undefined,
    budget: {
      daily: num('API_BIBLE_DAILY_SOFT_CAP') ?? DEFAULT_SOFT_BUDGET.daily,
      monthly: num('API_BIBLE_MONTHLY_SOFT_CAP') ?? DEFAULT_SOFT_BUDGET.monthly,
    },
  };
}

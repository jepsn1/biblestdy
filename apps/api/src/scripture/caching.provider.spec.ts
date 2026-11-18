import type { Chapter } from '@biblestdy/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryCacheStore, type ScriptureCacheStore } from './cache-store';
import {
  cacheEnv,
  CachingScriptureProvider,
  DEFAULT_SOFT_BUDGET,
  DEFAULT_TTL_MS,
  MAX_AGE_MS,
  UpstreamDeferredError,
  type CachingOptions,
} from './caching.provider';
import type { ScriptureProvider } from './provider';

const DAY = 24 * 60 * 60 * 1000;
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Upstream stand-in: counts calls; `gate` holds replies until released. */
function upstream() {
  let calls = 0;
  let version = 0;
  let gate: Promise<void> | null = null;
  let fail = false;
  const provider: ScriptureProvider = {
    listTranslations: () => {
      calls++;
      return Promise.resolve([
        { id: 'NIV', name: 'NIV', abbreviation: 'NIV', language: 'en' },
      ]);
    },
    getChapter: async (translationId, book, chapter) => {
      calls++;
      if (gate) await gate;
      if (fail) throw new Error('API.Bible down');
      return {
        translationId,
        book,
        chapter,
        verses: [{ verse: 1, text: `v${version}` }],
        fumsToken: `tok-${calls}`,
      };
    },
  };
  return {
    provider,
    calls: () => calls,
    bump: () => version++,
    failing: (v: boolean) => (fail = v),
    hold: () => {
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
  };
}

function setup(opts: CachingOptions = {}) {
  const up = upstream();
  const store = (opts.store as InMemoryCacheStore) ?? new InMemoryCacheStore();
  let now = Date.UTC(2026, 10, 18, 12);
  const clock = {
    now: () => now,
    advance: (ms: number) => (now += ms),
  };
  const make = (extra: CachingOptions = {}) =>
    new CachingScriptureProvider(up.provider, {
      store,
      now: clock.now,
      ...opts,
      ...extra,
    });
  return { up, store, clock, make, cache: make() };
}

const text = (c: Chapter) => c.verses[0].text;

describe('CachingScriptureProvider layers (#248)', () => {
  it('serves repeats from memory and survives a restart via the store', async () => {
    const { up, cache, make } = setup();
    await cache.getChapter('NIV', 'JHN', 3);
    await cache.getChapter('NIV', 'JHN', 3);
    expect(up.calls()).toBe(1);
    // A new process (restart, deploy, another dev server) on the same DB
    const restarted = make();
    await restarted.getChapter('NIV', 'JHN', 3);
    expect(up.calls()).toBe(1);
    await restarted.getChapter('NIV', 'JHN', 4);
    expect(up.calls()).toBe(2);
  });

  it('caches the translations list too, per source', async () => {
    const { up, cache, make } = setup();
    await cache.listTranslations();
    await make().listTranslations();
    expect(up.calls()).toBe(1);
    // Fixtures never answer for (or overwrite) real entries
    await make({ source: 'fake' }).listTranslations();
    expect(up.calls()).toBe(2);
  });

  it('keeps the FUMS token through the store, stored in its own column', async () => {
    const { cache, make, store } = setup();
    const first = await cache.getChapter('NIV', 'JHN', 3);
    expect(first.fumsToken).toBe('tok-1');
    const row = await store.get('apibible:chapter:NIV/JHN.3');
    expect(row?.fumsToken).toBe('tok-1');
    expect(row?.payload).not.toHaveProperty('fumsToken');
    expect((await make().getChapter('NIV', 'JHN', 3)).fumsToken).toBe('tok-1');
  });

  it('defaults to a 14-day refresh age, clamped to the 25-day ceiling', async () => {
    expect(DEFAULT_TTL_MS).toBe(14 * DAY);
    const { up, make } = setup();
    const cache = make({ ttlMs: 365 * DAY });
    await cache.getChapter('NIV', 'JHN', 3);
    const restarted = make({ ttlMs: 365 * DAY });
    expect((await restarted.stats()).ttlDays).toBe(25);
    expect(up.calls()).toBe(1);
  });

  it('serves a fresh entry without a call', async () => {
    const { up, cache, clock, make } = setup();
    await cache.getChapter('NIV', 'JHN', 3);
    clock.advance(DEFAULT_TTL_MS - 1);
    await make().getChapter('NIV', 'JHN', 3);
    await flush();
    expect(up.calls()).toBe(1);
  });

  it('past the TTL serves the stale entry and refreshes it once behind it', async () => {
    const { up, cache, clock, make } = setup();
    await cache.getChapter('NIV', 'JHN', 3);
    up.bump();
    clock.advance(DEFAULT_TTL_MS + DAY);
    const other = make();
    const stale = await other.getChapter('NIV', 'JHN', 3);
    expect(text(stale)).toBe('v0');
    await other.getChapter('NIV', 'JHN', 3); // refresh already running
    await flush();
    expect(up.calls()).toBe(2);
    expect(text(await other.getChapter('NIV', 'JHN', 3))).toBe('v1');
    expect(text(await make().getChapter('NIV', 'JHN', 3))).toBe('v1');
    expect(up.calls()).toBe(2);
  });

  it('never serves text older than the 25-day ceiling (ToS §11: 30 days)', async () => {
    const { up, cache, clock, make } = setup();
    await cache.getChapter('NIV', 'JHN', 3);
    up.bump();
    clock.advance(MAX_AGE_MS);
    expect(text(await make().getChapter('NIV', 'JHN', 3))).toBe('v1');
    expect(up.calls()).toBe(2);
  });

  it('memory re-reads the store within the hour (a purge elsewhere lands)', async () => {
    const { up, cache, clock, store } = setup();
    await cache.getChapter('NIV', 'JHN', 3);
    await store.purge('apibible', 'NIV'); // another process purged
    clock.advance(60 * 60 * 1000);
    await cache.getChapter('NIV', 'JHN', 3);
    expect(up.calls()).toBe(2);
  });

  it('a failed refresh keeps the stale entry and backs off', async () => {
    const { up, cache, clock, make } = setup();
    await cache.getChapter('NIV', 'JHN', 3);
    clock.advance(DEFAULT_TTL_MS + DAY);
    up.failing(true);
    const other = make();
    expect(text(await other.getChapter('NIV', 'JHN', 3))).toBe('v0');
    await flush();
    await other.getChapter('NIV', 'JHN', 3);
    await flush();
    expect(up.calls()).toBe(2); // not a call per read during an outage
  });

  it('reads through when the store fails', async () => {
    const broken: ScriptureCacheStore = {
      get: () => Promise.reject(new Error('db down')),
      put: () => Promise.reject(new Error('db down')),
      purge: () => Promise.reject(new Error('db down')),
      countCall: () => Promise.reject(new Error('db down')),
      calls: () => Promise.reject(new Error('db down')),
    };
    const up = upstream();
    const cache = new CachingScriptureProvider(up.provider, { store: broken });
    expect(text(await cache.getChapter('NIV', 'JHN', 3))).toBe('v0');
    await cache.getChapter('NIV', 'JHN', 3); // memory still works
    expect(up.calls()).toBe(1);
    await expect(cache.purge()).rejects.toThrow('db down');
  });
});

describe('single flight', () => {
  it('concurrent misses of one key make one upstream call', async () => {
    const { up, cache } = setup();
    const release = up.hold();
    const reads = Promise.all([
      cache.getChapter('NIV', 'JHN', 3),
      cache.getChapter('NIV', 'JHN', 3),
      cache.getChapter('NIV', 'JHN', 3),
    ]);
    await flush();
    release();
    const [a, b, c] = await reads;
    expect(up.calls()).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('a failure is not cached: the next read tries again', async () => {
    const { up, cache } = setup();
    up.failing(true);
    await expect(cache.getChapter('NIV', 'JHN', 3)).rejects.toThrow();
    up.failing(false);
    await cache.getChapter('NIV', 'JHN', 3);
    expect(up.calls()).toBe(2);
  });
});

describe('purge (ToS §10.3 / §13.2)', () => {
  it('drops one translation from memory and the store, the others stay', async () => {
    const { up, cache, make } = setup();
    await cache.getChapter('NIV', 'JHN', 3);
    await cache.getChapter('NIV', 'JHN', 4);
    await cache.getChapter('WEB', 'JHN', 3);
    await cache.listTranslations();
    expect(await cache.purge('NIV')).toBe(2);
    const restarted = make();
    await restarted.getChapter('WEB', 'JHN', 3);
    expect(up.calls()).toBe(4);
    await restarted.getChapter('NIV', 'JHN', 3);
    await restarted.listTranslations(); // the list (copyright lines) goes too
    expect(up.calls()).toBe(6);
    expect(await cache.purge()).toBe(2);
    await make().getChapter('WEB', 'JHN', 3);
    expect(up.calls()).toBe(7);
  });

  it('leaves the other source alone', async () => {
    const { up, make } = setup();
    const fake = make({ source: 'fake' });
    await fake.getChapter('WEB', 'JHN', 3);
    expect(await make().purge()).toBe(0);
    await make({ source: 'fake' }).getChapter('WEB', 'JHN', 3);
    expect(up.calls()).toBe(1);
  });
});

describe('call accounting + soft budget', () => {
  it('counts every upstream call per UTC day and month', async () => {
    const { cache, clock, make } = setup();
    await cache.getChapter('NIV', 'JHN', 3);
    await cache.getChapter('NIV', 'JHN', 3); // cached: not counted
    await cache.listTranslations();
    expect(await cache.stats()).toMatchObject({
      today: 2,
      month: 2,
      day: '2026-11-18',
    });
    clock.advance(DAY);
    await make().getChapter('NIV', 'JHN', 5);
    expect(await make().stats()).toMatchObject({ today: 1, month: 3 });
    clock.advance(14 * DAY); // December
    expect(await make().stats()).toMatchObject({ today: 0, month: 0 });
  });

  it('over the daily cap, read-ahead never goes upstream; real visits do', async () => {
    const { up, make } = setup();
    const cache = make({ budget: { daily: 2, monthly: 100 } });
    await cache.getChapter('NIV', 'JHN', 1);
    await cache.getChapter('NIV', 'JHN', 2);
    expect((await cache.stats()).overSoftCap).toBe(true);
    await expect(
      cache.getChapter('NIV', 'JHN', 3, { lowPriority: true }),
    ).rejects.toThrow(UpstreamDeferredError);
    expect(await cache.wouldDefer('NIV', 'JHN', 3)).toBe(true);
    // Cached text is still served to read-ahead
    expect(await cache.wouldDefer('NIV', 'JHN', 1)).toBe(false);
    await cache.getChapter('NIV', 'JHN', 1, { lowPriority: true });
    expect(up.calls()).toBe(2);
    // A real visit always fetches
    await cache.getChapter('NIV', 'JHN', 3);
    expect(up.calls()).toBe(3);
  });

  it('over the monthly cap, read-ahead gets stale text without a refresh', async () => {
    const { up, clock, make } = setup();
    const budget = { daily: 100, monthly: 0 }; // 0 = always over
    await make({ budget }).getChapter('NIV', 'JHN', 1);
    clock.advance(DEFAULT_TTL_MS + DAY);
    const cache = make({ budget });
    await cache.getChapter('NIV', 'JHN', 1, { lowPriority: true });
    await flush();
    expect(up.calls()).toBe(1);
    await cache.getChapter('NIV', 'JHN', 1); // a real visit refreshes
    await flush();
    expect(up.calls()).toBe(2);
  });

  it('without a budget, read-ahead fetches like any read', async () => {
    const { up, cache } = setup();
    await cache.getChapter('NIV', 'JHN', 3, { lowPriority: true });
    expect(up.calls()).toBe(1);
    expect(await cache.wouldDefer('NIV', 'JHN', 4)).toBe(false);
  });

  it('reads TTL and caps from the environment', () => {
    expect(cacheEnv({})).toEqual({
      ttlMs: undefined,
      budget: DEFAULT_SOFT_BUDGET,
    });
    expect(
      cacheEnv({
        SCRIPTURE_CACHE_TTL_DAYS: '7',
        API_BIBLE_DAILY_SOFT_CAP: '50',
        API_BIBLE_MONTHLY_SOFT_CAP: '0',
      }),
    ).toEqual({ ttlMs: 7 * DAY, budget: { daily: 50, monthly: 0 } });
    expect(cacheEnv({ SCRIPTURE_CACHE_TTL_DAYS: 'x' }).ttlMs).toBeUndefined();
  });
});

import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { FumsController } from './fums.controller';
import { ReadingQuotaService } from '../reading-quota/service';
import { InMemoryQuotaStore } from '../reading-quota/store';
import {
  SCRIPTURE_PROVIDER,
  type ScriptureProvider,
} from '../scripture/provider';
import { ScriptureController } from '../scripture/scripture.controller';
import {
  FUMS_VIEW_POLICY,
  FumsPacer,
  IssuedTokens,
  type FumsViewPolicy,
} from './fums.guard';
import { FUMS_URL, FumsReporter } from './fums.reporter';

function recorder() {
  const calls: string[] = [];
  const fetch = ((url: string) => {
    calls.push(url);
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const day = (iso: string) => () => new Date(iso);

describe('FumsReporter', () => {
  it('reports the tokens with anonymous device + session ids, no user id', async () => {
    const { calls, fetch } = recorder();
    const r = new FumsReporter({ secret: 's', fetch });
    await r.report(['tokA', 'tokB'], 'session-1');
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(`${url.origin}${url.pathname}`).toBe(FUMS_URL);
    expect(url.searchParams.getAll('t')).toEqual(['tokA', 'tokB']);
    expect(url.searchParams.get('dId')).toMatch(/^[\w-]{21}$/);
    expect(url.searchParams.get('sId')).toMatch(/^[\w-]{21}$/);
    expect(url.searchParams.has('uId')).toBe(false);
    expect(calls[0]).not.toContain('session-1');
  });

  it('keeps the device id per sign-in session; the session id turns daily', () => {
    const a = new FumsReporter({ secret: 's', now: day('2026-11-16T08:00Z') });
    const b = new FumsReporter({ secret: 's', now: day('2026-11-17T08:00Z') });
    expect(a.ids('x').dId).toBe(b.ids('x').dId);
    expect(a.ids('x').sId).not.toBe(b.ids('x').sId);
    expect(a.ids('x').dId).not.toBe(a.ids('y').dId);
    // Keyed: without the server's secret nobody can recompute them
    const other = new FumsReporter({
      secret: 't',
      now: day('2026-11-16T08:00Z'),
    });
    expect(other.ids('x').dId).not.toBe(a.ids('x').dId);
  });

  it('splits long batches into requests under 8 KiB', () => {
    const r = new FumsReporter({ secret: 's' });
    const tokens = Array.from({ length: 40 }, (_, i) =>
      `${i}`.padEnd(300, 'x'),
    );
    const urls = r.urls(tokens, 'k');
    expect(urls.length).toBeGreaterThan(1);
    for (const u of urls) expect(u.length).toBeLessThanOrEqual(8192);
    const sent = urls.flatMap((u) => new URL(u).searchParams.getAll('t'));
    expect(sent).toEqual(tokens);
  });

  it('never throws when FUMS is down', async () => {
    const errors: unknown[] = [];
    const r = new FumsReporter({
      secret: 's',
      fetch: () => Promise.reject(new Error('offline')),
      onError: (e) => errors.push(e),
    });
    await expect(r.report(['t'], 'k')).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});

describe('FumsPacer + IssuedTokens', () => {
  const policy = {
    ...FUMS_VIEW_POLICY,
    session: { burst: 2, refillMs: 1000 },
    ip: { burst: 3, refillMs: 1000 },
  };

  it('paces per session, and per IP across sessions', () => {
    let now = 0;
    const pacer = new FumsPacer(policy, () => now);
    expect(pacer.take('a', '1.2.3.4').allowed).toBe(true);
    expect(pacer.take('a', '1.2.3.4').allowed).toBe(true);
    expect(pacer.take('a', '1.2.3.4')).toEqual({
      allowed: false,
      retryAfterMs: 1000,
    });
    // Same IP, another session: the IP bucket has one left
    expect(pacer.take('b', '::ffff:1.2.3.4').allowed).toBe(true);
    expect(pacer.take('c', '1.2.3.4').allowed).toBe(false);
    now = 1000;
    expect(pacer.take('a', '1.2.3.4').allowed).toBe(true);
  });

  it('accepts only tokens served to that session, within the TTL', () => {
    let now = 0;
    const issued = new IssuedTokens(policy, () => now);
    issued.record('s1', 'tokA');
    expect(issued.accept('s1', ['tokA', 'forged'])).toEqual(['tokA']);
    expect(issued.accept('s2', ['tokA'])).toEqual([]);
    now = policy.issuedTtlMs;
    expect(issued.accept('s1', ['tokA'])).toEqual([]);
  });

  it('remembers a bounded number per session (oldest go first)', () => {
    const issued = new IssuedTokens({ ...policy, maxPerSession: 2 });
    for (const t of ['a', 'b', 'c']) issued.record('s', t);
    expect(issued.accept('s', ['a', 'b', 'c'])).toEqual(['b', 'c']);
  });
});

describe('POST /fums/views (HTTP)', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(
    signedIn: boolean,
    policy: FumsViewPolicy = FUMS_VIEW_POLICY,
  ) {
    const rec = recorder();
    const issued = new IssuedTokens(policy);
    let builder = Test.createTestingModule({
      controllers: [FumsController, ScriptureController],
      providers: [
        {
          provide: FumsReporter,
          useValue: new FumsReporter({ secret: 's', fetch: rec.fetch }),
        },
        { provide: FumsPacer, useValue: new FumsPacer(policy) },
        { provide: IssuedTokens, useValue: issued },
        { provide: SCRIPTURE_PROVIDER, useValue: tokenProvider },
        {
          provide: ReadingQuotaService,
          useValue: new ReadingQuotaService({
            store: new InMemoryQuotaStore(),
          }),
        },
      ],
    });
    if (signedIn)
      builder = builder.overrideGuard(SessionGuard).useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<AuthedRequest>();
          const session = String(req.headers['x-test-session'] ?? 'sess-1');
          req.user = {
            id: 'reader-1',
            email: 'reader@example.com',
            name: 'Reader',
            sessionId: session,
          };
          return true;
        },
      });
    app = (await builder.compile()).createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0);
    const base = await app.getUrl();
    const post = (body: unknown, session = 'sess-1') =>
      fetch(`${base}/fums/views`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-session': session,
        },
        body: JSON.stringify(body),
      });
    /** Serve JHN.n to a session: its token becomes reportable by it. */
    const read = (n: number, session = 'sess-1') =>
      fetch(`${base}/passages/NIV/JHN/${n}`, {
        headers: { 'x-test-session': session },
      });
    const relayed = async () => {
      await new Promise((r) => setTimeout(r, 20));
      return rec.calls.flatMap((u) => new URL(u).searchParams.getAll('t'));
    };
    return { post, read, relayed };
  }

  it('401s without a session', async () => {
    const { post } = await start(false);
    expect((await post({ tokens: ['abc'] })).status).toBe(401);
  });

  it('relays the tokens of chapters served to this session, once each', async () => {
    const { post, read, relayed } = await start(true);
    expect((await read(3)).status).toBe(200);
    expect((await read(4)).status).toBe(200);
    expect(
      (await post({ tokens: ['tok-JHN3', 'tok-JHN3', 'tok-JHN4'] })).status,
    ).toBe(204);
    expect(await relayed()).toEqual(['tok-JHN3', 'tok-JHN4']);
  });

  it("drops forged tokens and other sessions' tokens (no inflating counts)", async () => {
    const { post, read, relayed } = await start(true);
    await read(3, 'sess-other');
    expect((await post({ tokens: ['forgedToken', 'tok-JHN3'] })).status).toBe(
      204,
    );
    expect(await relayed()).toEqual([]);
  });

  it('429s past the pace, with Retry-After', async () => {
    const { post, read } = await start(true, {
      ...FUMS_VIEW_POLICY,
      session: { burst: 2, refillMs: 60_000 },
    });
    await read(3);
    expect((await post({ tokens: ['tok-JHN3'] })).status).toBe(204);
    expect((await post({ tokens: ['tok-JHN3'] })).status).toBe(204);
    const res = await post({ tokens: ['tok-JHN3'] });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('rejects anything that is not a token list', async () => {
    const { post, relayed } = await start(true);
    expect((await post({ tokens: [] })).status).toBe(400);
    expect((await post({ tokens: ['a&uId=me'] })).status).toBe(400);
    expect((await post({ tokens: Array(21).fill('a') })).status).toBe(400);
    expect(await relayed()).toEqual([]);
  });
});

/** Chapters carrying a FUMS token, like API.Bible's. */
const tokenProvider: ScriptureProvider = {
  listTranslations: () => Promise.resolve([]),
  getChapter: (translationId, book, chapter) =>
    Promise.resolve({
      translationId,
      book,
      chapter,
      verses: [{ verse: 1, text: 'x' }],
      fumsToken: `tok-${book}${chapter}`,
    }),
};

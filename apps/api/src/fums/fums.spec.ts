import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { FumsController } from './fums.controller';
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

describe('POST /fums/views (HTTP)', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(signedIn: boolean) {
    const rec = recorder();
    let builder = Test.createTestingModule({
      controllers: [FumsController],
      providers: [
        {
          provide: FumsReporter,
          useValue: new FumsReporter({ secret: 's', fetch: rec.fetch }),
        },
      ],
    });
    if (signedIn)
      builder = builder.overrideGuard(SessionGuard).useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<AuthedRequest>().user = {
            id: 'reader-1',
            email: 'reader@example.com',
            name: 'Reader',
            sessionId: 'sess-1',
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
    const post = (body: unknown) =>
      fetch(`${base}/fums/views`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    return { post, calls: rec.calls };
  }

  it('401s without a session', async () => {
    const { post } = await start(false);
    expect((await post({ tokens: ['abc'] })).status).toBe(401);
  });

  it('relays the shown tokens once each', async () => {
    const { post, calls } = await start(true);
    expect((await post({ tokens: ['abc', 'abc', 'def'] })).status).toBe(204);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]).searchParams.getAll('t')).toEqual(['abc', 'def']);
  });

  it('rejects anything that is not a token list', async () => {
    const { post, calls } = await start(true);
    expect((await post({ tokens: [] })).status).toBe(400);
    expect((await post({ tokens: ['a&uId=me'] })).status).toBe(400);
    expect((await post({ tokens: Array(21).fill('a') })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

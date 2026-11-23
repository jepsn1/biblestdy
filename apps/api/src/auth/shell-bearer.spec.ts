import type { AddressInfo } from 'node:net';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { emailOTP } from 'better-auth/plugins';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shellCors, shellOriginsFrom } from '../http/shell-cors';
import { shellBearer } from './shell-bearer';

/**
 * #18 end to end over HTTP: the Capacitor shell (Origin capacitor://localhost)
 * signs in with an emailed code and uses the bearer token it gets back —
 * same middleware order as main.ts (shell CORS, Better Auth, then an API
 * route checking the session the way SessionGuard does). In-memory DB.
 */
const WEB = 'http://localhost:5173';
const SHELL = 'capacitor://localhost';
const ANDROID = 'https://localhost';

const codes = new Map<string, string>();
const auth = betterAuth({
  baseURL: WEB,
  secret: 'test-secret-test-secret-test-secret-123',
  database: memoryAdapter({
    user: [],
    session: [],
    account: [],
    verification: [],
  }),
  rateLimit: { enabled: false },
  // Better Auth skips its origin/CSRF check under NODE_ENV=test; prod runs it
  advanced: { disableOriginCheck: false },
  plugins: [
    emailOTP({
      sendVerificationOTP: ({ email, otp }) => {
        codes.set(email, otp);
        return Promise.resolve();
      },
    }),
    shellBearer([SHELL, ANDROID]),
  ],
  trustedOrigins: [WEB, SHELL, ANDROID],
});

let base = '';
let close = () => {};
beforeAll(async () => {
  const app = express();
  app.use(shellCors([SHELL, ANDROID]));
  const authHandler = toNodeHandler(auth);
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/auth/')) return void authHandler(req, res);
    next();
  });
  // Stand-in for a SessionGuard route (same getSession call)
  app.get('/api/me', async (req, res) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) return void res.status(401).json({ message: 'no' });
    res.json({ email: session.user.email });
  });
  await new Promise<void>((done) => {
    const server = app.listen(0, () => done());
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
});
afterAll(() => close());

const post = (path: string, body: unknown, headers: Record<string, string>) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

async function signIn(email: string, origin: string) {
  await post(
    '/api/auth/email-otp/send-verification-otp',
    { email, type: 'sign-in' },
    { origin },
  );
  return post(
    '/api/auth/sign-in/email-otp',
    { email, otp: codes.get(email) },
    { origin },
  );
}

describe('shell CORS', () => {
  it('answers a shell preflight with the allowed origin, methods, headers', async () => {
    const res = await fetch(base + '/api/notes', {
      method: 'OPTIONS',
      headers: {
        origin: SHELL,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(SHELL);
    expect(res.headers.get('access-control-allow-headers')).toMatch(
      /authorization/,
    );
    expect(res.headers.get('access-control-allow-methods')).toMatch(/PATCH/);
    // bearer, not cookies: never credentialed
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('serves Android (https://localhost) too', async () => {
    const res = await fetch(base + '/api/auth/get-session', {
      headers: { origin: ANDROID },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(ANDROID);
  });

  it('adds nothing for other origins or same-origin requests', async () => {
    for (const headers of [
      { origin: 'https://evil.example' },
      {} as Record<string, string>,
    ]) {
      const res = await fetch(base + '/api/auth/get-session', { headers });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(res.headers.get('access-control-expose-headers')).toBeNull();
    }
    const pre = await fetch(base + '/api/me', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'GET',
      },
    });
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('shell bearer sessions', () => {
  it('OTP sign-in from the shell returns a token the shell can read', async () => {
    const res = await signIn('shell@example.com', SHELL);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(SHELL);
    expect(res.headers.get('access-control-expose-headers')).toMatch(
      /set-auth-token/,
    );
    expect(res.headers.get('set-auth-token')).toMatch(/\./); // token.signature
  });

  it('the token alone (no cookie) authenticates auth and API routes', async () => {
    const res = await signIn('bearer@example.com', SHELL);
    const token = res.headers.get('set-auth-token')!;
    const headers = { origin: SHELL, authorization: `Bearer ${token}` };

    const session = await fetch(base + '/api/auth/get-session', { headers });
    expect(
      ((await session.json()) as { user: { email: string } }).user.email,
    ).toBe('bearer@example.com');

    const me = await fetch(base + '/api/me', { headers });
    expect(me.status).toBe(200);
    expect(me.headers.get('access-control-allow-origin')).toBe(SHELL);
    expect(await me.json()).toEqual({ email: 'bearer@example.com' });
  });

  it('rejects a forged, unsigned or missing token', async () => {
    const res = await signIn('forge@example.com', SHELL);
    const token = res.headers.get('set-auth-token')!;
    const [id] = decodeURIComponent(token).split('.');
    for (const bad of [`${id}.AAAA`, id, '']) {
      const me = await fetch(base + '/api/me', {
        headers: { origin: SHELL, authorization: `Bearer ${bad}` },
      });
      expect(me.status).toBe(401);
    }
  });

  it('sign-out with the token ends the session', async () => {
    const res = await signIn('out@example.com', SHELL);
    const token = res.headers.get('set-auth-token')!;
    const headers = { origin: SHELL, authorization: `Bearer ${token}` };
    const out = await post('/api/auth/sign-out', {}, headers);
    expect(out.status).toBe(200);
    const me = await fetch(base + '/api/me', { headers });
    expect(me.status).toBe(401);
  });

  it('the web sign-in is cookie-only: no token header, no CORS headers', async () => {
    const res = await signIn('web@example.com', WEB);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(
      /better-auth\.session_token=.*HttpOnly/i,
    );
    expect(res.headers.get('set-auth-token')).toBeNull();
    expect(res.headers.get('access-control-expose-headers')).toBeNull();
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('trusts the shell origin, still refuses others, on cookie-carrying POSTs', async () => {
    // Better Auth checks Origin only when a cookie rides along (CSRF); the
    // shell sends none (credentials: 'omit'), but a stray one must not 403
    const send = (origin: string) =>
      post(
        '/api/auth/email-otp/send-verification-otp',
        { email: 'x@example.com', type: 'sign-in' },
        { origin, cookie: 'a=b' },
      );
    expect((await send('https://evil.example')).status).toBe(403);
    expect((await send(SHELL)).status).toBe(200);
    expect((await send(ANDROID)).status).toBe(200);
  });
});

describe('shell origins', () => {
  it('default to the iOS and Android shells; SHELL_ORIGINS replaces them', () => {
    expect(shellOriginsFrom(undefined)).toEqual([SHELL, ANDROID]);
    expect(shellOriginsFrom(' ')).toEqual([SHELL, ANDROID]);
    expect(
      shellOriginsFrom('capacitor://localhost, http://localhost:5918'),
    ).toEqual([SHELL, 'http://localhost:5918']);
  });
});

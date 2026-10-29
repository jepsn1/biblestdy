import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { emailOTP, magicLink } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';
import { CLIENT_IP_HEADER } from '../http/client-ip';
import {
  AUTH_IP_ADDRESS,
  AUTH_RATE_LIMIT,
  AUTH_RATE_RULES,
} from './rate-limit';

/**
 * Same rate-limit + IP config as the real auth instance, but in-memory DB and
 * rate-limit storage, and no mail: a send just counts.
 */
function testAuth() {
  const sent: string[] = [];
  const auth = betterAuth({
    baseURL: 'http://localhost:5173',
    secret: 'test-secret-test-secret-test-secret-123',
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    rateLimit: { ...AUTH_RATE_LIMIT, storage: 'memory' },
    advanced: { ipAddress: AUTH_IP_ADDRESS },
    plugins: [
      magicLink({
        sendMagicLink: ({ email }) => {
          sent.push(email);
          return Promise.resolve();
        },
      }),
      emailOTP({
        sendVerificationOTP: ({ email }) => {
          sent.push(email);
          return Promise.resolve();
        },
      }),
    ],
    trustedOrigins: ['http://localhost:5173'],
  });
  const post = (path: string, body: unknown, ip: string) =>
    auth.handler(
      new Request(`http://localhost:5173/api/auth${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
          [CLIENT_IP_HEADER]: ip,
        },
        body: JSON.stringify(body),
      }),
    );
  return { post, sent };
}

/** Fire `n` requests sequentially; return status codes. */
async function hammer(n: number, send: () => Promise<Response>) {
  const codes: number[] = [];
  for (let i = 0; i < n; i++) codes.push((await send()).status);
  return codes;
}

const cases = [
  {
    name: 'OTP send',
    path: '/email-otp/send-verification-otp',
    body: { email: 'a@example.com', type: 'sign-in' },
  },
  {
    name: 'magic-link send',
    path: '/sign-in/magic-link',
    body: { email: 'a@example.com', callbackURL: '/' },
  },
  {
    name: 'OTP sign-in',
    path: '/sign-in/email-otp',
    body: { email: 'a@example.com', otp: '000000' },
  },
] as const;

describe('auth rate limiting (per IP)', () => {
  it('is on regardless of NODE_ENV and persisted in the database', () => {
    expect(AUTH_RATE_LIMIT.enabled).toBe(true);
    expect(AUTH_RATE_LIMIT.storage).toBe('database');
  });

  for (const [i, c] of cases.entries()) {
    it(`${c.name}: 429 after the configured max`, async () => {
      const { post } = testAuth();
      const max = AUTH_RATE_RULES[c.path].max;
      const ip = `198.51.100.${10 + i}`;
      const codes = await hammer(max + 1, () => post(c.path, c.body, ip));
      expect(codes.slice(0, max)).not.toContain(429);
      expect(codes[max]).toBe(429);
    });

    it(`${c.name}: limits are per IP — another IP is unaffected`, async () => {
      const { post } = testAuth();
      const max = AUTH_RATE_RULES[c.path].max;
      const ip = `198.51.100.${50 + i}`;
      await hammer(max + 1, () => post(c.path, c.body, ip));
      const other = await post(c.path, c.body, `198.51.100.${90 + i}`);
      expect(other.status).not.toBe(429);
    });
  }

  it('a 429 on OTP send sends no mail', async () => {
    const { post, sent } = testAuth();
    const c = cases[0];
    const max = AUTH_RATE_RULES[c.path].max;
    await hammer(max + 2, () => post(c.path, c.body, '198.51.100.200'));
    expect(sent).toHaveLength(max);
  });
});

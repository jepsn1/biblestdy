import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { emailOTP, magicLink } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';
import { emailLanguage, renderAuthEmail, type EmailLanguage } from './email';

const URL = 'https://biblestdy.com/api/auth/magic-link/verify?token=abc';

describe('renderAuthEmail', () => {
  it('renders Danish for a Danish UI', () => {
    const { subject, text, html } = renderAuthEmail({
      url: URL,
      otp: '123456',
      lang: 'da',
    });
    expect(subject).toBe('Din loginkode til biblestdy');
    expect(html).toContain('lang="da"');
    expect(html).toContain('>Log ind på biblestdy</a>');
    expect(html).toContain('Eller indtast denne kode:');
    expect(html).toContain(
      'Har du ikke bedt om denne e-mail, kan du bare ignorere den.',
    );
    expect(html).not.toMatch(/Sign in|enter this code|ignore this/);
    expect(text).toContain('Kode: 123456');
    expect(text).toContain(`Link: ${URL}`);
  });

  it('renders English otherwise', () => {
    const { subject, text, html } = renderAuthEmail({
      url: URL,
      otp: '123456',
      lang: 'en',
    });
    expect(subject).toBe('Your sign-in code for biblestdy');
    expect(html).toContain('lang="en"');
    expect(html).toContain('>Sign in to biblestdy</a>');
    expect(html).toContain('Or enter this code:');
    expect(text).toContain('Code: 123456');
  });

  it('carries the link and the code', () => {
    const { html } = renderAuthEmail({ url: URL, otp: '654321', lang: 'da' });
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain('654321');
  });

  it('drops "Or" when the code is the only way in', () => {
    const { html } = renderAuthEmail({ otp: '123456', lang: 'da' });
    expect(html).not.toContain('<a ');
    expect(html).toContain('Kode: <strong');
  });
});

describe('emailLanguage', () => {
  const ctx = (accept?: string) => ({
    headers: new Headers(accept ? { 'accept-language': accept } : {}),
  });

  it('is Danish when Accept-Language leads with da', () => {
    expect(emailLanguage(ctx('da'))).toBe('da');
    expect(emailLanguage(ctx('da-DK,da;q=0.9,en;q=0.8'))).toBe('da');
  });

  it('is English for anything else, or no header at all', () => {
    expect(emailLanguage(ctx('en-US,da;q=0.5'))).toBe('en');
    expect(emailLanguage(ctx('nb-NO'))).toBe('en');
    expect(emailLanguage(ctx('dav'))).toBe('en'); // Taita, not Danish
    expect(emailLanguage(ctx())).toBe('en');
    expect(emailLanguage(undefined)).toBe('en');
  });

  it("reaches Better Auth's send callbacks from the request header", async () => {
    const seen: EmailLanguage[] = [];
    const auth = betterAuth({
      baseURL: 'http://localhost:5173',
      secret: 'test-secret-test-secret-test-secret-123',
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
      }),
      rateLimit: { enabled: false },
      plugins: [
        magicLink({
          sendMagicLink: (_, c) => {
            seen.push(emailLanguage(c));
            return Promise.resolve();
          },
        }),
        emailOTP({
          sendVerificationOTP: (_, c) => {
            seen.push(emailLanguage(c));
            return Promise.resolve();
          },
        }),
      ],
      trustedOrigins: ['http://localhost:5173'],
    });
    const post = (path: string, body: unknown) =>
      auth.handler(
        new Request(`http://localhost:5173/api/auth${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:5173',
            'accept-language': 'da',
          },
          body: JSON.stringify(body),
        }),
      );
    await post('/email-otp/send-verification-otp', {
      email: 'a@example.com',
      type: 'sign-in',
    });
    await post('/sign-in/magic-link', {
      email: 'a@example.com',
      callbackURL: '/',
    });
    expect(seen).toEqual(['da', 'da']);
  });
});

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, magicLink } from 'better-auth/plugins';
import { db, schema } from '../db';
import { emailLanguage, queueAuthEmail } from './email';
import { AUTH_IP_ADDRESS, AUTH_RATE_LIMIT } from './rate-limit';
import { SHELL_ORIGINS } from '../http/shell-cors';
import { shellBearer } from './shell-bearer';

/**
 * Better Auth instance. Passwordless — no passwords, ever (see VISION.md:
 * accounts exist solely for the user's own multi-device sync). Users can
 * either click the magic link or type the OTP code; both are sent.
 *
 * Emails go through Resend (email.ts), link + code coalesced into one email.
 * Without RESEND_API_KEY (dev): link + code are logged to the api console.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  user: {
    additionalFields: {
      // Last-used highlight color; the "Highlight" button applies this.
      defaultHighlightColor: {
        type: 'string',
        required: false,
        defaultValue: 'gold',
      },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: ({ email, url }, ctx) => {
        queueAuthEmail(email, { url }, emailLanguage(ctx));
        return Promise.resolve();
      },
    }),
    emailOTP({
      sendVerificationOTP: ({ email, otp }, ctx) => {
        queueAuthEmail(email, { otp }, emailLanguage(ctx));
        return Promise.resolve();
      },
    }),
    // The Capacitor shell's session transport (#18); web stays on cookies
    shellBearer(),
  ],
  // The web origin, plus the Capacitor shell's (http/shell-cors.ts) — its
  // sign-in POSTs carry Origin: capacitor://localhost (iOS) / https://localhost
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
    ...SHELL_ORIGINS,
  ],
  // Per-IP throttling of OTP/magic-link/sign-in (rate-limit.ts), keyed on the
  // proxy-resolved client IP (http/client-ip.ts).
  rateLimit: AUTH_RATE_LIMIT,
  advanced: { ipAddress: AUTH_IP_ADDRESS },
});

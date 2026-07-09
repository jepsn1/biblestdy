import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, magicLink } from 'better-auth/plugins';
import { db, schema } from '../db';
import { queueAuthEmail } from './email';

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
      sendMagicLink: ({ email, url }) => {
        queueAuthEmail(email, { url });
        return Promise.resolve();
      },
    }),
    emailOTP({
      sendVerificationOTP: ({ email, otp }) => {
        queueAuthEmail(email, { otp });
        return Promise.resolve();
      },
    }),
  ],
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'],
});

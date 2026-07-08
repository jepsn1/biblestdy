import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, magicLink } from 'better-auth/plugins';
import { Logger } from '@nestjs/common';
import { db, schema } from '../db';

const logger = new Logger('Auth');

/**
 * Better Auth instance. Passwordless — no passwords, ever (see VISION.md:
 * accounts exist solely for the user's own multi-device sync). Users can
 * either click the magic link or type the OTP code; both are sent.
 *
 * Dev: link + code are logged to the api console instead of being emailed.
 * A real sender (e.g. Resend) slots into these callbacks at pilot time —
 * and should combine link + code into one email.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  plugins: [
    magicLink({
      sendMagicLink: ({ email, url }) => {
        // TODO(pilot): send via real email provider
        logger.log(`Magic link for ${email}: ${url}`);
        return Promise.resolve();
      },
    }),
    emailOTP({
      sendVerificationOTP: ({ email, otp }) => {
        // TODO(pilot): send via real email provider (same email as the link)
        logger.log(`OTP for ${email}: ${otp}`);
        return Promise.resolve();
      },
    }),
  ],
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'],
});

import { CLIENT_IP_HEADER } from '../http/client-ip';

/**
 * Per-IP throttling of the auth endpoints (PRD #25 module 6), so the
 * per-account scripture caps can't be multiplied by minting accounts.
 *
 * Better Auth keys each bucket on `<ip>|<path>`. A bucket refills only after
 * `window` seconds with no allowed request, so sustained hammering stays
 * blocked. Sign-in fires OTP-send + magic-link-send together (one email), so
 * `max` on those = sign-in attempts per IP per window.
 *
 * Tune here; numbers are a first guess for the pilot.
 */
const HOUR = 60 * 60;

export const AUTH_RATE_RULES = {
  // Sending mail: tightest — also caps account creation per IP.
  '/email-otp/send-verification-otp': { window: HOUR, max: 5 },
  '/sign-in/magic-link': { window: HOUR, max: 5 },
  // Verifying: code typos / re-clicked links need some slack.
  '/sign-in/email-otp': { window: HOUR, max: 10 },
  '/magic-link/verify': { window: HOUR, max: 10 },
} satisfies Record<string, { window: number; max: number }>;

export const AUTH_RATE_LIMIT = {
  // Better Auth defaults to production-only; we want dev to behave the same.
  enabled: true,
  // Postgres `rate_limit` table: survives restarts/deploys.
  storage: 'database',
  // Everything else under /api/auth (session polling etc.): loose.
  window: 60,
  max: 100,
  customRules: AUTH_RATE_RULES,
} as const;

/** Better Auth reads the client IP from the header we stamp with `req.ip`. */
export const AUTH_IP_ADDRESS = {
  ipAddressHeaders: [CLIENT_IP_HEADER],
};

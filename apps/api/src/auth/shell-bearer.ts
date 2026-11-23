import type { BetterAuthPlugin } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { isShellOrigin, SHELL_ORIGINS } from '../http/shell-cors';

/**
 * Bearer sessions for the Capacitor shell (#18). WKWebView treats our
 * session cookie as third-party (the app runs on capacitor://localhost), so
 * the shell keeps the session token in the Keychain and sends it as
 * `Authorization: Bearer <token>`; Better Auth's bearer plugin turns that
 * back into the session cookie server-side, so every session check (Better
 * Auth's own endpoints and SessionGuard) works unchanged.
 *
 * Two tightenings over the stock plugin:
 * - `requireSignature`: only the signed cookie value (token.HMAC) is
 *   accepted, never a bare session id — a leaked database row alone can't
 *   be replayed as a bearer token.
 * - The token is handed out (`set-auth-token` response header) only to
 *   shell origins. The web keeps its HttpOnly cookie and never sees the
 *   token in a response its scripts can read.
 *
 * Accepting a bearer token is NOT limited by Origin: an Origin header is
 * trivially set by any non-browser client, so it proves nothing for a
 * token-holder, and a bearer header is never sent ambiently (no CSRF).
 * Rate limits still apply (per IP, rate-limit.ts).
 */
export function shellBearer(
  origins: readonly string[] = SHELL_ORIGINS,
): BetterAuthPlugin {
  const plugin = bearer({ requireSignature: true });
  const originOf = (ctx: {
    headers?: Headers;
    request?: Request;
  }): string | null =>
    ctx.request?.headers.get('origin') ?? ctx.headers?.get('origin') ?? null;
  return {
    ...plugin,
    hooks: {
      before: plugin.hooks.before,
      after: plugin.hooks.after.map((hook) => ({
        ...hook,
        matcher: (ctx) => isShellOrigin(originOf(ctx), origins),
      })),
    },
  };
}

import type { NextFunction, Request, Response } from 'express';

/**
 * CORS for the Capacitor shell (#18). The shell loads the bundled SPA from
 * its own origin and calls this API cross-origin:
 * - iOS: `capacitor://localhost` (WKWebView custom scheme)
 * - Android: `https://localhost` (`server.androidScheme: 'https'`)
 * The web app is same-origin and never matches, so its requests and
 * responses are untouched.
 *
 * No `Access-Control-Allow-Credentials`: the shell authenticates with a
 * bearer token (Better Auth bearer plugin, auth/shell-bearer.ts) and sends
 * `credentials: 'omit'`, so cookies play no part cross-origin.
 *
 * SHELL_ORIGINS (comma-separated) replaces the defaults — for simulating the
 * shell against a local API (e.g. the built SPA on http://localhost:59NN).
 */
export const DEFAULT_SHELL_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
];

export function shellOriginsFrom(env: string | undefined): string[] {
  const list = (env ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_SHELL_ORIGINS;
}

export const SHELL_ORIGINS = shellOriginsFrom(process.env.SHELL_ORIGINS);

export function isShellOrigin(
  origin: string | null | undefined,
  origins: readonly string[] = SHELL_ORIGINS,
): boolean {
  return !!origin && origins.includes(origin);
}

/** Request headers the shell sends: JSON bodies, the bearer token, the UI
 * language (sign-in email language, auth/email.ts). */
const ALLOW_HEADERS = 'authorization, content-type, accept-language';
const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
/** Response headers the SPA reads: the new session token (sign-in), the
 * reading quota's pacing (reader/reading-limit.ts, chapter-cache.ts). */
const EXPOSE_HEADERS = 'set-auth-token, retry-after, ratelimit-remaining';

/** Express middleware: CORS headers for shell origins; answers their
 * preflights. Everything else passes through unchanged. */
export function shellCors(origins: readonly string[] = SHELL_ORIGINS) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!isShellOrigin(origin, origins)) {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', EXPOSE_HEADERS);
    if (
      req.method === 'OPTIONS' &&
      req.headers['access-control-request-method']
    ) {
      res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
    next();
  };
}

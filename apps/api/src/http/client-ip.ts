import type { Express, NextFunction, Request, Response } from 'express';

/**
 * Real client IP behind the reverse proxy.
 *
 * Prod: infra Caddy (container `infra-caddy`, docker network `web`, a private
 * 172.x subnet) terminates TLS and proxies /api/* to `biblestdy-api:3001`.
 * The API publishes no ports, so only that proxy can reach it. Caddy sets
 * X-Forwarded-For to the visitor IP (it replaces client-sent XFF since it
 * trusts no upstream proxies). Dev: Vite proxy on loopback, no XFF.
 *
 * So we trust X-Forwarded-For only from loopback + private-network peers
 * (`uniquelocal` = 10/8, 172.16/12, 192.168/16, fc00::/7) — never from a
 * public peer. Override with TRUST_PROXY (any Express `trust proxy` value
 * string, e.g. `172.18.0.0/16`).
 */
export const DEFAULT_TRUST_PROXY = 'loopback, uniquelocal';

/**
 * Header we stamp with the resolved `req.ip` before Better Auth sees the
 * request, so its rate limiter keys on the trusted IP (it reads headers, not
 * `req.ip`). Always overwritten — clients can't spoof it.
 */
export const CLIENT_IP_HEADER = 'x-biblestdy-client-ip';

export function trustProxyFrom(env: string | undefined): string {
  return env?.trim() || DEFAULT_TRUST_PROXY;
}

export function configureClientIp(app: Express, trust: string): void {
  app.set('trust proxy', trust);
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.ip) req.headers[CLIENT_IP_HEADER] = req.ip;
    else delete req.headers[CLIENT_IP_HEADER];
    next();
  });
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  NotImplementedException,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { CacheStats } from './caching.provider';
import { SCRIPTURE_PROVIDER, type ScriptureProvider } from './provider';

type AdminCache = Partial<{
  purge(id?: string): Promise<number>;
  stats(): Promise<CacheStats>;
}>;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** The key tools/purge-scripture-cache.sh sends: derived from the server's
 * own secret, so only a shell on the server can compute it. */
export function purgeKey(secret: string): string {
  return createHmac('sha256', secret)
    .update('scripture-cache-purge')
    .digest('hex');
}

/**
 * Operator-only cache purge (ToS §10/§11: content changed or withdrawn by
 * API.Bible or a rights holder goes within 24 h). Reachable only from inside
 * the API's own host/container (raw socket address, not X-Forwarded-For)
 * AND with the purge key — Caddy's proxied requests never qualify.
 */
@Controller('admin/scripture-cache')
export class CacheAdminController {
  private readonly logger = new Logger('ScriptureCache');

  constructor(
    @Inject(SCRIPTURE_PROVIDER) private readonly provider: ScriptureProvider,
  ) {}

  @Post('purge')
  @HttpCode(200)
  async purge(
    @Req() req: Request,
    @Headers('x-purge-key') key: string | undefined,
    @Body() body: { translationId?: unknown },
  ): Promise<{ purged: number; translationId: string | null }> {
    const cache = this.authorised(req, key);
    if (typeof cache.purge !== 'function') {
      throw new NotImplementedException('No scripture cache to purge');
    }
    const id =
      typeof body?.translationId === 'string' && body.translationId
        ? body.translationId
        : undefined;
    // Memory AND the shared scripture_cache table (#248)
    const purged = await cache.purge(id);
    this.logger.log(`purged ${purged} chapters (${id ?? 'all translations'})`);
    return { purged, translationId: id ?? null };
  }

  /** Upstream API.Bible calls today / this month vs the soft budget (#248):
   * tools/scripture-calls.sh. */
  @Get('stats')
  stats(
    @Req() req: Request,
    @Headers('x-purge-key') key: string | undefined,
  ): Promise<CacheStats> {
    const cache = this.authorised(req, key);
    if (typeof cache.stats !== 'function') {
      throw new NotImplementedException('No scripture cache');
    }
    return cache.stats();
  }

  /** Loopback + server-derived key, else 403. */
  private authorised(req: Request, key: string | undefined): AdminCache {
    const secret = process.env.BETTER_AUTH_SECRET;
    const expected = secret ? Buffer.from(purgeKey(secret)) : null;
    const given = Buffer.from(key ?? '');
    if (
      !LOOPBACK.has(req.socket.remoteAddress ?? '') ||
      !expected ||
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    ) {
      throw new ForbiddenException();
    }
    return this.provider as AdminCache;
  }
}

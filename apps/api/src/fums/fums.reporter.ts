import { createHmac } from 'node:crypto';

/** API.Bible's Fair Use endpoint for products that report views themselves
 * (docs.api.bible/resources/fair-use, "manual" reporting). */
export const FUMS_URL = 'https://fums.api.bible/f3';
/** The JS tracker keeps each request under 8 KiB; so do we. */
const MAX_URL = 8192;

export interface FumsReporterOptions {
  /** Keys the anonymous ids (never sent). */
  secret: string;
  fetch?: typeof fetch;
  now?: () => Date;
  onError?: (err: unknown) => void;
}

/**
 * Reports Scripture views to API.Bible's Fair Use Management System (FUMS,
 * ToS §3.3) from the server, on the reader's behalf.
 *
 * Why not the browser tracker (fumsV3.min.js): it stores a lifelong device id
 * in localStorage and sends the reader's IP to a third party — storage that
 * needs consent under the Danish cookie rules (ePrivacy art. 5(3)). Relayed
 * here, nothing is stored on the device and API.Bible sees only our server:
 * - dId: an HMAC of the sign-in session (one per device/browser, ends at
 *   sign-out) — stable enough to count devices, linkable to no one outside;
 * - sId: the same, re-keyed per UTC day (the tracker's "session");
 * - uId: never sent.
 */
export class FumsReporter {
  private readonly fetch: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly opts: FumsReporterOptions) {
    this.fetch = opts.fetch ?? fetch;
    this.now = opts.now ?? (() => new Date());
  }

  /** The anonymous device + session ids for one sign-in session. */
  ids(sessionKey: string): { dId: string; sId: string } {
    const day = this.now().toISOString().slice(0, 10);
    return {
      dId: this.hmac(`fums-device:${sessionKey}`),
      sId: this.hmac(`fums-session:${sessionKey}:${day}`),
    };
  }

  /** Request URLs for these views: tokens batched as repeated `t`, each URL
   * under 8 KiB (the tracker's own limit). */
  urls(tokens: string[], sessionKey: string): string[] {
    const { dId, sId } = this.ids(sessionKey);
    const head = `${FUMS_URL}?dId=${dId}&sId=${sId}`;
    const urls: string[] = [];
    let current = head;
    for (const token of tokens) {
      const part = `&t=${encodeURIComponent(token)}`;
      if (current !== head && current.length + part.length > MAX_URL) {
        urls.push(current);
        current = head;
      }
      current += part;
    }
    if (current !== head) urls.push(current);
    return urls;
  }

  /** Fire the report; never throws (a lost view must not break reading). */
  async report(tokens: string[], sessionKey: string): Promise<void> {
    await Promise.all(
      this.urls(tokens, sessionKey).map(async (url) => {
        try {
          const res = await this.fetch(url, {
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`FUMS responded ${res.status}`);
        } catch (err) {
          this.opts.onError?.(err);
        }
      }),
    );
  }

  private hmac(value: string): string {
    // 21 url-safe chars, the same shape as the tracker's own random ids
    return createHmac('sha256', this.opts.secret)
      .update(value)
      .digest('base64url')
      .slice(0, 21);
  }
}

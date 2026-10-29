import type { TFunction } from "i18next";
import { data } from "react-router";

/** Why the API refused a chapter (429 body, PRD #25 API contract). */
export type ReadingLimitReason = "pace" | "daily" | "cooldown";

export interface ReadingLimit {
  reason: ReadingLimitReason;
  retryAfterSeconds: number;
}

const REASONS: readonly ReadingLimitReason[] = ["pace", "daily", "cooldown"];

/** "7 seconds" / "2 minutes" / "1 hour" — always rounded up, never shorter. */
function formatWait(t: TFunction, seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return t("readingLimit.seconds", { count: s });
  if (s < 3600) return t("readingLimit.minutes", { count: Math.ceil(s / 60) });
  return t("readingLimit.hours", { count: Math.ceil(s / 3600) });
}

/** Friendly, localized over-limit message saying how long to wait. */
export function readingLimitMessage(t: TFunction, limit: ReadingLimit): string {
  return t(`readingLimit.${limit.reason}`, { wait: formatWait(t, limit.retryAfterSeconds) });
}

/** Parse a 429 body; fall back to the Retry-After header, then reason pace. */
async function parseLimit(res: Response): Promise<ReadingLimit> {
  const header = Number(res.headers.get("retry-after"));
  const fallback: ReadingLimit = {
    reason: "pace",
    retryAfterSeconds: Number.isFinite(header) && header > 0 ? header : 1,
  };
  try {
    const body = (await res.json()) as Partial<ReadingLimit>;
    return {
      reason: REASONS.includes(body.reason as ReadingLimitReason)
        ? (body.reason as ReadingLimitReason)
        : fallback.reason,
      retryAfterSeconds:
        typeof body.retryAfterSeconds === "number" && body.retryAfterSeconds > 0
          ? body.retryAfterSeconds
          : fallback.retryAfterSeconds,
    };
  } catch {
    return fallback;
  }
}

/**
 * For the chapter loader: a 429 becomes a route error (status 429) carrying
 * the localized wait message, which the error boundary shows instead of the
 * generic load error. No auto-retry — the reader decides when to try again.
 * Any other status → null (not ours).
 */
export async function readingLimitError(res: Response, t: TFunction) {
  if (res.status !== 429) return null;
  return data(readingLimitMessage(t, await parseLimit(res)), { status: 429 });
}

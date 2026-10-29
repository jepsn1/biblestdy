import i18next, { type TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import da from "../locales/da";
import en from "../locales/en";
import { readingLimitError, readingLimitMessage } from "./reading-limit";

/** Reader over-limit UX (#29): a 429 becomes a friendly localized wait message. */
async function tFor(lng: "en" | "da"): Promise<TFunction> {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng,
    resources: { en: { translation: en }, da: { translation: da } },
    interpolation: { escapeValue: false },
  });
  return i18n.t;
}

function limited(body: unknown, retryAfter = "7") {
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": retryAfter },
  });
}

describe("readingLimitMessage", () => {
  it("explains a pace limit with the wait, in English", async () => {
    const t = await tFor("en");
    expect(readingLimitMessage(t, { reason: "pace", retryAfterSeconds: 7 })).toBe(
      "You're turning pages faster than we can serve them. Try again in 7 seconds.",
    );
  });

  it("explains a pace limit with the wait, in Danish", async () => {
    const t = await tFor("da");
    expect(readingLimitMessage(t, { reason: "pace", retryAfterSeconds: 1 })).toBe(
      "Du bladrer hurtigere, end vi kan følge med. Prøv igen om 1 sekund.",
    );
  });

  it("rounds long waits up to minutes and hours", async () => {
    const t = await tFor("en");
    expect(readingLimitMessage(t, { reason: "cooldown", retryAfterSeconds: 61 })).toContain(
      "2 minutes",
    );
    expect(readingLimitMessage(t, { reason: "daily", retryAfterSeconds: 3600 })).toContain(
      "1 hour)",
    );
  });

  it("tells a reader at the daily cap to come back tomorrow", async () => {
    expect(readingLimitMessage(await tFor("en"), { reason: "daily", retryAfterSeconds: 1800 })).toBe(
      "You've reached today's reading limit. Come back tomorrow (in 30 minutes).",
    );
    expect(readingLimitMessage(await tFor("da"), { reason: "daily", retryAfterSeconds: 1800 })).toBe(
      "Du har nået dagens læsegrænse. Kom tilbage i morgen (om 30 minutter).",
    );
  });

  it("explains a cooldown (minutes up to a day) without promising it's short (#32)", async () => {
    expect(readingLimitMessage(await tFor("en"), { reason: "cooldown", retryAfterSeconds: 86400 })).toBe(
      "You've hit the limit, so reading is paused. Try again in 24 hours.",
    );
    expect(readingLimitMessage(await tFor("da"), { reason: "cooldown", retryAfterSeconds: 60 })).toBe(
      "Du har ramt grænsen, så læsningen er sat på pause. Prøv igen om 1 minut.",
    );
  });

  it("has a message for every reason in both languages", async () => {
    for (const lng of ["en", "da"] as const) {
      const t = await tFor(lng);
      const msgs = (["pace", "daily", "cooldown"] as const).map((reason) =>
        readingLimitMessage(t, { reason, retryAfterSeconds: 5 }),
      );
      expect(new Set(msgs).size).toBe(3);
      for (const m of msgs) expect(m).not.toMatch(/readingLimit\./);
    }
  });
});

describe("readingLimitError (chapter loader)", () => {
  it("turns a 429 into a 429 route error carrying the localized message", async () => {
    const t = await tFor("en");
    const err = await readingLimitError(limited({ reason: "pace", retryAfterSeconds: 7 }), t);
    expect(err).toMatchObject({
      init: { status: 429 },
      data: "You're turning pages faster than we can serve them. Try again in 7 seconds.",
    });
  });

  it("falls back to Retry-After when the body is unreadable", async () => {
    const t = await tFor("en");
    const res = new Response("nope", { status: 429, headers: { "retry-after": "30" } });
    const err = await readingLimitError(res, t);
    expect(err?.data).toContain("30 seconds");
  });

  it("ignores other statuses", async () => {
    const t = await tFor("en");
    expect(await readingLimitError(new Response("{}", { status: 502 }), t)).toBeNull();
  });
});

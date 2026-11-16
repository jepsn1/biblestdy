/** Version + channel readout for the settings surface. Plain web today: a
 * build-time constant and the "web" channel. The OTA slice (#19) feeds the
 * real bundle version + channel in the native shell — until then these are
 * the graceful fallbacks. */
export const appVersion: string =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "1.5.0";
export const appChannel: string = "web";

/** Who runs biblestdy: licensee for scripture texts + data controller. A
 * private person, no company (API.Bible's non-commercial terms, §9.3). */
export const operator = { name: "Marcus Jepsen", country: "Denmark", email: "marcus@jepsn.com" } as const;

/** Where the licensed Bible text comes from: cited + linked in the app
 * (API.Bible Starter plan) and on the copyright page. */
export const API_BIBLE_URL = "https://api.bible";

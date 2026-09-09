/** Version + channel readout for the settings surface. Plain web today: a
 * build-time constant and the "web" channel. The OTA slice (#19) feeds the
 * real bundle version + channel in the native shell — until then these are
 * the graceful fallbacks. */
export const appVersion: string =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "1.5.0";
export const appChannel: string = "web";

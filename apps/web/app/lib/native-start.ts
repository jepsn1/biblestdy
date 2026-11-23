/**
 * The shell's start-up, in one chunk loaded only inside Capacitor (from
 * session-transport's sessionReady, which the first render waits for): its
 * keyboard (#273) and over-the-air updates (#19) — which may switch to a
 * downloaded bundle before anything renders. Nothing here is in the web's
 * first paint.
 */
import "./native-shell";
import { appBooted, launch } from "./ota-native";

export const started = launch();

// entry.client's <Booted/> says when the app has rendered
document.addEventListener("biblestdy:booted", appBooted, { once: true });

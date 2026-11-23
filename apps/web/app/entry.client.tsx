import { startTransition, StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { i18nReady } from "~/lib/i18n";
import { sessionReady } from "~/lib/session-transport";

/** Renders nothing; its effect runs once the whole app has committed its
 * first render — in the shell, the OTA updater then keeps this bundle (#19,
 * lib/native-start). */
function Booted() {
  useEffect(() => void document.dispatchEvent(new Event("biblestdy:booted")), []);
  return null;
}

// React Router's default client entry, but hydration waits for the UI
// language's lazy strings (#209) so the first render is already in it — and,
// in the native shell, for the stored session token (#18), so the first
// loader's session check carries it (and for a pending OTA switch, #19).
void Promise.all([i18nReady, sessionReady()]).then(() => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
        <Booted />
      </StrictMode>,
    );
  });
});

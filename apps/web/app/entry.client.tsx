import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { i18nReady } from "~/lib/i18n";

// React Router's default client entry, but hydration waits for the UI
// language's lazy strings (#209) so the first render is already in it.
void i18nReady.then(() => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    );
  });
});

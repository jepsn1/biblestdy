import {
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { apiBase } from "./api-base";
import { authFetchOptions } from "./session-transport";

// Same-origin (/api proxied in dev) on the web; prod origin inside the
// Capacitor shell (see api-base.ts), with a bearer session instead of the
// cookie (session-transport.ts)
export const authClient = createAuthClient({
  baseURL: apiBase || undefined,
  fetchOptions: authFetchOptions(),
  plugins: [
    // Mirrors the server user.additionalFields so session.user is typed
    inferAdditionalFields({
      user: { defaultHighlightColor: { type: "string" } },
    }),
    magicLinkClient(),
    emailOTPClient(),
  ],
});

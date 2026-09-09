import {
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { apiBase } from "./api-base";

// Same-origin (/api proxied in dev) on the web; prod origin inside the
// Capacitor shell (see api-base.ts)
export const authClient = createAuthClient({
  baseURL: apiBase || undefined,
  plugins: [
    // Mirrors the server user.additionalFields so session.user is typed
    inferAdditionalFields({
      user: { defaultHighlightColor: { type: "string" } },
    }),
    magicLinkClient(),
    emailOTPClient(),
  ],
});

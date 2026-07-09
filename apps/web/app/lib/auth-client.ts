import {
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Same-origin (/api proxied in dev), so no baseURL needed
export const authClient = createAuthClient({
  plugins: [
    // Mirrors the server user.additionalFields so session.user is typed
    inferAdditionalFields({
      user: {
        defaultHighlightColor: { type: "string" },
        docPanelSize: { type: "number" },
      },
    }),
    magicLinkClient(),
    emailOTPClient(),
  ],
});

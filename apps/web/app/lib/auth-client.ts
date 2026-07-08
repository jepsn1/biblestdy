import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Same-origin (/api proxied in dev), so no baseURL needed
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

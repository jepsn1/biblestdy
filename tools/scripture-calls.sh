#!/usr/bin/env bash
# Upstream API.Bible calls today / this month (UTC) vs the soft budget, as
# counted by the API's scripture cache (#248). Per database: prod and dev
# count separately but share one key — add both for the key's total.
# Usage:
#   tools/scripture-calls.sh                  # prod container
#   API_PORT=3001 tools/scripture-calls.sh    # dev API on this host
# Same numbers straight from Postgres:
#   SELECT day, source, calls FROM scripture_upstream_call ORDER BY day DESC;
set -euo pipefail
# Same key as purge-scripture-cache.sh (purgeKey() in cache-admin.controller.ts)
JS='
const { createHmac } = require("node:crypto");
const key = createHmac("sha256", process.env.BETTER_AUTH_SECRET)
  .update("scripture-cache-purge").digest("hex");
fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/admin/scripture-cache/stats`, {
  headers: { "x-purge-key": key },
}).then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); });
'
if [[ -n "${API_PORT:-}" ]]; then
  PORT="$API_PORT" node --env-file="$(dirname "$0")/../apps/api/.env" -e "$JS"
else
  docker exec biblestdy-api node -e "$JS"
fi

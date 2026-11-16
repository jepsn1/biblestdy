#!/usr/bin/env bash
# Drop the API's cached Scripture for one translation (or all), so the next
# read refetches it from API.Bible — for a change or removal requested by
# API.Bible or a rights holder (ToS §10/§11: within 24 h / 72 h).
# Usage:
#   tools/purge-scripture-cache.sh [translationId]        # prod container
#   API_PORT=3001 tools/purge-scripture-cache.sh [id]     # dev API on this host
# e.g. tools/purge-scripture-cache.sh 78a9f6124f344018-01   (NIV)
# Ids: GET /api/copyright. No id = every translation. The cache is in memory,
# so a restart (`make deploy`, `docker restart biblestdy-api`) purges all too.
set -euo pipefail
ID="${1:-}"
# Same derivation as purgeKey() in apps/api/src/scripture/cache-admin.controller.ts
JS='
const { createHmac } = require("node:crypto");
const key = createHmac("sha256", process.env.BETTER_AUTH_SECRET)
  .update("scripture-cache-purge").digest("hex");
fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/admin/scripture-cache/purge`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-purge-key": key },
  body: JSON.stringify({ translationId: process.argv[1] || undefined }),
}).then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); });
'
if [[ -n "${API_PORT:-}" ]]; then
  # Dev: secret from apps/api/.env
  PORT="$API_PORT" node --env-file="$(dirname "$0")/../apps/api/.env" -e "$JS" "$ID"
else
  docker exec biblestdy-api node -e "$JS" "$ID"
fi

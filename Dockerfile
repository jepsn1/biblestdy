# API container only — the SPA is built natively and served as static files
# by the infra Caddy (see STACK.md Deploy). Single stage; slim later if size bites.
FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @biblestdy/api --filter @biblestdy/shared

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @biblestdy/shared build && pnpm --filter @biblestdy/api build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

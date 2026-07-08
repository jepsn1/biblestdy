# biblestdy

Private, web-first Bible study app where Scripture and notes are equal first-class entities, connected through a knowledge graph. See [VISION.md](VISION.md) and [STACK.md](STACK.md); v1 PRD is [issue #1](https://github.com/jepsn1/biblestdy/issues/1).

## Layout

- `apps/web` — React Router v8 SPA (`ssr:false`), Vite, Tailwind
- `apps/api` — NestJS API (global prefix `/api`, port 3001)
- `packages/shared` — pure TS shared package (reference/anchor logic lives here)

## Dev

Requires Node ≥22.22 (`nvm use`) and pnpm 10.

```sh
pnpm install
pnpm dev        # builds shared, runs web (5173) + api (3001); /api proxied in dev
pnpm test       # vitest, all packages
pnpm typecheck
pnpm lint
```

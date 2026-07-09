# biblestdy — Tech Stack & Decisions

Decisions for v1 (see `VISION.md` for product, issue #1 for the v1 PRD). Rationale kept terse.

## Architecture

**Monorepo. Decoupled SPA + separate API.** Not Next.js: app is private/auth-gated (no SEO), highly client-side (text-selection → DOM Range → anchor), no MPA surface — Next's SSR/RSC strengths are wasted here. Separate backend also = cleaner home for the Scripture provider (API key + cache) and graph queries, and a stronger non-Next interview talk-track.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React Router v8** (SPA mode, `ssr:false`) + Vite | react.dev-endorsed framework, run static/no-server. Reuses React strength, drops Next magic. (Chose v7 originally; v8 was current at scaffold time.) Requires Node ≥22.22 (`.nvmrc`). |
| i18n | **react-i18next** (Danish + English) | UI locale independent of Scripture translation. |
| Design system | **Tailwind v4 + shadcn (Base UI, nova preset)**, custom tokens | Dark-first: warm charcoal bg, parchment fg, illuminated-gold accent. **Literata** (serif) for Scripture, **Geist** for UI — both self-hosted via fontsource. Tokens in `apps/web/app/app.css`; light theme = later `.light` override. |
| PWA | **vite-plugin-pwa** | Installable, responsive. No offline in v1. |
| Backend | **NestJS** (TypeScript) | New-to-dev structured patterns (DI/modules/guards) = CV signal, still TS → reviewable, shares types. Aligns with deep-module design. |
| Shared pkg | **Pure TS** — Reference module + anchor types | Used by both frontend and backend. |
| DB | **Local Postgres** (shared `infra-postgres` on our own server, see jepsn1/infra) + **Drizzle ORM** | Relational; the "graph" is modest M:N joins (note↔passage, tags), not a graph DB. Self-hosted — no point in Neon when the box runs Postgres locally. Dev: `localhost:5432`, db `biblestdy`. (Was Neon; switched 2026-07-09.) |
| Auth | **Better Auth** (self-hosted, users in local Postgres) | Framework-agnostic TS, built for separate-backend + SPA. Own-your-data + talk-track without from-scratch risk. Rejected: Clerk (declined), Auth.js (Next-centric/off-path), roll-your-own (footgun). |
| Scripture | **API.Bible** behind Scripture-provider interface | API text displayed/cached, not system-of-record. Swappable to self-hosted later. |
| Tests | **Vitest** | Isolated behavior tests: Reference, Anchor, Annotation graph, Connections. |

## Deploy

Self-hosted on our own server behind Caddy — see jepsn1/infra (its AGENTS.md = operating manual). Was Vercel/Neon; switched 2026-07-09. **Dev-only for now**; wiring below happens at pilot time.

- Domain: **biblestdy.com** → server IP; Caddy auto-HTTPS.
- SPA → static build served by Caddy. API → Docker container on shared `web` network. DB → shared local Postgres (`infra-postgres`).
- At deploy time add: `Dockerfile`, `docker-compose.yml` (container `biblestdy`, network `web`, no published ports), `caddy/sites/biblestdy.caddy` in infra (`new-app.sh` generates it).

## Deep modules (testable in isolation)

Reference · Anchor · Annotation graph · Connections service · Scripture provider (via fake).
Integration layers (lighter testing): Auth · i18n · Web UI.

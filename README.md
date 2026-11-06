# Orbit Money

What you can spend today. Deterministic envelopes, a 60-day bank forecast, and one daily allowance.

## Stack

- Next.js App Router + TypeScript + Tailwind
- Neon Postgres (`DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` for migrations)
- Raw SQL + RLS (no ORM)
- TanStack Query, Zod, React Hook Form, Auth.js (Resend magic-link in production)

## Setup

```bash
cp .env.example .env   # or use your Neon credentials
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000/today](http://localhost:3000/today). Locally, with `ALLOW_DEV_HEADER_AUTH=true` and `NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH=true` (both in `.env.example`), the UI sends Harbor seed headers (`Blair` / Harbor tenant) so `/api/v1` returns seeded allowance data.

## Auth

Production sign-in is a Resend magic link: set `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`, `AUTH_SECRET`, and `NEXT_PUBLIC_MAGIC_LINK=true`. Header impersonation (`x-user-id` / `x-tenant-id`) and the email-only Harbor credentials are local-only and rejected in production. Details: [`docs/12-deploy.md`](docs/12-deploy.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local app |
| `npm run test` | Unit tests (cents, waterfall, rate, calendar, catch-up) |
| `npm run test:integration` | Integration tests against the database in `.env` |
| `npm run db:migrate` | Apply SQL migrations (unpooled) |
| `npm run db:seed` | Idempotent Harbor household |
| `npm run typecheck` | `tsc --noEmit` |

## Docs

Architecture and decisions live in [`docs/`](docs/README.md). Implementation plan: [`docs/11-implementation-plan.md`](docs/11-implementation-plan.md).

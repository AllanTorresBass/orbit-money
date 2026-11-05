# Orbit Money

What you can spend today. Deterministic envelopes, a 60-day bank forecast, and one daily allowance.

## Stack

- Next.js App Router + TypeScript + Tailwind
- Neon Postgres (`DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` for migrations)
- Raw SQL + RLS (no ORM)
- TanStack Query, Zod, React Hook Form, Auth.js (scaffolded)

## Setup

```bash
cp .env.example .env   # or use your Neon credentials
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000/today](http://localhost:3000/today). The UI sends Harbor seed headers (`Blair` / Harbor tenant) so `/api/v1` returns seeded allowance data.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local app |
| `npm run test` | Unit tests (cents, waterfall, rate) |
| `npm run db:migrate` | Apply SQL migrations (unpooled) |
| `npm run db:seed` | Idempotent Harbor household |
| `npm run typecheck` | `tsc --noEmit` |

## Docs

Architecture and decisions live in [`docs/`](docs/README.md). Implementation plan: [`docs/11-implementation-plan.md`](docs/11-implementation-plan.md).

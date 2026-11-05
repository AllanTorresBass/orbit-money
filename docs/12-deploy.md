# Deploy (Vercel + Neon)

## Environment

Set these on the Vercel project (Production + Preview):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct / non-pooling string |
| `AUTH_SECRET` | Random string, ≥ 16 characters |
| `CRON_SECRET` | Bearer token for `/api/v1/cron/midnight` |

Do **not** set `ALLOW_DEV_HEADER_AUTH` or `NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH` in production. Header actor switching is local-only.

## Cron

`vercel.json` schedules `GET /api/v1/cron/midnight` at minute 5 of every hour. The handler runs only tenants whose local hour is `0`. Vercel sends `x-vercel-cron`; for manual runs use `Authorization: Bearer $CRON_SECRET`.

## Auth

Sign-in is Auth.js credentials (email → seeded or created user). The `(app)` layout redirects to `/signin` when there is no session (skipped when `ALLOW_DEV_HEADER_AUTH=true` for local Harbor actor switching). API routes resolve the cookie session via `resolveSession()`; request headers cannot impersonate another user once a cookie session exists.

## First deploy checklist

1. `npm run db:migrate` and `npm run db:seed` against the target Neon branch (or run from a one-off machine with unpooled URL). Migration `002_orbit_app_role.sql` creates a `NOBYPASSRLS` role; request transactions `SET LOCAL ROLE orbit_app` so tenant policies enforce even when the connection user is the Neon owner.
2. Confirm `GET /api/v1/health` returns `{ ok: true }`.
3. Sign in as `blair@harbor.test` and open Today.
4. Confirm the midnight cron appears in Vercel → Cron Jobs.

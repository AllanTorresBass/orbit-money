# Deploy (Vercel + Neon)

## Environment

Set these on the Vercel project (Production + Preview):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct / non-pooling string |
| `AUTH_SECRET` | Random string, ≥ 16 characters |
| `CRON_SECRET` | Bearer token for `/api/v1/cron/midnight` |
| `AUTH_RESEND_KEY` / `AUTH_EMAIL_FROM` | Optional. Enables magic-link via Resend |

Do **not** set `ALLOW_DEV_HEADER_AUTH` or `NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH` in production. Header actor switching is local-only. With `ALLOW_DEV_HEADER_AUTH=true`, anyone who can reach the API can send `x-user-id` / `x-tenant-id` and act as that person, so production must leave it unset (`lib/env.ts` rejects `true` when `NODE_ENV=production`).

## Cron

`vercel.json` schedules `GET /api/v1/cron/midnight` at minute 5 of every hour. Tenants are grouped by timezone; only those whose local hour is `0` run. Each tick shares a `cronBatchId` on `pipeline_runs`. Vercel sends `x-vercel-cron`; for manual runs use `Authorization: Bearer $CRON_SECRET`.

## Pipeline observability

Every evaluation writes `pipeline_runs` + `pipeline_steps` (how/when/where/why: step, duration, unfunded, breach, stale, sweep incomplete). Owners/admins can list recent runs with `GET /api/v1/pipeline/runs?asOfDate=YYYY-MM-DD`. Logs still emit the same `pipeline_step` JSON for Vercel.

## Auth

Sign-in supports Auth.js credentials (Harbor emails) and optional Resend magic-link when `AUTH_RESEND_KEY` and `AUTH_EMAIL_FROM` are set. Unknown emails redirect to Create. The `(app)` layout redirects to `/signin` when there is no session (skipped when `ALLOW_DEV_HEADER_AUTH=true` for local Harbor actor switching). Invited-only users go to `/invite`. API routes resolve the cookie session via `resolveSession()`; request headers cannot impersonate another user once a cookie session exists.

## Households

A person can belong to more than one household. The API never picks one for them:

- A cookie session that carries a single active membership uses it.
- With more than one active membership and no explicit tenant (Auth.js session tenant, the `orbit_tenant` cookie set by `POST /api/v1/me/tenant`, or the dev-only `x-tenant-id` header), every `/api/v1/*` route that needs a tenant returns `400` with `code: "tenant_selection_required"` and the list of households. The UI then shows a household picker.
- `POST /api/v1/people/invite/accept` turns an `invited` membership into `active`. Invites stay `invited` until the invited person accepts.

## First deploy checklist

1. `npm run db:migrate` (through `006_pipeline_observability.sql`: forecast stale, cycle sweep status, pipeline runs/steps, indexes) and `npm run db:seed` against the target Neon branch. Migration `002_orbit_app_role.sql` creates a `NOBYPASSRLS` role; request transactions `SET LOCAL ROLE orbit_app` so tenant policies enforce even when the connection user is the Neon owner.
2. Confirm `GET /api/v1/health` returns `{ ok: true }`.
3. Sign in as `blair@harbor.test` and open Today.
4. Confirm the midnight cron appears in Vercel → Cron Jobs.

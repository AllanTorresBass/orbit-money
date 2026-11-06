# Deploy (Vercel + Neon)

## Environment

Set these on the Vercel project (Production + Preview):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct / non-pooling string |
| `AUTH_SECRET` | Random string, ≥ 16 characters |
| `CRON_SECRET` | Required (≥ 8 chars; ≥ 16 in production). Only `Authorization: Bearer $CRON_SECRET` authorizes `/api/v1/cron/midnight`. Vercel injects this header when the env var is set. |
| `AUTH_RESEND_KEY` / `AUTH_EMAIL_FROM` | Required for production sign-in. Registers the Resend magic-link provider (needs migration `007`) |
| `APP_URL` | Optional public origin (`https://app.example.com`). Makes invite links absolute in the invite email and the People screen hint. Without it the hint is the path `/invite` |
| `NEXT_PUBLIC_MAGIC_LINK` | Set to `true` **only** when both Resend keys exist. Shows "Email me a link" on `/signin`. `lib/env.ts` rejects `true` without the keys |

Do **not** set `ALLOW_DEV_HEADER_AUTH` or `NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH` in production. Those flags also register the email-only credentials provider for Harbor demos. Header actor switching is local-only. With `ALLOW_DEV_HEADER_AUTH=true`, anyone who can reach the API can send `x-user-id` / `x-tenant-id` and act as that person, so production must leave it unset (`lib/env.ts` rejects `true` when `NODE_ENV=production`).

## Migrations before code

**Run `npm run db:migrate` through `009_auth_rate_limits.sql` before deploying Phase 9 code.** The new code writes `pipeline_runs.error_message`, filters `envelopes.archived_at`, and counts magic-link requests in `auth_rate_limits`; against an older schema those queries fail. Migrations are additive (`IF NOT EXISTS`), so applying `009` ahead of the deploy is safe for the previous release.

## Cron

`vercel.json` schedules `GET /api/v1/cron/midnight` at minute 5 of every hour. Tenants are grouped by timezone; only those whose local hour is `0` run. The same tick also **catches up** tenants whose `allowance_snapshots.as_of_date` is before their local today, or that have no snapshot (at most 50 per tick, never-published first, then oldest), so a missed hour-0 tick heals within the hour. The batch row records `meta.catchUp` and `meta.catchUpCount` (and `meta.forceAll` for `?all=1`). The route sets `maxDuration = 60`, and closes `cron_batches` still unfinished after 2 hours (`meta.abandoned`) at the start and end of each tick. Today shows "Numbers are from an earlier day. They will refresh overnight." while a snapshot is behind. Each tick writes a `cron_batches` row and shares a `cronBatchId` on `pipeline_runs`. Authorization is **Bearer only** — the `x-vercel-cron` header is logged but never sufficient alone. Manual runs: `Authorization: Bearer $CRON_SECRET`. Query `?all=1` also requires the same bearer.

## Pipeline observability

Every evaluation writes `pipeline_runs` + `pipeline_steps` (how/when/where/why: step, duration, unfunded, breach, stale, sweep incomplete, reason_code, cash_cents, actor). Owners/admins can list recent runs with `GET /api/v1/pipeline/runs?asOfDate=YYYY-MM-DD` (add `includeSteps=1` for step rows) and read one run with `GET /api/v1/pipeline/runs/[id]`. You → Activity shows the latest runs. A thrown error finishes the run as `error` with an `error_code` and a truncated (256 character) `error_message`; abandoned runs get one too. `finished_at` is stamped with `clock_timestamp()` on its own connection after the money callback returns, so a run's duration includes the commit. Activity's latest overnight pass is the newest batch that ran a midnight evaluation for the viewer's own household. Runs start on a short connection before the money transaction so abandoned `running` rows are visible. The midnight cron deletes runs (steps cascade) older than 90 days and runs due tenants four at a time. Logs still emit the same `pipeline_step` JSON for Vercel.

## Auth

Production sign-in is Resend magic-link only (when keys are set). Email-only credentials exist solely when `ALLOW_DEV_HEADER_AUTH=true` (local Harbor). Magic-link stores one-time tokens in `verification_token` through `@auth/pg-adapter` (migration `007`). An unknown email gets a `users` row with no membership, then a link; after confirm they land on Create. `POST /api/v1/tenants` requires a signed-in session whose email matches `ownerEmail` (local Harbor may bootstrap without a session when header auth is on). Create uses that email as the owner. The `(app)` layout redirects to `/signin` when there is no session (skipped when `ALLOW_DEV_HEADER_AUTH=true`). Invited-only users go to `/invite`. API routes resolve the cookie session via `resolveSession()`; request headers cannot impersonate another user once a cookie session exists.

## Continuity (no bank feed yet)

Owners and admins can `POST /api/v1/transactions/inflow` (Record payday) and `POST /api/v1/transactions/outflow` (Mark bill paid) with idempotency keys. These settle through the six-step pipeline and advance matching schedules. Until a bank-feed vendor is chosen, this is how cycles continue after Create.

## Invites and abuse guards

`POST /api/v1/people/invite` always returns `inviteHint` (an absolute URL when `APP_URL` is set, otherwise `/invite`) and `emailed`. When `AUTH_RESEND_KEY` and `AUTH_EMAIL_FROM` are set the invitee is also emailed that link; a failed send never fails the invite. Magic-link requests are limited to 5 per email per 15 minutes (`auth_rate_limits`, fixed window, address stored hashed); a request over the limit is refused before a `users` row is created or any mail is sent, and a failure of the limiter itself also refuses (fail closed). The midnight cron prunes counters older than a day.

## Households

A person can belong to more than one household. The API never picks one for them:

- A cookie session that carries a single active membership uses it.
- The `orbit_tenant` cookie beats the `tenantId` pinned in the Auth.js token at sign-in (the token is never re-minted after a switch). A cookie naming a household the person has left falls back to the token's tenant.
- With more than one active membership and no explicit tenant (Auth.js session tenant, the `orbit_tenant` cookie set by `POST /api/v1/me/tenant`, or the dev-only `x-tenant-id` header), every `/api/v1/*` route that needs a tenant returns `400` with `code: "tenant_selection_required"` and the list of households. The UI then shows a household picker.
- `POST /api/v1/people/invite/accept` turns an `invited` membership into `active`. Invites stay `invited` until the invited person accepts.

## First deploy checklist

1. `npm run db:migrate` (through `009_auth_rate_limits.sql`) and `npm run db:seed` against the target Neon branch. Migration `002_orbit_app_role.sql` creates a `NOBYPASSRLS` role; request transactions `SET LOCAL ROLE orbit_app` so tenant policies enforce even when the connection user is the Neon owner.
2. Confirm `GET /api/v1/health` returns `{ ok: true }`.
3. Confirm `CRON_SECRET` is set on Vercel so cron requests carry the Bearer header.
4. Sign in via magic-link (or local Harbor credentials when header auth is on) and open Today.
5. Confirm the midnight cron appears in Vercel → Cron Jobs.

# Engineering rules

How code in this repository is structured, typed, and reviewed. The short form lives in [`.cursor/rules/`](../.cursor/rules/) and is what an assistant loads during a change. This page is the same rules written so a person can follow them.

Two sets sit side by side.

| Set | Files | Job |
| --- | --- | --- |
| General | `general-standards`, `general-architecture`, `general-frontend`, `general-backend`, `general-review` | Portable defaults for any feature. |
| Orbit | `project-standards`, `domain-invariants`, `layered-architecture`, `frontend`, `backend`, `code-review` | Paths, money, tenancy, and screen language for this product. |

An Orbit rule wins when it names a path, a store, or a domain invariant. Read [Decisions](00-decisions.md) before changing allocation, the forecast, or today's allowance. Rejected alternatives in that file stay rejected.

## When a rule is in force

| Rule | In force |
| --- | --- |
| `general-standards`, `project-standards`, `domain-invariants` | Every session. |
| `general-architecture`, `layered-architecture` | Any `*.ts` or `*.tsx` file. |
| `general-frontend`, `frontend` | Any `*.tsx` file. |
| `general-backend`, `backend` | API routes, services, and SQL. |
| `general-review`, `code-review` | Before a change is treated as done. |

## Priority

| Priority | Merge |
| --- | --- |
| P0 | Blocked. Fix before merge. |
| P1 | Fix in the same change when the file was touched. |
| P2 | Naming, polish, or non-blocking docs. Does not block. |

P0 is `any`, `console.*`, a screen calling the network or SQL, a secret in the repo, unvalidated input, or SQL built by concatenating strings.

P1 is duplicated logic, an entity type declared outside `types/`, or a missing loading, empty, or error state.

## General standards

`any` is a P0 violation. Use `unknown` and a type guard. Catch blocks are `catch (error: unknown)`. Dictionaries are `Record<string, unknown>`.

- Every component exports a props interface. Include `className?` and merge it with `cn()`.
- Shared types and Zod schemas live in `types/[feature]/`. Infer form types with `z.infer<typeof schema>`. Do not declare entity types inside components, hooks, or services.
- Shared UI is generic and lives in `components/shared/` or `components/common/`. A second copy of date, error, or list logic goes to `lib/utils/` first.
- Log with the project logger. Do not call `console.*`.
- Every create, update, and delete tells the user it succeeded or failed.
- Layouts work at 360px with no horizontal scroll.
- New environment variables go in `.env.example` and are validated at startup.

## General architecture

Dependency direction is one way. A lower layer never imports a component, a hook, or a screen.

| Layer | Does | Must not |
| --- | --- | --- |
| Screen | Compose the route. Own route loading and error. | Call `fetch` or the database. |
| Component | Render props. Handle input. | Hold business rules or global server state. |
| Hook | Orchestrate queries, mutations, and UI state. | Build SQL or HTTP details. |
| Service | Business rules. Depend on interfaces. | Import UI. |
| Infrastructure | API, database, files. | Contain product rules. |

The portable default resolves services from a container. This repository overrides that: services extend `BaseService` and are exported from `lib/services/index.ts`. Do not call `new FeatureService()` from a screen, component, or hook in either case.

A feature keeps its components, hooks, and helpers private. Another feature imports that feature's service, or the shared layer, not an internal file.

One module has one reason to change. Extend with configuration and interfaces. A mock satisfies the same contract as production. Prefer a small interface over one that forces unused methods. Split a file that fetches, validates, and renders.

## General frontend

Pick state in this order:

1. Server data uses TanStack Query.
2. Shared persistent preferences use the project store.
3. State shared inside one feature uses React Context.
4. Inputs, toggles, and other local UI use `useState`.

Order in a component file: imports, exported props interface, hooks, early returns for loading, error, and empty, then the main render. A screen composes. It does not fetch inside `useEffect`.

A loading skeleton matches the final layout. Wrap a chart or a dense table in an error boundary. Images use the framework image component. Lists that can grow are paginated. Effects, timers, and listeners clean up.

Forms use React Hook Form, `zodResolver`, and the shared form fields. Schemas stay in `types/[feature]/`. Query keys come from one module, shaped `all` → `lists` → `details`. A mutation invalidates those keys on success and surfaces the error to the user.

Icon-only buttons have an accessible name. Keyboard use works.

```tsx
// The screen owns the request. Move this into a hook that calls the service.
useEffect(() => { fetch("/api/items").then((r) => r.json()).then(setItems); }, []);

const { data, isLoading, error } = useItems();
```

## General backend

Validate every request body and query with Zod before any write. Check authentication and the caller's permission before the query. Do not trust a role sent by the client.

Data access stays in the infrastructure layer. Parameterize every query (`$1`, `$2`, or the driver's bound parameters). Wrap `JSON.parse` in try/catch. Prefer a soft delete or a suspended status once rows are referenced.

Return `201` on create, `400` when validation fails, `401` or `403` when auth fails, `404` when the row is missing, and `{ error: string }` on failure. Do not leak internals. A write that must succeed or fail together uses a transaction. Rate-limit public endpoints. Do not log secrets, tokens, or raw personal data. Lists are paginated.

```ts
const validated = schema.parse(body);
await assertCan(session, "items:write");
const row = await db.query("INSERT INTO items (name) VALUES ($1) RETURNING *", [validated.name]);
return NextResponse.json(row, { status: 201 });
```

## Orbit project standards

These names replace the portable ones in this repository.

- The logger is `logger` from `@/lib/logger`.
- Success and failure go through `useGlobalErrorHandler`. Route caught errors through `handleCrudError` or `handleFetchError`.
- Shared tables, dialogs, and forms live in `components/shared/`.
- Breakpoints are Tailwind `sm`, `md`, and `lg`.
- Money formatting and other duplicated parsing go to `lib/utils/` before a second copy.

## Orbit domain invariants

- Store money as `NUMERIC(12, 2)`. Compute in integer cents. Never use binary floating point.
- One `discretionary` envelope per tenant. The database pairs rollover to tier: `fixed` / `top_up`, `sinking` / `accumulate`, `discretionary` / `reset_sweep`. `(tenant_id, tier_category, priority_order)` is unique.
- An inflow assigns every cent. Allocations are `>= 0`. Nothing is left unassigned.
- Envelope balances and bank balances stay separate. Safe-to-spend and the 60-day projection are written only by the six-step pipeline in [Daily evaluation](08-daily-evaluation-pipeline.md). Do not reorder those steps.
- Fixed and sinking envelopes stop at zero. The unpaid remainder reduces discretionary and is its own allocation row. `S_today` may go negative without an alert. A negative discretionary balance is an alert, and the next rate is zero until an inflow covers it.
- Floor the daily rate. Give leftover cents back as today's remainder. `N_p` is `[today, next inflow)`. Publish no rate when there is no future inflow.
- A breach cuts only the discretionary burn, at most twice, using decision D14. Do not reduce a bill or a goal to cover it.
- Settle a transaction once. The ledger insert, the balance updates, and envelope settlement commit together. Retries reuse `(tenant_id, idempotency_key)`. One `cycle_sweeps` row exists per tenant per cycle-end date.
- Dates use `tenants.timezone`, an IANA name. `booked_date` is that local date. The midnight batch runs per timezone.

```ts
const daily = Math.floor(spendableCents / days);
const remainder = spendableCents - days * daily;
```

## Orbit layers and paths

Build a feature in this order. Do not skip a layer.

1. Zod schema and types in `types/[feature]/`.
2. Service extending `BaseService`, exported from `lib/services/index.ts`.
3. Route at `app/api/v1/[feature]/route.ts` with Zod and parameterized SQL.
4. Hook in `hooks/use-[feature].ts` using TanStack Query. The hook calls the service.
5. Components in `components/[feature]/`, then the screen in `app/[feature]/page.tsx`.

| Layer | Path | May do |
| --- | --- | --- |
| Screen | `app/[feature]/page.tsx` | Server Component. Initial fetch. Route loading and error. |
| Component | `components/[feature]/` | Render props. Handle input. |
| Hook | `hooks/use-[feature].ts` | Query, mutation, cache updates. |
| Service | `lib/services/[feature]/` | Orchestrate the API. Extend `BaseService`. |
| Endpoint | `app/api/v1/` | Validate, authorize, run SQL. |
| Data | `lib/db/connection.ts` | Pool and parameterized queries. |

A higher layer may call the next one down. Cross-feature data comes from the other feature's service, not its hook. Query keys live in `lib/query-keys.ts`. There is no ORM.

## Orbit screen

Server data uses TanStack Query. A household switch or theme uses React Context. Form fields and open or closed panels use `useState`. Forms use shadcn `FormField`. Mutations report errors through `useGlobalErrorHandler`. Images use `next/image`. `loading.tsx` mirrors the screen.

Screen copy follows [Orbit interface](ui/README.md).

| Person sees | Engine term |
| --- | --- |
| You can spend | `S_today` |
| Bills | Fixed envelopes |
| Goals | Sinking envelopes |
| Spending | The one discretionary pool |
| Payday | Next normalized inflow |
| Keep at least | `liquidity_floor` |

The screen never says envelope, waterfall, tier, solvency, discretionary, tenant, or safe-to-spend. One idea per screen. One filled button. Hide an action the role cannot perform. The hero amount always shows cents. Other amounts drop `.00`. Dates read "Nov 18".

Paper is `#F4F1EA` and ink is `#1C1917`. Green is only the hero number when today is inside its pace. The filled button stays ink. The layout is one centered column at every width.

## Orbit backend

On every ledger request, before the first query, on the same connection:

1. Authenticate the user.
2. Require an explicit tenant id when the user has more than one membership.
3. Load `tenant_memberships` and require `status = 'active'`.
4. Set `app.current_tenant_id` and `app.current_user_id` with `set_config(..., true)` so the setting dies with the transaction.
5. If either value is missing, run no ledger query.

Row-level security is enabled and forced on every state-bearing table. The application role does not bypass it. Envelope overrides (`full`, `spend_only`, `hidden`) can narrow a role and cannot widen it. Advisors and read-only users do not log spending. Members propose envelope changes. They do not apply them.

Do not delete an envelope that still has transactions. Use `withTransaction()` for a post. `liquidity_floor` stays `0.00` until the owner sets it. Roles and isolation are specified in [Multi-tenancy](06-multi-tenancy.md) and [RBAC](07-rbac.md).

```ts
const validated = schema.parse(body);
const result = await db.query(
  "INSERT INTO transactions (tenant_id, amount, idempotency_key) VALUES ($1, $2, $3) RETURNING *",
  [tenantId, validated.amount, validated.idempotencyKey],
);
```

## Review before the change is done

```bash
rg "console\." --glob "*.ts" --glob "*.tsx" -g "!node_modules" -g "!.next"
rg ":\s*any\b|as any" --glob "*.ts" --glob "*.tsx" -g "!node_modules" -g "!.next"
```

P0 for this repository, in addition to the general list:

- Services used from UI come from `lib/services/index.ts`.
- Logs and client bundles contain no bank tokens or raw payee data.
- A ledger write checks the role, sets the tenant session, then commits once.

P1 for this repository, in addition to the general list:

- Query keys come from `lib/query-keys.ts`.
- Screen strings match [Orbit interface](ui/README.md).
- Money in an allocation formula is integer cents or `NUMERIC(12, 2)`.

Then typecheck, lint, and run the tests that cover the change.

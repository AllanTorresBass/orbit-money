# Module 5 — Relational Data Architecture

Section 5 of the specification. PostgreSQL is the system of record. This module defines the tables the engines read and write. It does not allocate money or compute the forecast.

## Purpose

Keep four ideas in different tables:

- physical accounts
- logical envelopes
- recurring schedules
- ledger entries (transactions)

Tenancy columns are required by module 6 even though the core `CREATE TABLE` block in the specification does not print `tenant_id`. Add `tenant_id` on every state-bearing table. The specification says each of those entities holds an indexed foreign key to `tenants(id)`.

Money columns are `NUMERIC(12, 2)`. Do not use floating point.

## Step 1 — Create `accounts`

Physical bank accounts.

```sql
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(100) NOT NULL,
  current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

`tenant_id` is the tenancy amendment. The other columns match the specification.

1. `current_balance` changes only when a transaction posts or the ledger sync refreshes the bank figure.
2. Set `updated_at` on every balance change.
3. Deleting an account is a physical-world action. Transactions and schedules reference it with `ON DELETE CASCADE` in the specification. Prefer suspending an account over deleting it once transactions exist. If you honor cascade, deleting an account removes its transactions and schedules.

## Step 2 — Create `envelopes`

Virtual compartments.

```sql
CREATE TABLE envelopes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  name                 VARCHAR(100) NOT NULL,
  tier_category        VARCHAR(20) NOT NULL
                         CHECK (tier_category IN ('fixed', 'sinking', 'discretionary')),
  priority_order       INT NOT NULL,
  current_balance      NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  target_cap           NUMERIC(12, 2) NULL,
  monthly_installment  NUMERIC(12, 2) NULL,
  rollover_policy      VARCHAR(20) NOT NULL
                         CHECK (rollover_policy IN ('accumulate', 'top_up', 'reset_sweep')),
  sweep_envelope_id    UUID NULL REFERENCES envelopes(id),
  CONSTRAINT envelopes_rollover_matches_tier CHECK (
    (tier_category = 'fixed' AND rollover_policy = 'top_up') OR
    (tier_category = 'sinking' AND rollover_policy = 'accumulate') OR
    (tier_category = 'discretionary' AND rollover_policy = 'reset_sweep')
  ),
  UNIQUE (tenant_id, tier_category, priority_order)
);

CREATE UNIQUE INDEX envelopes_one_discretionary
  ON envelopes (tenant_id)
  WHERE tier_category = 'discretionary';
```

How the waterfall reads these columns:

| Column | Used by |
| --- | --- |
| `tier_category` | Chooses tier 1, 2, or 3. |
| `priority_order` | Orders envelopes inside a tier. |
| `current_balance` | `B_j`. Tier 1 funds `DueAmount − balance`. Deficits subtract here. |
| `target_cap` | Sinking cap. Null means no cap. |
| `monthly_installment` | Sinking installment. Null means assign nothing in tier 2. |
| `rollover_policy` | Cycle-boundary behavior in module 2. |
| `sweep_envelope_id` | First sinking fund in the cycle-end sweep. Tenant setup points this at the emergency envelope. |

Recommended pairing, consistent with the policies in the specification:

| Tier | Rollover |
| --- | --- |
| `fixed` | `top_up` |
| `sinking` | `accumulate` |
| `discretionary` | `reset_sweep` |

The check constraint rejects a fixed envelope with a sinking rollover, and the partial unique index rejects a second discretionary envelope.

## Step 3 — Create `scheduled_schedules`

The specification uses this table name. It holds recurrence rules for income and for fixed debits.

```sql
CREATE TABLE scheduled_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  envelope_id       UUID REFERENCES envelopes(id) ON DELETE SET NULL,
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title             VARCHAR(120) NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL,
  direction         VARCHAR(10) NOT NULL
                      CHECK (direction IN ('inflow', 'outflow')),
  recurrence_rrule  VARCHAR(100) NOT NULL,
  next_due_date     DATE NOT NULL,
  is_active         BOOLEAN DEFAULT TRUE
);
```

1. `direction = 'inflow'` feeds `I(τ)` and can start a pay cycle.
2. `direction = 'outflow'` feeds `O_sched(τ)` and the fixed due amount.
3. `ON DELETE SET NULL` on `envelope_id` means a deleted envelope does not delete the schedule. The next forecast treats a null envelope outflow as unfunded (module 4).
4. `account_id` is required. The aggregate forecast still sums across accounts.
5. After an occurrence is booked or a projection shifts the anchor, persist the new `next_due_date` so the next run does not replay old dates.

Index `(tenant_id, is_active, next_due_date)` for the midnight expansion.

## Step 4 — Create `transactions`

The ledger of what actually posted.

```sql
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  envelope_id  UUID REFERENCES envelopes(id) ON DELETE RESTRICT,
  amount          NUMERIC(12, 2) NOT NULL,
  booked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  booked_date     DATE NOT NULL,
  memo            TEXT,
  settled_at      TIMESTAMPTZ NULL,
  idempotency_key TEXT NOT NULL,
  external_id     TEXT NULL,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, external_id)
);
```

1. `ON DELETE RESTRICT` on `envelope_id` means you cannot delete an envelope that still has transactions. Hide it or archive it instead.
2. `amount` is signed: positive inflow, negative outflow. The waterfall receives the positive value. Safe-to-spend sums the absolute value of negative discretionary amounts into `E_disc_actual`.
3. `booked_at` is the instant. `booked_date` is that instant's date in `tenants.timezone`.
4. `memo` is free text. It is not a category.
5. `settled_at` is null until module 8 finishes envelope settlement. Midnight skips a row that already has it.
6. A retried client request repeats `idempotency_key` and gets the original row back. `external_id` is the bank's id when a feed imported the row. PostgreSQL treats nulls as distinct, so many manual transactions can leave `external_id` empty.

A transaction insert is the synchronous trigger for the pipeline in module 8.

## Step 5 — Add the indexes the engines need

The specification requires an index on each `tenant_id` foreign key. Also index:

- `envelopes (tenant_id, tier_category, priority_order)` for the waterfall scan
- `transactions (tenant_id, booked_date)` for today's discretionary sum
- `transactions (account_id)` and `transactions (envelope_id)` for ledger sync and restrict checks
- `tenant_memberships (tenant_id, user_id)` is already unique (module 6)

## Step 6 — Write balances in the same transaction as the ledger row

When a transaction is recorded:

1. Insert the `transactions` row.
2. Update `accounts.current_balance` and `accounts.updated_at`.
3. Update `envelopes.current_balance` according to settlement.
4. Commit once.

Readers should not observe a transaction whose account balance was not updated. Derived forecast rows are written after that commit, by the pipeline, and may be replaced.

## Step 7 — Add the supporting tables

The PDF does not print these. The procedures need somewhere to write allocations, the published rate, the timeline, proposals, and cycle sweeps. Do not hide that data in `memo` or `name`.

```sql
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(254) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  envelope_id    UUID NOT NULL REFERENCES envelopes(id),
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  UNIQUE (transaction_id, envelope_id)
);

CREATE TABLE allowance_snapshots (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  as_of_date  DATE NOT NULL,
  s_daily     NUMERIC(12, 2) NOT NULL,
  s_today     NUMERIC(12, 2) NOT NULL,
  n_p         INT NOT NULL CHECK (n_p >= 1),
  o_unfunded  NUMERIC(12, 2) NOT NULL,
  mitigated   BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE forecast_days (
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_offset         INT NOT NULL CHECK (day_offset BETWEEN 0 AND 60),
  forecast_date      DATE NOT NULL,
  balance            NUMERIC(12, 2) NOT NULL,
  inflow             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  scheduled_outflow  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  assumed_burn       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status             VARCHAR(10) NOT NULL CHECK (status IN ('ok', 'warning', 'breach')),
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, day_offset)
);

CREATE TABLE envelope_proposals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  envelope_id  UUID NULL REFERENCES envelopes(id),
  proposed_by  UUID NOT NULL REFERENCES users(id),
  payload      JSONB NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected')),
  resolved_by  UUID NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ NULL
);

CREATE TABLE cycle_sweeps (
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  cycle_end_date          DATE NOT NULL,
  amount                  NUMERIC(12, 2) NOT NULL,
  destination_envelope_id UUID NOT NULL REFERENCES envelopes(id),
  PRIMARY KEY (tenant_id, cycle_end_date)
);
```

`envelope_id` null on a proposal means "create an envelope." `payload` holds the proposed column values. Accepting a proposal is an owner or admin action and then reruns the pipeline.

Also add to `tenants`, owned by module 6: `timezone TEXT NOT NULL DEFAULT 'UTC'` and `liquidity_floor NUMERIC(12, 2) NOT NULL DEFAULT 0.00`.

## Deletion map

| If you delete… | Specified effect |
| --- | --- |
| `accounts` row | Cascades to schedules and transactions that point at it. |
| `envelopes` row | Schedules keep the row and null the envelope. Transactions block the delete. |
| `tenants` row | Memberships cascade (module 6). Define the same cascade or restrict for accounts and envelopes when you add `tenant_id`. Restrict is the safer default so a tenant delete cannot wipe a ledger by accident. |

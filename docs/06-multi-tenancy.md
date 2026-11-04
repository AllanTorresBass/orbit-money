# Module 6 — Multi-Tenancy and Data Isolation

Section 6 of the specification. One PostgreSQL database, one shared schema, many tenants. Isolation is row-level security plus session variables set by the authentication middleware.

## Purpose

Support, in the same database:

- a solo user
- a couple sharing a household
- a larger household
- a financial-advisor relationship

A query must not be able to read another tenant's accounts, envelopes, schedules, or transactions because a `WHERE` clause was forgotten.

## Tenancy model

| Choice in the specification | What to implement |
| --- | --- |
| Pooled single database | One database for all tenants. |
| Shared schema | The tables in modules 5 and 6. No schema-per-tenant. |
| Row-level security | PostgreSQL RLS on every state-bearing table. |
| Tenant key | `tenant_id UUID NOT NULL REFERENCES tenants(id)`, indexed. |

`tenant_type` is one of `individual`, `household`, `organization`. It labels the tenant. It does not select a different schema.

## Step 1 — Create `tenants`

```sql
CREATE TABLE tenants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL,
  tenant_type    VARCHAR(20) NOT NULL
                   CHECK (tenant_type IN ('individual', 'household', 'organization')),
  base_currency   CHAR(3) NOT NULL DEFAULT 'USD',
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  holiday_region  TEXT NOT NULL DEFAULT 'US',
  liquidity_floor NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

1. Money in modules 2 through 4 is denominated in `base_currency`.
2. The specification does not define conversion between currencies. Do not mix currencies inside one tenant.
3. `timezone` is an IANA name captured at signup. It selects the local date and the midnight batch. `UTC` is stored only when the client sends no zone. `holiday_region` selects the holiday calendar for the business-day shift. `liquidity_floor` is `C_min` and stays `0.00` until the owner sets it.
4. Create the tenant row before any account or envelope.

## Step 2 — Create `tenant_memberships`

```sql
CREATE TABLE tenant_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL
                CHECK (role IN ('owner', 'admin', 'member', 'read_only', 'advisor')),
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('invited', 'active', 'suspended')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);
```

1. A person can belong to more than one tenant. The unique key is the pair, not `user_id` alone.
2. Only `status = 'active'` may pass the middleware. `invited` has not accepted. `suspended` keeps the row and blocks access.
3. Role values are the five profiles in module 7. The database spellings are `read_only` and `advisor`.

## Step 3 — Create envelope visibility overrides

Role checks are coarse. A household may also hide one envelope from one person.

```sql
CREATE TABLE envelope_access_overrides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  envelope_id      UUID NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_level VARCHAR(20) NOT NULL
                     CHECK (permission_level IN ('full', 'spend_only', 'hidden')),
  UNIQUE (envelope_id, user_id)
);
```

`tenant_id` is added so RLS can filter this table the same way as the others.

| `permission_level` | Behavior |
| --- | --- |
| `full` | The membership role applies with no extra restriction on this envelope. |
| `spend_only` | The user may post discretionary spend against this envelope if their role already allows spending. They do not reconfigure it. |
| `hidden` | The envelope is omitted from lists, forecasts-by-envelope, and spend targets for this user. |

Absence of a row means no override. The membership role alone applies.

Overrides do not grant a capability the role denies. An advisor with `spend_only` still cannot log spend, because module 7 denies advisors that action. A member with `hidden` cannot see that envelope even though members may otherwise spend.

## Step 4 — Set session context in the authentication middleware

Every request that touches ledger data does this before the first query, on the same database session:

1. Authenticate the user.
2. Resolve which tenant they are acting in. A user with multiple memberships must send an explicit tenant id. Do not silently pick one.
3. Load the membership. Require `status = 'active'`.
4. Set the PostgreSQL session variables the specification names:

```sql
SELECT set_config('app.current_tenant_id', :tenant_id, true);
SELECT set_config('app.current_user_id', :user_id, true);
```

The third argument `true` makes the setting local to the transaction, so a pooled connection cannot leak context to the next request.

5. If either value is missing, run no ledger query. Return an authorization failure.

## Step 5 — Enable row-level security

For each state-bearing table (`accounts`, `envelopes`, `scheduled_schedules`, `transactions`, `tenant_memberships`, `envelope_access_overrides`, and any forecast table you add):

1. `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.
2. Force it for the table owner as well, so an application role cannot bypass it: `ALTER TABLE … FORCE ROW LEVEL SECURITY`.
3. Add a policy that allows access only when `tenant_id` equals the session tenant:

```sql
CREATE POLICY tenant_isolation ON accounts
  USING (tenant_id = current_setting('app.current_tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', false)::uuid);
```

Repeat that pattern per table. `USING` filters reads and updates. `WITH CHECK` rejects inserts and updates that would place a row in another tenant.

The specification requires this enforcement inside the database engine. Repeating `WHERE tenant_id = $1` in the application is useful and not sufficient.

`tenants` itself is filtered by membership: a user may see a tenant row only when an active membership links `app.current_user_id` to that tenant.

## Step 6 — Apply envelope overrides when reading

RLS gets the query into the right tenant. Overrides are a second filter for the current user:

1. After the tenant policy, exclude envelopes that have an override of `hidden` for `app.current_user_id`.
2. Apply the same exclusion to transactions and schedules joined to a hidden envelope when the result would reveal that envelope's name, balance, or amounts.
3. Aggregate bank figures (`C(τ)`, account balances) stay visible to roles that may inspect the timeline. Hiding an envelope hides the virtual bucket, not the physical account. Document that to household users: a hidden envelope does not hide cash that is in a shared bank account.

## Step 7 — Create a tenant from scratch

1. Insert `tenants`.
2. Insert the creating user.
3. Insert `tenant_memberships` with `role = 'owner'` and `status = 'active'`.
4. Insert at least one `accounts` row and one discretionary `envelopes` row before the first income event. The waterfall cannot place a residual without a discretionary envelope.
5. Only then accept transactions.

## Edge cases

| Situation | Required behavior |
| --- | --- |
| Connection returned to the pool | Context was transaction-local, so it is gone. The next request must set it again. |
| User passes another tenant's id | Membership lookup fails. Do not set `app.current_tenant_id` to a tenant they do not belong to. |
| Advisor in two households | Each request names one tenant. Forecasts and envelopes never span both. |
| `hidden` plus a transaction post by id | Reject the post if the target envelope is hidden or is not in the tenant. Do not rely on the list view being filtered. |
| Cross-tenant foreign key | `WITH CHECK` on `tenant_id` stops the insert. Also check that `account_id` and `envelope_id` belong to the same tenant so a row cannot point at another tenant's account while carrying this tenant's id. |

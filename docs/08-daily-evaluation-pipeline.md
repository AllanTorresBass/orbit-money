# Module 8 — Daily Evaluation and Execution Pipeline

Section 8 of the specification. This is the state machine that runs the other modules in a fixed order.

It runs in two situations:

- **Synchronously**, when a transaction is recorded.
- **As a batch**, every midnight.

Both paths execute the same six steps. The midnight run does it for every active tenant. The synchronous run does it for the tenant that owns the new transaction.

## The six steps

```text
1. Tenant context initialization
2. Ledger synchronization
3. Envelope settlement
4. Forward simulation
5. Solvency check
6. Safe-to-spend calibration
```

Do not reorder them. Simulation needs settled envelopes and a fresh bank balance. The published safe-to-spend number is the calibration at the end, after the solvency check has had a chance to tighten the ceiling.

`S_daily` is an input to the forecast, and the specification also lists calibration last. Resolve that as follows.

- Midnight, and any inflow, recalculate `S_daily` before the projection. Today's opening allowance is that rate plus the leftover cents.
- A discretionary purchase updates `S_today` from that opening allowance. While `S_today` stays at or above zero, later days keep burning `S_daily`. Once `S_today` goes negative, later days burn `floor_cents(B_disc / days after today)`. The purchase is already in `C(0)`, so those later days must burn what is left, not the old pace.
- A floor breach lowers the future burn by the closed-form cut in step 5, projects once more, and publishes that rate.

## Step 1 — Tenant context initialization

Establish the security context before any ledger write or read.

**Synchronous trigger**

1. The request already authenticated the user.
2. Confirm module 7 allows this specific write (usually "log discretionary spend").
3. Set `app.current_tenant_id` and `app.current_user_id` for the transaction (module 6).
4. Refuse to continue if either setting is absent.

**Midnight trigger**

1. There is no end user. Use a database role that may set the tenant setting, then iterate tenants.
2. For each active tenant, set `app.current_tenant_id` to that tenant.
3. Set `app.current_user_id` to a system principal reserved for the batch, or leave user-scoped override checks out of the batch. The batch reconciles the tenant. It does not act as a member browsing hidden envelopes.
4. Commit or roll back per tenant so one tenant's failure does not abort the others.

## Step 2 — Ledger synchronization

Update physical bank balances for every active account in the tenant.

1. For each `accounts` row, determine the current bank balance.
2. If the synchronous trigger just inserted a transaction, the balance update from module 5 is the synchronization for that account. Do not apply the same transaction a second time.
3. If an external feed is connected, reconcile the feed against `transactions` and set `current_balance` to the bank's figure. Insert any bank transaction the ledger does not yet have, then let step 3 settle those new rows.
4. Set `accounts.updated_at`.
5. Opening cash for the forecast is the sum of the balances after this step.

The specification does not describe a bank-feed vendor. The step is "update physical bank balances." A manual deployment can treat the ledger sum as the bank balance until a feed exists.

## Step 3 — Envelope settlement

Apply the virtual side of every transaction that is not yet settled. On the synchronous path that is the new row. On the midnight path it is anything posted since the last run, plus cycle-boundary policy if a cycle ended.

**Credits (inflows)**

1. Take the positive amount as `I(t)`.
2. Run the waterfall (module 2, steps 1 through 5).
3. Persist `A_j` and the new envelope balances in the same database transaction as the ledger row.

**Debits (expenditures)**

1. If the transaction names an envelope, deduct from that envelope up to its available balance.
2. If the envelope is fixed or sinking and cannot cover the debit, absorb the remainder from `B_disc` (module 2, step 7).
3. If the transaction is a flexible daily purchase, the envelope is the discretionary pool even when the client did not pick a category.
4. Add the discretionary portion to `E_disc_actual` for `booked_date`.

**Cycle boundary (midnight only)**

1. If today is the last day of the pay cycle, apply rollover policies: accumulate, top-up, or reset-and-sweep (module 2, step 6).
2. Advance `next_due_date` on schedules whose occurrence was today.
3. Then continue to simulation. Do not sweep in the middle of a synchronous daytime spend.

## Step 4 — Forward simulation

Project physical balance `C(τ)` across 60 days.

1. Set `C(0)` from step 2. Do not subtract today's burn from it again.
2. Expand active schedules and normalize business days (module 3).
3. Take the future burn from decision D7. Do not rebuild the morning pace from a balance that already had today's purchases removed, and do not keep that morning pace for later days after today has gone negative.
4. For a future payday inside the horizon, simulate the waterfall in memory and floor-divide that cycle's pool. Discard those projected envelope balances afterward.
5. Recurse:

```text
C(τ) = C(τ − 1) + I(τ) − O_sched(τ) − S_daily(cycle(τ))
```

6. Hold the series in memory until step 5 finishes. Replace the stored forecast only when the final series is ready.

## Step 5 — Solvency check

```text
breach if any C(τ) < C_min for 0 ≤ τ ≤ 60
warning if any C(τ) < C_min + (1.5 × S_daily) and the day is not already a breach
```

When a breach exists, lower only the discretionary burn. Do not move envelope balances.

```text
k    ← earliest τ ≥ 1 where C(τ) is the minimum
gap  ← C_min − C(k)
rate ← max(0, rate − ceil_cents(gap / k))
series ← project(rate)
if min series < C_min and the minimum moved to a different day:
    apply the same cut once more and project once
```

`ceil_cents` rounds the per-day cut up to the next cent, so a gap of `$50` first seen on day 22 cuts the rate by `$2.28` (`50 / 22 = 2.272…`). The confirmation projection catches a day that becomes the new minimum. If the rate is already zero and the horizon is still short, store that series, keep the alert, and report the first breach date and `C_min − C(τ)`.

A warning does not enter this loop. It means the balance is still at or above the floor and inside `1.5 × S_daily` of it.

## Step 6 — Safe-to-spend calibration

Publish the number clients display.

1. On a synchronous spend, keep the morning `S_daily` and set `S_today` to the opening allowance minus today's discretionary spend. On the midnight run, recalibrate `S_daily` for the new day, then set `S_today` to that rate plus the new remainder.
2. If step 5 reduced the ceiling, publish that reduced rate as `S_daily` instead.
3. Store the figures as the tenant's current calibration, with the timestamp of this run. Readers always see the latest run.
4. On the synchronous path, return `S_today` in the response to the transaction so the client does not need a second request.

The midnight formula for the new day is:

```text
S_daily(t + 1) = B_disc(t + 1) / (N_p − 1)
```

with the unfunded-obligation clamp from module 4 so the published rate cannot spend money a near-term bill still needs.

## Synchronous path, compressed

```text
authorize the spend
insert transaction and update account balance
settle the envelope and set settled_at
if the row is an inflow: recalculate S_daily
else: S_today ← S_daily − today's discretionary spend
project 60 days
if breach: cut the rate and project again
replace forecast_days and allowance_snapshots
return S_today
```

If any step fails, roll back the transaction insert and the balance updates together. Do not leave a purchase recorded against yesterday's allowance.

## Midnight path, compressed

```text
for each tenant:
    set tenant context
    sync every account balance
    settle anything still open
    if the pay cycle ends today: apply rollover
    advance due dates that occurred today
    project, check solvency, calibrate
    commit this tenant
```

Run the batch at midnight in `tenants.timezone`. `booked_date` uses that same zone. A tenant on `UTC` and a tenant on `America/New_York` do not share a midnight.

## Idempotency

Running the pipeline twice on the same settled ledger must not double-apply a waterfall.

1. Set `transactions.settled_at` when step 3 finishes. Skip any row that already has it.
2. Replacing `forecast_days` and `allowance_snapshots` is safe to repeat.
3. Insert `cycle_sweeps` for the cycle-end date before moving money. A retry that finds the row skips the sweep.

## Failure behavior

| Failure | Result |
| --- | --- |
| Tenant context missing | Abort before any write. |
| Waterfall does not sum to `I(t)` | Roll back settlement. Leave the previous calibration in place. Alert an operator. |
| No discretionary envelope | Abort settlement for that inflow. Do not drop the remainder. |
| Forecast holiday calendar unavailable | Abort the forecast. Do not publish a timeline that ignored the business-day rules. Keep the previous timeline and mark it stale. |
| One tenant fails at midnight | Roll back that tenant. Continue with the next. |

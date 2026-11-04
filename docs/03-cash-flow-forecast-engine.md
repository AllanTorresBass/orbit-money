# Module 3 — Cash-Flow and Burn-Rate Forecast Engine

Section 3 of the specification (Layer 2). This module does not move money. It projects physical bank liquidity for 60 days and reports whether the tenant stays above the reserve floor.

## Purpose

Layer 1 has already organized virtual capital. Layer 2 answers a different question: on the real accounts, what is `C(τ)` for each day `τ` in `[0, H]`, with `H = 60`.

The user-facing result is a forward timeline that can warn about a shortfall weeks before it happens.

## Inputs

| Input | Source |
| --- | --- |
| `C(0)` | Sum of `accounts.current_balance` for the tenant's active accounts. |
| `I(τ)` | Active schedules with `direction = 'inflow'` whose normalized due date is `τ`. |
| `O_sched(τ)` | Active schedules with `direction = 'outflow'` whose normalized due date is `τ`. |
| `S_daily` | The base daily rate from module 4, for the pay cycle that contains `τ`. |
| `C_min` | Tenant liquidity floor. The specification's example is `$200.00`. |
| Calendar | Weekends and public holidays, used only to shift scheduled dates. |

## Outputs

| Output | Meaning |
| --- | --- |
| `C(τ)` for `τ = 0 … 60` | Projected aggregate bank balance at the end of that day. |
| Solvency flag | True when the minimum projected balance is at least `C_min`. |
| Warning dates | Days where the balance is still at or above `C_min` but inside the warning band. |
| Breach dates | Days where `C(τ) < C_min`. |

Persist the series only as a derived forecast. The next pipeline run replaces it.

## Step 1 — Freeze the opening balance

1. Resolve the tenant (module 6) and sum physical balances.
2. Set `C(0)` to that sum. Day 0 is today, after any transaction that triggered this run has already posted.
3. Set `H = 60`. Do not make the horizon a per-request parameter. The specification fixes it.

`C(τ)` is aggregate liquidity, not one account. Schedules still name an `account_id` so a later per-account view is possible, but the solvency test in the specification uses the aggregate.

## Step 2 — Expand recurrence into dated events

Each active row in `scheduled_schedules` has `recurrence_rrule`, `next_due_date`, `amount`, and `direction`.

Supported frequencies:

- Weekly
- Bi-weekly
- Semi-monthly
- Monthly
- Annual

Procedure:

1. Ignore rows with `is_active = false`.
2. Start at `next_due_date`. If that date is before today, advance it by the recurrence until it falls on today or later, and store the new `next_due_date`.
3. Emit an occurrence for every date from today through day 60.
4. Semi-monthly is two monthly rows (decision D11), such as `FREQ=MONTHLY;BYMONTHDAY=1` and `FREQ=MONTHLY;BYMONTHDAY=15`. If that day does not exist in a short month, use the month's last day, then apply the business-day shift.
5. Keep `amount` and `direction` on each occurrence.

`recurrence_rrule` stores an iCalendar rule. Weekly, bi-weekly (`INTERVAL=2`), monthly, and yearly fit in one row.

## Step 3 — Normalize onto business days

Bank timing is not the calendar date of the rule.

| Direction | If the occurrence falls on a weekend or public holiday |
| --- | --- |
| Inflow (direct deposit) | Roll **backward** to the preceding business day. Liquidity arrives earlier. |
| Outflow (automated debit) | Roll **forward** to the next business day. The debit happens later. |

Apply this per occurrence, after expansion:

1. If the date is a business day, keep it.
2. If it is an inflow, walk backward until the date is a business day.
3. If it is an outflow, walk forward until the date is a business day.
4. If the shift moves an inflow from inside the horizon to before today, include it in `C(0)` only if the deposit has actually posted. Do not double-count a deposit that is already in `current_balance`.
5. If the shift moves an outflow past day 60, drop it from this horizon. It belongs to the next run.

Sum occurrences that land on the same day. `I(τ)` is the sum of normalized inflows that day. `O_sched(τ)` is the sum of normalized outflows.

Example, with Wednesday 4 November 2026 as a business day. A schedule dated Saturday 7 November moves like this:

| Direction | Calendar date | Normalized date |
| --- | --- | --- |
| Inflow | Saturday 7 November | Friday 6 November |
| Outflow | Saturday 7 November | Monday 9 November |
| Inflow | Sunday 8 November | Friday 6 November |
| Outflow | Sunday 8 November | Monday 9 November |

Two inflows that both land on Friday are one `I(τ)`, the sum of their amounts.

## Step 4 — Recurse the balance

`C(0)` is today's actual aggregate. Do not subtract `S_daily` from it again. For each `τ` from 1 through 60:

```text
C(τ) = C(τ − 1) + I(τ) − O_sched(τ) − S_daily(cycle(τ))
```

`S_daily(cycle(τ))` is the discretionary burn assumed on that day:

1. Days before the next payday use the future burn from decision D7. That is the morning rate while today is still inside its allowance, and the rebated rate once today has gone past it.
2. On a future payday, run the waterfall against projected envelope balances, floor-divide the new discretionary pool by the next cycle length, and subtract that new rate on the payday. Drop the projected balances when the series is done. Do not write them back.
3. Subtract the burn every calendar day, including weekends. The recursion does not skip them.

Each day's inputs are already in cents. The balance passed into the next day is that cent value.

**Illustration.** `C(0) = 2000`, `C_min = 200`, `S_daily = 40`. Tomorrow has a scheduled debit of `1500` and no income.

```text
C(1) = 2000 + 0 − 1500 − 40 = 460
```

## Step 5 — Test solvency

```text
solvent  ⇔  min{ C(τ) : 0 ≤ τ ≤ H } ≥ C_min
```

1. Scan the 61 values `C(0)` through `C(60)`.
2. Record the minimum and the first day it occurs.
3. If the minimum is below `C_min`, the tenant is not solvent on the horizon.

The specification's mitigation example is a dynamic reduction of the daily ceiling. That reduction is module 4's job, triggered by module 8 when this check fails. This module reports the breach. It does not edit envelopes.

## Step 6 — Raise the warning band before the floor

A day is in the warning band when:

```text
C(τ) < C_min + (1.5 × S_daily)
```

Using the illustration, `S_daily = 40`, so the band starts at `200 + 60 = 260`. A projected balance of `460` is outside the band. A projected balance of `240` is above the floor and still a warning.

1. Evaluate the comparison with the `S_daily` of `cycle(τ)`, not a single global rate, when cycles inside the horizon have different rates.
2. A breach (`C(τ) < C_min`) is stronger than a warning. Report it as a breach, not as both.
3. The product copy for a warning is a forward shortfall, not a rejected transaction. Layer 2 does not block spending.

## Step 7 — Publish the timeline

1. Replace the tenant's current forecast atomically.
2. Each point needs the date, `C(τ)`, the inflow total, the scheduled outflow total, the assumed burn, and a status of `ok`, `warning`, or `breach`.
3. Readers (owner, admin, member, advisor, read-only) may all inspect this timeline. That permission is in module 7.

## Edge cases

| Situation | Required behavior |
| --- | --- |
| No active schedules | The series is `C(τ) = C(τ−1) − S_daily` each day. Still run the floor check. |
| `S_daily` is zero | The recursion subtracts zero. The warning band collapses to `C_min`, so only a breach remains. |
| Two inflows in one cycle | `N_p` and cycle bounds follow the next deposit. Do not average them into one synthetic payday. |
| Holiday calendar missing | Do not skip normalization. Fail the forecast run rather than shifting dates with a weekend-only rule while claiming holiday support. |
| Account balance updated mid-run | This run keeps the `C(0)` it froze. The transaction that changed the balance starts a new pipeline run. |

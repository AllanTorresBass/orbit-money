# Resolved decisions

The specification leaves these choices open. Each one is resolved below. The practice is the rule the module guides follow. "Rejected" is the alternative that looks simpler and causes a wrong balance, a wrong bill, or a rate the user cannot reconcile.

## D1 — Money is integer cents, and the parts sum to the pool

**Practice.** Store money as `NUMERIC(12, 2)` and compute in cents. Never use binary floating point.

The repeating daily rate is floored to the cent:

```text
S_daily     = floor_cents(spendable / N_p)
remainder   = spendable − (N_p × S_daily)
```

`N_p × S_daily` never exceeds the pool. The leftover cents are spendable today. At the start of the day, before any discretionary purchase:

```text
S_today = S_daily + remainder
```

They are not an invisible balance the user finds next week.

**Why.** Allocating a sum of money is an exact partition. Banker's rounding and round-half-up can make the days add up to more than the pool. Flooring without giving the remainder back makes `N_p × rate` disagree with the envelope, which is the figure the user is checking.

**Rejected.** Floating point. Rounding each day independently. Leaving the remainder stuck in the envelope with no path onto today's number.

## D2 — One discretionary pool, pairing enforced in the database

**Practice.** A tenant has exactly one `tier_category = 'discretionary'` envelope. That balance is `B_disc`. The database rejects a second one.

Rollover is tied to the tier, also in the database:

| Tier | `rollover_policy` |
| --- | --- |
| `fixed` | `top_up` |
| `sinking` | `accumulate` |
| `discretionary` | `reset_sweep` |

**Why.** The product exists to replace a pile of daily categories with one number. Many discretionary envelopes would bring back the categorization the specification is removing. A check constraint is the right place for an invariant the waterfall assumes on every run.

**Rejected.** A discretionary envelope per merchant or per person. Enforcing the pairing only in application code.

## D3 — A scheduled bill is funded in full

**Practice.** `DueAmount_j` is the sum of active outflow schedules for envelope `j` whose next business-day date falls before the next inflow.

`target_cap` is the expected ceiling only when that sum is zero (a variable bill such as electricity with no schedule yet). When a schedule exists, the schedule is the due amount. The cap does not reduce it.

**Why.** The schedule is the cash that will leave the bank. Funding `$150` toward a `$180` autopay leaves a hole that shows up later as a surprise in the daily rate. Envelope practice is to cover the known transaction. The cap remains the planning ceiling for a bill that is still an estimate.

**Rejected.** `min(schedule, target_cap)`. That underfunds a known debit and hides the gap inside safe-to-spend.

## D4 — Sinking funds stop at the cap

**Practice.**

```text
room = infinity                  if target_cap is null
room = max(0, target_cap − B_j)  otherwise
A_j  = min(remaining, installment or 0, room)
```

A balance already at the cap takes nothing. A null installment assigns nothing. A null cap is allowed: that is a standing contribution with no end goal, such as a retirement transfer, and the installment still limits it.

**Why.** Goal balances should not keep absorbing a paycheck after the goal is met. The next envelope in priority order, and then discretionary, should receive that money in the same inflow.

**Rejected.** Assigning the full installment on top of a full cap. Treating a null cap as zero, which would freeze every uncapped contribution.

## D5 — Priority is unique inside a tier

**Practice.** Fund by `priority_order` ascending. `(tenant_id, tier_category, priority_order)` is unique. Two fixed envelopes cannot both be priority 1.

**Why.** A tie broken by UUID is stable and meaningless. The user thinks both bills are first, and the engine silently prefers whichever row was inserted first. A unique order makes the waterfall explainable.

**Rejected.** Breaking ties by envelope id.

## D6 — Leftover discretionary fills sinking funds in order

**Practice.** At cycle end, move the discretionary balance through sinking funds until it is gone or no fund has room:

1. The sinking envelope in `sweep_envelope_id`, when set. Tenant setup creates an emergency sinking envelope and points here.
2. Every other sinking envelope, by `priority_order`, that still has room under its cap.
3. Whatever cannot fit stays in discretionary, and the run records that the clean slate was incomplete.

No sinking fund is pushed through its cap. The amount that did move is one `cycle_sweeps` row.

**Why.** The specification sweeps leftover spending into tier-2 reserves so the next cycle starts clean. A single destination that is already full would skip that sweep and leave the leftover sitting in spending. Filling the emergency fund first, then the next goal with room, matches how leftover cash is actually assigned. Creating the emergency envelope up front means the first cycle has a destination.

**Rejected.** One pointer and, if it is full, leaving the entire leftover in spending. Sweeping past a cap. Requiring the owner to configure a destination before the app can finish a cycle.

## D7 — Today's pace, today's remainder, and the future burn are three different numbers

**Practice.**

| Event | Morning pace `S_daily` | `S_today` | Burn used on forecast days after today |
| --- | --- | --- | --- |
| Midnight, or an inflow | Recalculated from the pool and the new `N_p` | `S_daily + remainder`, since nothing has been spent yet today | `S_daily` |
| Discretionary purchase, and `S_today` is still ≥ 0 afterward | Unchanged | Opening allowance minus today's discretionary spend | `S_daily` |
| Discretionary purchase that drives `S_today` below 0 | Unchanged as the pace for today | Negative, by the amount today went past its allowance | `floor_cents(B_disc / days after today)` |
| Solvency mitigation | Lowered to the mitigated rate | Recomputed from that rate, minus what was already spent | The mitigated rate |

Opening allowance is `S_daily + remainder` from D1. `S_today = opening allowance − E_disc_actual(t)`.

While today is still inside its allowance, later days keep the morning rate. The purchase reduced the bank balance, and the unspent part of today is still sitting in the envelope for later today, so the future slice of the pool is unchanged.

Once today has gone through its allowance, the overspend was taken from the money those later days were going to use. The forecast burn becomes the remaining discretionary balance divided by the days after today. Midnight then runs the same division, which is the specification's day `t+1` formula. Doing it when the overspend happens keeps the timeline honest for the rest of the day.

**Why.** `C(0)` already includes the purchase. Continuing to subtract the old, higher rate for every future day removes that overspend a second time and invents a shortfall. Waiting until midnight to fix it leaves a wrong timeline on screen all day. Showing a negative `S_today` still tells the truth about today, without a penalty alert. That split is the specification: no punitive alert, and the variance is spread across the remaining days.

**Rejected.** Freezing the future burn at the morning rate until midnight. Replacing `S_daily` on every coffee, which hides the fact that today went over. Subtracting `E_disc_actual` from a rate that was already computed on the post-spend balance.

## D8 — `N_p` includes today and excludes payday

**Practice.** `N_p` is the number of calendar days in `[today, next normalized inflow)`.

If that inflow is today and it is not settled yet, `N_p = 1`. Today is the last day of the cycle, and the user still has a number. After it settles, count forward to the following inflow.

If there is no future inflow at all, do not publish a rate.

**Why.** A half-open interval matches "days this money has to last, not including the morning it is replaced." Publishing nothing on payday morning, before the deposit arrives, leaves the app blank on the day the user is most likely to look.

**Rejected.** Counting payday itself, which double-counts that day across two cycles. Using `N_p = 0` and skipping the rate.

## D9 — The forecast starts from cash already in the bank

**Practice.** `C(0)` is the aggregate bank balance after the transaction that triggered the run. The recursion runs for `τ = 1 … 60`. Day 0 is not charged the daily burn again.

Days after today use the future burn from D7. On a future payday the engine runs the waterfall in memory, applies D1 to that cycle, and subtracts the new rate on the payday. Those projected envelope balances are discarded. They are not written back.

**Why.** `C(0)` is measured cash. Subtracting today's plan from it again assumes the user spends the allowance twice. Writing projected envelope balances back would turn a forecast into a posting.

**Rejected.** Subtracting `S_daily` from `C(0)`. Persisting the in-memory waterfall.

## D10 — The tenant's IANA timezone owns the calendar

**Practice.** `tenants.timezone` is an IANA name such as `America/New_York`. Signup stores the client's zone. `UTC` is used only when the client does not send one.

`booked_date` is the local date in that zone. `booked_at` stores the same instant as `timestamptz`. The midnight batch runs per distinct timezone, at local midnight, not at one server midnight.

`tenants.holiday_region` defaults to `US` and supplies the holiday set for the business-day shift.

**Why.** A paycheck posted at 9 p.m. in New York is still that local day. A UTC batch at 00:00 rolls the date at 7 p.m. Eastern and splits one evening's spending across two allowances. Offsets are not timezones: they do not know when daylight saving starts.

**Rejected.** One deployment-wide midnight. Storing a numeric UTC offset. Treating Saturday and Sunday as the only non-business days.

## D11 — Semi-monthly is two monthly rules

**Practice.** A semi-monthly schedule is two `recurrence_rrule` rows, each monthly, with the two days the user named. The engine does not assume the 1st and the 15th.

A day that does not exist in a short month uses that month's last day. The business-day shift runs after that clamp. Inflows move to the previous business day. Outflows move to the next one.

**Why.** Semi-monthly payroll is often the 15th and the last day, not the 1st and the 15th. iCalendar has no semi-monthly frequency. Two monthly rules are the usual representation, and the user keeps the days they were actually paid.

**Rejected.** A new frequency enum. Hard-coding the 1st and the 15th. Skipping the holiday calendar.

## D12 — Fixed reserves stay non-negative

**Practice.** A fixed or sinking envelope is reduced only down to zero. The unpaid remainder reduces `B_disc`, which may go negative. Each such remainder is its own allocation row, so the deficit is visible without editing the original purchase.

`S_today` going negative is not an alert. The specification spreads that variance instead of scolding it. `B_disc` going negative is an alert, and the next rate is zero until an inflow covers it.

**Why.** Raiding rent or the emergency fund to cover a grocery overdraft quietly destroys the reserves the waterfall just built. Putting the deficit on discretionary makes the daily number fall, which is the behavior the specification asks for. An audit row is what lets support explain a negative spending balance without rewriting history.

**Rejected.** Driving the fixed envelope negative. Pulling the difference from the highest sinking fund. A push alert every time `S_today` crosses zero.

## D13 — A transaction settles once

**Practice.** The ledger insert, the balance updates, and envelope settlement commit in one database transaction. `transactions.settled_at` is set in that commit. A client retry sends the same `idempotency_key`; the unique key `(tenant_id, idempotency_key)` returns the original row. A bank import uses `external_id` the same way.

`cycle_sweeps` has one row per tenant per cycle-end date. A repeated midnight run sees it and does not move the money again.

**Why.** At-least-once delivery is the normal case for a midnight job and for a mobile client on a bad network. Exactly-once posting comes from a unique key and a single commit, not from hoping the job runs once.

**Rejected.** A settled flag with no idempotency key. Settling in a second transaction after the insert has already committed.

## D14 — The floor is chosen, and a breach is cut in one step

**Practice.** `tenants.liquidity_floor` is `C_min` and defaults to `0.00`. Onboarding offers a floor of one week of the current daily rate and shows the specification's `$200` as an example the owner can accept. Nothing writes `$200` unless they do.

A day is a breach when `C(τ) < C_min`. A day is a warning when it is not a breach and `C(τ) < C_min + 1.5 ×` that day's burn. A warning does not change the rate.

A breach lowers only the discretionary burn:

```text
k    = earliest τ ≥ 1 where C(τ) is the minimum
gap  = C_min − C(k)
rate = max(0, rate − ceil_cents(gap / k))
project again once
```

If the minimum moved to another day and is still below the floor, apply that same cut one more time and project once more. Then stop. If the rate is already zero and the horizon is still short, keep the alert and report the first breach date and the remaining gap. Envelope balances do not move.

**Why.** A universal `$200` floor is wrong for someone whose balance is `$80` and unnecessary for someone who keeps a month of cash. The gap on the worst day, spread over the days that led to it, is the cut that lifts that day to the floor. One confirmation projection catches the case where a different day becomes the new minimum. Looping a fixed three times does not know when it is done.

**Rejected.** Defaulting every tenant to `$200`. A three-iteration search. Covering the breach by reducing a fixed envelope.

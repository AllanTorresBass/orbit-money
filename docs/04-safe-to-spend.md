# Module 4 — Dynamic Safe-to-Spend

Section 4 of the specification (Layer 3). This module reduces the discretionary pool, the days left in the cycle, and today's spending to one daily ceiling.

## Purpose

The user should not categorize flexible purchases. Coffee, groceries, and similar debits are withdrawals against one allowance. If they spend more than today's allowance, the engine does not scold them. It lowers the allowance for the remaining days.

## Inputs

| Input | Meaning |
| --- | --- |
| `B_disc(t)` | Discretionary balance used for today's rate: the balance after inflows and non-discretionary settlement, before today's discretionary spending is removed. |
| `O_unfunded` | Upcoming contractual liabilities that no envelope currently backs. |
| `N_p` | Calendar days left until the next scheduled income deposit, counted as of this morning. |
| `E_disc_actual(t)` | Discretionary amount already spent today. |

## Outputs

| Output | Meaning |
| --- | --- |
| `S_daily(t)` | Base daily rate for the rest of the cycle, before today's spending is subtracted. |
| `S_today(t)` | What remains of today's allowance. This is the number clients show. |

Both are derived. Recompute them. Do not let a client post a corrected "safe to spend."

## Step 1 — Measure the unfunded contractual gap

`O_unfunded` is the part of upcoming fixed obligations that envelopes cannot cover.

1. List active outflow schedules whose envelope is fixed, or whose obligation is contractual, with a due date before the next inflow.
2. For each, the uncovered amount is `max(0, amount − B_j)` for its envelope.
3. Schedules with a null `envelope_id` are fully uncovered. Their whole amount is unfunded.
4. Sum those uncovered amounts into `O_unfunded`.

This stops the daily rate from treating money as spendable when a bill due before payday has no envelope backing.

## Step 2 — Compute the base daily rate

```text
spendable   = max(0, B_disc(t) − O_unfunded)
S_daily(t)  = floor_cents(spendable / N_p)
```

The specification writes the division directly. Flooring to the cent (decision D1) keeps `N_p × S_daily` from exceeding the pool.

1. Subtract unfunded obligations from the discretionary balance first.
2. If the result is negative or zero, the rate is zero.
3. Divide by `N_p`, the days in `[today, next payday)`.
4. If the next inflow is today and it is not settled, `N_p = 1`. After it settles, count to the payday after that. If no later payday exists, publish no rate.

**Illustration.** Discretionary balance `$600`, nothing unfunded, 15 days until payday.

```text
S_daily = max(0, 600 − 0) / 15 = 40.00
```

With `$90` unfunded:

```text
S_daily = max(0, 600 − 90) / 15 = 34.00
```

## Step 3 — Subtract what was already spent today

```text
opening    = S_daily(t) + remainder
S_today(t) = opening − E_disc_actual(t)
```

`remainder` is the cents from decision D1. It is zero when the pool divides evenly.

1. `E_disc_actual(t)` is the sum of today's discretionary debits, not every transaction. Fixed and sinking settlements are not "today's allowance."
2. `S_today` may be negative. That negative value means today is already over the rate. Show it as overspend against the allowance, then let step 4 absorb it. The specification does not want a punitive alert at this moment.
3. Clients that need a single non-negative "you can still spend" figure should display `max(0, S_today)` and separately show that today exceeded the rate. The stored metric is the unclamped difference, because the next day's formula needs the true discretionary balance, which already includes the overspend.

## Step 4 — Recalibrate on the next day

The specification writes:

```text
S_daily(t + 1) = B_disc(t + 1) / (N_p − 1)
```

Apply the same unfunded clamp and cent floor as step 2:

```text
S_daily(t + 1) = floor_cents(max(0, B_disc(t + 1) − O_unfunded) / (N_p − 1))
```

1. `B_disc(t + 1)` is the discretionary balance after today's spending and any midnight settlement.
2. `N_p − 1` is the day count from tomorrow to payday.
3. Overspend is spread automatically. Spending `$55` against a `$40` rate leaves `B_disc = 545` if the day started at `$600` and nothing else changed. With 14 days left:

```text
S_daily(t + 1) = floor_cents(545 / 14) = 38.92
```

The `$15` overspend lowers each remaining day by `$1.08`. There is no extra penalty. Two cents stay in the envelope because `14 × 38.92 = 544.88`.

4. When `N_p − 1` is zero, tomorrow is payday. Do not divide by zero. Run the waterfall for the deposit, then compute a new `S_daily` with the new cycle length.

## Step 5 — Feed the rate to the forecast

Days after today burn the future rate from decision D7, not `S_today`.

1. Publish the morning `S_daily`, the remainder, and `S_today`.
2. While `S_today ≥ 0`, later days of this cycle burn `S_daily`. The unspent part of today is still in the envelope.
3. When `S_today < 0`, later days burn `floor_cents(B_disc / days after today)`. The overspend has already been taken from that future slice, and `C(0)` already includes the purchase, so the forecast must not also keep the old higher rate.
4. If the solvency check then fails, module 8 lowers that future burn. It does not take the breach out of a fixed envelope.

## Step 6 — What a discretionary purchase does

For a flexible purchase of amount `X` today:

1. Insert the transaction against the discretionary envelope (module 5).
2. Decrease the stored envelope balance by `X`. If another envelope was selected and cannot cover `X`, absorb the delta from discretionary (module 2, step 7).
3. Increase `E_disc_actual(t)` by the portion that hit discretionary.
4. Recompute `S_today` from the opening allowance: `S_daily + remainder − E_disc_actual(t)`. Do not divide the post-spend balance by `N_p` and then subtract `E_disc_actual` again.
5. Leave the morning `S_daily` in place for the rest of today. If `S_today` is still ≥ 0, the forecast keeps burning that morning rate. If `S_today` is negative, replace the future burn as in step 5.
6. Do not create a new category, and do not require the user to pick one, for this class of purchase.

If the stored balance has already been reduced and you must rebuild the morning base, add today's discretionary spending back first:

```text
B_disc(t) = current discretionary balance + E_disc_actual(t)
S_daily(t) = max(0, B_disc(t) − O_unfunded) / N_p
```

## Edge cases

| Situation | Required behavior |
| --- | --- |
| Discretionary balance is zero | `S_daily = 0` and `S_today = −E_disc_actual` if they already spent. Further discretionary spend deepens the deficit recorded in module 2. |
| User spends under the rate | No special case. Tomorrow's formula uses the higher remaining balance, so the daily rate rises on its own. |
| Income arrives today | Settlement (waterfall) runs before this module. `B_disc` already includes `A_disc`. `N_p` then points at the following payday. |
| `O_unfunded` exceeds `B_disc` | Base rate is zero. The forecast still shows the uncovered bills as scheduled outflows. |
| Multiple time zones | "Today" is the tenant's local date from `tenants.timezone`. Sum `E_disc_actual` on that date. |
| Pool does not divide evenly | `$1,570` over 14 days publishes pace `$112.14`. The leftover `$0.04` is on today's opening allowance, so the day starts at `$112.18`. |

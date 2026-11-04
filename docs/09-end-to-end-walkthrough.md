# End-to-End Walkthrough

One household tenant, one paycheck, one discretionary purchase, and the midnight batch. Amounts are an illustration of the specification's formulas, using the document's example floor of `$200`.

## Starting position

Tenant "Harbor Household", type `household`, currency `USD`.

| Actor | Role |
| --- | --- |
| Alex | `owner` |
| Blair | `member` |
| Casey | `advisor` |

Accounts and envelopes:

| Object | Balance | Notes |
| --- | --- | --- |
| Checking account | `$2,000` | The only physical account. |
| Rent | `$0` | Fixed, priority 1, due `$1,200`, policy `top_up`. |
| Electricity | `$40` | Fixed, priority 2, ceiling `$150`, policy `top_up`. |
| Car insurance | `$400` | Sinking, installment `$200`, cap `$1,000`, policy `accumulate`. |
| Vacation | `$1,000` | Sinking, installment `$100`, cap `$1,000`, policy `accumulate`. |
| Spending | `$80` | The discretionary pool, policy `reset_sweep`. |

`liquidity_floor` is `$200`. Spending's `sweep_envelope_id` points at Car insurance. No contractual amount is uncovered beyond the rent and electricity gaps the waterfall will fund.

Today is Wednesday 4 November 2026. The next paycheck is Wednesday 18 November, 14 days later, so `N_p = 14` after this deposit settles. Discretionary spend so far today is `$0`. The only scheduled bank debit inside this cycle is rent, `$1,200`, on Friday 13 November (day 9). That date is a business day, so the debit does not shift.

Casey can see the timeline and cannot post the grocery transaction. Blair can post it and cannot reorder the waterfall.

## A. Paycheck posts

Alex's payroll deposit of `$3,000` is recorded on checking. `booked_date` is today. The synchronous pipeline starts.

### A1. Tenant context

Middleware sets `app.current_tenant_id` to Harbor and `app.current_user_id` to Alex. Alex is an active owner, so both the ledger write and account update are allowed.

### A2. Ledger synchronization

Checking becomes `2000 + 3000 = 5000`. That credit is not applied again later in the run.

### A3. Envelope settlement (waterfall)

`remaining = 3000`.

Tier 1, fixed:

```text
Rent:         need = 1200 − 0 = 1200    assign 1200    remaining 1800
Electricity:  need = 150 − 40 = 110     assign 110     remaining 1690
```

Tier 2, sinking:

```text
Car insurance: balance 400 ≤ cap 1000
               room = 600, installment = 200
               assign 200                         remaining 1490
Vacation:      balance 1000 is not under the cap
               assign 0                           remaining 1490
```

Tier 3:

```text
Spending: assign 1490                    remaining 0
```

Zero-sum check: `1200 + 110 + 200 + 0 + 1490 = 3000`. Commit.

Balances after the paycheck:

| Envelope | Balance |
| --- | --- |
| Rent | 1,200 |
| Electricity | 150 |
| Car insurance | 600 |
| Vacation | 1,000 |
| Spending | 80 + 1,490 = 1,570 |

Checking stays `$5,000`. Envelope totals are not required to equal checking. Checking was already `$2,000` before this deposit, and the old envelope balances were not a full partition of that `$2,000`.

### A4. Working daily rate

`O_unfunded = 0` after tier 1 filled rent and electricity. `N_p = 14`.

```text
S_daily   = floor_cents(1570 / 14) = 112.14
remainder = 1570 − (14 × 112.14) = 0.04
S_today   = 112.14 + 0.04 = 112.18
```

The four cents are spendable today. They are not left sitting in the envelope with no path onto the allowance.

### A5. Forward simulation

`C(0) = 5000`. Days 1 through 13 subtract `$112.14`. Day 9 also subtracts the rent debit. Covering rent inside the envelope does not remove that debit from the bank recursion. Rent on any day in this stretch leaves the same balance on day 13, because the burn and the debit are both subtractions.

| Day | Date | Bank movement | `C(τ)` |
| --- | --- | --- | --- |
| 0 | Wed 4 Nov | Opening cash after the paycheck | 5,000.00 |
| 8 | Thu 12 Nov | Eight days of burn | 4,102.88 |
| 9 | Fri 13 Nov | Burn and the `$1,200` rent debit | 2,790.74 |
| 13 | Tue 17 Nov | Four more days of burn | 2,342.18 |

Day 14 is the next paycheck. The projection burns the rate on days 1 through 13 only. Today is already inside `C(0)`, and no discretionary purchase has posted, so Spending is not charged a fourteenth burn until one does.

```text
13 × 112.14 = 1,457.82
Spending left before the new paycheck = 1,570.00 − 1,457.82 = 112.18
```

The in-memory waterfall then sees rent at `$0` after its debit, electricity still full, car insurance at `$600`, and vacation still on its cap. From the new `$3,000`:

```text
Rent            1,200
Car insurance     200
Spending        1,600
```

Spending becomes `112.18 + 1,600 = 1,712.18`. The next cycle is also 14 days:

```text
S_daily = floor_cents(1712.18 / 14) = 122.29
C(14)   = 2342.18 + 3000 − 122.29 = 5219.89
```

A grocery purchase later today posts against the real balance and runs this projection again. This table is the plan at the moment the paycheck settles.

### A6. Solvency and calibration

`C_min` is `$200`. The warning band for this cycle is `200 + 1.5 × 112.14 = 368.21`. The low point before payday is `$2,342.18`, so this cycle has no warning and no ceiling cut.

Published allowance, with nothing spent today:

```text
S_today = 112.18
```

Casey, Blair, and Alex can all read this number. Only Alex and Blair can act on it by spending.

## B. Blair buys groceries the same day

Amount `$40`. Blair is a member, so "log daily discretionary spend" is allowed. The grocery envelope is Spending. No category is collected.

### B3. Settlement

```text
Spending: 1570 − 40 = 1530
E_disc_actual(today) = 40
```

Checking: `5000 − 40 = 4960`.

### B6. Calibration after the purchase

Today's pace stays the paycheck rate. The purchase comes off the opening allowance, which already included the four cents:

```text
S_daily stays 112.14
S_today = 112.18 − 40 = 72.18
```

`S_today` is still positive, so the forecast keeps burning `$112.14` on later days. The `$40` is already in the bank balance, and the unspent `$72.18` is still in Spending for the rest of today. No alert is sent.

If Blair had spent `$150` instead:

```text
Spending ends at 1,420
S_daily stays 112.14
S_today = 112.18 − 150 = −37.82
future burn = floor_cents(1420 / 13) = 109.23
```

Today is past its allowance, so the timeline drops the later days to `$109.23` immediately. Waiting until midnight would keep subtracting `$112.14` and would show a shortfall that the remaining pool does not justify. Rent stays at `$1,200`.

## C. Midnight, and the next morning

The batch sets Harbor's tenant context without Blair's user overrides, syncs checking, and finds no unsettled transactions.

Tomorrow is not payday, so there is no sweep. `N_p` from tomorrow is 13. Spending is still `$1,530` if the grocery debit was `$40`.

```text
S_daily(tomorrow) = floor_cents(1530 / 13) = 117.69
```

That is the same division the forecast would have used yesterday only if yesterday had already gone negative. It had not, so yesterday's later days stayed at `$112.14`, and this morning is the scheduled recalculation.

Yesterday's unused portion of the allowance stays in the pool, so the next day's rate is higher. That is the same formula as an overspend, run in the other direction.

The batch replaces the 60-day series from `C(0) = 4960` and the new rate, then runs the floor check again.

## D. What the cycle boundary will do later

On the last day before the next paycheck, midnight applies rollover:

| Envelope | Policy | Effect |
| --- | --- | --- |
| Rent | `top_up` | Leftover rent stays. The next paycheck funds only the gap to `$1,200`. |
| Electricity | `top_up` | Same, against the `$150` ceiling. |
| Car insurance | `accumulate` | `$600` plus later installments stay, up to the `$1,000` cap. |
| Vacation | `accumulate` | Stays at the cap. Further installments assign `$0`. |
| Spending | `reset_sweep` | Leftover spending moves to Car insurance, up to that envelope's remaining room under `$1,000`. Spending then starts at `$0`. |

Car insurance is `$600` before the sweep and its cap is `$1,000`, so at most `$400` moves. Anything above that stays in Spending and is reported. The sweep is one `cycle_sweeps` row. A retried midnight job sees the row and does not move the money again.

## E. A shortfall on the timeline

Suppose a later projection shows day 22 at `$150`, with `C_min = 200` and `S_daily = 100`.

```text
150 < 200          breach
warning band       200 + 1.5 × 100 = 350
```

Day 22 is a breach, not merely a warning. The pipeline alerts Harbor with the date and a `$50` gap, then lowers the discretionary ceiling and projects once more. Rent and electricity balances are not reduced to manufacture the `$50`. If Spending cannot give up enough to lift day 22 to `$200`, the ceiling goes to zero and the alert stays.

Blair can propose a waterfall change after seeing that alert. Alex or an admin would have to accept it. Casey can see the alert and cannot log a purchase to "fix" it.

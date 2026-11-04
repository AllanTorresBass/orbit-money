# Module 2 — Zero-Based Waterfall Allocation Engine

Section 2 of the specification (Layer 1). This module assigns an entire income inflow to envelopes. It also applies rollover and overdraw policy when a cycle ends or an envelope goes negative.

## Purpose

When money arrives, fill obligations in priority order until the inflow is exhausted:

1. Fixed contractual envelopes that are short of their due amount.
2. Sinking funds, up to the scheduled installment, without ignoring the cap.
3. Whatever remains, into the discretionary pool.

No dollar of `I(t)` stays unassigned.

## Inputs

| Input | Source |
| --- | --- |
| `I(t)` | The income transaction amount on day `t`. |
| Envelope rows | `tier_category`, `priority_order`, `current_balance`, `target_cap`, `monthly_installment`, `rollover_policy`. |
| Due amount for a fixed envelope | Sum of active outflow schedules for that envelope due before the next inflow. If there is no schedule, `target_cap`. A cap never reduces a schedule. Decision D3. |
| Installment for a sinking envelope | `monthly_installment`. Null means zero. |

## Outputs

| Output | Meaning |
| --- | --- |
| `A_j(t)` for each envelope | Amount added to that envelope from this inflow. |
| Updated `B_j` | `B_j + A_j(t)`. |
| Proof of zero-sum | `Σ A_j(t) = I(t)`. |

## Step 1 — Open an inflow run

1. Confirm the caller is allowed to affect balances (module 7). A member may log discretionary spend. Changing waterfall rules is not this step.
2. Set `remaining = I(t)`.
3. Set `A_j = 0` for every envelope.
4. Load `E_fixed`, `E_sink`, and `E_disc` for this tenant only (module 6).
5. Sort each tier by `priority_order` ascending. The order is unique inside the tier.

Reject the run if `I(t) < 0`. A negative amount is a debit and belongs to settlement (module 8, step 3), not to the waterfall.

## Step 2 — Priority tier 1, fixed contractual

Fully fund fixed obligations that are due before the next income cycle.

For each fixed envelope `j`, in priority order, while `remaining > 0`:

```text
need_j = max(0, DueAmount_j − B_j(t))
A_j(t) = min(remaining, need_j)
remaining = remaining − A_j(t)
```

The specification writes this as:

```text
A_j(t) = min(Remaining Inflow, DueAmount_j − B_j(t))
```

Clamp `DueAmount_j − B_j(t)` at zero before the `min`. If the envelope is already at or above the due amount, tier 1 assigns nothing. That is the top-up behavior for variable bills: only the marginal gap is funded.

**Illustration.** Inflow `$3,000`. Rent is due `$1,200` with balance `$0`. Electricity ceiling is `$150` with balance `$40`.

| Envelope | Need | Assigned | Remaining after |
| --- | --- | --- | --- |
| Rent | 1200 − 0 = 1200 | 1200 | 1800 |
| Electricity | 150 − 40 = 110 | 110 | 1690 |

## Step 3 — Priority tier 2, sinking target caps

Dispatch the scheduled amortized contribution toward each long-range target.

For each sinking envelope `j`, in priority order, while `remaining > 0`:

```text
A_j(t) = min(remaining, Installment_j)    subject to B_j(t) ≤ Cap_j
remaining = remaining − A_j(t)
```

`Installment_j` is `monthly_installment`. `Cap_j` is `target_cap`.

The written constraint is `B_j(t) ≤ Cap_j`. Together with "compound toward the defined cap", assignment stops at the cap. A balance already equal to the cap gets nothing:

```text
room   = target_cap − B_j(t)          when target_cap is set, else no room limit
room   = max(0, room)
A_j(t) = min(remaining, Installment_j, room)
```

**Illustration, continuing from step 2.** Remaining `$1,690`.

| Envelope | Balance | Cap | Installment | Assigned | Why |
| --- | --- | --- | --- | --- | --- |
| Car insurance | 400 | 1000 | 200 | 200 | Under the cap. Remaining becomes 1490. |
| Vacation | 1000 | 1000 | 100 | 0 | Already at the cap. |

## Step 4 — Priority tier 3, discretionary residual

After tiers 1 and 2:

```text
A_disc(t) = max(0, remaining)
remaining = 0
```

There is nothing else to fund. The residual, including zero, is the discretionary assignment. With the illustration, `A_disc = 1490`.

## Step 5 — Prove the invariance, then commit

1. Compute `Σ A_j(t)`.
2. Require equality with `I(t)` at `NUMERIC(12, 2)` precision.
3. Require every `A_j(t) ≥ 0`.
4. In one database transaction, add each `A_j(t)` to `envelopes.current_balance`.
5. If the proof fails, roll the transaction back. Do not leave a partial waterfall.

Do not write the allocation as a second bank deposit. The physical credit was recorded on the account when the income transaction was inserted.

## Step 6 — Apply rollover policy at a cycle boundary

Run this when a pay cycle ends (the day before the next inflow, or at the midnight batch that closes the cycle). Use `rollover_policy`.

### `accumulate` — sinking funds

1. Leave `B_j` unchanged across the monthly boundary.
2. The next tier-2 pass continues from that balance toward `target_cap`.
3. Do not sweep sinking balances into discretionary.

### `top_up` — fixed utilities and other variable ceilings

1. Leave leftover funds in the envelope.
2. On the next inflow, tier 1 assigns only `max(0, DueAmount_j − B_j)`.
3. Do not reset the envelope to zero. A light utility month reduces the next assignment automatically.

### `reset_sweep` — discretionary

1. Read leftover `B_disc` at cycle end.
2. Move that leftover into a tier-2 destination: an investment envelope or an emergency-reserve envelope.
3. Set `B_disc` to `0` so the next cycle starts clean.
4. The sweep is a virtual reassignment. It is not a bank transfer.
5. Move the leftover through sinking funds in the order in decision D6: the designated `sweep_envelope_id` first, then the other sinking funds by priority, each only up to its remaining room. Money that fits in none of them stays in discretionary and the sweep is marked incomplete.

## Step 7 — Absorb a deficit without touching fixed reserves

When spending is posted against an envelope:

1. If the envelope is discretionary, subtract the full amount. The balance may go negative.
2. If the envelope is fixed or sinking, subtract only `min(balance, amount)`.
3. Subtract the unpaid remainder from `B_disc`. Discretionary may go negative. Fixed and sinking balances stay at or above zero.
4. Recompute today's allowance (module 4). A negative discretionary balance forces `S_daily` to zero at the next recalibration, and `S_today` reflects the overspend immediately.
5. Do not rewrite posted allocation rows to hide the overdraw.

## Canonical inflow

```text
remaining ← I(t) in cents
for j in E_fixed ordered by priority_order:
    need ← max(0, DueAmount_j − B_j)
    A_j ← min(remaining, need)
    remaining ← remaining − A_j
for j in E_sink ordered by priority_order:
    room ← max(0, Cap_j − B_j) or remaining if Cap_j is null
    A_j ← min(remaining, Installment_j, room)
    remaining ← remaining − A_j
A_disc ← remaining
assert sum(A_j) = I(t) and every A_j ≥ 0
add each A_j to that envelope, in the same transaction as the bank credit
```

## Checks

| Situation | Result |
| --- | --- |
| Inflow smaller than tier 1 | Earlier fixed envelopes fill. Later ones, sinking funds, and discretionary get zero. The sum still equals the inflow. |
| No discretionary envelope | Roll back. Do not drop the remainder. |
| Two envelopes submitted with the same `priority_order` | The insert is rejected. The existing order is unchanged. |
| Installment or cap is null | Null installment assigns zero. Null cap does not limit the installment. |
| Designated sweep fund is at its cap | The leftover continues to the next sinking fund with room. If none have room, discretionary keeps it. |
| $10 overdraw on rent that has $4, discretionary has $3 | Rent ends at $0. Discretionary ends at $−3. |

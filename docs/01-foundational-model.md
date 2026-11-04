# Module 1 — Foundational Model

Section 1 of the specification. This module does not run a job of its own. It defines the objects the other modules share, and the order in which they run.

## Purpose

Give the product one financial operating model:

- Layer 1 assigns money that has arrived.
- Layer 2 asks whether the bank account survives the next 60 days.
- Layer 3 turns the discretionary remainder into a single daily number.

## Step 1 — Separate physical cash from virtual envelopes

1. A **physical account** is a bank balance. Its balance is `accounts.current_balance`. Only real credits and debits change it.
2. An **envelope** is a virtual compartment. Its balance is `envelopes.current_balance`. The waterfall and settlement change it.
3. The sum of envelope balances is not required to equal the bank balance at every instant. Layer 2 exists because those two views answer different questions:
   - Envelopes answer "what is this money for?"
   - The bank timeline answers "will the account go below the floor?"

Do not implement transfers between bank accounts to mirror envelope moves. The specification forbids that.

## Step 2 — Partition every envelope into exactly one tier

Let `E` be the set of envelopes for the tenant. Split it into three disjoint subsets:

| Subset | `tier_category` | What it holds | Typical rollover |
| --- | --- | --- | --- |
| `E_fixed` | `fixed` | Contractual obligations (rent, loans, expected utility ceiling) | `top_up` |
| `E_sink` | `sinking` | Irregular future targets (insurance, repairs, travel) | `accumulate` |
| `E_disc` | `discretionary` | Money left for flexible daily spending | `reset_sweep` |

Rules:

1. Every envelope is in one subset. An envelope cannot be both fixed and sinking.
2. There is exactly one discretionary envelope. Its balance is `B_disc`. A second discretionary envelope is a configuration error.
3. `priority_order` sequences envelopes inside a tier. Lower numbers are funded first. The order is unique inside a tier, so two envelopes are never tied.

## Step 3 — State the zero-sum rule before any allocation code

For an income event `I(t)` on day `t`:

```text
I(t) = Σ A_j(t)    for every envelope j in E
A_j(t) ≥ 0
```

`A_j(t)` is the virtual amount assigned to envelope `j` from this inflow. It is not the envelope's new balance. The balance update is:

```text
B_j(after) = B_j(before) + A_j(t)     for a credit assignment
```

Check after every inflow:

1. Sum of `A_j(t)` equals `I(t)` to the cent.
2. No `A_j(t)` is negative.
3. The physical account balance increased by `I(t)` separately, when the deposit was recorded. Do not add `I(t)` twice.

If the sum is short, the remainder belongs to the discretionary envelope (Layer 1, tier 3). If the sum is over, a tier assigned more than the remaining inflow and the run is invalid.

## Step 4 — Hand off between layers

Use this order whenever money moves. The daily pipeline in module 8 is the same sequence.

1. Record the physical transaction and settle envelopes (Layer 1).
2. Update the allowance (Layer 3). An inflow or a new calendar day recalculates `S_daily`. A discretionary purchase changes `S_today`. It changes the future burn only after today has gone past its allowance. See decision D7.
3. Project `C(τ)` for `τ = 0 … 60` using that `S_daily` as the expected daily burn (Layer 2).
4. If any future day is under the floor, lower `S_daily` and project again. Then publish.

Layer 2 reads the rate Layer 3 just published. Layer 3 reads envelope balances Layer 1 just wrote. Do not project from balances that belong to a previous transaction.

## Step 5 — Decide what the user is allowed to think about

The specification assigns each layer a cognitive footprint. Product behavior should match it.

| Layer | User does | User does not do |
| --- | --- | --- |
| 1 | Review the buckets a paycheck filled | Move money between envelopes by hand to "balance the month" |
| 2 | Read the 60-day graph and any shortfall warning | Build a separate spreadsheet of due dates |
| 3 | Spend against one daily number | Categorize every grocery trip into a custom category |

Categorization still exists for fixed and sinking items, because those are scheduled. Flexible daily purchases all hit the discretionary pool.

## Step 6 — Define a pay cycle

Several rules say "until the next income" or "end of the pay cycle" without a separate cycle table.

1. A cycle is the half-open span from one normalized inflow date to the next.
2. `N_p` is the number of calendar days in `[today, next inflow date)`. Today counts. Payday does not. After today's inflow is settled, the next inflow is the one after it.
3. Recurrence frequencies that can open a cycle are weekly, bi-weekly, semi-monthly, monthly, and annual (module 3).

If a tenant has no future inflow, do not divide and do not publish a rate.

## What this module stores

Nothing of its own. It constrains:

- `envelopes.tier_category`
- `envelopes.priority_order`
- `envelopes.rollover_policy`
- the sign and the sum of allocations produced by module 2

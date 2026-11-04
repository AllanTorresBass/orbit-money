# Module 7 — Role-Based Access Control

Section 7 of the specification. Five roles gate the financial machinery. This module is consulted at the start of every mutation and every read that the matrix distinguishes.

Envelope-level overrides from module 6 can narrow a role. They cannot widen it.

## Roles

| Database value | Matrix name | Intended actor |
| --- | --- | --- |
| `owner` | Owner | The person responsible for the tenant, billing, and ownership. |
| `admin` | Admin | A household or organization operator who must not own billing. |
| `member` | Member | A participant who spends and may propose envelope changes. |
| `advisor` | Advisor | A financial advisor who can see the plan and cannot move money. |
| `read_only` | Read-Only | An auditor or guest who can see the same forecasts and cannot change them. |

A suspended or invited membership has no role capabilities, regardless of the `role` value stored on the row.

## Permission matrix

The specification's matrix, restated as checks:

| Capability | Owner | Admin | Member | Advisor | Read-only |
| --- | --- | --- | --- | --- | --- |
| Manage tenant, billing, and ownership | Allow | Deny | Deny | Deny | Deny |
| Invite or revoke users, and assign roles | Allow | Allow | Deny | Deny | Deny |
| Connect or modify physical accounts | Allow | Allow | Deny | Deny | Deny |
| Configure envelopes and waterfall rules | Allow | Allow | Propose only | Deny | Deny |
| Log daily discretionary spend | Allow | Allow | Allow | Deny | Deny |
| Inspect safe-to-spend and the timeline forecast | Allow | Allow | Allow | Allow | Allow |

## Step 1 — Resolve the actor

1. Read `app.current_user_id` and `app.current_tenant_id` (module 6).
2. Load the membership for that pair.
3. Require `status = 'active'`.
4. Hold `role` for the rest of the request. Do not accept a role sent by the client.

## Step 2 — Manage tenant, billing, and ownership

**Allow:** owner. **Everyone else:** deny.

This capability covers:

1. Rename the tenant, change `tenant_type`, or change `base_currency` (only when no ledger rows exist, if you need a practical guard the specification does not spell out).
2. Billing actions for the tenant.
3. Transfer of ownership: insert a new `owner` membership and change the previous owner to another role.
4. Delete the tenant.

There must be one active owner after any ownership change. Reject a change that leaves zero active owners.

Admins do not gain this capability by being the only other active user.

## Step 3 — Invite, revoke, and assign roles

**Allow:** owner and admin. **Everyone else:** deny.

1. **Invite.** Insert `tenant_memberships` with `status = 'invited'` and a role other than a second accidental owner unless the caller is an owner performing step 2.
2. **Accept.** The invited user sets `status` from `invited` to `active`. That transition is theirs, not an admin capability.
3. **Revoke.** Set `status = 'suspended'`, or delete the membership. Suspension keeps the audit trail.
4. **Assign role.** Update `role`.

Extra restrictions that follow from step 2:

- An admin may assign `admin`, `member`, `advisor`, and `read_only`.
- An admin may not create or remove an `owner`. That is ownership management.
- Nobody may suspend the last active owner.

## Step 4 — Connect or modify physical accounts

**Allow:** owner and admin. **Everyone else:** deny.

1. Insert, rename, or disconnect an `accounts` row.
2. Link a schedule's `account_id` to a different physical account.
3. Direct edits of `current_balance` outside the ledger pipeline. Ordinary balance changes happen because a transaction posted, which is step 6, not this step.

Members do not add bank accounts even though they can spend against envelopes.

## Step 5 — Configure envelopes and waterfall rules

**Allow:** owner and admin. **Member:** propose only. **Advisor and read-only:** deny.

Configuration means creating or editing:

- `tier_category`
- `priority_order`
- `target_cap`
- `monthly_installment`
- `rollover_policy`
- the discretionary sweep destination
- `C_min`
- schedule amount, direction, recurrence, or due date

**Propose only**, for a member:

1. Insert an `envelope_proposals` row with `status = 'pending'`. Do not change the live envelope.
2. An owner or admin accepts or rejects it.
3. On accept, apply `payload` to the envelope (or insert one) and rerun the pipeline.
4. A member cannot accept their own proposal. Set `resolved_by` to the owner or admin who did.

## Step 6 — Log daily discretionary spend

**Allow:** owner, admin, and member. **Advisor and read-only:** deny.

1. Insert a `transactions` row for a flexible purchase.
2. The pipeline settles it against the discretionary envelope (or absorbs the deficit into it).
3. If an `envelope_access_overrides` row for this user and envelope is `hidden`, deny.
4. If the override is `spend_only`, allow the spend and deny any edit of the envelope's rules.
5. This capability is not permission to post an inflow or to edit a historical row. Correcting the ledger is an account-level operation (step 4) unless you later split it. The matrix only grants "log daily discretionary spend" to these three roles.

## Step 7 — Inspect safe-to-spend and the timeline

**Allow:** all five roles, including advisor and read-only.

1. Read `S_daily`, `S_today`, and the 60-day series.
2. Read the warning and breach flags.
3. Do not include envelopes marked `hidden` for this user.
4. Read-only and advisor use the same inspect path. Neither path may call steps 2 through 6.

## Step 8 — Check order inside one request

```text
authenticate
set tenant and user session variables
load active membership
if the action is not allowed for role: deny
if the action names an envelope:
    if override is hidden: deny
    if action configures the envelope and override is spend_only: deny
perform the action
```

Deny with the same response for "wrong tenant" and "unknown id" when the id would reveal that a row exists in another tenant.

## Decision table for common actions

| Action | Minimum role | Override note |
| --- | --- | --- |
| View the daily number | `read_only` | Hidden envelopes stay out of the breakdown. The daily number is still visible. |
| View the 60-day graph | `read_only` | Aggregate `C(τ)` is visible. |
| Record a card purchase | `member` | Denied when the target envelope is hidden. |
| Add a sinking fund | `admin` | Members file a proposal. |
| Reorder waterfall priority | `admin` | Members file a proposal. |
| Connect a bank | `admin` | |
| Invite an advisor | `admin` | |
| Change the plan's owner | `owner` | |
| Change billing | `owner` | |

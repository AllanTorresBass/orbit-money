# Flows

The paths a person actually takes. Each path stays inside the three tabs and a sheet.

## First evening

Blair has never used Orbit. The goal of the first session is one number on screen, then stop.

1. Sign in with an email. It is new, so Create opens.
2. They name it "Harbor" and leave Household selected.
3. They choose "Every two weeks" and next payday Nov 18.
4. They enter $3,000.
5. Today opens. The hero is a real amount, computed from that payday and an empty set of bills. Spending holds the whole $3,000, so the daily pace is that amount divided by the days until Nov 18.
6. A single banner, not a tour, sits under the button for this session only: "Add rent whenever you like. Today already works." Tapping it opens Plan. Ignoring it is a complete success.

Orbit has already created Spending and Emergency. The banner is the only onboarding. There is no checklist and no spotlight tour.

Later, from Plan, an owner adds Rent at $1,200 leaving on Nov 13. Today and Ahead update on save. The hero drops, because part of the paycheck is now reserved. The sentence under the new number still only says when payday is.

## An ordinary purchase

1. Blair opens Today. It is already the landing screen.
2. They tap "Add a purchase", type 40, tap Save.
3. The sheet closes. The hero moves from $112.18 to $72.18.
4. They leave.

No category, no receipt, no second confirmation. The purchase appears under Spending in Plan as "Purchase" with the time, until someone adds a note. The default name is "Purchase", not "Uncategorized".

If Blair is offline, Save keeps the purchase on the device, the hero updates, and the banner reads "You're offline. This purchase will save when you reconnect." The idempotency key means a retry does not record it twice.

## Payday morning

The deposit lands before Blair opens the app. The midnight run, or the moment the deposit is recorded, has already split it.

1. Today shows the new "You can spend" for the new stretch of days.
2. The sentence names the following payday.
3. If they open Plan, the split is the list: bills first, then goals that still have room, then Spending. There is nothing to drag unless they want a different order next time.

They are not asked to categorize the deposit or to move money between buckets. If the deposit was a different amount than the usual $3,000, the list shows the amount that actually arrived.

## Going past today's pace

Blair adds $150 when the opening allowance was $112.18.

1. Save completes.
2. The label becomes "Past today's pace".
3. The number is $37.82, in ink.
4. The sentence is "Tomorrow's pace will be $109.23."
5. Ahead's line uses $109.23 for the days after today, so the picture matches the money left.

There is no modal, no red hero, and no notification for this. A negative Spending balance is different: the banner says "Spending is below zero. The next payday will cover it before ordinary spending resumes." That banner is the alert. It is not a push notification unless they have asked for warnings in You.

## Not enough ahead

Ahead finds a day under the $200 they chose to keep.

1. Today gains one banner: "Nov 22 drops below the $200 you want to keep."
2. The hero may also be lower, because ordinary spending was reduced in the picture so the bank can recover. The sentence says the new pace.
3. Tapping the banner opens Ahead, with Nov 22 labeled.
4. The line is short from the low day through the recovery.
5. Plan is unchanged. Orbit does not move Rent to manufacture the $200.

An owner who wants a different plan edits a goal or the floor. A member who wants a different plan uses "Suggest a change". An advisor sees the same banner and the same line, and has no edit path.

## Suggest, then accept

1. Blair opens Plan, taps Electric, changes the ceiling, taps "Suggest this change".
2. Plan shows "Alex can review this."
3. Alex opens Today, taps Harbor, taps "1 suggestion".
4. The sheet shows "$150 → $180" and Accept or Decline.
5. Accept closes the sheet. If the ceiling changed what payday must set aside, the next open of Today shows the new number. Alex does not have to refresh by hand.

Blair cannot accept their own suggestion. The suggestions row is not in their You sheet.

## Invite an advisor

1. Alex opens You, People, Invite someone.
2. They enter Casey's email and tap Advisor. The line reads "Can look, and cannot move money."
3. Casey opens the invite and taps "Join Harbor".
4. Casey's Today has the hero and no "Add a purchase". Plan has no "Add a bill" and no drag handles.

## What the interface never does

These are product decisions, so a later screen does not "temporarily" add them.

- A pie of categories for coffee, dining, and groceries.
- A manual transfer between Rent and Spending.
- A dashboard of six summary cards.
- A score, a grade, or a streak.
- A chart with more than one line.
- Icons without labels in the bottom bar.
- A greyed-out button for a role that cannot act.
- A setup wizard with more than three questions before the first number.
- Engineering words from the architecture guides.
- A second navigation for "admin" that replaces Today, Ahead, and Plan. Owners live in the same three tabs. Extra tasks are rows inside You.

## How this stays true in build

A screen is done when a person who has not read the architecture can answer the screen's one question out loud, and can name the single filled button. If they cannot, the screen is carrying a second job and should lose it.

Check these with the Harbor numbers before a release:

| Check | Passes when |
| --- | --- |
| First run | A new person reaches a dollar amount in three questions, without adding a bill |
| Today | The only filled button on the phone is "Add a purchase", or there is no filled button for an advisor |
| Purchase | Saving $40 changes the hero by $40, with no category step |
| Past the pace | The sentence names tomorrow's pace, and the hero is not red |
| Ahead | One line, and a sentence that says whether the bank stays above the amount they keep |
| Plan | Bills, then goals, then Spending, in that order, with no priority numbers |
| Member | "Suggest this change" is present, and Save on a bill is absent |
| Advisor | Today, Ahead, and Plan open, and Add a purchase is absent |
| Language | A search of the interface strings finds none of: envelope, waterfall, solvency, discretionary, tenant, tier |

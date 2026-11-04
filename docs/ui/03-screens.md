# Screens

Each screen has one job. Layout is top to bottom. Sample copy uses the Harbor household from the [walkthrough](../09-end-to-end-walkthrough.md): payday on Nov 18, $112.18 to spend after the paycheck, rent set aside, a $200 keep-at-least.

## 1. Sign in

**Job.** Get a known person into their space.

**Who.** Anyone with an account.

```text
Orbit

Email
[ you@example.com        ]

[ Continue ]
```

A code or a password step follows, on the same column, with the same button. There is no illustrated marketing panel beside the form.

If the email is new, the next screen is Create, not an error.

## 2. Create

**Job.** Name the space and learn one payday. Three short steps, one question each. A text button "Back" sits above the title. Progress is "1 of 3", in secondary, not a bar with stages named "Allocation".

**Step 1.** "What should we call this?" Placeholder "Harbor". Under the field, three quiet choices, one selected: Personal, Household, Organization. Default is Household if they type a shared-sounding name, otherwise Personal. They can change it with a tap. The button is "Continue".

**Step 2.** "When does money usually arrive?" Choices as rows, not a calendar widget first: Every week, Every two weeks, Twice a month, Every month, Once a year. Then one date: "Next time". Twice a month asks for the two days ("15th" and "Last day") instead of assuming the 1st and the 15th. Button: "Continue".

**Step 3.** "About how much arrives?" One amount. Sentence: "You can fix this later. Orbit uses it to split payday." Button: "See what I can spend".

Bills, goals, and the bank are not collected here. Asking for them now is how setup becomes a form. They are offered, one at a time, from empty states after the person has seen a number.

On finish, Orbit creates the Spending bucket, an Emergency goal, and points leftover spending at Emergency. The person never sees those as setup tasks.

## 3. Today

**Job.** Say what can be spent, and offer the one action.

**Who.** Every role. The button is omitted for advisor and read-only.

```text
Harbor
Household

You can spend
$112.18
Until payday on Nov 18.

[ Add a purchase ]

Today      Ahead      Plan
```

The name "Harbor" opens You. "Household" is secondary and is not a control.

When today is past the pace, the label becomes "Past today's pace" and the sentence becomes "Tomorrow's pace will be $109.23." The button remains "Add a purchase" for people who can spend. Adding more is allowed. The screen does not scold.

A banner sits above the hero only when Ahead has a shortfall or a getting-low day. One sentence, tappable, opens Ahead already scrolled to that day: "Nov 22 drops below the $200 you want to keep."

There is no list of recent purchases on Today. A purchase is confirmed by the number changing. Recent purchases live at the bottom of Plan, under Spending, labeled "This payday", five rows, then "Show all".

## 4. Add a purchase

**Job.** Record one ordinary amount.

**Who.** Owner, admin, member. Opens as a sheet over Today.

```text
Close

Add a purchase

$40

[ Save ]
```

The amount is focused, and the keypad is up. Save is enabled when the amount is greater than zero.

There is no category, no note field, and no account picker. The purchase lands on Spending and on the only bank account, or on the account marked for everyday spending if they have connected more than one. A note can be added from the purchase row afterward, from "This payday", for someone who wants a reminder. It is not on this sheet.

Save closes the sheet. The hero eases from $112.18 to $72.18. The sentence stays "Until payday on Nov 18."

If the amount would push today past the pace, Save still completes. The hero then reads "Past today's pace". Orbit does not ask "Are you sure?"

## 5. Ahead

**Job.** Show the next 60 days of money in the bank, in one line.

**Who.** Every role. Read only.

```text
Ahead

All money in connected accounts
$5,000

[ single line, Nov 4 to Jan 3 ]

The bank stays above $200.

Nov 13   Rent leaves    $1,200
Nov 18   Payday         $3,000
```

Under the chart, only the days that move the line are listed: payday, a bill leaving the bank, and any day that is getting low or short. Ordinary daily spending is in the line and is not a row per day.

Tapping a row opens that day (screen 6).

If "keep at least" is still $0, the sentence is "The bank stays above $0." A text button, for owner and admin only, sits under it: "Choose an amount to keep."

## 6. One day

**Job.** Explain a single date in one sentence plus the amounts that land that day.

```text
Close

Friday, Nov 13

Rent leaves the bank.
$1,200

Money in the bank that evening
$2,790.74
```

No edit controls. Changing the bill happens in Plan.

## 7. Plan

**Job.** Show how payday was split, in the order money was set aside.

**Who.** Every role reads it. Owner and admin can add and edit. A member can suggest. Advisor and read-only see the list and nothing else.

```text
Plan

Payday on Nov 18
$3,000 arrives

Bills
Rent                         $1,200
Electric                     Set aside

Goals
Emergency                    $0 of $1,000
Car insurance                $600 of $1,000
Vacation                     $1,000

Spending
$1,570 for this payday

This payday
Groceries                    $40
```

Order inside Bills and inside Goals is the priority order. The person changes order by dragging. There is no priority number on screen. A member does not see drag handles. They see "Suggest a change" on a row they are allowed to know about.

"Set aside" means the bill's ceiling is already covered, so this payday added nothing. A short bill shows the dollars still needed, in ink.

Vacation at its goal shows the amount and no "of $1,000" once it has arrived. A goal still filling shows "of".

Spending is one row. Tapping it explains, in a sheet: "This is for ordinary days. What you don't use by Nov 18 goes to Emergency, then to other goals that still have room."

Owner and admin see a text row at the bottom of each section: "Add a bill" or "Add a goal".

## 8. A bill or a goal

**Job.** Edit one planned item, or read it.

```text
Close

Rent

Amount each payday
$1,200

Leaves the bank
Friday, Nov 13

[ Save ]
```

A goal uses "Set aside each payday" and "Stop when it reaches". Stop when it reaches can be left empty. The sentence under an empty stop is "Orbit will keep setting this amount aside."

A member sees the same fields as text, and the button is "Suggest this change". Saving a suggestion returns to Plan with a banner: "Alex can review this."

Owner and admin have "Remove" as a text button at the bottom. Removing a bill that already has history asks one question: "Remove Rent? Past paydays stay in the record." Confirm is "Remove".

## 9. Suggestions

**Job.** Let an owner or admin accept or decline a member's idea.

Shown inside You, as a row "2 suggestions", and only when the count is greater than zero. The list is plain rows: "Blair suggests Electric ceiling $180." Open one.

```text
Blair suggests

Electric ceiling
$150  →  $180

[ Accept ]  [ Decline ]
```

Accept applies it and returns. The hero and Ahead update if the change moved the numbers. Decline needs no reason.

## 10. You

**Job.** The few tasks that are not Today, Ahead, or Plan.

Opened from the household name. A sheet.

| Row | Who |
| --- | --- |
| Suggestions, with a count | Owner, admin, when any are waiting |
| People | Owner, admin |
| Bank | Owner, admin |
| Keep at least | Owner, admin |
| Billing | Owner |
| Sign out | Everyone |

Advisor and read-only see Sign out, and the household switcher when they belong to more than one. The sheet is still titled with their name and the role in secondary text: "Casey, advisor". The role word is human: Owner, Admin, Member, Advisor, View only.

## 11. People

**Job.** See who is here, and invite someone.

```text
People

Alex          Owner
Blair         Member
Casey         Advisor

[ Invite someone ]
```

Tapping a person offers a role change and "Remove", within what that role is allowed to do. An admin does not see a way to change the owner. The last owner cannot be removed. The screen says "Harbor needs an owner." when that is the reason a control is missing, rather than failing after a tap.

Invite is one email, then a role chosen from rows with one line each:

| Role on screen | Line |
| --- | --- |
| Owner | Can do everything, including billing |
| Admin | Can edit the plan, the bank, and people |
| Member | Can spend, and can suggest changes |
| Advisor | Can look, and cannot move money |
| View only | Can look, and cannot move money |

The button is "Send invite".

## 12. Bank

**Job.** Name the accounts whose cash Ahead is watching.

```text
Bank

Checking                 $5,000
Everyday spending

[ Add an account ]
```

"Everyday spending" marks the account ordinary purchases use. One account can hold that mark.

"Add an account" asks for a name and a current balance. Connecting a feed, when one exists, is the same screen with a second text button: "Connect a bank instead". The balance they type is enough for the product to work.

## 13. Keep at least

**Job.** Set the floor in words.

```text
Keep at least

$200

Orbit will warn you if a coming day
falls below this.

This week of spending is $785.
The guide's example is $200.

[ Save ]
```

"This week of spending" is seven times the current daily pace, rounded to the dollar, offered as a tappable suggestion. "$200" is a second suggestion. The field starts empty for a new space, which means the floor is $0 until they save a number.

## 14. Invite acceptance

**Job.** Land a new person in the right household with no setup.

```text
Alex invited you to Harbor.

You'll be a member.
You can add purchases and suggest changes.

[ Join Harbor ]
```

Join opens Today. They do not walk through Create.

## 15. Something went wrong

**Job.** One sentence and one recovery, on the screen they were already on.

| Situation | Sentence | Action |
| --- | --- | --- |
| No connection | "You're offline. Today's number is from earlier." | None, until the network returns, then the number refreshes |
| Save failed | "That purchase wasn't saved." | "Try again" |
| Payday missing | "Add a payday" on the hero | The button |
| Two people edit one bill | "Alex saved a newer version of Rent." | "Show me" reloads the row |

There is no error-code screen and no toast stack. A failure replaces the button label for a moment, or replaces the banner area.

# Visual design

A small system. If a new screen needs a new component, the screen is probably doing two jobs.

## Color

One paper, one ink, one quiet green. Warning and trouble are used only in a sentence that already explains them.

| Role | Light | Dark | Used for |
| --- | --- | --- | --- |
| Paper | `#F4F1EA` | `#141311` | The whole screen |
| Ink | `#1C1917` | `#F4F1EA` | The number, titles, the filled button |
| Secondary | `#6F6A63` | `#A39E96` | The sentence under the number, dates, inactive tabs |
| Line | `#E6E1D8` | `#2A2724` | A hairline between rows |
| Fine | `#1F6B4A` | `#8FCBB0` | The hero number when today is within its pace and Ahead has no shortfall |
| Low | `#8A5A12` | `#E2C08A` | The words "Getting low" |
| Short | `#8E2F2F` | `#F0B4B4` | The words "Not enough ahead" |

The filled button is ink with paper text. It does not turn green. Green is reserved for the hero number so the screen has one accent.

Dark mode follows the system setting. It uses the same layout. It is not a separate theme with extra chrome.

Contrast for ink on paper, and for paper on the filled button, meets WCAG 2.2 AA. Secondary text is at least 4.5:1 against paper at 15px and above. The fine green is used at 72px, where large-text contrast applies, and the sentence under it is ink or secondary, never green alone.

## Type

Two families, used with discipline.

| Use | Face | Size | Weight |
| --- | --- | --- | --- |
| Hero number | A text serif with tabular figures | 72px on a phone, 88px in the desktop column | Regular |
| Screen title | The same serif | 28px | Regular |
| Body and buttons | A neutral grotesque | 17px | Regular |
| Row title | Grotesque | 17px | Medium |
| Sentence under the hero, dates, tab labels | Grotesque | 15px | Regular |
| Rare meta, such as "Edited by Alex" | Grotesque | 13px | Regular |

The serif is for the amount and the screen title only. A second display style, a condensed face, or all-caps labels are not part of the system.

Line height is 1.45 for sentences and 1.0 for the hero number. The hero uses tabular figures so `$112.18` does not shift sideways when it updates.

The minimum body size is 17px. Nothing the person must read is smaller than 15px.

## Space

An 8-point scale: 8, 16, 24, 40, 64.

- Screen padding is 24 on the sides.
- The hero block has 40 above the label and 40 below the sentence.
- Rows are 64 tall, with a hairline on the bottom. They are not cards.
- Sections are separated by 40, and by a short serif title ("Bills", "Goals") in ink.
- The bottom bar is 64 tall, plus the system safe area. The primary button sits 16 above that bar, full width inside the 24 padding.

The content column maxes out at 480. Wider windows do not add a sidebar.

## Shape

Corners are almost square.

- Filled button: 14px radius, 56 tall.
- A sheet: 20px on the top corners. The rest of the app is flat.
- Rows, fields, and the navigation have no radius and no shadow.

Fields are a line under the text, not a boxed input. The typed amount uses the serif at 48px.

## Parts

The whole product is these parts.

| Part | What it is |
| --- | --- |
| Hero | Label, amount, one sentence |
| Button | One filled button, or a text button for the secondary step ("Not now") |
| Row | A name on the left, an amount on the right, an optional second line in secondary |
| Sheet | A panel that covers Today from the bottom, with "Close" and one task |
| Banner | One sentence at the top of Today or Ahead. No icon required. No dismiss unless the sentence is about a past day |
| Line chart | A single stroke for money in the bank across 60 days. No grid, no second series, no legend |

Lists do not have avatars, progress rings, or status pills. A bill that is fully set aside shows its amount in secondary text: "Set aside $1,200". A bill that is still short shows ink: "$1,200 still to set aside".

## Motion

Motion explains a change. It does not decorate.

- The hero number eases to the new amount in 200ms.
- A sheet rises in 240ms and closes in 180ms.
- The chart stroke draws once, in 400ms, the first time Ahead is opened in a session.

Nothing bounces. Nothing loops. When the system setting "reduce motion" is on, numbers and sheets appear in place.

## The hero, in the three states

The layout does not change. The sentence and the number color do.

**Within the pace.** Number in fine green.

```text
You can spend
$72.18
Until payday on Nov 18.
```

**Past the pace.** Number in ink. The pace is named so the negative amount has a meaning.

```text
Past today's pace
$37.82
Tomorrow's pace will be $109.23.
```

**Nothing to divide.** Number omitted. This is the only hero without an amount.

```text
Add a payday
Orbit needs to know when money arrives
before it can say what you can spend.
```

The button under that sentence is "Add a payday".

## Ahead, the line

The line is ink. A day that is getting low turns the line low from that day forward until it recovers. A day that is not enough turns the line short from that day to the end of the shortfall.

Under the line, one sentence:

- "The bank stays above $200."
- "Nov 22 gets close to the $200 you want to keep."
- "Nov 22 drops below the $200 you want to keep. Ordinary spending is paused in this picture so the bank can recover."

There are no axes full of numbers. The left edge is labeled with today's bank balance. The low point is labeled with its date and amount, and only when it is getting low or short.

## Writing on the screen

- One sentence. If a second sentence is needed, it is because the first would be false without it.
- "You" for a personal space. "Harbor" or "the household" when the space is shared.
- No exclamation marks. No "oops", "uh oh", or "great job".
- Errors say what to do: "That amount isn't a number yet." The field stays, and the button stays put until the amount is valid.
- Empty areas are one sentence and, when the role allows, one button. "No bills yet." and "Add a bill".

# MyCAL

A cinematic week calendar that acts as an external brain.

Opens straight to your week. No dashboard, no AI planner, no productivity score.
**If it matters, it lives on the calendar. If it isn't on the calendar, you didn't plan to do it.**

**Live:** https://migthycoder.github.io/MyCAL/ — installable to a phone home
screen, and it opens with no signal.

```bash
npm run dev
```

Then open http://localhost:5273.

Data lives in your browser by default. Cross-device sync is optional and off
until you set it up — see [SYNC-SETUP.md](SYNC-SETUP.md). Sign-in is an email and
a password: emailed links are single-use, expire, and on a phone open the browser
instead of the installed app, so the session ends up somewhere you aren't.

---

## The two kinds of blocks

| | Examples | After it passes |
|---|---|---|
| **Event / commitment** | school, Streetplays, Yuva Kendra, appointments | nothing — it just happened |
| **Task / work block** | CCIR, SAT, Vantage prep, gallery editing | **Needs outcome → Finished / Reschedule / Drop** |
| **Flex period** | 3rd and 4th | **Needs outcome → one tap: Friends / Study–work / Personal / Other** |

Rescheduling never moves the original. The old block stays where you planned it,
dashed out, tagged `→ Fri 4 PM`, with an optional reason ("couldn't work in car —
bad service"). Months later you can read back how your life actually went without
having journaled anything.

## School

`My classes` sets up the whole year from the official MHHS 2026–27 bell schedule.
You name your seven classes **once** (5th period is SUCCESS, every day) and MyCAL
places them correctly on every date:

- **Mon–Wed** — regular, eight short periods
- **Thursday** — block: 1st, 2nd, Advisory, 3rd, 4th
- **Friday** — block early release: 6th, 7th, 8th
- **Rally Fridays** (10/23, 1/15, 3/19), **conferences** (10/19–20), **finals**
  (12/15–18, 5/25–28) — all dated and handled automatically

The `⋯` on any day header swaps that day's bell schedule, including **No school**
for holidays and the CAASPP testing days the district hasn't dated yet.

A Flex holds a **plan in priority order**, because you rarely have exactly one
thing to do with it:

```
FLEX
PLANNED
1. Calc HW
2. English essay draft
Did: Calc HW, English essay draft
```

It always says **Planned** and **Did**, however many items there are — the labels
are what make it readable months later.

Reorder with ↑ ↓ in the editor. After it passes, one tap answers it — **✓ The
plan** records what you'd written, or Friends / Study–work / Personal, or type
your own. The gap between what you meant to do and what you did is the entire
reason for writing them down, so reporting never erases the plan.

## Rescheduling

Four ways, because "when" isn't always a time you know off the top of your head:

- **Into a Flex or SUCCESS.** The sheet lists the target day's actual periods, so
  you never have to go and look up when Flex is on a block day. The task goes
  *into* that period's plan rather than stacking a block on top of it — Flex is
  already the slot for doing your own work, so laying a box over it says nothing.
  It lands at the end of that Flex's plan, with a preview of the result; reorder
  from the Flex itself whenever, rather than having to decide mid-move.
- **An open gap.** Real holes in that day, found by merging what's booked and
  reporting what's left, filtered to slots your task actually fits in.
- **A time you type.** As before.
- **Pick on the calendar.** Drops you back on the grid — any day, any week — and
  the next time you drag becomes the target.

- **SUCCESS** shows `Open` until you write something for that day.
- **Flex** is a period you *have*, not a slot in the bell schedule — mark 3rd and
  4th (or whichever) as Flex in setup. Those are the only school blocks that ask
  for anything: optional `Planned:` beforehand, then one tap afterwards from
  **Friends · Study/work · Personal · Other** to record `Did:`. Because 3rd and
  4th run Mon–Wed and again on Thursday's block day, that's eight Flex periods a
  week you can actually see the shape of.
- Everything else in school — classes, Advisory, SUCCESS, Lunch — never asks for
  an outcome. You don't "complete" a class.

## It wasn't watching before you started

MyCAL builds your whole year from the bell schedule, so on day one it already
knows about every period since August. It will not nag you about any of them.
Nothing before **Start holding me accountable from** (set in setup, defaults to
the day you set it up) can ever say `Needs outcome` — those weeks show your real
schedule, they're just history.

## Interactions

Glance first, interact second. The default state should tell you everything.

| | |
|---|---|
| Drag empty time | new block — a plain **click** just dismisses, it never creates one |
| Double-click empty time | new 45-minute block there |
| **Long-press a block (phone)** | it lifts off the grid and follows your finger — drag up or down to move it in the day, or onto a day in the week strip to move it to that day |
| **Tick a to-do's box** | done — one tap, and tap again to undo |
| **Tap a to-do's text** | its editor: rename, move, drop, delete |
| **Hover a commitment** | a `＋` rail fades in over its right edge, the `＋` tracking your cursor — click or drag there to add something alongside at that exact time. Nothing on the grid moves |
| Click a block | inline note for **that day only** — type, Enter, done |
| `＋` in an open block | same thing, from the keyboard-ish path |
| Double-click a block | full editor: **rename**, markers, outcome, times, colour, location, duplicate, delete |
| Click a date | expand that day; click again to collapse |
| Click the date range | jump to any week |
| `←` `→` `T` `Esc` | prev / next / today / collapse |

Intentional overlaps are a feature — but only on **commitments you added**
(Streetplay, Yuva Kendra, a drive). Classes and tasks never offer the rail: you
aren't doing side work during 3rd period, and a task is already the thing you're
doing. MyCAL asks what makes the overlap work, then shows the reason as the
block's header:

```
WORK IN CAR
CCIR Workshop 3
```

Two blocks sharing time can mean three different things, so they look three
different ways:

| | Looks like | Because |
|---|---|---|
| One **fits inside** the other | frosted pane on top, inset left so a stripe of the host shows | one is *where you are*, the other is *what you're doing there* |
| They **clip** each other | cascaded — the later one laid over the earlier, offset right, shadow falling left | neither contains the other; one just runs into the next |
| They **start together** | split into even columns | genuinely competing for the same hour |

Splitting was the original behaviour for all three, and it was wrong twice: two
tall blocks at half width each is unreadable, and it claims a competition that
isn't there. A cascaded block hides the clock on whatever it covers, since half a
time range reads worse than none. A rider never gets a rail of its own — an
overlap on an overlap isn't a thing.

A day can hold as many notes as it needs — a test *and* two things due *and*
something to ask about is an ordinary Wednesday. Each is a line coloured by what
it is, and each *kind* gets its own chip, because a test and a due date are
different facts and both deserve saying:

```
AP CALCULUS BC
[TEST] [DUE (2)]
● Integrals unit 3
● 9.1 homework
● Study guide
```

Clicking a block to jot only ever touches the first *unlabelled* note, so quickly
writing "ask about grade" can't overwrite the test you already put there. Labels
and extra rows live in the editor.

## Notes always wrap

A note never gets an ellipsis. Three things keep it readable:

1. **Notes wrap** instead of truncating, and they outrank the clock — a block
   drops its `1:11–1:59 PM` line before it drops a word of what you wrote.
2. **The `− ＋` zoom** in the header sets row height. At the default a 30-minute
   SUCCESS holds two full lines; one step up holds four. It's saved, so set it
   once for your screen.
3. **Hovering grows a block** past its slot to show the rest, floating over what's
   below. This works on *every* block including classes and SUCCESS — it's
   separate from the commitment-only rail. Blocks whose text already fits don't
   move, so nothing jitters.

---

## Renaming

Every block's editor opens with its name as a text field. Renaming something that
repeats asks which you meant — **every time** or **just this day** — and renaming
a class writes back to your roster, so one edit fixes all 180 days of it.

## Layout

```
src/lib/
  bell.ts          MHHS 2026-27 bell schedules + dated exceptions
  types.ts         Series (definition) vs Override (one specific day)
  occurrences.ts   expands series + bell schedule into dated blocks
  layout.ts        column packing for overlapping blocks
  time.ts          minutes-from-midnight helpers
  store.ts         state, localStorage, all mutations
```

The core idea: a **Series** is a definition, an **Override** is everything you
wrote about one specific day of it. That's why Monday's SUCCESS can say
"See Lohmann" while Tuesday's still says "Open", and why a schedule change ends
the old series instead of erasing it.

## To-dos

Not everything has a time. "Call grandma before bed" isn't a 30-minute block, and
giving it one makes the grid lie about your evening.

So a to-do is a **line across the day** rather than a box: a dashed rule, a dot,
the text, and nothing claiming a slot it doesn't take. It lands after everything
else you've got on that day, and you can drag it anywhere — including out of the
way to fit something under it.

It is still a task. Once it passes it reads `done?`. The box on the left is a
real checkbox — one tap finishes it, another undoes it — and the rest of the line
is left free to be dragged. Tapping the text opens its editor for renaming,
moving, dropping or deleting. Moving keeps the history trail like any other
reschedule. Two to-dos at the same moment stack instead of printing over each
other.

Add one with `+ Block` → **To-do**.

## On a phone

Below 760px the seven columns collapse to a single day with a week strip on top —
tap a day, or swipe the grid left and right. Each strip chip carries an amber dot
if that day owes you an outcome and a blue bar if its bell schedule isn't the
usual one, so you can see the week without opening it.

Add it to your home screen and it runs full-screen, offline, with the schedule
already in it.

## Not built yet

- Recurring blocks you create yourself are weekly only (no "every other Tuesday").
- Dragging a block onto a different day lifts it out of its series as a one-off.
- The hover rail is mouse-only; on touch, add alongside via a block's `＋`.

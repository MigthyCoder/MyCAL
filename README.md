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
until you set it up — see [SYNC-SETUP.md](SYNC-SETUP.md).

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
| Drag empty time | new block |
| **Hover a commitment** | a `＋` rail fades in over its right edge, the `＋` tracking your cursor — click or drag there to add something alongside at that exact time. Nothing on the grid moves |
| Click a block | inline note for **that day only** — type, Enter, done |
| `＋` in an open block | same thing, from the keyboard-ish path |
| Double-click a block | full editor: markers, outcome, times, color |
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

**A block that fits inside a commitment rides on top of it**, as a frosted pane
inset from the left so a stripe of the block underneath still shows. It does not
split the column. A rider never gets a rail of its own — an overlap on an overlap
isn't a thing. Side-by-side would claim the two things compete for the time —
they don't; one is *where you are* and the other is *what you're doing there*.
Blocks that genuinely clash (neither contains the other) still split into
columns, and riders that clash with each other split within their host's width.

Tests and due dates get a chip on the title line rather than a plain note, because
`AP CALC BC · TEST · Integrals unit 3` should not look like `AP CALC BC · Lasnier C12`.

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

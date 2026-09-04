/**
 * The calendar's proportions, in one place.
 *
 * These used to be literals scattered across BlockCard and WeekGrid — a bare
 * `18` for the shortest a block may be, `30` and `46` for when it drops text,
 * `'minmax(0, 3.4fr)'` inline in a template string. Each was defensible alone
 * and none of them agreed with the others, so changing the type scale left the
 * height thresholds behind and a denser grid produced blocks too short to read.
 *
 * Everything here derives from two things: how tall an hour is, and how tall a
 * line of block text is. Nothing else in the calendar should invent a number.
 */

/* ------------------------------------------------------------------ density */

/**
 * Row height expressed as pixels per hour, which is how you actually think
 * about a calendar — "an hour is about this tall" — rather than the
 * pixels-per-minute the grid maths wants.
 *
 * Five steps, roughly a major-third apart so each is visibly different from
 * the last rather than a nudge. `comfortable` is the default: at 112px/hour a
 * 50-minute class is 93px, which holds a title, a teacher line and a time
 * without any of them truncating.
 */
export const HOUR_HEIGHTS = [64, 88, 112, 144, 184] as const
export const DEFAULT_HOUR_HEIGHT = 112

export const perMinute = (hourHeight: number) => hourHeight / 60
export const hourHeightOf = (pxPerMin: number) => pxPerMin * 60

/** Stored densities are pixels-per-minute, so the steps the +/- buttons walk
 *  are these heights converted. Kept as the same shape the store already
 *  exports so nothing downstream has to know this changed. */
export const DENSITY_STEPS = HOUR_HEIGHTS.map(perMinute)
export const DEFAULT_DENSITY = perMinute(DEFAULT_HOUR_HEIGHT)

/* ------------------------------------------------------------------- blocks */

/** One line of block text: 12px title at 1.25, or an 11px subtitle at 1.3. */
export const LINE_H = 15
/** Vertical padding inside a block, top + bottom, matching .block's CSS. */
export const BLOCK_PAD_Y = 10
/** The border, top + bottom. */
export const BLOCK_BORDER_Y = 2

/**
 * The shortest a block may be drawn.
 *
 * Was 18px, which is shorter than a single line of its own text — a 10-minute
 * block rendered as a coloured sliver with the title clipped inside it. One
 * line plus padding is the floor: if a block is on the grid at all, its name
 * has to be readable.
 */
export const BLOCK_MIN_H = LINE_H + BLOCK_PAD_Y + BLOCK_BORDER_Y // 27

/** Title only — no room for a second line. */
export const BLOCK_TITLE_ONLY_H = BLOCK_MIN_H + LINE_H // 42
/** Title and subtitle both fit. */
export const BLOCK_TWO_LINE_H = BLOCK_TITLE_ONLY_H + LINE_H // 57

/**
 * A pin is a moment, not a span, so its height is its own rather than earned
 * from a duration of zero. Sized to the same single-line floor as everything
 * else so a pin and the shortest possible block agree.
 */
export const PIN_H = BLOCK_MIN_H

/** Opened for editing: enough for the title, a note field and the actions. */
export const BLOCK_OPEN_H = 104
/** A Flex opened for an outcome also carries the quick-pick row, which wraps. */
export const BLOCK_OPEN_FLEX_H = 156

/**
 * Horizontal breathing room, in px, taken off each block.
 *
 * Blocks in the same column used to butt directly against each other, so two
 * back-to-back classes read as one tall shape with a line through it. A small
 * gutter each side is what makes them read as separate objects without
 * spending real width.
 */
export const BLOCK_GAP_X = 3
export const BLOCK_INSET_X = 3

/* --------------------------------------------------------------------- grid */

/**
 * Column widths when one day is focused, as grid fractions.
 *
 * The focused day needs to be obviously the subject without the other six
 * collapsing into unreadable slivers — below about 0.6fr a weekday column can
 * no longer hold "AP Biology" on one line at this type size.
 */
export const COL_FOCUSED = 3.4
export const COL_UNFOCUSED = 0.7
export const COL_EVEN = 1

/** Width of the hour-label gutter. Wide enough for "12:30 PM" at the time-axis
 *  size, and no wider — every px here is taken from the days. */
export const GUTTER_W = 56
export const GUTTER_W_MOBILE = 44

/** How far above the current time the grid scrolls on open, in minutes. Enough
 *  that what just happened is still on screen above "now". */
export const SCROLL_LEAD_MIN = 105

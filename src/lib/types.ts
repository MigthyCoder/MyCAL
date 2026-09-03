import type { BellSchedule, WeekdayMap } from './bell'

/** Everything in MyCAL is either something that HAPPENED TO you or something you
 *  INTENDED TO DO. That distinction is the whole product, so it's the first type. */
export type Kind =
  | 'event' // school, Streetplays, Yuva Kendra, appointments — occupies time, no follow-up
  | 'task' // CCIR, SAT, gallery edits — must be resolved after it passes

export type Category = 'school' | 'work' | 'commitment' | 'personal'

/** Flex is the one school block that behaves like a task: you plan it, then you
 *  have to say what you actually did. */
export type SchoolRole = 'class' | 'flex' | 'success' | null

export type Outcome = 'finished' | 'rescheduled' | 'dropped'

export type MarkerType = 'test' | 'quiz' | 'due' | 'presentation'

export interface Marker {
  type: MarkerType
  label: string
}

/**
 * One thing written against a day. A plain jot has no marker; a test or a due
 * date is the same thing wearing a label. A day can hold several — a test and a
 * pset due and something to ask about is an ordinary Wednesday.
 */
export interface DayNote {
  id: string
  text: string
  marker?: MarkerType
}

/** A Series is the definition of a block. A one-off block is just a series whose
 *  recurrence is null. Nothing about a series changes when you edit a single day —
 *  that's what Override is for. */
export interface Series {
  id: string
  title: string
  kind: Kind
  category: Category
  schoolRole: SchoolRole
  /** Shown under the title when a given day has no note of its own. SUCCESS uses "Lunch". */
  defaultSubtitle?: string
  location?: string
  startMin: number // minutes from midnight
  endMin: number
  /** null = one-off on anchorDate. Otherwise repeats weekly on these weekdays (0=Sun). */
  recurrence: { byDay: number[]; until?: string } | null
  anchorDate: string // 'YYYY-MM-DD' — first day this exists
  createdAt: number
  /** Why this block is allowed to overlap another one. "Work in car", "Editing on phone". */
  overlapReason?: string
  /**
   * A moment rather than a span. "Call grandma before bed" has no duration you
   * could honestly draw, so it's a line on the grid instead of a box — but it's
   * still something you meant to do, so it still owes you an outcome.
   */
  pin?: boolean
  archived?: boolean
}

/** Everything you write about ONE specific day of a series lives here. This is why
 *  Monday's SUCCESS can say "See Lohmann" while Tuesday's still says "Lunch". */
export interface Override {
  seriesId: string
  date: string // 'YYYY-MM-DD'

  // --- glanceable layer ---
  notes?: DayNote[]
  /** @deprecated single-note shape, migrated into `notes` on load */
  subtitle?: string
  /** @deprecated single-marker shape, migrated into `notes` on load */
  marker?: Marker

  // --- this-day-only reshaping ---
  title?: string
  startMin?: number
  endMin?: number
  cancelled?: boolean

  // --- accountability ---
  outcome?: Outcome
  outcomeNote?: string // "couldn't work in car — bad service"
  movedTo?: { date: string; startMin: number } // history pointer, never cleared

  // --- flex: planned vs did ---
  /** @deprecated single-plan shape; migrated into `notes` on load, in order */
  planned?: string
  did?: string

  // --- after the fact, for normal events ---
  afterNote?: string
}

/**
 * Something to do with no date on it at all.
 *
 * Everything else here is anchored to a day, because the whole product is about
 * time you actually have. But "email Ms. Chen" is real work that isn't a promise
 * about Tuesday, and forcing a date onto it means either lying to yourself or
 * not writing it down. So this is the one thing the calendar deliberately does
 * not place: a pile you work off when a gap opens up.
 *
 * Deliberately not a Series: a Series must expand into dated occurrences, and
 * giving one a fake anchorDate would put it on the grid, which is exactly what
 * this is for avoiding.
 */
export interface Task {
  id: string
  text: string
  done?: boolean
  createdAt: number
  /** When it got ticked, so "done" can be shown newest-first and swept later. */
  doneAt?: number
  /**
   * The block this got scheduled as. The task stays in the list rather than
   * disappearing onto the grid: you wrote it down because you wanted to see it
   * until it is actually done, and giving it a time does not make that less
   * true. Ticking either side resolves the other.
   */
  seriesId?: string
  /** Which day that block sits on. Outcomes are per-date, so resolving the
   *  block from this side needs the date as well as the series. */
  scheduledFor?: string
  /** Same four categories everything else uses, so a task carries its colour
   *  onto the grid instead of every scheduled task landing the same shade. */
  category?: Category
}

/**
 * Something to do on a day, with no particular time. "Call grandma" isn't a
 * 30-minute block and pretending it is makes the grid lie about your evening.
 */
export interface Reminder {
  id: string
  date: string // 'YYYY-MM-DD'
  text: string
  done?: boolean
  createdAt: number
}

/** Your roster, keyed by period number. Only periods your schedules actually
 *  teach appear — a period that is study hall everywhere never shows up.
 *  `flex` marks a period that's discretionary time rather than a class — those
 *  are the only blocks that ask what you actually used them for. */
export type ClassRoster = Record<string, { title: string; room?: string; flex?: boolean }>

export interface SchoolConfig {
  enabled: boolean
  startDate: string
  endDate: string
  classes: ClassRoster
  showBreakfast: boolean
  showLunch: boolean
  /** What SUCCESS says on a day you haven't written anything for it. */
  successDefault: string
  /** Your own per-date schedule swaps — holidays, breaks, undated testing days. */
  dayOverrides: Record<string, string>
  /** Your school's day shapes, keyed by id. Editable: this is the whole point
   *  of the calendar not being welded to one school's bell sheet. */
  schedules: Record<string, BellSchedule>
  /** Which shape each weekday normally runs, keyed by `Date.getDay()`. */
  weekdays: WeekdayMap
  /** Dated exceptions off the school calendar — rallies, finals, conferences.
   *  Distinct from `dayOverrides`, which is what *you* changed by hand. */
  specialDates: Record<string, string>
  /** Which preset this started from, if any. Only used to label the UI. */
  presetId?: string
}

export interface DB {
  version: 1
  /** Pixels per minute. Taller rows mean short blocks can hold a wrapped note
   *  instead of truncating it — that's the whole reason this is adjustable. */
  density: number
  /** When this device last changed something. Missing on documents written
   *  before sync existed, which are treated as fresh. */
  touchedAt?: number
  /** The day you started using MyCAL. Nothing before this ever asks for an
   *  outcome — the calendar knows your year, but it wasn't watching yet. */
  startedOn: string
  series: Series[]
  overrides: Override[]
  reminders: Reminder[]
  /** Undated work. Absent on documents written before it existed, which load()
   *  fills with an empty list. */
  tasks?: Task[]
  school: SchoolConfig
  onboarded: boolean
}

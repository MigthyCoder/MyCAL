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

/** Your roster, keyed by period number. Period 5 is SUCCESS, so it's never here.
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
  school: SchoolConfig
  onboarded: boolean
}

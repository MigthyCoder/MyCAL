import type { Category } from './types'

/**
 * `lift` corrects for HSL lightness not being perceptual.
 *
 * At one fixed L, a yellow reads far lighter than a violet — so a single border
 * lightness that gives purple a crisp edge on white leaves teal and amber at
 * ~2:1, under the 3:1 a UI boundary needs. Measured against the light surface,
 * these are the points each hue has to come down to land near 5:1 like the
 * others. Only light mode uses it: on a dark surface the light hues are the
 * *more* visible ones, so the error runs the safe way.
 */
export const CATEGORY_META: Record<Category, { label: string; hue: number; lift: number }> = {
  school: { label: 'School', hue: 258, lift: 0 },
  work: { label: 'Work', hue: 38, lift: 20 },
  commitment: { label: 'Commitment', hue: 168, lift: 24 },
  personal: { label: 'Personal', hue: 320, lift: 7 },
}

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[]

/** Quick answers for "what did you actually use that Flex for?" — the point is
 *  one tap, not a journaling prompt. */
export const FLEX_OPTIONS = ['Friends', 'Study / work', 'Personal', 'Other'] as const

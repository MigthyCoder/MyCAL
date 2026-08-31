import type { Category } from './types'

export const CATEGORY_META: Record<Category, { label: string; hue: number }> = {
  school: { label: 'School', hue: 258 },
  work: { label: 'Work', hue: 38 },
  commitment: { label: 'Commitment', hue: 168 },
  personal: { label: 'Personal', hue: 320 },
}

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[]

/** Quick answers for "what did you actually use that Flex for?" — the point is
 *  one tap, not a journaling prompt. */
export const FLEX_OPTIONS = ['Friends', 'Study / work', 'Personal', 'Other'] as const

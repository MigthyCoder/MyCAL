import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn's class helper: clsx for conditionals, tailwind-merge so a caller's
 *  utility wins over the variant's instead of both landing and last-in-the-
 *  stylesheet deciding. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

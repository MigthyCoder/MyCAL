import type { ReactNode } from 'react'
import { CATEGORIES, CATEGORY_META } from '../lib/seed'
import type { Category } from '../lib/types'

export function Sheet({
  onClose,
  wide,
  children,
}: {
  onClose: () => void
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`sheet ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function TimeField({
  value,
  onChange,
  ...rest
}: { value: number; onChange: (min: number) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
>) {
  const hh = String(Math.floor(value / 60)).padStart(2, '0')
  const mm = String(value % 60).padStart(2, '0')
  return (
    <input
      {...rest}
      type="time"
      className="field"
      value={`${hh}:${mm}`}
      onChange={(e) => {
        const [h, m] = e.target.value.split(':').map(Number)
        if (!Number.isNaN(h) && !Number.isNaN(m)) onChange(h * 60 + m)
      }}
    />
  )
}

export function CategoryPicker({
  value,
  onChange,
}: {
  value: Category
  onChange: (c: Category) => void
}) {
  return (
    <div className="swatches">
      {CATEGORIES.map((c) => (
        <button
          key={c}
          className="swatch"
          title={CATEGORY_META[c].label}
          aria-pressed={value === c}
          // @ts-expect-error custom property
          style={{ '--h': CATEGORY_META[c].hue }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function DayPicker({
  value,
  onChange,
}: {
  value: number[]
  onChange: (v: number[]) => void
}) {
  return (
    <div className="dowpick">
      {DOW.map((d, i) => (
        <button
          key={i}
          aria-pressed={value.includes(i)}
          onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}
        >
          {d}
        </button>
      ))}
    </div>
  )
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

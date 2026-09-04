import { ChevronLeft, ChevronRight, Minus, Plus, GraduationCap } from 'lucide-react'
import { Button } from './shadcn/button'
import { Separator } from './shadcn/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './shadcn/tooltip'
import { ThemeToggle } from './ThemeToggle'
import { SyncButton } from './SyncSheet'
import { dateKey, fmtMonthRange, parseKey, startOfWeek } from '../lib/time'
import { DENSITY_STEPS, setDensity } from '../lib/store'

/** Icon-only controls say nothing to a screen reader and nothing to a new user
 *  either, so every one of them carries both a label and a tooltip. */
function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

interface Props {
  days: Date[]
  density: number
  thisWeek: boolean
  schoolEnabled: boolean
  isMobile: boolean
  onJump: (n: number) => void
  onPickDate: (d: Date) => void
  onToday: () => void
  onOpenSync: () => void
  onOpenSchool: () => void
  onCreate: () => void
}

export function Topbar({
  days,
  density,
  thisWeek,
  schoolEnabled,
  isMobile,
  onJump,
  onPickDate,
  onToday,
  onOpenSync,
  onOpenSchool,
  onCreate,
}: Props) {
  const stepDensity = (dir: 1 | -1) => {
    const i = DENSITY_STEPS.findIndex((d) => (dir === -1 ? d >= density : d > density))
    setDensity(
      dir === -1
        ? DENSITY_STEPS[Math.max(0, i - 1)]
        : DENSITY_STEPS[i === -1 ? DENSITY_STEPS.length - 1 : i],
    )
  }

  return (
    <div className="topbar">
      <div className="brand">
        <h1>MyCAL</h1>
        {!isMobile && <span>your life, in time</span>}
      </div>

      <div className="nav">
        <div className="navgroup">
          <IconAction label="Previous week" onClick={() => onJump(-1)}>
            <ChevronLeft />
          </IconAction>

          {/* Looking back at an old week is a first-class use of this thing, so
              the range doubles as a jump-to-date control. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="range jump">
                {fmtMonthRange(days)}
                <input
                  type="date"
                  aria-label="Jump to a date"
                  value={dateKey(days[0])}
                  onChange={(e) => {
                    if (!e.target.value) return
                    onPickDate(startOfWeek(parseKey(e.target.value)))
                  }}
                />
              </label>
            </TooltipTrigger>
            <TooltipContent>Jump to a date</TooltipContent>
          </Tooltip>

          <IconAction label="Next week" onClick={() => onJump(1)}>
            <ChevronRight />
          </IconAction>
        </div>

        {!thisWeek && (
          <Button variant="ghost" size="sm" onClick={onToday}>
            Today
          </Button>
        )}

        <Separator orientation="vertical" className="!h-5" />

        {/* Row height. Grouped with the appearance switch because both are about
            how the calendar looks rather than what is on it. */}
        {!isMobile && (
          <div className="navgroup">
            <IconAction
              label="Shorter rows"
              disabled={density <= DENSITY_STEPS[0]}
              onClick={() => stepDensity(-1)}
            >
              <Minus />
            </IconAction>
            <IconAction
              label="Taller rows"
              disabled={density >= DENSITY_STEPS[DENSITY_STEPS.length - 1]}
              onClick={() => stepDensity(1)}
            >
              <Plus />
            </IconAction>
          </div>
        )}

        <ThemeToggle />

        <Separator orientation="vertical" className="!h-5" />

        <SyncButton onOpen={onOpenSync} />

        <Button variant="outline" size="sm" onClick={onOpenSchool}>
          <GraduationCap />
          {schoolEnabled ? (isMobile ? 'Classes' : 'My classes') : 'Set up school'}
        </Button>

        <Button size="sm" onClick={onCreate}>
          <Plus />
          Block
        </Button>
      </div>
    </div>
  )
}

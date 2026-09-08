import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, Check, Moon, Plus, Sun, X } from 'lucide-react'

/* ------------------------------------------------------------------ tokens */

const T = {
  light: {
    canvas: 'bg-zinc-50/50',
    surface: 'bg-white',
    text: 'text-zinc-900',
    muted: 'text-zinc-500',
    border: 'border-zinc-200/60',
    frosted: 'bg-white/80 backdrop-blur-md',
    hover: 'hover:bg-zinc-100/40',
    shadow: 'shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03)]',
  },
  dark: {
    canvas: 'bg-[#09090b]',
    surface: 'bg-[#0e0e11]',
    text: 'text-zinc-100',
    muted: 'text-zinc-400',
    border: 'border-zinc-800/60',
    frosted: 'bg-[#09090b]/80 backdrop-blur-md',
    hover: 'hover:bg-zinc-900/40',
    shadow: 'shadow-[0_4px_24px_rgba(0,0,0,0.6)]',
  },
}

const CATEGORY = {
  School: {
    light:
      'bg-blue-50/80 border-l-4 border-blue-500 text-blue-700 shadow-sm shadow-blue-500/5',
    dark:
      'bg-blue-500/10 border-l-4 border-blue-500/70 text-blue-200 border-t border-r border-b border-blue-500/20',
    dot: 'bg-blue-500',
  },
  Work: {
    light:
      'bg-amber-50/80 border-l-4 border-amber-500 text-amber-700 shadow-sm shadow-amber-500/5',
    dark:
      'bg-amber-500/10 border-l-4 border-amber-500/70 text-amber-200 border-t border-r border-b border-amber-500/20',
    dot: 'bg-amber-500',
  },
  Personal: {
    light:
      'bg-purple-50/80 border-l-4 border-purple-500 text-purple-700 shadow-sm shadow-purple-500/5',
    dark:
      'bg-purple-500/10 border-l-4 border-purple-500/70 text-purple-200 border-t border-r border-b border-purple-500/20',
    dot: 'bg-purple-500',
  },
} as const

type CategoryName = keyof typeof CATEGORY

interface EventItem {
  id: string
  title: string
  category: CategoryName
  day: number // 0..6, Mon..Sun
  start: number // minutes from midnight
  end: number
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DAY_NUMBERS = [7, 8, 9, 10, 11, 12, 13]
const MINI_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const fmt = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h < 12 ? 'AM' : 'PM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

const SEED: EventItem[] = [
  { id: 'e1', title: 'AP Biology', category: 'School', day: 0, start: 8 * 60, end: 9 * 60 + 30 },
  { id: 'e2', title: 'US History', category: 'School', day: 0, start: 10 * 60, end: 11 * 60 },
  { id: 'e3', title: 'Shift at the studio', category: 'Work', day: 0, start: 15 * 60, end: 18 * 60 },
  { id: 'e4', title: 'AP Calculus BC', category: 'School', day: 1, start: 9 * 60, end: 10 * 60 + 30 },
  { id: 'e5', title: 'Gym', category: 'Personal', day: 1, start: 17 * 60, end: 18 * 60 + 30 },
  { id: 'e6', title: 'English 11 Honors', category: 'School', day: 2, start: 8 * 60 + 30, end: 10 * 60 },
  { id: 'e7', title: 'Design review', category: 'Work', day: 2, start: 13 * 60, end: 14 * 60 },
  { id: 'e8', title: 'Spanish 3', category: 'School', day: 3, start: 11 * 60, end: 12 * 60 + 30 },
  { id: 'e9', title: 'Dinner with Mom', category: 'Personal', day: 3, start: 18 * 60 + 30, end: 20 * 60 },
  { id: 'e10', title: 'AP Physics 1', category: 'School', day: 4, start: 9 * 60, end: 10 * 60 + 30 },
  { id: 'e11', title: 'Closing shift', category: 'Work', day: 4, start: 16 * 60, end: 21 * 60 },
  { id: 'e12', title: 'Soccer', category: 'Personal', day: 5, start: 10 * 60, end: 12 * 60 },
  { id: 'e13', title: 'Reading', category: 'Personal', day: 6, start: 14 * 60, end: 15 * 60 + 30 },
]

export default function WeeklyCalendar() {
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [active, setActive] = useState<CategoryName[]>(['School', 'Work', 'Personal'])
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [newCategory, setNewCategory] = useState<CategoryName>('School')
  const [events, setEvents] = useState<EventItem[]>(SEED)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const c = isDarkMode ? T.dark : T.light
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  const toggle = (name: CategoryName) =>
    setActive((a) => (a.includes(name) ? a.filter((x) => x !== name) : [...a, name]))

  const visible = events.filter((e) => active.includes(e.category))

  const addEvent = () => {
    if (!title.trim()) return
    setEvents((e) => [
      ...e,
      {
        id: `e${Date.now()}`,
        title: title.trim(),
        category: newCategory,
        day: 0,
        start: 12 * 60,
        end: 13 * 60,
      },
    ])
    setTitle('')
    setModalOpen(false)
  }

  return (
    <div className={`w-full h-screen overflow-hidden flex flex-col antialiased font-sans ${c.canvas} ${c.text}`}>
      {/* ------------------------------------------------- top navigation */}
      <div className={`h-14 w-full border-b ${c.border} ${c.surface} flex items-center justify-between px-6 shrink-0`}>
        <div className="font-semibold text-sm tracking-tight flex items-center gap-2">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center ${
              isDarkMode ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-white'
            }`}
          >
            <Calendar strokeWidth={1.5} size={18} className="w-3 h-3" />
          </div>
          MyCAL
        </div>

        <div className={`${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'} p-0.5 rounded-lg flex gap-1`}>
          {['Day', 'Week', 'Month'].map((v) => (
            <button
              key={v}
              className={`relative px-3 h-7 rounded-md text-xs font-medium transition-colors ${
                v === 'Week' ? '' : c.muted
              }`}
            >
              {v === 'Week' && (
                <motion.div
                  layoutId="activeTab"
                  className={`absolute inset-0 rounded-md ${isDarkMode ? 'bg-zinc-800' : 'bg-white'} shadow-sm`}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative z-10">{v}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDarkMode((d) => !d)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.hover} ${c.muted} transition-colors`}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun strokeWidth={1.5} size={18} /> : <Moon strokeWidth={1.5} size={18} />}
          </button>

          <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-semibold text-zinc-500">
            A
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="bg-gradient-to-b from-zinc-800 to-zinc-900 text-white dark:from-zinc-100 dark:to-zinc-200 dark:text-zinc-950 font-medium px-3 h-8 rounded-lg shadow-sm active:scale-[0.98] transition-transform text-xs flex items-center gap-1.5"
          >
            <Plus strokeWidth={1.5} size={18} className="w-3.5 h-3.5" />
            Create
          </button>
        </div>
      </div>

      {/* ---------------------------------------------- main content split */}
      <div className="flex flex-row w-full h-[calc(100vh-56px)] overflow-hidden">
        {/* --------------------------------------------------- sidebar */}
        <div className={`w-72 border-r ${c.border} ${c.surface} flex flex-col p-5 shrink-0 select-none overflow-y-auto`}>
          <div className="mb-6 shrink-0">
            <div className="text-sm font-semibold tracking-tight mb-4">September 2026</div>
            <div className="grid grid-cols-7 gap-y-1 mb-2">
              {MINI_LETTERS.map((d, i) => (
                <div
                  key={i}
                  className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 text-center"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
                <div
                  key={day}
                  className={`text-xs w-7 h-7 flex items-center justify-center mx-auto text-center cursor-pointer rounded-full ${
                    day === 7
                      ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-full font-medium'
                      : `${c.muted} ${c.hover}`
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0">
            <span className="text-[10px] font-bold tracking-wider text-zinc-400 mb-3 block">
              MY CALENDARS
            </span>
            <div className="flex flex-col gap-1">
              {(Object.keys(CATEGORY) as CategoryName[]).map((name) => {
                const on = active.includes(name)
                return (
                  <div
                    key={name}
                    onClick={() => toggle(name)}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer ${c.hover} transition-colors`}
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer ${
                        on ? `${CATEGORY[name].dot} border-transparent` : c.border
                      }`}
                    >
                      <AnimatePresence>
                        {on && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          >
                            <Check strokeWidth={1.5} size={18} className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <span className="text-xs font-medium">{name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ------------------------------------------ calendar viewport */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ------------------------------------------ grid header */}
          <div
            className={`h-16 w-full flex items-center border-b ${c.border} ${c.frosted} sticky top-0 z-20 shrink-0`}
          >
            <div className="w-16 shrink-0" />
            {DAY_NUMBERS.map((n, i) => (
              <div key={n} className="flex-1 flex flex-col items-center justify-center gap-1">
                {i === 0 ? (
                  <div className="bg-red-500 text-white w-7 h-7 flex items-center justify-center rounded-full mx-auto text-lg font-semibold tracking-tight">
                    {String(n).padStart(2, '0')}
                  </div>
                ) : (
                  <div className="text-lg font-semibold tracking-tight">
                    {String(n).padStart(2, '0')}
                  </div>
                )}
                <div
                  className={`text-[10px] uppercase tracking-wider font-bold ${
                    i === 0 ? 'text-red-500' : 'text-zinc-400'
                  }`}
                >
                  {DAY_NAMES[i]}
                </div>
              </div>
            ))}
          </div>

          {/* ------------------------------------ scrollable time grid */}
          <div className="flex-1 overflow-y-scroll overflow-x-hidden relative">
            <div className="flex w-full relative" style={{ height: '1440px' }}>
              {/* column 1 — time labels */}
              <div className="w-16 shrink-0 relative">
                {HOURS.map((h) => (
                  <span
                    key={h}
                    className="text-[10px] font-medium tracking-tight text-right pr-3 select-none text-zinc-400 block h-[60px] leading-[0px] pt-0"
                  >
                    {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                  </span>
                ))}
              </div>

              {/* columns 2-8 — day columns */}
              {DAY_NUMBERS.map((n, dayIndex) => (
                <div key={n} className={`flex-1 relative border-l ${c.border}`}>
                  {/* horizontal row intersections */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className={`h-[60px] border-b ${c.border} ${c.hover} transition-colors`}
                    />
                  ))}

                  {/* absolute container wrapper */}
                  <div className="absolute inset-0">
                    <AnimatePresence>
                      {visible
                        .filter((e) => e.day === dayIndex)
                        .map((e) => (
                          <motion.div
                            key={e.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            whileHover={{ scale: 1.01, y: -1, zIndex: 10 }}
                            whileTap={{ scale: 0.99 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className={`absolute cursor-pointer p-2.5 flex flex-col h-full justify-between overflow-hidden select-none rounded-xl border transition-colors duration-200 ${
                              isDarkMode ? CATEGORY[e.category].dark : CATEGORY[e.category].light
                            }`}
                            style={{
                              top: `${e.start}px`,
                              height: `${e.end - e.start}px`,
                              width: 'calc(100% - 8px)',
                              left: '4px',
                            }}
                          >
                            <div className="font-semibold text-xs leading-tight tracking-tight truncate mb-0.5">
                              {e.title}
                            </div>
                            <div className="text-[10px] opacity-75 font-mono tracking-wide">
                              {fmt(e.start)} – {fmt(e.end)}
                            </div>
                          </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* present time indicator — Monday only */}
                    {dayIndex === 0 && (
                      <div
                        className="absolute left-0 right-0 z-20 pointer-events-none"
                        style={{ top: `calc(((${currentHour} * 60) + ${currentMinute}) * 1px)` }}
                      >
                        <div className="w-2 h-2 bg-red-500 rounded-full absolute -left-1 -top-[3px] shadow-[0_0_8px_#ef4444]" />
                        <div className="h-[1px] bg-red-500 w-full absolute top-0" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ creation modal */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 bg-black/20 z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={`fixed right-0 top-0 h-full w-96 z-50 ${c.surface} border-l ${c.border} ${c.shadow} p-6 flex flex-col`}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="font-semibold text-sm tracking-tight">New event</div>
                <button
                  onClick={() => setModalOpen(false)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.hover} ${c.muted}`}
                  aria-label="Close"
                >
                  <X strokeWidth={1.5} size={18} />
                </button>
              </div>

              <input
                type="text"
                placeholder="Add title"
                value={title}
                onChange={(ev) => setTitle(ev.target.value)}
                className={`w-full h-10 px-3 rounded-lg border ${c.border} bg-transparent text-sm outline-none focus:border-zinc-400 transition-colors mb-5`}
              />

              <span className="text-[10px] font-bold tracking-wider text-zinc-400 mb-3 block">
                CATEGORY
              </span>
              <div className={`${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'} p-0.5 rounded-lg flex gap-1 mb-6`}>
                {(Object.keys(CATEGORY) as CategoryName[]).map((name) => (
                  <button
                    key={name}
                    onClick={() => setNewCategory(name)}
                    className={`relative flex-1 h-8 rounded-md text-xs font-medium transition-colors ${
                      newCategory === name ? '' : c.muted
                    }`}
                  >
                    {newCategory === name && (
                      <motion.div
                        layoutId="activeCategory"
                        className={`absolute inset-0 rounded-md ${isDarkMode ? 'bg-zinc-800' : 'bg-white'} shadow-sm`}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center justify-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${CATEGORY[name].dot}`} />
                      {name}
                    </span>
                  </button>
                ))}
              </div>

              <button
                onClick={addEvent}
                className="bg-gradient-to-b from-zinc-800 to-zinc-900 text-white dark:from-zinc-100 dark:to-zinc-200 dark:text-zinc-950 font-medium px-3 h-9 rounded-lg shadow-sm active:scale-[0.98] transition-transform text-xs"
              >
                Add event
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

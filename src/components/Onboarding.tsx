import { useMemo, useState } from 'react'
import type { ClassRoster } from '../lib/types'
import { getDB, setOnboarded, setSchool, setStartedOn } from '../lib/store'
import { periodLabelIn, periodsIn, type PeriodNo } from '../lib/bell'
import { fmtRange } from '../lib/time'
import { Sheet } from './ui'
import { ScheduleEditor } from './ScheduleEditor'

export function Onboarding({ onClose }: { onClose: () => void }) {
  const db = getDB()
  const [editingSchedules, setEditingSchedules] = useState(false)

  // The periods your own schedules teach. MHHS gives 1,2,3,4,6,7,8 because 5
  // is SUCCESS; a plain eight-period school gives 1..8.
  const periods = useMemo(() => periodsIn(db.school.schedules), [db.school.schedules])

  // The distinct day shapes in a normal week, in weekday order. Replaces a
  // hardcoded ['regular','thuBlock','friBlock'].
  const previewIds = useMemo(() => {
    const seen: string[] = []
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
      const id = db.school.weekdays[String(dow)]
      if (id && !seen.includes(id)) seen.push(id)
    }
    return seen
  }, [db.school.weekdays])

  const scheduleCount = Object.keys(db.school.schedules).length
  const dayCount = Object.values(db.school.weekdays).filter(Boolean).length
  const [classes, setClasses] = useState<ClassRoster>(() => ({ ...db.school.classes }))
  const [showBreakfast, setShowBreakfast] = useState(db.school.showBreakfast)
  const [showLunch, setShowLunch] = useState(db.school.showLunch)
  const [successDefault, setSuccessDefault] = useState(db.school.successDefault)
  const [startDate, setStart] = useState(db.school.startDate)
  const [endDate, setEnd] = useState(db.school.endDate)
  const [trackFrom, setTrackFrom] = useState(db.startedOn)

  const set = (p: PeriodNo, field: 'title' | 'room', v: string) =>
    setClasses((c) => ({ ...c, [String(p)]: { ...(c[String(p)] ?? { title: '' }), [field]: v } }))

  const toggleFlex = (p: PeriodNo) =>
    setClasses((c) => ({
      ...c,
      [String(p)]: { ...(c[String(p)] ?? { title: '' }), flex: !c[String(p)]?.flex },
    }))

  const save = () => {
    setSchool({
      enabled: true,
      classes,
      showBreakfast,
      showLunch,
      successDefault,
      startDate,
      endDate,
    })
    setStartedOn(trackFrom)
    setOnboarded(true)
    onClose()
  }

  const named = periods.filter((p) => classes[String(p)]?.title?.trim()).length

  // The editor is the same sheet surface, swapped in. Stacking a second sheet
  // over this one would put two scrims on the screen and trap Escape.
  if (editingSchedules) {
    return <ScheduleEditor onClose={() => setEditingSchedules(false)} />
  }

  return (
    <Sheet onClose={onClose} wide>
      <div className="onb">
        <h3>Your school year</h3>
        <p className="lede">
          Most schools don't run the same day five times a week, so you can't
          just repeat one column. Set up your day shapes once, name your
          classes once, and MyCAL places them correctly on every day of the
          year — including block days, early releases, rallies, conferences,
          and finals week.
        </p>

        <h4>Your bell schedules</h4>
        <div className="row wrap" style={{ gap: 10 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            {scheduleCount === 0
              ? 'No day shapes yet — add one to get started.'
              : `${scheduleCount} day ${scheduleCount === 1 ? 'shape' : 'shapes'}, covering ${dayCount} ${dayCount === 1 ? 'day' : 'days'} of the week.`}
            {db.school.presetId === 'mhhs' && ' Starting from the MHHS preset.'}
          </div>
          <div className="spacer" />
          <button className="btn ghost" onClick={() => setEditingSchedules(true)}>
            {scheduleCount === 0 ? 'Add a schedule' : 'Edit schedules'}
          </button>
        </div>

        <h4>Your classes</h4>
        <div className="ptable">
          <div className="prow head" style={{ gridTemplateColumns: '84px 1fr 150px 72px' }}>
            <div className="plabel">Period</div>
            <div>Class</div>
            <div>Room / teacher</div>
            <div style={{ textAlign: 'center' }}>Flex</div>
          </div>
          {periods.map((p) => (
            <div className="prow" key={p} style={{ gridTemplateColumns: '84px 1fr 150px 72px' }}>
              <div className="plabel">{periodLabelIn(db.school.schedules, p)}</div>
              <input
                className="field"
                value={classes[String(p)]?.title ?? ''}
                onChange={(e) => set(p, 'title', e.target.value)}
                placeholder="Leave blank if free"
              />
              <input
                className="field"
                value={classes[String(p)]?.room ?? ''}
                onChange={(e) => set(p, 'room', e.target.value)}
                placeholder="Lasnier · C12"
              />
              <button
                className={`flexpick ${classes[String(p)]?.flex ? 'on' : ''}`}
                aria-pressed={Boolean(classes[String(p)]?.flex)}
                title="Discretionary time — asks what you actually used it for"
                onClick={() => toggleFlex(p)}
              >
                {classes[String(p)]?.flex ? 'Flex' : '—'}
              </button>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
          These are the periods your own schedules teach, so a period that is
          never a class simply isn't listed. Mark one <strong>Flex</strong> and
          it stops behaving like a class: you can plan it, and once it passes it
          asks what you actually used it for. Nothing else in school ever asks.
        </div>

        <h4>How the special blocks behave</h4>
        <div className="row wrap" style={{ gap: 14 }}>
          <label className="check">
            <input type="checkbox" checked={showLunch} onChange={(e) => setShowLunch(e.target.checked)} />
            Show Lunch
          </label>
          <label className="check">
            <input type="checkbox" checked={showBreakfast} onChange={(e) => setShowBreakfast(e.target.checked)} />
            Show Breakfast
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>SUCCESS says</div>
          <input
            className="field"
            style={{ maxWidth: 220 }}
            value={successDefault}
            onChange={(e) => setSuccessDefault(e.target.value)}
            placeholder="Open"
          />
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>until you write something for that day</div>
        </div>

        <h4>School year runs</h4>
        <div className="row">
          <input className="field" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} style={{ maxWidth: 190 }} />
          <span style={{ color: 'var(--text-3)' }}>to</span>
          <input className="field" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} style={{ maxWidth: 190 }} />
        </div>

        <h4>Start holding me accountable from</h4>
        <div className="row">
          <input className="field" type="date" value={trackFrom} onChange={(e) => setTrackFrom(e.target.value)} style={{ maxWidth: 190 }} />
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Weeks before this still show your real schedule, they just never ask
            for an outcome. You weren't using MyCAL yet.
          </div>
        </div>

        <h4>What a normal week will look like</h4>
        <div className="preview">
          {previewIds.map((id) => (
            <div className="pcol" key={id}>
              <div className="phead">{db.school.schedules[id]?.label ?? id}</div>
              {(db.school.schedules[id]?.slots ?? []).map((slot) => {
                if (slot.role === 'breakfast' && !showBreakfast) return null
                if (slot.role === 'lunch' && !showLunch) return null
                const title = slot.period
                  ? classes[String(slot.period)]?.title?.trim() || `— ${slot.label} —`
                  : slot.label
                const unset = Boolean(slot.period) && !classes[String(slot.period!)]?.title?.trim()
                const isFlex = Boolean(slot.period && classes[String(slot.period)]?.flex)
                return (
                  <div
                    className={`pslot ${unset ? 'unset' : ''} ${isFlex ? 'flex' : slot.role}`}
                    key={slot.key}
                  >
                    <span className="pt">{title}</span>
                    <span className="pw">{fmtRange(slot.startMin, slot.endMin)}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="actions">
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', alignSelf: 'center' }}>
            {named} of {periods.length} periods named
          </div>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn solid" onClick={save} disabled={named === 0}>
            Build my year
          </button>
        </div>
      </div>
    </Sheet>
  )
}

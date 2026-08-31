import { useState } from 'react'
import type { ClassRoster } from '../lib/types'
import { getDB, setOnboarded, setSchool, setStartedOn } from '../lib/store'
import { PERIOD_NOS, SCHEDULES, type PeriodNo } from '../lib/bell'
import { fmtRange } from '../lib/time'
import { Sheet } from './ui'

const ORDINAL: Record<PeriodNo, string> = {
  1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 6: '6th', 7: '7th', 8: '8th',
}

const PREVIEW = ['regular', 'thuBlock', 'friBlock'] as const

export function Onboarding({ onClose }: { onClose: () => void }) {
  const db = getDB()
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

  const named = PERIOD_NOS.filter((p) => classes[String(p)]?.title?.trim()).length

  return (
    <Sheet onClose={onClose} wide>
      <div className="onb">
        <h3>Your school year</h3>
        <p className="lede">
          MHHS runs three different day shapes in a normal week, so you can't just
          repeat one column seven times. Name your seven classes once and MyCAL
          places them correctly on every day of the year — including block
          Thursdays, early-release Fridays, rallies, conferences, and finals week.
        </p>

        <h4>Your classes</h4>
        <div className="ptable">
          <div className="prow head" style={{ gridTemplateColumns: '84px 1fr 150px 72px' }}>
            <div className="plabel">Period</div>
            <div>Class</div>
            <div>Room / teacher</div>
            <div style={{ textAlign: 'center' }}>Flex</div>
          </div>
          {PERIOD_NOS.map((p) => (
            <div className="prow" key={p} style={{ gridTemplateColumns: '84px 1fr 150px 72px' }}>
              <div className="plabel">{ORDINAL[p]}</div>
              <input
                className="field"
                value={classes[String(p)]?.title ?? ''}
                onChange={(e) => set(p, 'title', e.target.value)}
                placeholder={p === 1 ? 'AP Gov / Econ' : p === 6 ? 'AP Calc BC' : 'Leave blank if free'}
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
          There's no 5th period slot — 5th <em>is</em> SUCCESS, every single day.
          Mark a period <strong>Flex</strong> and it stops behaving like a class:
          you can plan it, and once it passes it asks what you actually used it for.
          Nothing else in school ever asks.
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
          {PREVIEW.map((id) => (
            <div className="pcol" key={id}>
              <div className="phead">{SCHEDULES[id].label}</div>
              {SCHEDULES[id].slots.map((slot) => {
                if (slot.role === 'breakfast' && !showBreakfast) return null
                if (slot.role === 'lunch' && !showLunch) return null
                const title = slot.period
                  ? classes[String(slot.period)]?.title?.trim() || `— ${ORDINAL[slot.period]} —`
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
            {named} of 7 periods named
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

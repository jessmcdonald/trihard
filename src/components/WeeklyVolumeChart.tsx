import { useMemo, useState } from 'react'
import type { PlannedWorkoutRow } from '@/lib/plan-generator'
import type { CompletedWorkout, Discipline, TrainingPhase } from '@/lib/database.types'
import { completionByPlannedId, parseISODate, todayISO } from '@/lib/tracking'

const DISCIPLINE_COLORS: Record<Discipline, string> = {
  swim: '#22d3ee',
  bike: '#fbbf24',
  run: '#4ade80',
  strength: '#c084fc',
}

const DISCIPLINE_LABELS: Record<Discipline, string> = {
  swim: '🏊 Swim',
  bike: '🚴 Bike',
  run: '🏃 Run',
  strength: '🏋️ Strength',
}

const PHASE_BG: Record<TrainingPhase, string> = {
  base: 'rgba(59,130,246,0.08)',
  build: 'rgba(245,158,11,0.08)',
  peak: 'rgba(239,68,68,0.08)',
  taper: 'rgba(34,197,94,0.08)',
}

interface Props {
  weeklyWorkouts: PlannedWorkoutRow[][]
  completions: CompletedWorkout[]
  selectedWeek: number
  onSelectWeek: (idx: number) => void
}

interface DisciplineHours {
  swim: number
  bike: number
  run: number
  strength: number
  total: number
}

interface WeekVolume extends DisciplineHours {
  phase: TrainingPhase
  isRecovery: boolean
}

const EMPTY: DisciplineHours = { swim: 0, bike: 0, run: 0, strength: 0, total: 0 }

function addHours(vol: DisciplineHours, discipline: Discipline, hours: number) {
  vol[discipline] += hours
  vol.total += hours
}

function weekRange(workouts: PlannedWorkoutRow[]): { start: string; end: string } | null {
  if (workouts.length === 0) return null
  const start = workouts.reduce((min, w) => (w.date < min ? w.date : min), workouts[0]!.date)
  const end = parseISODate(start)
  end.setDate(end.getDate() + 6)
  return { start, end: todayISO(end) }
}

function StackedBar({ vol, maxHours, faded }: { vol: DisciplineHours; maxHours: number; faded?: boolean }) {
  const heightPct = (vol.total / maxHours) * 100
  const segments = (['swim', 'bike', 'run', 'strength'] as Discipline[])
    .filter(d => vol[d] > 0)
    .map(d => ({
      discipline: d,
      pct: vol.total > 0 ? (vol[d] / vol.total) * 100 : 0,
      color: DISCIPLINE_COLORS[d],
    }))

  return (
    <div
      className={`w-full rounded-t overflow-hidden flex flex-col-reverse ${faded ? 'opacity-55' : ''}`}
      style={{ height: `${heightPct}%`, minHeight: vol.total > 0 ? '2px' : '0' }}
    >
      {segments.map(seg => (
        <div
          key={seg.discipline}
          style={{
            height: `${seg.pct}%`,
            backgroundColor: seg.color,
            minHeight: '1px',
          }}
        />
      ))}
    </div>
  )
}

export default function WeeklyVolumeChart({
  weeklyWorkouts,
  completions,
  selectedWeek,
  onSelectWeek,
}: Props) {
  const [showPlanned, setShowPlanned] = useState(true)
  const [showTracked, setShowTracked] = useState(true)
  const plannedOn = showPlanned || !showTracked
  const trackedOn = showTracked

  const { planned, tracked } = useMemo(() => {
    const done = completionByPlannedId(completions)
    const plannedWeeks: WeekVolume[] = weeklyWorkouts.map(workouts => {
      const vol: WeekVolume = { ...EMPTY, phase: 'base', isRecovery: false }
      for (const w of workouts) {
        addHours(vol, w.discipline, w.plannedDurationMin / 60)
      }
      if (workouts.length > 0) {
        vol.phase = workouts[0]!.phase
        vol.isRecovery = workouts[0]!.isRecoveryWeek
      }
      return vol
    })

    const trackedWeeks: DisciplineHours[] = weeklyWorkouts.map(workouts => {
      const vol: DisciplineHours = { ...EMPTY }
      for (const w of workouts) {
        if (!w.id) continue
        const log = done.get(w.id)
        if (log?.actual_duration_min) addHours(vol, w.discipline, log.actual_duration_min / 60)
      }
      const range = weekRange(workouts)
      if (range) {
        for (const c of completions) {
          if (c.planned_workout_id) continue
          if (c.date < range.start || c.date > range.end) continue
          addHours(vol, c.discipline, (c.actual_duration_min ?? 0) / 60)
        }
      }
      return vol
    })

    return { planned: plannedWeeks, tracked: trackedWeeks }
  }, [weeklyWorkouts, completions])

  const maxHours = useMemo(() => {
    let max = 1
    for (let i = 0; i < planned.length; i++) {
      if (plannedOn) max = Math.max(max, planned[i]!.total)
      if (trackedOn) max = Math.max(max, tracked[i]!.total)
    }
    return max
  }, [planned, tracked, plannedOn, trackedOn])

  const plannedTotals = useMemo(() => {
    const t = { ...EMPTY }
    for (const v of planned) {
      t.swim += v.swim
      t.bike += v.bike
      t.run += v.run
      t.strength += v.strength
      t.total += v.total
    }
    return t
  }, [planned])

  const trackedTotals = useMemo(() => {
    const t = { ...EMPTY }
    for (const v of tracked) {
      t.swim += v.swim
      t.bike += v.bike
      t.run += v.run
      t.strength += v.strength
      t.total += v.total
    }
    return t
  }, [tracked])

  const selectedPlanned = planned[selectedWeek]
  const selectedTracked = tracked[selectedWeek]
  const both = plannedOn && trackedOn

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {(['swim', 'bike', 'run', 'strength'] as Discipline[]).map(d => (
          <span key={d} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: DISCIPLINE_COLORS[d] }} />
            <span className="text-gray-400">{DISCIPLINE_LABELS[d]}</span>
            {selectedPlanned && plannedOn && selectedPlanned[d] > 0 && (
              <span className="font-medium" style={{ color: DISCIPLINE_COLORS[d] }}>
                {selectedPlanned[d].toFixed(1)}h
              </span>
            )}
            {selectedTracked && trackedOn && selectedTracked[d] > 0 && (
              <span className="text-gray-500">
                {plannedOn ? `/ ${selectedTracked[d].toFixed(1)}h` : `${selectedTracked[d].toFixed(1)}h`}
              </span>
            )}
          </span>
        ))}
        <span className="flex items-center gap-2 ml-auto">
          <Toggle label="Planned" on={showPlanned} onClick={() => setShowPlanned(v => !v)} />
          <Toggle label="Tracked" on={showTracked} onClick={() => setShowTracked(v => !v)} />
        </span>
      </div>

      {selectedPlanned && (
        <div className="text-right text-xs text-white font-medium">
          Wk {selectedWeek + 1}:
          {plannedOn && ` ${selectedPlanned.total.toFixed(1)}h planned`}
          {both && ' ·'}
          {trackedOn && ` ${selectedTracked?.total.toFixed(1) ?? '0.0'}h tracked`}
        </div>
      )}

      <div className="flex items-end gap-[2px] h-32">
        {planned.map((vol, idx) => {
          const isSelected = idx === selectedWeek
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectWeek(idx)}
              title={
                `Week ${idx + 1} — ${vol.total.toFixed(1)}h planned` +
                (tracked[idx] ? `, ${tracked[idx]!.total.toFixed(1)}h tracked` : '')
              }
              className={`flex-1 min-w-[6px] flex items-end gap-px rounded-t transition-all ${
                isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-950 z-10' : 'hover:brightness-125'
              } ${vol.isRecovery ? 'opacity-60' : ''}`}
              style={{
                height: '100%',
                background: PHASE_BG[vol.phase],
              }}
            >
              {plannedOn && (
                <div className="flex-1 h-full flex flex-col justify-end">
                  <StackedBar vol={vol} maxHours={maxHours} />
                </div>
              )}
              {trackedOn && (
                <div className="flex-1 h-full flex flex-col justify-end">
                  <StackedBar vol={tracked[idx] ?? EMPTY} maxHours={maxHours} faded />
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex justify-between text-[10px] text-gray-600">
        <span>0h</span>
        <span>
          {plannedOn && `Plan ${plannedTotals.total.toFixed(0)}h`}
          {both && ' · '}
          {trackedOn && `Tracked ${trackedTotals.total.toFixed(0)}h`}
        </span>
        <span>{maxHours.toFixed(1)}h</span>
      </div>
    </div>
  )
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
        on
          ? 'bg-gray-800 border-gray-600 text-white'
          : 'bg-transparent border-gray-800 text-gray-500'
      }`}
    >
      {label}
    </button>
  )
}

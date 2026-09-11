import { useMemo } from 'react'
import type { PlannedWorkoutRow } from '@/lib/plan-generator'
import type { Discipline, TrainingPhase } from '@/lib/database.types'

const DISCIPLINE_COLORS: Record<Discipline, string> = {
  swim: '#22d3ee',     // cyan-400
  bike: '#fbbf24',     // amber-400
  run: '#4ade80',      // green-400
  strength: '#c084fc', // purple-400
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
  selectedWeek: number
  onSelectWeek: (idx: number) => void
}

interface WeekVolume {
  swim: number
  bike: number
  run: number
  strength: number
  total: number
  phase: TrainingPhase
  isRecovery: boolean
}

export default function WeeklyVolumeChart({ weeklyWorkouts, selectedWeek, onSelectWeek }: Props) {
  const weekVolumes: WeekVolume[] = useMemo(() => {
    return weeklyWorkouts.map(workouts => {
      const vol: WeekVolume = { swim: 0, bike: 0, run: 0, strength: 0, total: 0, phase: 'base', isRecovery: false }
      for (const w of workouts) {
        const hours = w.plannedDurationMin / 60
        vol[w.discipline] += hours
        vol.total += hours
      }
      if (workouts.length > 0) {
        vol.phase = workouts[0].phase
        vol.isRecovery = workouts[0].isRecoveryWeek
      }
      return vol
    })
  }, [weeklyWorkouts])

  const maxHours = useMemo(() => Math.max(...weekVolumes.map(v => v.total), 1), [weekVolumes])

  // Totals across all weeks per discipline
  const totals = useMemo(() => {
    const t = { swim: 0, bike: 0, run: 0, strength: 0, total: 0 }
    for (const v of weekVolumes) {
      t.swim += v.swim
      t.bike += v.bike
      t.run += v.run
      t.strength += v.strength
      t.total += v.total
    }
    return t
  }, [weekVolumes])

  const selectedVol = weekVolumes[selectedWeek]

  return (
    <div className="space-y-3">
      {/* Legend with inline hours for selected week */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {(['swim', 'bike', 'run', 'strength'] as Discipline[]).map(d => (
          <span key={d} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: DISCIPLINE_COLORS[d] }} />
            <span className="text-gray-400">{DISCIPLINE_LABELS[d]}</span>
            {selectedVol && selectedVol[d] > 0 && (
              <span className="font-medium" style={{ color: DISCIPLINE_COLORS[d] }}>{selectedVol[d].toFixed(1)}h</span>
            )}
          </span>
        ))}
        {selectedVol && (
          <span className="text-white font-medium ml-auto">
            Wk {selectedWeek + 1}: {selectedVol.total.toFixed(1)}h
          </span>
        )}
      </div>

      {/* Stacked bar chart */}
      <div className="flex items-end gap-[2px] h-32">
        {weekVolumes.map((vol, idx) => {
          const heightPct = (vol.total / maxHours) * 100
          const isSelected = idx === selectedWeek
          const segments = (['swim', 'bike', 'run', 'strength'] as Discipline[])
            .filter(d => vol[d] > 0)
            .map(d => ({
              discipline: d,
              pct: (vol[d] / vol.total) * 100,
              color: DISCIPLINE_COLORS[d],
            }))

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectWeek(idx)}
              title={`Week ${idx + 1} — ${vol.total.toFixed(1)}h`}
              className={`flex-1 min-w-[6px] flex flex-col justify-end rounded-t transition-all ${
                isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-950 z-10' : 'hover:brightness-125'
              } ${vol.isRecovery ? 'opacity-60' : ''}`}
              style={{
                height: '100%',
                background: PHASE_BG[vol.phase],
              }}
            >
              <div
                className="w-full rounded-t overflow-hidden flex flex-col-reverse"
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
            </button>
          )
        })}
      </div>

      {/* Y-axis hints */}
      <div className="flex justify-between text-[10px] text-gray-600">
        <span>0h</span>
        <span>Plan total: {totals.total.toFixed(0)}h</span>
        <span>{maxHours.toFixed(1)}h</span>
      </div>
    </div>
  )
}

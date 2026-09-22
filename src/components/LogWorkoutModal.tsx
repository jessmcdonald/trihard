import { useState } from 'react'
import { WORKOUT_TYPES, workoutLabel } from '@/lib/constants'
import type { CompletedWorkout, Discipline } from '@/lib/database.types'
import type { TrackedPlanned } from '@/lib/tracking'
import { todayISO } from '@/lib/tracking'

export interface LogWorkoutValues {
  date: string
  durationMin: number
  distanceM: number | null
  perceivedEffort: number | null
  notes: string
  discipline: Discipline
  workoutType: string
  plannedWorkoutId: string | null
}

interface Props {
  planned?: TrackedPlanned
  existing?: CompletedWorkout | null
  extraDate?: string
  saving?: boolean
  onSubmit: (values: LogWorkoutValues) => Promise<void> | void
  onClose: () => void
  onSkip?: () => void
  onUnskip?: () => void
  onToggleOptional?: () => void
  onDelete?: () => void
}

export default function LogWorkoutModal({
  planned,
  existing,
  extraDate,
  saving,
  onSubmit,
  onClose,
  onSkip,
  onUnskip,
  onToggleOptional,
  onDelete,
}: Props) {
  const isExtra = !planned
  const [discipline, setDiscipline] = useState<Discipline>(planned?.discipline ?? existing?.discipline ?? 'run')
  const [workoutType, setWorkoutType] = useState(planned?.workoutType ?? existing?.workout_type ?? 'easy')
  const [date, setDate] = useState(existing?.date ?? extraDate ?? todayISO())
  const presetMin = existing?.actual_duration_min ?? planned?.plannedDurationMin ?? 45
  const [durationH, setDurationH] = useState(String(Math.floor(presetMin / 60)))
  const [durationM, setDurationM] = useState(String(presetMin % 60))
  const [distance, setDistance] = useState(
    existing?.actual_distance_m != null
      ? String(existing.actual_distance_m)
      : planned?.plannedDistanceM != null
        ? String(planned.plannedDistanceM)
        : '',
  )
  const [rpe, setRpe] = useState(existing?.perceived_effort != null ? String(existing.perceived_effort) : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [error, setError] = useState('')

  const catalog = WORKOUT_TYPES[discipline] as readonly { value: string; label: string }[]
  const skipped = planned?.status === 'skipped'
  const showDistance = discipline !== 'strength'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const durationMin = Math.max(1, (Number(durationH) || 0) * 60 + (Number(durationM) || 0))
    const rpeNum = rpe ? Number(rpe) : null
    if (rpeNum != null && (rpeNum < 1 || rpeNum > 10)) {
      setError('RPE must be between 1 and 10')
      return
    }
    await onSubmit({
      date,
      durationMin,
      distanceM: showDistance && distance ? Number(distance) || null : null,
      perceivedEffort: rpeNum,
      notes: notes.trim(),
      discipline,
      workoutType,
      plannedWorkoutId: planned?.id ?? null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {existing ? 'Edit log' : isExtra ? 'Extra workout' : 'Log workout'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {planned && (
          <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
            <span className="capitalize">{planned.discipline}</span>
            <span className="text-gray-600">·</span>
            <span>{workoutLabel(planned.discipline, planned.workoutType)}</span>
            <span className="text-gray-600">·</span>
            <span>Planned {planned.plannedDurationMin}min</span>
            {planned.optional && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-600 text-gray-400">
                Optional
              </span>
            )}
          </div>
        )}

        {isExtra && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-300 mb-1 block">Discipline</span>
              <select
                value={discipline}
                onChange={e => {
                  const next = e.target.value as Discipline
                  setDiscipline(next)
                  setWorkoutType(WORKOUT_TYPES[next][0]!.value)
                }}
                className="input"
              >
                <option value="swim">Swim</option>
                <option value="bike">Bike</option>
                <option value="run">Run</option>
                <option value="strength">Strength</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-300 mb-1 block">Type</span>
              <select value={workoutType} onChange={e => setWorkoutType(e.target.value)} className="input">
                {catalog.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-1 block">Date completed</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="input" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="block">
            <span className="text-sm font-medium text-gray-300 mb-1 block">Duration</span>
            <div className="flex gap-2 items-center">
              <input type="number" value={durationH} onChange={e => setDurationH(e.target.value)} min={0} className="input w-16 text-center" />
              <span className="text-xs text-gray-500">h</span>
              <input type="number" value={durationM} onChange={e => setDurationM(e.target.value)} min={0} max={59} className="input w-16 text-center" />
              <span className="text-xs text-gray-500">m</span>
            </div>
          </div>
          {showDistance && (
            <label className="block">
              <span className="text-sm font-medium text-gray-300 mb-1 block">Distance (m)</span>
              <input type="number" value={distance} onChange={e => setDistance(e.target.value)} placeholder="optional" className="input" />
            </label>
          )}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-1 block">RPE (1–10)</span>
          <input
            type="number"
            min={1}
            max={10}
            value={rpe}
            onChange={e => setRpe(e.target.value)}
            placeholder="optional"
            className="input"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-1 block">Notes</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input resize-none" />
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            {saving ? 'Saving…' : existing ? 'Update log' : 'Save log'}
          </button>
        </div>

        {planned && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-800">
            {onToggleOptional && (
              <button
                type="button"
                onClick={onToggleOptional}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                {planned.optional ? 'Mark required' : 'Mark optional'}
              </button>
            )}
            {skipped && onUnskip ? (
              <button type="button" onClick={onUnskip} className="text-xs text-gray-400 hover:text-white underline">
                Undo skip
              </button>
            ) : onSkip && !existing ? (
              <button type="button" onClick={onSkip} className="text-xs text-gray-400 hover:text-white underline">
                Skip this session
              </button>
            ) : null}
            {existing && onDelete && (
              <button type="button" onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 underline">
                Delete log
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  )
}

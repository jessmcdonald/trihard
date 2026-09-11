import { useState } from 'react'
import { WORKOUT_TYPES } from '@/lib/constants'
import type { Discipline } from '@/lib/database.types'

const DISCIPLINES: { value: Discipline; label: string; emoji: string }[] = [
  { value: 'swim', label: 'Swim', emoji: '🏊' },
  { value: 'bike', label: 'Bike', emoji: '🚴' },
  { value: 'run', label: 'Run', emoji: '🏃' },
  { value: 'strength', label: 'Strength', emoji: '🏋️' },
]

interface Props {
  onAdd: (discipline: Discipline, workoutType: string) => void
}

export default function AddWorkoutPicker({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [discipline, setDiscipline] = useState<Discipline | null>(null)

  function handleSelectType(type: string) {
    if (discipline) {
      onAdd(discipline, type)
    }
    setDiscipline(null)
    setOpen(false)
  }

  function handleCancel() {
    setDiscipline(null)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300 transition-colors py-1.5 text-xs"
      >
        + Add
      </button>
    )
  }

  // Step 1: pick discipline
  if (!discipline) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-2 space-y-1">
        {DISCIPLINES.map(d => (
          <button
            key={d.value}
            type="button"
            onClick={() => setDiscipline(d.value)}
            className="w-full text-left rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
          >
            {d.emoji} {d.label}
          </button>
        ))}
        <button type="button" onClick={handleCancel} className="w-full text-center text-xs text-gray-500 hover:text-gray-300 pt-1">
          Cancel
        </button>
      </div>
    )
  }

  // Step 2: pick workout type for chosen discipline
  const types = WORKOUT_TYPES[discipline]

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-2 space-y-1">
      <div className="text-xs text-gray-500 px-1 mb-1">
        {DISCIPLINES.find(d => d.value === discipline)?.emoji}{' '}
        {DISCIPLINES.find(d => d.value === discipline)?.label}
      </div>
      {types.map(t => (
        <button
          key={t.value}
          type="button"
          onClick={() => handleSelectType(t.value)}
          className="w-full text-left rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
        >
          {t.label}
        </button>
      ))}
      <button type="button" onClick={() => setDiscipline(null)} className="w-full text-center text-xs text-gray-500 hover:text-gray-300 pt-1">
        ← Back
      </button>
    </div>
  )
}

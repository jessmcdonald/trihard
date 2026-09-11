import { useState } from 'react'
import { WORKOUT_TYPES } from '@/lib/constants'
import type { PlannedWorkoutRow } from '@/lib/plan-generator'
import type { Discipline } from '@/lib/database.types'

interface Props {
  workout: PlannedWorkoutRow
  onSave: (updated: PlannedWorkoutRow) => void
  onClose: () => void
}

function workoutLabel(discipline: Discipline, workoutType: string): string {
  const catalog = WORKOUT_TYPES[discipline] as readonly { value: string; label: string }[]
  return catalog.find(t => t.value === workoutType)?.label ?? workoutType
}

const ZONE_LABELS = ['', 'Easy / Aerobic', 'Moderate / Tempo', 'Hard / Threshold+']

export default function WorkoutEditModal({ workout, onSave, onClose }: Props) {
  const [durationH, setDurationH] = useState(String(Math.floor(workout.plannedDurationMin / 60)))
  const [durationM, setDurationM] = useState(String(workout.plannedDurationMin % 60))
  const [distance, setDistance] = useState(
    workout.plannedDistanceM != null ? String(workout.plannedDistanceM) : ''
  )
  const [zone, setZone] = useState(workout.intensityZone)
  const [description, setDescription] = useState(workout.description)
  const [workoutType, setWorkoutType] = useState(workout.workoutType)

  const catalog = WORKOUT_TYPES[workout.discipline] as readonly { value: string; label: string }[]

  function handleSave() {
    const durationMin = Math.max(5, (Number(durationH) || 0) * 60 + (Number(durationM) || 0))
    const distanceM = distance ? Number(distance) || null : null

    onSave({
      ...workout,
      workoutType,
      plannedDurationMin: durationMin,
      plannedDistanceM: distanceM,
      intensityZone: zone,
      description,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Edit Workout
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Date + discipline badge */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>{new Date(workout.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span className="text-gray-600">·</span>
          <span className="capitalize">{workout.discipline}</span>
          <span className="text-gray-600">·</span>
          <span>Week {workout.weekNumber}</span>
        </div>

        {/* Workout type */}
        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-1 block">Workout type</span>
          <select
            value={workoutType}
            onChange={e => setWorkoutType(e.target.value)}
            className="input"
          >
            {catalog.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        {/* Duration + Distance row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="block">
            <span className="text-sm font-medium text-gray-300 mb-1 block">Duration</span>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={durationH}
                onChange={e => setDurationH(e.target.value)}
                min={0}
                className="input w-16 text-center"
              />
              <span className="text-xs text-gray-500">h</span>
              <input
                type="number"
                value={durationM}
                onChange={e => setDurationM(e.target.value)}
                min={0}
                max={59}
                className="input w-16 text-center"
              />
              <span className="text-xs text-gray-500">m</span>
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-300 mb-1 block">Distance (m)</span>
            <input
              type="number"
              value={distance}
              onChange={e => setDistance(e.target.value)}
              placeholder="optional"
              className="input"
            />
          </label>
        </div>

        {/* Intensity zone */}
        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-1 block">Intensity zone</span>
          <div className="flex gap-2">
            {[1, 2, 3].map(z => (
              <button
                key={z}
                type="button"
                onClick={() => setZone(z)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  zone === z
                    ? z === 1 ? 'bg-blue-600 text-white'
                      : z === 2 ? 'bg-amber-600 text-white'
                      : 'bg-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Z{z}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">{ZONE_LABELS[zone]}</p>
        </label>

        {/* Description */}
        <label className="block">
          <span className="text-sm font-medium text-gray-300 mb-1 block">Description</span>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="input resize-none"
          />
        </label>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { DAY_LABELS, WORKOUT_TYPES } from '@/lib/constants'
import type { Discipline } from '@/lib/database.types'
import WorkoutChip from '@/components/WorkoutChip'
import AddWorkoutPicker from '@/components/AddWorkoutPicker'

interface Slot {
  id: string // local key for react
  discipline: Discipline
  workoutType: string
}

type WeekGrid = Slot[][] // index 0–6 = Mon–Sun

function emptyWeek(): WeekGrid {
  return Array.from({ length: 7 }, () => [])
}

let nextId = 0
function localId() {
  return `local-${++nextId}`
}

function workoutLabel(discipline: Discipline, workoutType: string): string {
  const catalog = WORKOUT_TYPES[discipline] as readonly { value: string; label: string }[]
  return catalog.find(t => t.value === workoutType)?.label ?? workoutType
}

export default function WeeklyTemplatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const raceGoalId = searchParams.get('goal')

  const [grid, setGrid] = useState<WeekGrid>(emptyWeek)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [raceName, setRaceName] = useState('')

  // Load existing template + race goal name
  useEffect(() => {
    if (!user || !raceGoalId) return

    async function load() {
      const [goalRes, templateRes] = await Promise.all([
        supabase.from('race_goals').select('name').eq('id', raceGoalId!).single(),
        supabase
          .from('weekly_templates')
          .select('*')
          .eq('race_goal_id', raceGoalId!)
          .eq('user_id', user!.id)
          .order('day_of_week')
          .order('sort_order'),
      ])

      if (goalRes.data) setRaceName(goalRes.data.name)

      if (templateRes.data && templateRes.data.length > 0) {
        const week = emptyWeek()
        for (const row of templateRes.data) {
          week[row.day_of_week].push({
            id: localId(),
            discipline: row.discipline as Discipline,
            workoutType: row.workout_type,
          })
        }
        setGrid(week)
      }

      setLoading(false)
    }

    load()
  }, [user, raceGoalId])

  const addWorkout = useCallback((dayIndex: number, discipline: Discipline, workoutType: string) => {
    setGrid(prev => {
      const next = prev.map(day => [...day])
      next[dayIndex].push({ id: localId(), discipline, workoutType })
      return next
    })
  }, [])

  const removeWorkout = useCallback((dayIndex: number, slotId: string) => {
    setGrid(prev => {
      const next = prev.map(day => [...day])
      next[dayIndex] = next[dayIndex].filter(s => s.id !== slotId)
      return next
    })
  }, [])

  async function handleSave() {
    if (!user || !raceGoalId) return
    setError('')
    setSaving(true)

    try {
      // Delete existing templates for this goal, then insert fresh
      const { error: delErr } = await supabase
        .from('weekly_templates')
        .delete()
        .eq('race_goal_id', raceGoalId)
        .eq('user_id', user.id)

      if (delErr) throw delErr

      const rows = grid.flatMap((day, dayIndex) =>
        day.map((slot, sortOrder) => ({
          user_id: user.id,
          race_goal_id: raceGoalId,
          day_of_week: dayIndex,
          discipline: slot.discipline,
          workout_type: slot.workoutType,
          sort_order: sortOrder,
        }))
      )

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('weekly_templates').insert(rows)
        if (insErr) throw insErr
      }

      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  // Summary counts
  const totalWorkouts = grid.reduce((sum, day) => sum + day.length, 0)
  const byCounts = grid.flat().reduce<Record<string, number>>((acc, s) => {
    acc[s.discipline] = (acc[s.discipline] || 0) + 1
    return acc
  }, {})

  if (!raceGoalId) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No race goal selected</p>
          <button onClick={() => navigate('/dashboard')} className="text-indigo-400 hover:text-indigo-300 underline text-sm">
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">
            ← Back to dashboard
          </button>
          {raceName && (
            <p className="text-xs text-gray-500 mt-0.5">{raceName}</p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium transition-colors"
        >
          {saving ? 'Saving…' : 'Save Template'}
        </button>
      </header>

      <main className="px-4 py-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Weekly Template</h2>
          <div className="flex gap-3 text-xs text-gray-400">
            <span>{totalWorkouts} workouts/week</span>
            {byCounts.swim && <span className="text-cyan-400">🏊 {byCounts.swim}</span>}
            {byCounts.bike && <span className="text-amber-400">🚴 {byCounts.bike}</span>}
            {byCounts.run && <span className="text-green-400">🏃 {byCounts.run}</span>}
            {byCounts.strength && <span className="text-purple-400">🏋️ {byCounts.strength}</span>}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* 7-column grid */}
        <div className="grid grid-cols-7 gap-2">
          {DAY_LABELS.map((dayLabel, dayIndex) => (
            <div key={dayLabel} className="flex flex-col">
              {/* Day header */}
              <div className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2 border-b border-gray-800 mb-2">
                {dayLabel}
              </div>

              {/* Workout slots */}
              <div className="flex-1 space-y-1.5 min-h-[120px]">
                {grid[dayIndex].map(slot => (
                  <WorkoutChip
                    key={slot.id}
                    discipline={slot.discipline}
                    workoutLabel={workoutLabel(slot.discipline, slot.workoutType)}
                    onRemove={() => removeWorkout(dayIndex, slot.id)}
                  />
                ))}
              </div>

              {/* Add button */}
              <div className="mt-2">
                <AddWorkoutPicker
                  onAdd={(discipline, workoutType) => addWorkout(dayIndex, discipline, workoutType)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Rest day hint */}
        {totalWorkouts > 0 && grid.some(day => day.length === 0) && (
          <p className="text-xs text-gray-600 text-center mt-4">
            Empty days = rest days
          </p>
        )}
      </main>
    </div>
  )
}

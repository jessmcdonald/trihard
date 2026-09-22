import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { DAY_LABELS, workoutLabel } from '@/lib/constants'
import type { CompletedWorkout, RaceGoal } from '@/lib/database.types'
import LogWorkoutModal from '@/components/LogWorkoutModal'
import type { LogWorkoutValues } from '@/components/LogWorkoutModal'
import WorkoutChip from '@/components/WorkoutChip'
import type { ChipState } from '@/components/WorkoutChip'
import {
  completionByPlannedId,
  currentWeekPlanned,
  formatDoneOn,
  mapPlannedFromDb,
  addDaysISO,
  mondayISO,
  parseISODate,
  scoreEndedWeeks,
  scoreWeek,
  startOfWeekMonday,
  sundayISO,
  todayISO,
  type TrackedPlanned,
} from '@/lib/tracking'

function chipState(w: TrackedPlanned, done: Map<string, CompletedWorkout>): ChipState {
  if (done.has(w.id)) return 'done'
  if (w.status === 'skipped') return 'skipped'
  return 'pending'
}

export default function TrackWorkoutsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const raceGoalId = searchParams.get('goal')

  const [goal, setGoal] = useState<RaceGoal | null>(null)
  const [planned, setPlanned] = useState<TrackedPlanned[]>([])
  const [completions, setCompletions] = useState<CompletedWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  type LogTarget =
    | { type: 'planned'; workout: TrackedPlanned }
    | { type: 'extra'; date: string; existing?: CompletedWorkout }

  const [logging, setLogging] = useState<LogTarget | null>(null)

  async function reload() {
    if (!user || !raceGoalId) return
    const { data: planRow } = await supabase
      .from('training_plans')
      .select('id')
      .eq('race_goal_id', raceGoalId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!planRow) {
      setPlanned([])
      setCompletions([])
      return
    }

    const [plannedRes, completedRes] = await Promise.all([
      supabase
        .from('planned_workouts')
        .select('*')
        .eq('training_plan_id', planRow.id)
        .eq('user_id', user.id)
        .order('date')
        .order('sort_order'),
      supabase
        .from('completed_workouts')
        .select('*')
        .eq('user_id', user.id)
        .order('date'),
    ])

    setPlanned((plannedRes.data ?? []).map(mapPlannedFromDb))
    setCompletions((completedRes.data ?? []) as CompletedWorkout[])
  }

  useEffect(() => {
    if (!user || !raceGoalId) return

    async function load() {
      const { data: goalRow } = await supabase.from('race_goals').select('*').eq('id', raceGoalId!).single()
      if (goalRow) setGoal(goalRow as RaceGoal)
      await reload()
      setLoading(false)
    }

    load()
  }, [user, raceGoalId])

  const done = useMemo(() => completionByPlannedId(completions), [completions])
  const today = todayISO()
  const yesterday = addDaysISO(today, -1)
  const weekPlanned = useMemo(() => currentWeekPlanned(planned), [planned])
  const weekNumber = weekPlanned[0]?.weekNumber ?? null
  const weekMonday = startOfWeekMonday(new Date())
  const weekScore = weekNumber == null
    ? null
    : scoreWeek(planned, completions, weekNumber, weekMonday)
  const planScore = useMemo(() => scoreEndedWeeks(planned, completions), [planned, completions])

  const todayPlanned = weekPlanned.filter(w => w.date === today)
  const doneTodayOther = weekPlanned.filter(w => {
    const log = done.get(w.id)
    return w.date !== today && log?.date === today
  })
  const extrasToday = completions.filter(c => !c.planned_workout_id && c.date === today)

  const yesterdayPlanned = planned.filter(w => w.date === yesterday)
  const extrasYesterday = completions.filter(c => !c.planned_workout_id && c.date === yesterday)

  const extrasThisWeek = completions.filter(c => {
    if (c.planned_workout_id) return false
    return c.date >= mondayISO(new Date()) && c.date <= sundayISO(new Date())
  })

  const loggingPlanned = logging?.type === 'planned' ? logging.workout : undefined
  const loggingExisting = logging?.type === 'planned'
    ? done.get(logging.workout.id) ?? null
    : logging?.type === 'extra'
      ? logging.existing ?? null
      : null

  async function saveLog(values: LogWorkoutValues) {
    if (!user) return
    setSaving(true)
    setError('')
    try {
      if (loggingExisting) {
        const { error: err } = await supabase
          .from('completed_workouts')
          .update({
            date: values.date,
            discipline: values.discipline,
            workout_type: values.workoutType,
            actual_duration_min: values.durationMin,
            actual_distance_m: values.distanceM,
            perceived_effort: values.perceivedEffort,
            notes: values.notes || null,
          })
          .eq('id', loggingExisting.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('completed_workouts').insert({
          user_id: user.id,
          planned_workout_id: values.plannedWorkoutId,
          date: values.date,
          discipline: values.discipline,
          workout_type: values.workoutType,
          actual_duration_min: values.durationMin,
          actual_distance_m: values.distanceM,
          perceived_effort: values.perceivedEffort,
          notes: values.notes || null,
        })
        if (err) throw err
      }
      setLogging(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save log')
    } finally {
      setSaving(false)
    }
  }

  async function setSkipped(workout: TrackedPlanned, skipped: boolean) {
    const { error: err } = await supabase
      .from('planned_workouts')
      .update({
        status: skipped ? 'skipped' : 'planned',
        skipped_at: skipped ? new Date().toISOString() : null,
      })
      .eq('id', workout.id)
    if (err) {
      setError(err.message)
      return
    }
    setLogging(null)
    await reload()
  }

  async function toggleOptional(workout: TrackedPlanned) {
    const { error: err } = await supabase
      .from('planned_workouts')
      .update({ optional: !workout.optional })
      .eq('id', workout.id)
    if (err) {
      setError(err.message)
      return
    }
    setLogging(null)
    await reload()
  }

  async function deleteLog(completion: CompletedWorkout) {
    const { error: err } = await supabase.from('completed_workouts').delete().eq('id', completion.id)
    if (err) {
      setError(err.message)
      return
    }
    setLogging(null)
    await reload()
  }

  if (!raceGoalId) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">No race goal selected.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  const byDay: TrackedPlanned[][] = Array.from({ length: 7 }, () => [])
  for (const w of weekPlanned) {
    const dow = (parseISODate(w.date).getDay() + 6) % 7
    byDay[dow]!.push(w)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">
            ← Back to dashboard
          </button>
          <p className="text-xs text-gray-500 mt-0.5">{goal?.name ?? 'Track workouts'}</p>
        </div>
        {goal && (
          <button
            onClick={() => navigate(`/training-calendar?goal=${goal.id}`)}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            Calendar
          </button>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {planned.length === 0 ? (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-2">Save a plan first</h2>
            <p className="text-sm text-gray-400 mb-4">
              Tracking links to saved planned sessions. Generate and save your calendar, then come back.
            </p>
            <button
              onClick={() => navigate(`/training-calendar?goal=${raceGoalId}`)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium"
            >
              Open training calendar
            </button>
          </div>
        ) : (
          <>
            <section className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h2 className="text-lg font-semibold mb-1">This week</h2>
              {weekScore ? (
                <p className="text-sm text-gray-400">
                  {weekScore.completedRequired}/{weekScore.required} required
                  {weekScore.leftoverRequired > 0 && (
                    <> · {weekScore.leftoverRequired} {weekScore.weekEnded ? 'missed' : 'left'}</>
                  )}
                  {weekScore.optionalTotal > 0 && (
                    <> · {weekScore.optionalLeft} optional left</>
                  )}
                  {weekScore.sessionPct != null && weekScore.weekEnded && (
                    <> · {weekScore.sessionPct}% sessions</>
                  )}
                  {weekScore.volumePct != null && weekScore.weekEnded && (
                    <> · {weekScore.volumePct}% volume</>
                  )}
                </p>
              ) : (
                <p className="text-sm text-gray-500">No sessions scheduled this week</p>
              )}
              {planScore && (
                <p className="text-xs text-gray-500 mt-2">
                  Plan to date (finished weeks): {planScore.completedRequired}/{planScore.required} required
                  {planScore.sessionPct != null && ` · ${planScore.sessionPct}%`}
                  {planScore.volumePct != null && ` · ${planScore.volumePct}% volume`}
                </p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Yesterday</h2>
                <button
                  onClick={() => setLogging({ type: 'extra', date: yesterday })}
                  className="text-sm text-indigo-400 hover:text-indigo-300"
                >
                  + Extra workout
                </button>
              </div>
              {yesterdayPlanned.length === 0 && extrasYesterday.length === 0 && (
                <p className="text-sm text-gray-500">Nothing left to log from yesterday</p>
              )}
              <div className="space-y-2">
                {yesterdayPlanned.map(w => (
                  <SessionRow
                    key={w.id}
                    workout={w}
                    log={done.get(w.id)}
                    onOpen={() => setLogging({ type: 'planned', workout: w })}
                  />
                ))}
                {extrasYesterday.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setLogging({ type: 'extra', date: c.date, existing: c })}
                    className="w-full rounded-xl bg-gray-900 border border-gray-800 p-3 text-left hover:border-indigo-500"
                  >
                    <WorkoutChip
                      discipline={c.discipline}
                      workoutLabel={workoutLabel(c.discipline, c.workout_type)}
                      state="extra"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Extra · {c.actual_duration_min ?? '—'}min
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Today</h2>
                <button
                  onClick={() => setLogging({ type: 'extra', date: today })}
                  className="text-sm text-indigo-400 hover:text-indigo-300"
                >
                  + Extra workout
                </button>
              </div>

              {todayPlanned.length === 0 && extrasToday.length === 0 && doneTodayOther.length === 0 && (
                <p className="text-sm text-gray-500">Nothing planned today</p>
              )}

              <div className="space-y-2">
                {todayPlanned.map(w => (
                  <SessionRow
                    key={w.id}
                    workout={w}
                    log={done.get(w.id)}
                    onOpen={() => setLogging({ type: 'planned', workout: w })}
                  />
                ))}
                {doneTodayOther.map(w => (
                  <SessionRow
                    key={w.id}
                    workout={w}
                    log={done.get(w.id)}
                    onOpen={() => setLogging({ type: 'planned', workout: w })}
                  />
                ))}
                {extrasToday.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setLogging({ type: 'extra', date: c.date, existing: c })}
                    className="w-full rounded-xl bg-gray-900 border border-gray-800 p-3 text-left hover:border-indigo-500"
                  >
                    <WorkoutChip
                      discipline={c.discipline}
                      workoutLabel={workoutLabel(c.discipline, c.workout_type)}
                      state="extra"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Extra · {c.actual_duration_min ?? '—'}min
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">This week</h2>
              <div className="space-y-4">
                {DAY_LABELS.map((label, dayIdx) => {
                  const dayWorkouts = byDay[dayIdx] ?? []
                  const dayDate = new Date(weekMonday)
                  dayDate.setDate(weekMonday.getDate() + dayIdx)
                  const dayIso = todayISO(dayDate)
                  const extras = extrasThisWeek.filter(c => c.date === dayIso)
                  const isPastOrToday = dayIso <= today
                  if (dayWorkouts.length === 0 && extras.length === 0 && !isPastOrToday) return null
                  return (
                    <div key={label}>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        {label} · {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="space-y-2">
                        {dayWorkouts.length === 0 && extras.length === 0 && (
                          <button
                            type="button"
                            onClick={() => setLogging({ type: 'extra', date: dayIso })}
                            className="w-full rounded-xl bg-gray-900 border border-dashed border-gray-800 p-3 text-left text-sm text-gray-500 hover:border-indigo-500 hover:text-indigo-300"
                          >
                            Rest / + log extra
                          </button>
                        )}
                        {dayWorkouts.map(w => (
                          <SessionRow
                            key={w.id}
                            workout={w}
                            log={done.get(w.id)}
                            onOpen={() => setLogging({ type: 'planned', workout: w })}
                          />
                        ))}
                        {extras.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setLogging({ type: 'extra', date: c.date, existing: c })}
                            className="w-full rounded-xl bg-gray-900 border border-gray-800 p-3 text-left hover:border-indigo-500"
                          >
                            <WorkoutChip
                              discipline={c.discipline}
                              workoutLabel={workoutLabel(c.discipline, c.workout_type)}
                              state="extra"
                            />
                            <p className="text-xs text-gray-500 mt-1">Extra · {c.actual_duration_min ?? '—'}min</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </main>

      {logging && (
        <LogWorkoutModal
          planned={loggingPlanned}
          existing={loggingExisting}
          extraDate={logging.type === 'extra' ? logging.date : undefined}
          saving={saving}
          onSubmit={saveLog}
          onClose={() => setLogging(null)}
          onSkip={loggingPlanned && !loggingExisting ? () => setSkipped(loggingPlanned, true) : undefined}
          onUnskip={loggingPlanned?.status === 'skipped' ? () => setSkipped(loggingPlanned, false) : undefined}
          onToggleOptional={loggingPlanned ? () => toggleOptional(loggingPlanned) : undefined}
          onDelete={loggingExisting ? () => deleteLog(loggingExisting) : undefined}
        />
      )}
    </div>
  )
}

function SessionRow({
  workout,
  log,
  onOpen,
}: {
  workout: TrackedPlanned
  log?: CompletedWorkout
  onOpen: () => void
}) {
  const shifted = log ? formatDoneOn(workout.date, log.date) : null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl bg-gray-900 border border-gray-800 p-3 text-left hover:border-indigo-500 transition-colors"
    >
      <WorkoutChip
        discipline={workout.discipline}
        workoutLabel={workoutLabel(workout.discipline, workout.workoutType)}
        state={chipState(workout, new Map(log ? [[workout.id, log]] : []))}
        optional={workout.optional}
      />
      <p className="text-xs text-gray-500 mt-1">
        {log
          ? `${log.actual_duration_min ?? '—'}min${log.perceived_effort != null ? ` · RPE ${log.perceived_effort}` : ''}${shifted ? ` · done ${shifted}` : ''}`
          : workout.status === 'skipped'
            ? 'Skipped'
            : `${workout.plannedDurationMin}min · ${workout.optional ? 'Optional' : 'Required'}`}
      </p>
    </button>
  )
}

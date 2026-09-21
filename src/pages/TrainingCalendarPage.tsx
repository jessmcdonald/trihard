import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { DAY_LABELS, WORKOUT_TYPES } from '@/lib/constants'
import { generatePlan, allocatePhases, isRecoveryWeek, nextMonday, weeksBetween } from '@/lib/plan-generator'
import type { GoalInput, TemplateSlot, PlannedWorkoutRow } from '@/lib/plan-generator'
import type { Discipline, ExperienceLevel, RaceGoal, TrainingPhase } from '@/lib/database.types'
import WorkoutChip from '@/components/WorkoutChip'
import WorkoutEditModal from '@/components/WorkoutEditModal'
import WeeklyVolumeChart from '@/components/WeeklyVolumeChart'
import FitnessConfigStep, { buildFitnessForm, parseFitnessForm } from '@/components/FitnessConfigStep'
import type { FitnessForm } from '@/components/FitnessConfigStep'

const PHASE_COLORS: Record<TrainingPhase, string> = {
  base: 'bg-blue-900/40 border-blue-800 text-blue-300',
  build: 'bg-amber-900/40 border-amber-800 text-amber-300',
  peak: 'bg-red-900/40 border-red-800 text-red-300',
  taper: 'bg-green-900/40 border-green-800 text-green-300',
}

const PHASE_LABELS: Record<TrainingPhase, string> = {
  base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper',
}

function workoutLabel(discipline: Discipline, workoutType: string): string {
  const catalog = WORKOUT_TYPES[discipline] as readonly { value: string; label: string }[]
  return catalog.find(t => t.value === workoutType)?.label ?? workoutType
}

export default function TrainingCalendarPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const raceGoalId = searchParams.get('goal')

  const [goal, setGoal] = useState<RaceGoal | null>(null)
  const [templateSlots, setTemplateSlots] = useState<TemplateSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [editingWorkout, setEditingWorkout] = useState<{ weekIdx: number; workoutIdx: number } | null>(null)

  // Configuration step state
  const [configStep, setConfigStep] = useState<'configure' | 'fitness' | 'calendar'>('configure')
  const [recoveryWeeks, setRecoveryWeeks] = useState<Set<number>>(new Set())
  const [customPhases, setCustomPhases] = useState<{ base: number; build: number; peak: number; taper: number } | null>(null)
  const [deloadCut, setDeloadCut] = useState(30) // % volume reduction in recovery weeks
  const [fitnessForm, setFitnessForm] = useState<FitnessForm | null>(null)

  // Load goal + template + check for existing saved plan
  useEffect(() => {
    if (!user || !raceGoalId) return

    async function load() {
      const [goalRes, templateRes, planRes] = await Promise.all([
        supabase.from('race_goals').select('*').eq('id', raceGoalId!).single(),
        supabase
          .from('weekly_templates')
          .select('*')
          .eq('race_goal_id', raceGoalId!)
          .eq('user_id', user!.id)
          .order('day_of_week')
          .order('sort_order'),
        supabase
          .from('training_plans')
          .select('*')
          .eq('race_goal_id', raceGoalId!)
          .eq('user_id', user!.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1),
      ])

      if (goalRes.data) setGoal(goalRes.data as RaceGoal)
      if (templateRes.data) {
        setTemplateSlots(
          templateRes.data.map(r => ({
            dayOfWeek: r.day_of_week,
            discipline: r.discipline as Discipline,
            workoutType: r.workout_type,
            sortOrder: r.sort_order,
          }))
        )
      }

      // If a saved plan exists, load its workouts directly into calendar view
      const savedPlan = planRes.data?.[0]
      if (savedPlan) {
        const { data: savedWorkouts } = await supabase
          .from('planned_workouts')
          .select('*')
          .eq('training_plan_id', savedPlan.id)
          .eq('user_id', user!.id)
          .order('date')
          .order('sort_order')

        if (savedWorkouts && savedWorkouts.length > 0) {
          setPlanSummary({
            startDate: savedPlan.start_date,
            endDate: savedPlan.end_date,
            totalWeeks: savedPlan.total_weeks,
            baseWeeks: savedPlan.base_weeks,
            buildWeeks: savedPlan.build_weeks,
            peakWeeks: savedPlan.peak_weeks,
            taperWeeks: savedPlan.taper_weeks,
            weeklyHoursTarget: Number(savedPlan.weekly_hours_target),
          })
          setAllWorkouts(savedWorkouts.map(w => ({
            date: w.date,
            weekNumber: w.week_number,
            phase: w.phase as TrainingPhase,
            discipline: w.discipline as Discipline,
            workoutType: w.workout_type,
            plannedDurationMin: w.planned_duration_min ?? 0,
            plannedDistanceM: w.planned_distance_m,
            intensityZone: w.intensity_zone ?? 1,
            description: w.description ?? '',
            isRecoveryWeek: w.is_recovery_week,
            sortOrder: w.sort_order,
          })))
          setSaved(true)
          setConfigStep('calendar')
        }
      }

      setLoading(false)
    }

    load()
  }, [user, raceGoalId])

  // Compute total weeks + phases + default recovery weeks once data is loaded
  const planMeta = useMemo(() => {
    if (!goal) return null
    const start = nextMonday(new Date())
    const total = weeksBetween(start, new Date(goal.race_date))
    if (total < 4) return null
    const phases = customPhases ?? allocatePhases(total)
    return { startDate: start, totalWeeks: total, phases }
  }, [goal, customPhases])

  // Set default recovery weeks (3:1 pattern) when planMeta first computes
  useEffect(() => {
    if (!planMeta) return
    const defaults = new Set<number>()
    const { phases } = planMeta
    let weekNum = 0
    for (const [phase, count] of [['base', phases.base], ['build', phases.build], ['peak', phases.peak], ['taper', phases.taper]] as const) {
      for (let i = 0; i < count; i++) {
        weekNum++
        if (isRecoveryWeek(i, phase)) {
          defaults.add(weekNum)
        }
      }
    }
    setRecoveryWeeks(defaults)
  }, [planMeta])

  // Generate plan — store summary separately, workouts in mutable state
  const [planSummary, setPlanSummary] = useState<ReturnType<typeof generatePlan>['summary'] | null>(null)
  const [allWorkouts, setAllWorkouts] = useState<PlannedWorkoutRow[]>([])

  function goToFitness() {
    if (!goal) return
    const skill = (profile?.experience_level ?? 'intermediate') as ExperienceLevel
    const stale = !fitnessForm
      || !('cssPace' in fitnessForm.swim)
      || !('raceDistanceKm' in fitnessForm.bike)
      || !('races' in fitnessForm.run)
    if (stale) setFitnessForm(buildFitnessForm(goal, skill))
    setError('')
    setConfigStep('fitness')
  }

  function handleGenerate() {
    if (!goal || templateSlots.length === 0 || !planMeta || !fitnessForm) return

    const parsed = parseFitnessForm(fitnessForm, goal)
    if (typeof parsed === 'string') {
      setError(parsed)
      return
    }

    try {
      const goalInput: GoalInput = {
        raceDate: goal.race_date,
        distanceType: goal.distance_type as GoalInput['distanceType'],
        swimDistanceM: goal.swim_distance_m,
        bikeDistanceM: goal.bike_distance_m,
        runDistanceM: goal.run_distance_m,
        targetSwimSec: goal.target_swim_time,
        targetBikeSec: goal.target_bike_time,
        targetRunSec: goal.target_run_time,
      }

      const result = generatePlan(goalInput, templateSlots, {
        startDate: '',
        experienceLevel: (profile?.experience_level ?? 'intermediate') as ExperienceLevel,
        customRecoveryWeeks: recoveryWeeks.size > 0 ? recoveryWeeks : undefined,
        customPhases: customPhases ?? undefined,
        recoveryMultiplier: (100 - deloadCut) / 100,
        currentFitness: parsed,
      })

      setPlanSummary(result.summary)
      setAllWorkouts(result.workouts)
      setConfigStep('calendar')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan')
    }
  }

  // Group workouts by week
  const weeklyWorkouts = useMemo(() => {
    const byWeek: PlannedWorkoutRow[][] = []
    for (const w of allWorkouts) {
      const idx = w.weekNumber - 1
      if (!byWeek[idx]) byWeek[idx] = []
      byWeek[idx].push(w)
    }
    return byWeek
  }, [allWorkouts])

  // Save plan to Supabase
  async function handleSave() {
    if (!user || !planSummary || !raceGoalId) return
    setSaving(true)
    setError('')

    try {
      // Create training_plan row
      const { data: planRow, error: planErr } = await supabase
        .from('training_plans')
        .insert({
          user_id: user.id,
          race_goal_id: raceGoalId,
          start_date: planSummary.startDate,
          end_date: planSummary.endDate,
          total_weeks: planSummary.totalWeeks,
          base_weeks: planSummary.baseWeeks,
          build_weeks: planSummary.buildWeeks,
          peak_weeks: planSummary.peakWeeks,
          taper_weeks: planSummary.taperWeeks,
          weekly_hours_target: planSummary.weeklyHoursTarget,
          status: 'active',
        })
        .select('id')
        .single()

      if (planErr) throw planErr

      // Batch insert planned workouts
      const workoutRows = allWorkouts.map(w => ({
        training_plan_id: planRow.id,
        user_id: user.id,
        date: w.date,
        week_number: w.weekNumber,
        phase: w.phase,
        discipline: w.discipline,
        workout_type: w.workoutType,
        planned_duration_min: w.plannedDurationMin,
        planned_distance_m: w.plannedDistanceM,
        intensity_zone: w.intensityZone,
        description: w.description,
        is_recovery_week: w.isRecoveryWeek,
        sort_order: w.sortOrder,
      }))

      // Insert in batches of 200 (Supabase limit)
      for (let i = 0; i < workoutRows.length; i += 200) {
        const batch = workoutRows.slice(i, i + 200)
        const { error: wErr } = await supabase.from('planned_workouts').insert(batch)
        if (wErr) throw wErr
      }

      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  if (!raceGoalId) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">No race goal selected</p>
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

  if (!planMeta || templateSlots.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-gray-400">{error || 'Could not generate a plan. Set up a weekly template first.'}</p>
          <button onClick={() => navigate('/dashboard')} className="text-indigo-400 hover:text-indigo-300 underline text-sm">
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Configure step: recovery week picker ──
  if (configStep === 'configure') {
    const { totalWeeks, phases } = planMeta
    const phasesSum = phases.base + phases.build + phases.peak + phases.taper
    const phaseMismatch = phasesSum !== totalWeeks

    function updatePhase(key: 'base' | 'build' | 'peak' | 'taper', value: number) {
      const current = customPhases ?? { ...phases }
      setCustomPhases({ ...current, [key]: Math.max(1, value) })
    }

    function resetPhases() {
      setCustomPhases(null)
    }

    // Build phase labels for each week
    const weekMeta: { weekNum: number; phase: TrainingPhase; phaseWeekIdx: number }[] = []
    let wn = 0
    for (const [phase, count] of [['base', phases.base], ['build', phases.build], ['peak', phases.peak], ['taper', phases.taper]] as const) {
      for (let i = 0; i < count; i++) {
        wn++
        weekMeta.push({ weekNum: wn, phase, phaseWeekIdx: i })
      }
    }

    function toggleRecovery(weekNum: number) {
      setRecoveryWeeks(prev => {
        const next = new Set(prev)
        if (next.has(weekNum)) next.delete(weekNum)
        else next.add(weekNum)
        return next
      })
    }

    function resetToDefault() {
      const defaults = new Set<number>()
      for (const wm of weekMeta) {
        if (isRecoveryWeek(wm.phaseWeekIdx, wm.phase)) defaults.add(wm.weekNum)
      }
      setRecoveryWeeks(defaults)
    }

    // Suggest cycle-based pattern (every N weeks)
    function setCyclePattern(interval: number) {
      const custom = new Set<number>()
      for (let w = interval; w <= totalWeeks; w += interval) {
        custom.add(w)
      }
      setRecoveryWeeks(custom)
    }

    const startDateStr = planMeta.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <header className="border-b border-gray-800 px-6 py-4">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">
            ← Back to dashboard
          </button>
          <p className="text-xs text-gray-500 mt-0.5">{goal?.name}</p>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-indigo-400 mb-1">Step 1 of 2</p>
            <h2 className="text-2xl font-bold mb-1">Configure Your Plan</h2>
            <p className="text-sm text-gray-400">
              {totalWeeks} weeks starting {startDateStr}
            </p>
          </div>

          {/* Phase weeks editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Training Phases</h3>
              {customPhases && (
                <button type="button" onClick={resetPhases} className="text-xs text-gray-400 hover:text-white underline">
                  Reset to default
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {([
                { key: 'base' as const, label: 'Base', color: 'border-blue-700 text-blue-300' },
                { key: 'build' as const, label: 'Build', color: 'border-amber-700 text-amber-300' },
                { key: 'peak' as const, label: 'Peak', color: 'border-red-700 text-red-300' },
                { key: 'taper' as const, label: 'Taper', color: 'border-green-700 text-green-300' },
              ]).map(p => (
                <div key={p.key} className={`rounded-lg border bg-gray-900 p-3 text-center ${p.color}`}>
                  <div className="text-xs font-medium mb-1.5">{p.label}</div>
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => updatePhase(p.key, phases[p.key] - 1)}
                      disabled={phases[p.key] <= 1}
                      className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-sm flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-lg font-bold">{phases[p.key]}</span>
                    <button
                      type="button"
                      onClick={() => updatePhase(p.key, phases[p.key] + 1)}
                      className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-sm flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-[10px] opacity-60 mt-1">weeks</div>
                </div>
              ))}
            </div>
            {phaseMismatch && (
              <p className={`text-xs ${phasesSum > totalWeeks ? 'text-red-400' : 'text-amber-400'}`}>
                Phases total {phasesSum}w but plan is {totalWeeks}w — {phasesSum > totalWeeks ? 'reduce' : 'add'} {Math.abs(phasesSum - totalWeeks)} week{Math.abs(phasesSum - totalWeeks) !== 1 ? 's' : ''}
              </p>
            )}
            {!phaseMismatch && (
              <p className="text-xs text-gray-600">
                {phases.base}w + {phases.build}w + {phases.peak}w + {phases.taper}w = {totalWeeks}w ✓
              </p>
            )}
          </div>

          {/* Recovery week picker */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold mb-1">Recovery Weeks</h3>
              <p className="text-sm text-gray-400">
                Click weeks to toggle recovery. Sync with your cycle, travel, or life schedule. Recovery weeks reduce volume to ~60% and cap intensity at zone 1.
              </p>
            </div>

            {/* Quick patterns */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetToDefault} className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors">
                Default 3:1
              </button>
              <button type="button" onClick={() => setCyclePattern(4)} className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors">
                Every 4 weeks
              </button>
              <button type="button" onClick={() => setCyclePattern(5)} className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors">
                Every 5 weeks
              </button>
              <button type="button" onClick={() => setRecoveryWeeks(new Set())} className="text-xs px-3 py-1 rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors">
                Clear all
              </button>
            </div>

            {/* Week grid */}
            <div className="grid grid-cols-7 sm:grid-cols-10 gap-1.5">
              {weekMeta.map(wm => {
                const isRec = recoveryWeeks.has(wm.weekNum)
                const isTaper = wm.phase === 'taper'
                const weekStart = new Date(planMeta.startDate.getTime() + (wm.weekNum - 1) * 7 * 86400000)
                const dateLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                return (
                  <button
                    key={wm.weekNum}
                    type="button"
                    onClick={() => !isTaper && toggleRecovery(wm.weekNum)}
                    disabled={isTaper}
                    title={`Week ${wm.weekNum} · ${dateLabel} · ${PHASE_LABELS[wm.phase]}${isRec ? ' (recovery)' : ''}${isTaper ? ' — taper is auto-managed' : ''}`}
                    className={`relative rounded-lg py-2 px-1 text-center transition-colors ${
                      isTaper
                        ? 'bg-green-900/30 border border-green-800/50 text-green-400/50 cursor-not-allowed'
                        : isRec
                          ? 'bg-indigo-600 border-2 border-indigo-400 text-white'
                          : `border ${PHASE_COLORS[wm.phase]} hover:brightness-125 cursor-pointer`
                    }`}
                  >
                    <div className="text-[10px] font-bold">{isRec && !isTaper ? '💤' : wm.weekNum}</div>
                    <div className="text-[8px] opacity-60">{dateLabel}</div>
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-gray-600">
              {recoveryWeeks.size} recovery week{recoveryWeeks.size !== 1 ? 's' : ''} selected
              {' · '}Taper weeks are auto-managed
            </p>

            {/* Deload intensity */}
            <div className="flex items-center gap-3 pt-2">
              <span className="text-sm text-gray-300 whitespace-nowrap">Deload cut</span>
              <input
                type="range"
                min={10}
                max={50}
                step={5}
                value={deloadCut}
                onChange={e => setDeloadCut(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-sm font-medium w-10 text-right">{deloadCut}%</span>
            </div>
            <p className="text-[10px] text-gray-600">
              Recovery weeks at {100 - deloadCut}% volume. Typical range: 20–30% cut.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={goToFitness}
            disabled={phaseMismatch}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-white font-medium transition-colors text-lg"
          >
            {phaseMismatch ? `Phases must total ${totalWeeks} weeks` : 'Next: Current fitness'}
          </button>
        </main>
      </div>
    )
  }

  // ── Fitness assessment step ──
  if (configStep === 'fitness') {
    if (!goal || !fitnessForm) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )
    }
    return (
      <FitnessConfigStep
        goal={goal}
        form={fitnessForm}
        onChange={setFitnessForm}
        onBack={() => { setError(''); setConfigStep('configure') }}
        onGenerate={handleGenerate}
        error={error}
      />
    )
  }

  // ── Calendar view (after generation) ──
  if (!planSummary || allWorkouts.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  const currentWeek = weeklyWorkouts[selectedWeek] ?? []
  const weekPhase = currentWeek[0]?.phase ?? 'base'
  const isRecovery = currentWeek[0]?.isRecoveryWeek ?? false

  // Organize selected week's workouts by day
  const workoutsByDay: PlannedWorkoutRow[][] = Array.from({ length: 7 }, () => [])
  for (const w of currentWeek) {
    const d = new Date(w.date)
    const dow = (d.getDay() + 6) % 7 // convert Sun=0 to Mon=0
    workoutsByDay[dow].push(w)
  }

  // Week date range
  const weekMonday = currentWeek.length > 0 ? new Date(currentWeek[0].date) : null
  const weekSunday = weekMonday ? new Date(weekMonday.getTime() + 6 * 86400000) : null
  const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const weekDateRange = weekMonday && weekSunday ? `${fmtShort(weekMonday)} – ${fmtShort(weekSunday)}` : ''

  // Week volume
  const weekMinutes = currentWeek.reduce((s, w) => s + w.plannedDurationMin, 0)
  const weekHours = (weekMinutes / 60).toFixed(1)

  // Editing modal helpers
  const editingData = editingWorkout
    ? weeklyWorkouts[editingWorkout.weekIdx]?.[editingWorkout.workoutIdx] ?? null
    : null

  function handleWorkoutUpdate(updated: PlannedWorkoutRow) {
    if (!editingWorkout) return
    const { weekIdx, workoutIdx } = editingWorkout
    const original = weeklyWorkouts[weekIdx]?.[workoutIdx]
    if (!original) return

    setAllWorkouts(prev => prev.map(w =>
      w.date === original.date
        && w.discipline === original.discipline
        && w.workoutType === original.workoutType
        && w.sortOrder === original.sortOrder
        ? updated : w
    ))
    setEditingWorkout(null)
  }

  async function handleRegenerate() {
    if (!user || !raceGoalId) return

    // Delete existing plan + workouts for this goal
    const { data: plans } = await supabase
      .from('training_plans')
      .select('id')
      .eq('race_goal_id', raceGoalId)
      .eq('user_id', user.id)

    if (plans) {
      for (const p of plans) {
        await supabase.from('planned_workouts').delete().eq('training_plan_id', p.id)
        await supabase.from('training_plans').delete().eq('id', p.id)
      }
    }

    setPlanSummary(null)
    setAllWorkouts([])
    setSaved(false)
    setConfigStep('configure')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">
            ← Back to dashboard
          </button>
          <p className="text-xs text-gray-500 mt-0.5">{goal?.name}</p>
        </div>
        {!saved ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium transition-colors"
          >
            {saving ? 'Saving…' : 'Save Plan'}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-sm font-medium">✓ Saved</span>
            <button
              onClick={handleRegenerate}
              className="rounded-lg bg-gray-800 hover:bg-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors"
            >
              Regenerate
            </button>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Plan summary bar */}
        <div className="flex flex-wrap gap-3 items-center mb-6">
          <h2 className="text-xl font-bold mr-auto">Training Calendar</h2>
          <Stat label="Weeks" value={planSummary.totalWeeks} />
          <Stat label="Avg hrs/wk" value={planSummary.weeklyHoursTarget.toFixed(1)} />
          <Stat label="Start" value={planSummary.startDate} />
          <Stat label="Race" value={planSummary.endDate} />
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Weekly volume chart */}
        <div className="mb-6">
          <WeeklyVolumeChart
            weeklyWorkouts={weeklyWorkouts}
            selectedWeek={selectedWeek}
            onSelectWeek={setSelectedWeek}
          />
        </div>

        {/* Phase timeline + week selector */}
        <div className="mb-6">
          <div className="flex gap-0.5 rounded-lg">
            {weeklyWorkouts.map((wk, idx) => {
              const phase = wk[0]?.phase ?? 'base'
              const recovery = wk[0]?.isRecoveryWeek ?? false
              const isSelected = idx === selectedWeek
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedWeek(idx)}
                  title={`Week ${idx + 1} — ${PHASE_LABELS[phase]}${recovery ? ' (recovery)' : ''}`}
                  className={`flex-1 h-8 min-w-[12px] transition-all rounded-sm ${
                    isSelected
                      ? 'outline outline-2 outline-white z-10 brightness-125'
                      : ''
                  } ${
                    recovery
                      ? 'opacity-50'
                      : ''
                  } ${PHASE_COLORS[phase].split(' ')[0]}`}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-0.5">
            <span>Base ({planSummary.baseWeeks}w)</span>
            <span>Build ({planSummary.buildWeeks}w)</span>
            <span>Peak ({planSummary.peakWeeks}w)</span>
            <span>Taper ({planSummary.taperWeeks}w)</span>
          </div>
        </div>

        {/* Selected week header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setSelectedWeek(Math.max(0, selectedWeek - 1))}
            disabled={selectedWeek === 0}
            className="text-gray-400 hover:text-white disabled:opacity-30 text-lg"
          >
            ‹
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">Week {selectedWeek + 1}</span>
            {weekDateRange && (
              <span className="text-sm text-gray-400">{weekDateRange}</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full border ${PHASE_COLORS[weekPhase]}`}>
              {PHASE_LABELS[weekPhase]}
            </span>
            {isRecovery && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                Recovery
              </span>
            )}
            <span className="text-xs text-gray-500">{weekHours}h total</span>
          </div>
          <button
            onClick={() => setSelectedWeek(Math.min(weeklyWorkouts.length - 1, selectedWeek + 1))}
            disabled={selectedWeek >= weeklyWorkouts.length - 1}
            className="text-gray-400 hover:text-white disabled:opacity-30 text-lg"
          >
            ›
          </button>
        </div>

        {/* 7-column week view */}
        <div className="grid grid-cols-7 gap-2">
          {DAY_LABELS.map((dayLabel, dayIdx) => {
            const dayWorkouts = workoutsByDay[dayIdx]
            const dayDate = currentWeek.length > 0
              ? new Date(new Date(currentWeek[0].date).getTime() + dayIdx * 86400000)
              : null
            const dayMinutes = dayWorkouts.reduce((s, w) => s + w.plannedDurationMin, 0)

            return (
              <div key={dayLabel} className="flex flex-col">
                <div className="text-center pb-2 border-b border-gray-800 mb-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {dayLabel}
                  </div>
                  {dayDate && (
                    <div className="text-[10px] text-gray-600">
                      {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5 min-h-[100px]">
                  {dayWorkouts.length === 0 && (
                    <div className="text-xs text-gray-700 text-center py-4">Rest</div>
                  )}
                  {dayWorkouts.map((w, i) => {
                    // Find the flat index into currentWeek for this workout
                    const flatIdx = currentWeek.indexOf(w)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setEditingWorkout({ weekIdx: selectedWeek, workoutIdx: flatIdx })}
                        className="w-full text-left space-y-0.5 rounded-lg p-1 -m-1 hover:bg-gray-800/50 transition-colors cursor-pointer"
                      >
                        <WorkoutChip
                          discipline={w.discipline}
                          workoutLabel={workoutLabel(w.discipline, w.workoutType)}
                        />
                        <div className="text-[10px] text-gray-500 px-1 leading-tight">
                          {w.plannedDurationMin}min
                          {w.plannedDistanceM != null && (
                            <> · {w.plannedDistanceM >= 1000
                              ? `${(w.plannedDistanceM / 1000).toFixed(1)}km`
                              : `${w.plannedDistanceM}m`
                            }</>
                          )}
                          {' · Z'}{w.intensityZone}
                        </div>
                        <div className="text-[10px] text-gray-600 px-1 leading-tight italic">
                          {w.description}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {dayWorkouts.length > 0 && (
                  <div className="text-[10px] text-gray-600 text-center pt-1 border-t border-gray-800/50 mt-1">
                    {dayMinutes}min
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {/* Edit modal */}
        {editingData && (
          <WorkoutEditModal
            workout={editingData}
            onSave={handleWorkoutUpdate}
            onClose={() => setEditingWorkout(null)}
          />
        )}
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center px-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}

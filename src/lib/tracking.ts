import type { CompletedWorkout, Discipline, PlannedWorkout, PlannedWorkoutStatus, TrainingPhase } from './database.types'
import type { PlannedWorkoutRow } from './plan-generator'

export type TrackedPlanned = PlannedWorkoutRow & {
  id: string
  optional: boolean
  status: PlannedWorkoutStatus
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

export function todayISO(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function startOfWeekMonday(from: Date): Date {
  const x = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

export function endOfWeekSunday(monday: Date): Date {
  const s = new Date(monday)
  s.setDate(s.getDate() + 6)
  return s
}

export function weekHasEnded(weekMonday: Date, now = new Date()): boolean {
  const end = endOfWeekSunday(weekMonday)
  end.setHours(23, 59, 59, 999)
  return now > end
}

export function mondayISO(from: Date): string {
  return todayISO(startOfWeekMonday(from))
}

export function sundayISO(from: Date): string {
  return todayISO(endOfWeekSunday(startOfWeekMonday(from)))
}

export function mapPlannedFromDb(w: PlannedWorkout): TrackedPlanned {
  return {
    id: w.id,
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
    optional: w.optional,
    status: w.status,
  }
}

export function completionByPlannedId(completions: CompletedWorkout[]): Map<string, CompletedWorkout> {
  const map = new Map<string, CompletedWorkout>()
  for (const c of completions) {
    if (c.planned_workout_id) map.set(c.planned_workout_id, c)
  }
  return map
}

export function extrasOnDate(completions: CompletedWorkout[], date: string): CompletedWorkout[] {
  return completions.filter(c => !c.planned_workout_id && c.date === date)
}

export interface WeekScore {
  required: number
  completedRequired: number
  leftoverRequired: number
  optionalTotal: number
  optionalLeft: number
  extras: number
  sessionPct: number | null
  volumePct: number | null
  weekEnded: boolean
}

function requiredInWeek(planned: TrackedPlanned[], weekNumber: number): TrackedPlanned[] {
  return planned.filter(w =>
    w.weekNumber === weekNumber && !w.optional && w.status !== 'skipped'
  )
}

export function scoreWeek(
  planned: TrackedPlanned[],
  completions: CompletedWorkout[],
  weekNumber: number,
  weekMonday: Date,
  now = new Date(),
): WeekScore {
  const done = completionByPlannedId(completions)
  const required = requiredInWeek(planned, weekNumber)
  const completedRequired = required.filter(w => done.has(w.id))
  const optional = planned.filter(w => w.weekNumber === weekNumber && w.optional && w.status !== 'skipped')
  const optionalLeft = optional.filter(w => !done.has(w.id)).length
  const extras = completions.filter(c => {
    if (c.planned_workout_id) return false
    const d = parseISODate(c.date)
    return d >= weekMonday && d <= endOfWeekSunday(weekMonday)
  }).length

  const plannedMin = required.reduce((s, w) => s + w.plannedDurationMin, 0)
  const actualMin = completedRequired.reduce((s, w) => {
    const log = done.get(w.id)
    return s + (log?.actual_duration_min ?? 0)
  }, 0)

  const ended = weekHasEnded(weekMonday, now)

  return {
    required: required.length,
    completedRequired: completedRequired.length,
    leftoverRequired: required.length - completedRequired.length,
    optionalTotal: optional.length,
    optionalLeft,
    extras,
    sessionPct: required.length === 0 ? null : Math.round((completedRequired.length / required.length) * 100),
    volumePct: plannedMin === 0 ? null : Math.round((actualMin / plannedMin) * 100),
    weekEnded: ended,
  }
}

export function scoreEndedWeeks(
  planned: TrackedPlanned[],
  completions: CompletedWorkout[],
  now = new Date(),
): WeekScore | null {
  const byWeek = new Map<number, TrackedPlanned[]>()
  for (const w of planned) {
    const list = byWeek.get(w.weekNumber) ?? []
    list.push(w)
    byWeek.set(w.weekNumber, list)
  }

  const endedWeeks: number[] = []
  for (const [weekNumber, rows] of byWeek) {
    const monday = parseISODate(rows.reduce((min, w) => w.date < min ? w.date : min, rows[0]!.date))
    if (weekHasEnded(monday, now)) endedWeeks.push(weekNumber)
  }

  if (endedWeeks.length === 0) return null

  const done = completionByPlannedId(completions)
  const required = planned.filter(w =>
    endedWeeks.includes(w.weekNumber) && !w.optional && w.status !== 'skipped'
  )
  const completedRequired = required.filter(w => done.has(w.id))
  const plannedMin = required.reduce((s, w) => s + w.plannedDurationMin, 0)
  const actualMin = completedRequired.reduce((s, w) => s + (done.get(w.id)?.actual_duration_min ?? 0), 0)

  return {
    required: required.length,
    completedRequired: completedRequired.length,
    leftoverRequired: required.length - completedRequired.length,
    optionalTotal: 0,
    optionalLeft: 0,
    extras: 0,
    sessionPct: required.length === 0 ? null : Math.round((completedRequired.length / required.length) * 100),
    volumePct: plannedMin === 0 ? null : Math.round((actualMin / plannedMin) * 100),
    weekEnded: true,
  }
}

export function currentWeekPlanned(planned: TrackedPlanned[], now = new Date()): TrackedPlanned[] {
  const mon = mondayISO(now)
  const sun = sundayISO(now)
  return planned.filter(w => w.date >= mon && w.date <= sun)
}

export function formatDoneOn(plannedDate: string, actualDate: string): string | null {
  if (plannedDate === actualDate) return null
  const d = parseISODate(actualDate)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

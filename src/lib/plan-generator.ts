/**
 * Training Plan Generator
 *
 * Takes a race goal + weekly template + experience level → generates a full
 * periodized plan with daily workouts, phase-appropriate volume, and 3:1
 * mesocycle structure.
 */

import type { Discipline, ExperienceLevel, RaceDistance, TrainingPhase } from './database.types'
import {
  PHASE_RATIOS,
  PHASE_VOLUME_MULTIPLIER,
  MESOCYCLE,
  TAPER_SCHEDULE,
  DISCIPLINE_SPLIT,
  WEEKLY_HOURS,
  INTENSITY_DISTRIBUTION,
  WORKOUT_TYPES,
  STRENGTH_SESSIONS,
} from './constants'
import { swimZonePace } from './swim-css'
import { bikeZoneKmh, runZoneSecPerKm } from './endurance-fitness'

// ── Input types ──

export interface GoalInput {
  raceDate: string        // ISO date
  distanceType: RaceDistance
  swimDistanceM: number
  bikeDistanceM: number
  runDistanceM: number
  targetSwimSec?: number | null
  targetBikeSec?: number | null
  targetRunSec?: number | null
}

/** Current longest session + easy pace per endurance discipline. */
export interface DisciplineFitness {
  longestM: number
  /** Swim: sec/100m · Bike: km/h · Run: sec/km */
  easyPace: number
  skill: ExperienceLevel
  /** Swim only: critical swim speed, sec/100m */
  cssPace?: number
  /** Past race used as the current distance/pace anchor */
  raceDistanceM?: number
  raceTimeSec?: number
  /** Bike: elevation gain of that race, metres */
  elevationGainM?: number
  /** Bike: flat-equivalent race speed km/h */
  raceFlatKmh?: number
  /** Run: threshold pace sec/km from a short race */
  thresholdPace?: number
  /** Run: all entered races */
  races?: { distanceM: number; timeSec: number }[]
}

const SKILL_LONGEST_PCT: Record<ExperienceLevel, number> = {
  beginner: 0.30,
  intermediate: 0.45,
  advanced: 0.60,
}

const DEFAULT_EASY_PACE: Record<'swim' | 'bike' | 'run', Record<ExperienceLevel, number>> = {
  swim: { beginner: 130, intermediate: 115, advanced: 100 },
  bike: { beginner: 24, intermediate: 27, advanced: 30 },
  run: { beginner: 390, intermediate: 345, advanced: 315 },
}

const SKILL_VOLUME_FLOOR: Record<ExperienceLevel, number> = {
  beginner: 0.45,
  intermediate: 0.62,
  advanced: 0.82,
}

export function defaultDisciplineFitness(
  discipline: 'swim' | 'bike' | 'run',
  raceDistM: number,
  skill: ExperienceLevel,
  raceTimeSec?: number | null,
): DisciplineFitness {
  const longestM = Math.max(1, Math.round(raceDistM * SKILL_LONGEST_PCT[skill]))
  let easyPace = DEFAULT_EASY_PACE[discipline][skill]
  if (raceTimeSec && raceTimeSec > 0 && raceDistM > 0) {
    if (discipline === 'swim') easyPace = (raceTimeSec / raceDistM) * 100 * 1.08
    else if (discipline === 'bike') easyPace = (raceDistM / 1000) / (raceTimeSec / 3600) * 0.88
    else easyPace = (raceTimeSec / (raceDistM / 1000)) * 1.12
  }
  return { longestM, easyPace, skill }
}

function blendSkills(fitness: CurrentFitness): ExperienceLevel {
  const score = { beginner: 0, intermediate: 1, advanced: 2 }
  const avg = (score[fitness.swim.skill] + score[fitness.bike.skill] + score[fitness.run.skill]) / 3
  if (avg < 0.75) return 'beginner'
  if (avg < 1.5) return 'intermediate'
  return 'advanced'
}

export interface CurrentFitness {
  swim: DisciplineFitness
  bike: DisciplineFitness
  run: DisciplineFitness
}

export interface TemplateSlot {
  dayOfWeek: number       // 0=Mon, 6=Sun
  discipline: Discipline
  workoutType: string
  sortOrder: number
}

export interface GeneratorConfig {
  startDate: string       // ISO date (defaults to next Monday)
  experienceLevel: ExperienceLevel
  /** Optional set of 1-indexed week numbers to treat as recovery weeks.
   *  When provided, overrides the automatic 3:1 mesocycle pattern. */
  customRecoveryWeeks?: Set<number>
  /** Optional phase week counts. When provided, overrides allocatePhases(). */
  customPhases?: { base: number; build: number; peak: number; taper: number }
  /** Recovery week volume as fraction of normal (0-1). Default 0.60. E.g. 0.75 = 25% cut. */
  recoveryMultiplier?: number
  /** Per-discipline starting point. Plan ramps from here toward race-ready volume/distance. */
  currentFitness?: CurrentFitness
}

// ── Output types ──

export interface PlanSummary {
  startDate: string
  endDate: string
  totalWeeks: number
  baseWeeks: number
  buildWeeks: number
  peakWeeks: number
  taperWeeks: number
  weeklyHoursTarget: number
}

export interface PlannedWorkoutRow {
  date: string
  weekNumber: number
  phase: TrainingPhase
  discipline: Discipline
  workoutType: string
  plannedDurationMin: number
  plannedDistanceM: number | null
  intensityZone: number
  description: string
  isRecoveryWeek: boolean
  sortOrder: number
}

// ── Helpers ──

export function nextMonday(from: Date): Date {
  const d = new Date(from)
  const day = d.getDay() // 0=Sun, 1=Mon …
  const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function lerp(from: number, to: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return from + (to - from) * clamped
}

/** 0 at week 1, 1 once peak phase starts. */
function loadProgress(weekNum: number, peakStartWeek: number): number {
  if (weekNum >= peakStartWeek) return 1
  return (weekNum - 1) / Math.max(1, peakStartWeek - 1)
}

function interpolatedEasyPace(
  discipline: 'swim' | 'bike' | 'run',
  current: number,
  raceDistM: number,
  raceTimeSec: number | null | undefined,
  t: number,
): number {
  if (!raceTimeSec || raceTimeSec <= 0 || raceDistM <= 0) {
    return current
  }

  let targetEasy = current
  if (discipline === 'swim') {
    const racePer100 = (raceTimeSec / raceDistM) * 100
    targetEasy = racePer100 * 1.08
    if (current < targetEasy) targetEasy = current
  } else if (discipline === 'bike') {
    const raceKmh = (raceDistM / 1000) / (raceTimeSec / 3600)
    targetEasy = raceKmh * 0.88
    if (current > targetEasy) targetEasy = current
  } else {
    const racePerKm = raceTimeSec / (raceDistM / 1000)
    targetEasy = racePerKm * 1.12
    if (current < targetEasy) targetEasy = current
  }

  return lerp(current, targetEasy, t)
}

/** Current CSS, with a modest improvement toward race-goal CSS over the plan. */
function swimCssNow(
  fitness: DisciplineFitness,
  progress: number,
  goalSwimDistM: number,
  goalSwimSec?: number | null,
): number {
  const css = fitness.cssPace ?? Math.max(70, fitness.easyPace - 10)
  if (!goalSwimSec || goalSwimSec <= 0 || goalSwimDistM <= 0) return css
  const goalCss = (goalSwimSec / goalSwimDistM) * 100
  if (goalCss >= css) return css
  return lerp(css, goalCss, progress * 0.4)
}

export function weeksBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000))
}

// ── Phase allocation ──

export function allocatePhases(totalWeeks: number): { base: number; build: number; peak: number; taper: number } {
  let taper = Math.max(1, Math.round(totalWeeks * PHASE_RATIOS.taper))
  let peak = Math.max(1, Math.round(totalWeeks * PHASE_RATIOS.peak))
  let base = Math.max(2, Math.round(totalWeeks * PHASE_RATIOS.base))
  let build = totalWeeks - base - peak - taper

  // Ensure build gets at least 2 weeks
  if (build < 2) {
    const deficit = 2 - build
    base = Math.max(2, base - deficit)
    build = totalWeeks - base - peak - taper
  }

  return { base, build, peak, taper }
}

// ── Volume for a specific week ──

function weekVolume(
  weekNum: number,           // 1-indexed overall
  phase: TrainingPhase,
  phaseWeekIndex: number,    // 0-indexed within phase
  avgWeeklyMin: number,
  isRecovery: boolean,
  recoveryMult: number,
  totalWeeks: number,
): number {
  if (phase === 'taper') {
    const taperIdx = Math.min(phaseWeekIndex, TAPER_SCHEDULE.length - 1)
    return avgWeeklyMin * PHASE_VOLUME_MULTIPLIER.peak * TAPER_SCHEDULE[taperIdx]
  }

  const phaseBase = avgWeeklyMin * PHASE_VOLUME_MULTIPLIER[phase]

  // Progressive overload: volume grows with position in overall plan
  // This ensures later weeks (even recovery) are higher than early weeks
  const progressionFactor = 1 + (weekNum / totalWeeks) * 0.25 // up to +25% by end

  // Within mesocycle, further micro-progression across load weeks
  const mesoCycleLen = MESOCYCLE.loadWeeks + MESOCYCLE.recoveryWeeks
  const posInMeso = phaseWeekIndex % mesoCycleLen
  const loadWeekIdx = Math.min(posInMeso, MESOCYCLE.loadWeeks - 1)
  const mesoFactor = 1 + loadWeekIdx * MESOCYCLE.weeklyIncrease

  const loadVolume = phaseBase * progressionFactor * mesoFactor

  if (isRecovery) {
    // Recovery is relative to the peak of the preceding load block
    const peakMesoFactor = 1 + (MESOCYCLE.loadWeeks - 1) * MESOCYCLE.weeklyIncrease
    const peakVolume = phaseBase * progressionFactor * peakMesoFactor
    return peakVolume * recoveryMult
  }

  return loadVolume
}

export function isRecoveryWeek(phaseWeekIndex: number, phase: TrainingPhase): boolean {
  if (phase === 'taper') return false
  const mesoCycleLen = MESOCYCLE.loadWeeks + MESOCYCLE.recoveryWeeks
  return (phaseWeekIndex % mesoCycleLen) === MESOCYCLE.loadWeeks
}

// ── Workout description generator ──

function describeWorkout(
  discipline: Discipline,
  workoutType: string,
  durationMin: number,
  zone: number,
  phase: TrainingPhase,
  isRecovery: boolean,
): string {
  if (isRecovery) {
    if (discipline === 'strength') return 'Light mobility or skip'
    return `Easy ${durationMin}min — recovery week`
  }

  if (discipline === 'strength') {
    return `${durationMin}min session`
  }

  // Build interval descriptions for high-intensity workouts
  if (zone >= 3) {
    const warmup = Math.round(durationMin * 0.2)
    const cooldown = Math.round(durationMin * 0.15)
    const mainSet = durationMin - warmup - cooldown

    if (workoutType === 'vo2max') {
      const reps = Math.max(3, Math.round(mainSet / 5))
      return `${warmup}min warmup → ${reps}×3min hard / 2min easy → ${cooldown}min cooldown`
    }
    if (workoutType === 'threshold' || workoutType === 'speed') {
      const reps = Math.max(2, Math.round(mainSet / 7))
      return `${warmup}min warmup → ${reps}×5min at threshold / 2min recovery → ${cooldown}min cooldown`
    }
    // Generic interval
    return `${warmup}min warmup → ${mainSet}min intervals → ${cooldown}min cooldown`
  }

  if (zone === 2) {
    if (workoutType === 'tempo') {
      const warmup = Math.round(durationMin * 0.2)
      const cooldown = Math.round(durationMin * 0.15)
      const tempo = durationMin - warmup - cooldown
      return `${warmup}min warmup → ${tempo}min steady tempo → ${cooldown}min cooldown`
    }
    if (workoutType === 'sweet_spot') {
      return `${Math.round(durationMin * 0.15)}min warmup → ${Math.round(durationMin * 0.7)}min sweet spot → cooldown`
    }
    if (workoutType === 'race_pace' || workoutType === 'race_sim') {
      return `${durationMin}min at race effort`
    }
    return `${durationMin}min moderate effort`
  }

  // Zone 1 — easy / endurance
  if (workoutType === 'long') return `${durationMin}min long — easy conversational pace`
  if (workoutType === 'technique') return `${durationMin}min — drills & technique focus`
  return `${durationMin}min easy aerobic`
}

// ── Main generator ──

export function generatePlan(
  goal: GoalInput,
  template: TemplateSlot[],
  config: GeneratorConfig,
): { summary: PlanSummary; workouts: PlannedWorkoutRow[] } {
  const raceDate = new Date(goal.raceDate)
  const startDate = config.startDate ? new Date(config.startDate) : nextMonday(new Date())
  const totalWeeks = weeksBetween(startDate, raceDate)
  const recoveryMult = config.recoveryMultiplier ?? MESOCYCLE.recoveryMultiplier

  if (totalWeeks < 4) {
    throw new Error(`Only ${totalWeeks} weeks until race — need at least 4`)
  }

  const phases = config.customPhases ?? allocatePhases(totalWeeks)
  const peakStartWeek = phases.base + phases.build + 1
  const fitness = config.currentFitness
  const distKey = goal.distanceType === 'custom' ? 'olympic' : goal.distanceType
  const experienceLevel = fitness ? blendSkills(fitness) : config.experienceLevel
  const hoursRange = WEEKLY_HOURS[distKey][experienceLevel]
  const avgWeeklyHours = (hoursRange.min + hoursRange.max) / 2
  const avgWeeklyMin = avgWeeklyHours * 60

  // Build phase schedule: which phase is each week in?
  const weekPhases: { phase: TrainingPhase; phaseWeekIdx: number }[] = []
  for (let i = 0; i < phases.base; i++) weekPhases.push({ phase: 'base', phaseWeekIdx: i })
  for (let i = 0; i < phases.build; i++) weekPhases.push({ phase: 'build', phaseWeekIdx: i })
  for (let i = 0; i < phases.peak; i++) weekPhases.push({ phase: 'peak', phaseWeekIdx: i })
  for (let i = 0; i < phases.taper; i++) weekPhases.push({ phase: 'taper', phaseWeekIdx: i })

  // Group template slots by day
  const templateByDay: Map<number, TemplateSlot[]> = new Map()
  for (const slot of template) {
    const existing = templateByDay.get(slot.dayOfWeek) ?? []
    existing.push(slot)
    templateByDay.set(slot.dayOfWeek, existing)
  }

  const workouts: PlannedWorkoutRow[] = []

  for (let weekIdx = 0; weekIdx < totalWeeks; weekIdx++) {
    const { phase, phaseWeekIdx } = weekPhases[weekIdx] ?? weekPhases[weekPhases.length - 1]
    const recovery = config.customRecoveryWeeks
      ? config.customRecoveryWeeks.has(weekIdx + 1) // 1-indexed
      : isRecoveryWeek(phaseWeekIdx, phase)
    const weekMinutes = weekVolume(weekIdx + 1, phase, phaseWeekIdx, avgWeeklyMin, recovery, recoveryMult, totalWeeks)
    const progress = phase === 'taper' ? 0.45 : loadProgress(weekIdx + 1, peakStartWeek)

    // Count workouts per discipline this week from template
    const weekSlots: TemplateSlot[] = []
    for (let dow = 0; dow < 7; dow++) {
      const daySlots = templateByDay.get(dow) ?? []
      for (const slot of daySlots) {
        // Skip strength in taper
        if (slot.discipline === 'strength' && phase === 'taper') continue
        weekSlots.push(slot)
      }
    }

    // Calculate minutes per discipline
    const disciplineMinutes: Record<Discipline, number> = {
      swim: weekMinutes * DISCIPLINE_SPLIT.swim,
      bike: weekMinutes * DISCIPLINE_SPLIT.bike,
      run: weekMinutes * DISCIPLINE_SPLIT.run,
      strength: STRENGTH_SESSIONS[phase].durationMin * STRENGTH_SESSIONS[phase].perWeek,
    }

    // Weak bike/run: start below target weekly volume and ramp toward it.
    // Swim time-in-water is not cut — distance/pace absorb the gap.
    if (fitness) {
      for (const disc of ['bike', 'run'] as const) {
        const peakLong = (disc === 'bike' ? goal.bikeDistanceM : goal.runDistanceM) * 0.85
        const fromLongest = fitness[disc].longestM / Math.max(peakLong, 1)
        const readiness = Math.min(1, Math.max(SKILL_VOLUME_FLOOR[fitness[disc].skill], fromLongest, 0.4))
        disciplineMinutes[disc] *= lerp(readiness, 1, progress)
      }
    }

    // ── Weighted time allocation per workout type ──
    // Long/endurance workouts get the biggest share, intervals less, recovery least
    const WORKOUT_WEIGHT: Record<string, number> = {
      long: 2.5, endurance: 2.5, open_water: 2.0,
      sweet_spot: 1.2, tempo: 1.2, fartlek: 1.1, race_sim: 1.5, race_pace: 1.2,
      cadence_force: 1.0, technique: 1.0,
      threshold: 0.85, vo2max: 0.75, speed: 0.8,
      recovery: 0.4, easy: 1.0,
      full_body: 1.0, upper: 1.0, lower: 1.0, core: 0.7, mobility: 0.5,
    }

    // Compute weighted shares per discipline
    const disciplineSlots: Record<Discipline, { slot: TemplateSlot; weight: number }[]> = {
      swim: [], bike: [], run: [], strength: [],
    }
    for (const s of weekSlots) {
      const w = WORKOUT_WEIGHT[s.workoutType] ?? 1.0
      disciplineSlots[s.discipline].push({ slot: s, weight: w })
    }

    // Pre-compute per-slot minutes based on weight share
    const slotMinutes = new Map<TemplateSlot, number>()
    for (const disc of ['swim', 'bike', 'run', 'strength'] as Discipline[]) {
      const slots = disciplineSlots[disc]
      const totalWeight = slots.reduce((s, e) => s + e.weight, 0)
      const totalMin = disciplineMinutes[disc]
      for (const { slot, weight } of slots) {
        slotMinutes.set(slot, totalWeight > 0 ? Math.round((weight / totalWeight) * totalMin) : 30)
      }
    }

    // ── Race-distance-aware long workout scaling ──
    // In build/peak, long workouts should approach a % of race distance
    const phaseDistancePct: Record<TrainingPhase, number> = {
      base: 0.45,  // long rides ~45% of race distance
      build: 0.65, // ~65%
      peak: 0.85,  // ~85% — longest rides before taper
      taper: 0.50, // reduced
    }
    const raceDistances = { swim: goal.swimDistanceM, bike: goal.bikeDistanceM, run: goal.runDistanceM }

    // Generate each day's workouts
    for (let dow = 0; dow < 7; dow++) {
      const daySlots = templateByDay.get(dow) ?? []
      const weekMonday = addDays(startDate, weekIdx * 7)
      const date = addDays(weekMonday, dow)

      // Don't generate workouts past race date
      if (date > raceDate) continue

      for (const slot of daySlots) {
        if (slot.discipline === 'strength' && phase === 'taper') continue

        let durationMin = slotMinutes.get(slot) ?? 30

        // Look up zone from workout catalog
        const catalog = WORKOUT_TYPES[slot.discipline] as readonly { value: string; zone: number; phases: readonly string[] }[]
        const catalogEntry = catalog.find(t => t.value === slot.workoutType)
        let zone = catalogEntry?.zone ?? 1

        // In recovery weeks, cap intensity at zone 1
        // (volume reduction is already handled by weekVolume)
        if (recovery && slot.discipline !== 'strength') {
          zone = 1
        }

        // For key long workouts, scale distance toward race distance by phase
        const isLongWorkout = slot.workoutType === 'long' || slot.workoutType === 'endurance' || slot.workoutType === 'open_water'
        let distanceM: number | null = null
        const discKey = slot.discipline as 'swim' | 'bike' | 'run'
        const raceDist = slot.discipline === 'strength' ? 0 : (raceDistances[discKey] ?? 0)
        const discFitness = fitness && slot.discipline !== 'strength' ? fitness[discKey] : undefined
        let easyPace: number | null = null
        if (discFitness && slot.discipline === 'swim') {
          const cssNow = swimCssNow(discFitness, progress, raceDist, goal.targetSwimSec)
          easyPace = swimZonePace(cssNow, recovery ? 1 : zone)
        } else if (discFitness && slot.discipline === 'bike' && discFitness.raceFlatKmh) {
          easyPace = bikeZoneKmh(discFitness.raceFlatKmh, recovery ? 1 : zone)
        } else if (discFitness && slot.discipline === 'run' && discFitness.thresholdPace) {
          easyPace = runZoneSecPerKm(discFitness.easyPace, discFitness.thresholdPace, recovery ? 1 : zone)
        } else if (discFitness) {
          easyPace = interpolatedEasyPace(
            discKey,
            discFitness.easyPace,
            raceDist,
            discKey === 'bike' ? goal.targetBikeSec : goal.targetRunSec,
            progress,
          )
        }

        if (isLongWorkout && !recovery && slot.discipline !== 'strength') {
          const peakLong = raceDist * phaseDistancePct.peak
          const startLong = discFitness
            ? Math.min(discFitness.raceDistanceM ?? discFitness.longestM, peakLong)
            : raceDist * phaseDistancePct.base
          const targetDist = Math.round(
            lerp(startLong, peakLong, phase === 'taper' ? phaseDistancePct.taper : progress),
          )

          if (slot.discipline === 'swim') {
            const paceSecPer100 = easyPace ?? 120
            const fromTime = (durationMin * 60 / paceSecPer100) * 100
            distanceM = Math.round(Math.min(fromTime, targetDist))
            durationMin = Math.max(15, Math.round((distanceM / 100) * (paceSecPer100 / 60)))
          } else if (slot.discipline === 'bike') {
            const kmh = easyPace ?? 28
            durationMin = Math.round((targetDist / 1000) / kmh * 60)
            distanceM = targetDist
          } else if (slot.discipline === 'run') {
            const secPerKm = easyPace ?? 330
            durationMin = Math.round((targetDist / 1000) * (secPerKm / 60))
            distanceM = targetDist
          }
        }

        // Clamp durations
        durationMin = Math.max(15, Math.min(durationMin, 420))

        // Estimate distance for non-long workouts
        if (distanceM === null) {
          if (slot.discipline === 'swim') {
            const paceSec = easyPace ?? (zone >= 3 ? 100 : zone === 2 ? 110 : 120)
            distanceM = Math.round((durationMin * 60 / paceSec) * 100)
          } else if (slot.discipline === 'bike') {
            const speedKmh = easyPace ?? (zone >= 3 ? 32 : zone === 2 ? 30 : 28)
            distanceM = Math.round((speedKmh * 1000 * durationMin) / 60)
          } else if (slot.discipline === 'run') {
            const paceSecPerKm = easyPace ?? (zone >= 3 ? 255 : zone === 2 ? 285 : 330)
            distanceM = Math.round((durationMin * 60 / paceSecPerKm) * 1000)
          }
        }

        const description = describeWorkout(
          slot.discipline, slot.workoutType, durationMin, zone, phase, recovery
        )

        workouts.push({
          date: isoDate(date),
          weekNumber: weekIdx + 1,
          phase,
          discipline: slot.discipline,
          workoutType: slot.workoutType,
          plannedDurationMin: durationMin,
          plannedDistanceM: distanceM,
          intensityZone: zone,
          description,
          isRecoveryWeek: recovery,
          sortOrder: slot.sortOrder,
        })
      }
    }
  }

  const endDate = addDays(startDate, totalWeeks * 7 - 1)

  return {
    summary: {
      startDate: isoDate(startDate),
      endDate: isoDate(endDate),
      totalWeeks,
      ...phases,
      baseWeeks: phases.base,
      buildWeeks: phases.build,
      peakWeeks: phases.peak,
      taperWeeks: phases.taper,
      weeklyHoursTarget: avgWeeklyHours,
    },
    workouts,
  }
}

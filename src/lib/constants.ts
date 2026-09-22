import type { RaceDistance, Discipline, ExperienceLevel } from './database.types'

// Default distances per race type (meters)
export const RACE_DISTANCES: Record<Exclude<RaceDistance, 'custom'>, { swim: number; bike: number; run: number; label: string }> = {
  sprint:    { swim: 750,  bike: 20000,  run: 5000,   label: 'Sprint' },
  olympic:   { swim: 1500, bike: 40000,  run: 10000,  label: 'Olympic' },
  half_iron: { swim: 1900, bike: 90000,  run: 21100,  label: 'Half Ironman (70.3)' },
  ironman:   { swim: 3800, bike: 180000, run: 42200,  label: 'Ironman (140.6)' },
}

// Total plan length range (weeks) by distance
export const PLAN_WEEKS: Record<Exclude<RaceDistance, 'custom'>, { min: number; max: number; default: number }> = {
  sprint:    { min: 8,  max: 12, default: 10 },
  olympic:   { min: 12, max: 16, default: 14 },
  half_iron: { min: 16, max: 20, default: 18 },
  ironman:   { min: 24, max: 30, default: 26 },
}

// Phase ratios (% of total plan weeks)
export const PHASE_RATIOS = {
  base:  0.33,
  build: 0.33,
  peak:  0.17,
  taper: 0.12,
  // Remaining 5% absorbed into build/peak rounding
}

// Weekly hours by distance × experience level
export const WEEKLY_HOURS: Record<Exclude<RaceDistance, 'custom'>, Record<ExperienceLevel, { min: number; max: number }>> = {
  sprint:    { beginner: { min: 4, max: 6 },  intermediate: { min: 6, max: 8 },   advanced: { min: 8, max: 10 } },
  olympic:   { beginner: { min: 6, max: 8 },  intermediate: { min: 8, max: 10 },  advanced: { min: 10, max: 14 } },
  half_iron: { beginner: { min: 8, max: 10 }, intermediate: { min: 10, max: 13 }, advanced: { min: 14, max: 18 } },
  ironman:   { beginner: { min: 10, max: 12 }, intermediate: { min: 13, max: 16 }, advanced: { min: 16, max: 22 } },
}

// Discipline time split (% of total weekly hours)
export const DISCIPLINE_SPLIT: Record<Discipline, number> = {
  swim: 0.17,
  bike: 0.50,
  run:  0.28,
  strength: 0.05,
}

// Volume multipliers per phase (relative to average weekly hours)
export const PHASE_VOLUME_MULTIPLIER = {
  base:  0.85,  // below average — building up
  build: 1.05,  // slightly above average
  peak:  1.20,  // highest volume
  taper: 0.55,  // sharp drop, maintain intensity
}

// Mesocycle: 3 weeks load, 1 week recovery
export const MESOCYCLE = {
  loadWeeks: 3,
  recoveryWeeks: 1,
  weeklyIncrease: 0.07,     // +7% volume per load week
  recoveryMultiplier: 0.60, // recovery week = 60% of preceding peak
}

// Taper volume reduction (% of peak week volume)
export const TAPER_SCHEDULE = [0.65, 0.45, 0.30] // week 1, 2, 3 (race week)

// Intensity distribution by phase (% of weekly volume)
export const INTENSITY_DISTRIBUTION = {
  base:  { zone1: 0.90, zone2: 0.05, zone3: 0.05 },
  build: { zone1: 0.80, zone2: 0.08, zone3: 0.12 },
  peak:  { zone1: 0.75, zone2: 0.08, zone3: 0.17 },
  taper: { zone1: 0.80, zone2: 0.05, zone3: 0.15 },
}

// Max hard sessions per week by experience level
export const MAX_HARD_SESSIONS: Record<ExperienceLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
}

// Strength sessions per week by phase
export const STRENGTH_SESSIONS = {
  base:  { perWeek: 3, durationMin: 50 },
  build: { perWeek: 2, durationMin: 35 },
  peak:  { perWeek: 1, durationMin: 25 },
  taper: { perWeek: 0, durationMin: 0 },
}

// Workout type catalogs per discipline
export const WORKOUT_TYPES = {
  swim: [
    { value: 'technique',  label: 'Technique / Drill', zone: 1, phases: ['base', 'build', 'peak', 'taper'] },
    { value: 'endurance',  label: 'Aerobic Endurance',  zone: 1, phases: ['base', 'build', 'peak', 'taper'] },
    { value: 'threshold',  label: 'Threshold',          zone: 3, phases: ['build', 'peak'] },
    { value: 'speed',      label: 'Speed / VO2max',     zone: 3, phases: ['build', 'peak'] },
    { value: 'race_sim',   label: 'Race Simulation',    zone: 2, phases: ['peak'] },
    { value: 'recovery',   label: 'Recovery',           zone: 1, phases: ['base', 'build', 'peak', 'taper'] },
    { value: 'open_water', label: 'Open Water',         zone: 1, phases: ['build', 'peak'] },
  ],
  bike: [
    { value: 'endurance',     label: 'Endurance / Long',   zone: 1, phases: ['base', 'build', 'peak', 'taper'] },
    { value: 'sweet_spot',    label: 'Sweet Spot',         zone: 2, phases: ['build'] },
    { value: 'threshold',     label: 'Threshold',          zone: 3, phases: ['build', 'peak'] },
    { value: 'vo2max',        label: 'VO2max Intervals',   zone: 3, phases: ['build', 'peak'] },
    { value: 'cadence_force', label: 'Cadence / Force',    zone: 2, phases: ['base', 'build'] },
    { value: 'recovery',      label: 'Recovery Spin',      zone: 1, phases: ['base', 'build', 'peak', 'taper'] },
    { value: 'race_sim',      label: 'Race Simulation',    zone: 2, phases: ['peak'] },
  ],
  run: [
    { value: 'easy',       label: 'Easy Aerobic',       zone: 1, phases: ['base', 'build', 'peak', 'taper'] },
    { value: 'long',       label: 'Long Run',           zone: 1, phases: ['base', 'build', 'peak'] },
    { value: 'tempo',      label: 'Tempo',              zone: 2, phases: ['build', 'peak'] },
    { value: 'threshold',  label: 'Threshold Intervals', zone: 3, phases: ['build', 'peak'] },
    { value: 'vo2max',     label: 'VO2max Intervals',   zone: 3, phases: ['build', 'peak'] },
    { value: 'fartlek',    label: 'Fartlek',            zone: 2, phases: ['build'] },
    { value: 'recovery',   label: 'Recovery Jog',       zone: 1, phases: ['base', 'build', 'peak', 'taper'] },
    { value: 'race_pace',  label: 'Race Pace',          zone: 2, phases: ['peak'] },
  ],
  strength: [
    { value: 'full_body', label: 'Full Body',  zone: 2, phases: ['base', 'build'] },
    { value: 'upper',     label: 'Upper Body', zone: 2, phases: ['base', 'build'] },
    { value: 'lower',     label: 'Lower Body', zone: 2, phases: ['base', 'build'] },
    { value: 'core',      label: 'Core',       zone: 1, phases: ['base', 'build', 'peak'] },
    { value: 'mobility',  label: 'Mobility',   zone: 1, phases: ['base', 'build', 'peak', 'taper'] },
  ],
} as const

// Day of week labels (0=Mon, 6=Sun)
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export function workoutLabel(discipline: Discipline, workoutType: string): string {
  const catalog = WORKOUT_TYPES[discipline] as readonly { value: string; label: string }[]
  return catalog.find(t => t.value === workoutType)?.label ?? workoutType
}

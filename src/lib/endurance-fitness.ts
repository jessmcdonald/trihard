import type { ExperienceLevel } from './database.types'

export const BIKE_RACE_PRESETS = [
  { m: 20000, label: '20km' },
  { m: 40000, label: '40km' },
  { m: 90000, label: '90km' },
  { m: 160934, label: 'Century' },
  { m: 180000, label: '180km' },
] as const

export const RUN_RACE_PRESETS = [
  { m: 5000, label: '5k' },
  { m: 10000, label: '10k' },
  { m: 16093, label: '10 mile' },
  { m: 21097, label: 'Half' },
  { m: 42195, label: 'Marathon' },
] as const

const RUN_SHORT_MAX_M = 12000

export interface PastRace {
  distanceM: number
  timeSec: number
}

/** ~0.85s per metre climbed — rough amateur endurance penalty. */
export function flatEquivalentBikeKmh(distanceM: number, timeSec: number, elevM: number): number {
  const climbPenaltySec = Math.max(0, elevM) * 0.85
  const flatTime = Math.max(timeSec - climbPenaltySec, timeSec * 0.75)
  return (distanceM / 1000) / (flatTime / 3600)
}

export function bikeZoneKmh(flatRaceKmh: number, zone: number): number {
  if (zone >= 3) return flatRaceKmh * 1.02
  if (zone === 2) return flatRaceKmh * 0.94
  return flatRaceKmh * 0.86
}

export function isShortRun(distanceM: number): boolean {
  return distanceM > 0 && distanceM < RUN_SHORT_MAX_M
}

export function runPacesFromRaces(races: PastRace[]): {
  easySecPerKm: number
  thresholdSecPerKm: number
  longestM: number
} {
  const paced = races.map(r => ({
    ...r,
    secPerKm: r.timeSec / (r.distanceM / 1000),
  }))
  const shorts = paced.filter(r => isShortRun(r.distanceM)).sort((a, b) => a.distanceM - b.distanceM)
  const longs = paced.filter(r => !isShortRun(r.distanceM)).sort((a, b) => b.distanceM - a.distanceM)
  const shortest = shorts[0]
  const longestRace = longs[0]
  const fallback = paced.sort((a, b) => b.distanceM - a.distanceM)[0]

  const thresholdSecPerKm = shortest ? shortest.secPerKm : fallback.secPerKm * 0.96
  const enduranceSecPerKm = longestRace ? longestRace.secPerKm * 1.08 : fallback.secPerKm * 1.16
  const easySecPerKm = Math.max(enduranceSecPerKm, thresholdSecPerKm * 1.15)

  return {
    easySecPerKm,
    thresholdSecPerKm,
    longestM: Math.max(...races.map(r => r.distanceM)),
  }
}

export function runZoneSecPerKm(easySecPerKm: number, thresholdSecPerKm: number, zone: number): number {
  if (zone >= 3) return thresholdSecPerKm * 0.95
  if (zone === 2) return thresholdSecPerKm
  return easySecPerKm
}

export function runMixHint(races: PastRace[]): string | null {
  if (races.length === 0) return 'Add a shorter race (5k/10k) and a longer one (half/marathon) if you can.'
  if (races.length === 1) {
    return isShortRun(races[0].distanceM)
      ? 'Add a longer race (half or marathon) so we can see endurance, not just speed.'
      : 'Add a shorter race (5k or 10k) so we can see threshold speed.'
  }
  const hasShort = races.some(r => isShortRun(r.distanceM))
  const hasLong = races.some(r => !isShortRun(r.distanceM))
  if (!hasShort) return 'Both look like long races — a 5k or 10k would fill in your speed.'
  if (!hasLong) return 'Both look like short races — a half or marathon would fill in endurance.'
  return null
}

export function defaultBikeKmh(skill: ExperienceLevel): number {
  return { beginner: 24, intermediate: 27, advanced: 30 }[skill]
}

export function defaultRunSecPerKm(skill: ExperienceLevel): number {
  return { beginner: 390, intermediate: 345, advanced: 315 }[skill]
}

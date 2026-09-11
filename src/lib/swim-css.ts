import type { ExperienceLevel } from './database.types'

/** Default CSS (sec/100m) when the athlete has no test or race data. */
export const DEFAULT_CSS: Record<ExperienceLevel, number> = {
  beginner: 120,
  intermediate: 105,
  advanced: 90,
}

export const SWIM_RACE_PRESETS = [
  { m: 400, label: '400m' },
  { m: 750, label: '750m' },
  { m: 1500, label: '1500m' },
  { m: 1900, label: '1.9km' },
  { m: 3800, label: '3.8km' },
] as const

/**
 * CSS from 400m + 200m time trials.
 * CSS (sec/100m) = (T400 − T200) / 2
 */
export function cssFrom400and200(t400Sec: number, t200Sec: number): number | null {
  if (t400Sec <= t200Sec || t200Sec <= 0) return null
  const css = (t400Sec - t200Sec) / 2
  if (css < 50 || css > 240) return null
  return css
}

/**
 * Estimate CSS from a past race.
 * Short pool races are faster than CSS; long OW races are slower.
 */
export function estimateCssFromRace(raceDistM: number, raceTimeSec: number): number | null {
  if (raceDistM <= 0 || raceTimeSec <= 0) return null
  const per100 = (raceTimeSec / raceDistM) * 100
  if (raceDistM <= 450) return per100 + 5
  if (raceDistM <= 850) return per100 + 2
  if (raceDistM <= 1600) return per100
  if (raceDistM <= 2200) return per100 - 3
  return per100 - 6
}

/** Training pace from CSS. Zone 1 easy, 2 threshold/tempo, 3+ speed. */
export function swimZonePace(cssSecPer100: number, zone: number): number {
  if (zone >= 3) return Math.max(60, cssSecPer100 - 4)
  if (zone === 2) return cssSecPer100 + 2
  return cssSecPer100 + 10
}

/** Seconds → "H:MM:SS" or "M:SS" */
export function secondsToHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "H:MM:SS" or "M:SS" → total seconds, or null if invalid */
export function hmsToSeconds(hms: string): number | null {
  const parts = hms.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

/** Meters → human-readable distance */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`
  return `${meters}m`
}

const METERS_PER_MILE = 1609.344

export type PaceUnit = 'km' | 'mi'

/**
 * Given total seconds and distance in meters, compute pace string.
 * Swim: always per 100m (M:SS)
 * Bike: speed in km/h or mph (decimal)
 * Run: pace per km or per mile (M:SS)
 */
export function timeToPace(
  totalSeconds: number,
  distanceMeters: number,
  discipline: 'swim' | 'bike' | 'run',
  unit: PaceUnit
): string {
  if (totalSeconds <= 0 || distanceMeters <= 0) return ''

  if (discipline === 'swim') {
    // Pace per 100m
    const secsPer100 = (totalSeconds / distanceMeters) * 100
    return formatPaceTime(secsPer100)
  }

  if (discipline === 'bike') {
    // Speed: km/h or mph
    const hours = totalSeconds / 3600
    const distKm = distanceMeters / 1000
    if (unit === 'mi') return (distKm / METERS_PER_MILE * 1000 / hours).toFixed(1)
    return (distKm / hours).toFixed(1)
  }

  // Run: pace per km or per mile
  const distUnit = unit === 'mi' ? distanceMeters / METERS_PER_MILE : distanceMeters / 1000
  const secsPerUnit = totalSeconds / distUnit
  return formatPaceTime(secsPerUnit)
}

/**
 * Given a pace string and distance, compute total seconds.
 * Swim: pace per 100m (M:SS) → total seconds
 * Bike: speed in km/h or mph → total seconds
 * Run: pace per km or mile (M:SS) → total seconds
 */
export function paceToTime(
  paceStr: string,
  distanceMeters: number,
  discipline: 'swim' | 'bike' | 'run',
  unit: PaceUnit
): number | null {
  if (!paceStr || distanceMeters <= 0) return null

  if (discipline === 'swim') {
    const secsPer100 = parsePaceTime(paceStr)
    if (secsPer100 === null) return null
    return Math.round((secsPer100 / 100) * distanceMeters)
  }

  if (discipline === 'bike') {
    const speed = parseFloat(paceStr)
    if (isNaN(speed) || speed <= 0) return null
    const distKm = distanceMeters / 1000
    const hours = unit === 'mi' ? (distKm / (speed * METERS_PER_MILE / 1000)) : distKm / speed
    return Math.round(hours * 3600)
  }

  // Run
  const secsPerUnit = parsePaceTime(paceStr)
  if (secsPerUnit === null) return null
  const distUnit = unit === 'mi' ? distanceMeters / METERS_PER_MILE : distanceMeters / 1000
  return Math.round(secsPerUnit * distUnit)
}

/** Format seconds as M:SS */
export function formatPaceTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60)
  const s = Math.round(totalSecs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Parse "M:SS" → total seconds */
export function parsePaceTime(str: string): number | null {
  const parts = str.split(':').map(Number)
  if (parts.length !== 2 || parts.some(isNaN)) return null
  return parts[0] * 60 + parts[1]
}

/** Pace label per discipline */
export function paceLabel(discipline: 'swim' | 'bike' | 'run', unit: PaceUnit): string {
  if (discipline === 'swim') return '/100m'
  if (discipline === 'bike') return unit === 'mi' ? 'mph' : 'km/h'
  return unit === 'mi' ? '/mi' : '/km'
}

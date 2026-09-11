import { useEffect, useState, useRef } from 'react'
import { hmsToSeconds, secondsToHms, timeToPace, paceToTime, paceLabel } from '@/lib/format'
import type { PaceUnit } from '@/lib/format'

interface Props {
  discipline: 'swim' | 'bike' | 'run'
  distanceMeters: number
  unit: PaceUnit
  /** Current time as H:MM:SS or M:SS */
  value: string
  onChange: (timeStr: string) => void
  placeholder?: string
}

/**
 * Paired time ↔ pace input.
 * Editing time updates pace, editing pace updates time.
 */
export default function TimePaceInput({ discipline, distanceMeters, unit, value, onChange, placeholder }: Props) {
  const [paceStr, setPaceStr] = useState('')
  const editingRef = useRef<'time' | 'pace' | null>(null)

  // Sync pace when time changes externally (or from time input)
  useEffect(() => {
    if (editingRef.current === 'pace') return
    const secs = hmsToSeconds(value)
    if (secs !== null && distanceMeters > 0) {
      setPaceStr(timeToPace(secs, distanceMeters, discipline, unit))
    }
  }, [value, distanceMeters, discipline, unit])

  function handleTimeChange(timeStr: string) {
    editingRef.current = 'time'
    onChange(timeStr)
    // Pace auto-updates via useEffect
    setTimeout(() => { editingRef.current = null }, 0)
  }

  function handlePaceChange(newPace: string) {
    editingRef.current = 'pace'
    setPaceStr(newPace)
    const secs = paceToTime(newPace, distanceMeters, discipline, unit)
    if (secs !== null) {
      onChange(secondsToHms(secs))
    }
    setTimeout(() => { editingRef.current = null }, 0)
  }

  return (
    <div className="flex gap-2 items-end">
      <label className="flex-1 block">
        <span className="text-xs text-gray-500 mb-0.5 block">Time</span>
        <input
          type="text"
          value={value}
          onChange={e => handleTimeChange(e.target.value)}
          placeholder={placeholder ?? '0:00:00'}
          className="input text-sm"
        />
      </label>
      <label className="flex-1 block">
        <span className="text-xs text-gray-500 mb-0.5 block">
          Pace <span className="text-gray-600">{paceLabel(discipline, unit)}</span>
        </span>
        <input
          type="text"
          value={paceStr}
          onChange={e => handlePaceChange(e.target.value)}
          placeholder={discipline === 'bike' ? '30.0' : '5:00'}
          className="input text-sm"
        />
      </label>
    </div>
  )
}

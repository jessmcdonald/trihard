import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { RACE_DISTANCES } from '@/lib/constants'
import { hmsToSeconds, secondsToHms, formatDistance } from '@/lib/format'
import type { PaceUnit } from '@/lib/format'
import type { RaceDistance, SwimVenue, TerrainProfile } from '@/lib/database.types'
import TimePaceInput from '@/components/TimePaceInput'

const DISTANCE_OPTIONS: { value: RaceDistance; label: string }[] = [
  { value: 'sprint', label: 'Sprint' },
  { value: 'olympic', label: 'Olympic' },
  { value: 'half_iron', label: 'Half Ironman (70.3)' },
  { value: 'ironman', label: 'Ironman (140.6)' },
  { value: 'custom', label: 'Custom' },
]

const SWIM_VENUES: { value: SwimVenue; label: string }[] = [
  { value: 'lake', label: '🏞️ Lake' },
  { value: 'ocean', label: '🌊 Ocean' },
  { value: 'river', label: '🏞️ River' },
  { value: 'indoor', label: '🏊 Indoor' },
]

const TERRAIN_OPTIONS: { value: TerrainProfile; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'rolling', label: 'Rolling' },
  { value: 'hilly', label: 'Hilly' },
]

export default function RaceGoalPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Existing goal tracking
  const [existingId, setExistingId] = useState<string | null>(null)
  const [loadingGoal, setLoadingGoal] = useState(true)

  // Core fields
  const [name, setName] = useState('')
  const [distanceType, setDistanceType] = useState<RaceDistance>('olympic')
  const [raceDate, setRaceDate] = useState('')
  const [customSwim, setCustomSwim] = useState('')
  const [customBike, setCustomBike] = useState('')
  const [customRun, setCustomRun] = useState('')

  // Course profiles
  const [swimVenue, setSwimVenue] = useState<SwimVenue | null>(null)
  const [bikeTerrain, setBikeTerrain] = useState<TerrainProfile | null>(null)
  const [bikeElevation, setBikeElevation] = useState('')
  const [runTerrain, setRunTerrain] = useState<TerrainProfile | null>(null)

  // Times (stored as H:MM:SS strings)
  const [swimTime, setSwimTime] = useState('')
  const [t1Time, setT1Time] = useState('2:00')
  const [bikeTime, setBikeTime] = useState('')
  const [t2Time, setT2Time] = useState('2:00')
  const [runTime, setRunTime] = useState('')

  // Pace unit preference
  const [paceUnit, setPaceUnit] = useState<PaceUnit>('km')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load existing active race goal
  useEffect(() => {
    if (!user) return

    supabase
      .from('race_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const goal = data?.[0]
        if (goal) {
          setExistingId(goal.id)
          setName(goal.name)
          setDistanceType(goal.distance_type as RaceDistance)
          setRaceDate(goal.race_date)

          if (goal.distance_type === 'custom') {
            setCustomSwim(String(goal.swim_distance_m))
            setCustomBike(String(goal.bike_distance_m))
            setCustomRun(String(goal.run_distance_m))
          }

          setSwimVenue((goal.swim_venue as SwimVenue) ?? null)
          setBikeTerrain((goal.bike_terrain as TerrainProfile) ?? null)
          setBikeElevation(goal.bike_elevation_gain_m ? String(goal.bike_elevation_gain_m) : '')
          setRunTerrain((goal.run_terrain as TerrainProfile) ?? null)

          if (goal.target_swim_time) setSwimTime(secondsToHms(goal.target_swim_time))
          if (goal.target_t1_time) setT1Time(secondsToHms(goal.target_t1_time))
          if (goal.target_bike_time) setBikeTime(secondsToHms(goal.target_bike_time))
          if (goal.target_t2_time) setT2Time(secondsToHms(goal.target_t2_time))
          if (goal.target_run_time) setRunTime(secondsToHms(goal.target_run_time))
        }
        setLoadingGoal(false)
      })
  }, [user])

  const isCustom = distanceType === 'custom'
  const distances = isCustom
    ? { swim: Number(customSwim) || 0, bike: Number(customBike) || 0, run: Number(customRun) || 0 }
    : RACE_DISTANCES[distanceType]

  function totalTargetSeconds(): number | null {
    const parts = [swimTime, t1Time, bikeTime, t2Time, runTime]
    const seconds = parts.map(hmsToSeconds)
    if (seconds.some(s => s === null)) return null
    return seconds.reduce((a, b) => a! + b!, 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError('')
    setSaving(true)

    const payload = {
      user_id: user.id,
      name,
      distance_type: distanceType,
      race_date: raceDate,
      swim_distance_m: distances.swim,
      bike_distance_m: distances.bike,
      run_distance_m: distances.run,
      target_swim_time: hmsToSeconds(swimTime),
      target_t1_time: hmsToSeconds(t1Time),
      target_bike_time: hmsToSeconds(bikeTime),
      target_t2_time: hmsToSeconds(t2Time),
      target_run_time: hmsToSeconds(runTime),
      swim_venue: swimVenue,
      bike_terrain: bikeTerrain,
      bike_elevation_gain_m: bikeElevation ? Number(bikeElevation) : null,
      run_terrain: runTerrain,
      is_active: true,
    }

    try {
      if (existingId) {
        const { error: dbError } = await supabase
          .from('race_goals')
          .update(payload)
          .eq('id', existingId)
        if (dbError) throw dbError
      } else {
        const { error: dbError } = await supabase.from('race_goals').insert(payload)
        if (dbError) throw dbError
      }

      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save race goal')
    } finally {
      setSaving(false)
    }
  }

  const total = totalTargetSeconds()

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">
          ← Back to dashboard
        </button>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">
        {loadingGoal ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
        <>
        <h2 className="text-2xl font-bold mb-6">{existingId ? 'Edit Race Goal' : 'Set Race Goal'}</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Race name */}
          <Field label="Race name">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Ironman Barcelona 2027"
              required
              className="input"
            />
          </Field>

          {/* Distance type */}
          <Field label="Distance">
            <div className="flex flex-wrap gap-2">
              {DISTANCE_OPTIONS.map(opt => (
                <ToggleBtn
                  key={opt.value}
                  active={distanceType === opt.value}
                  onClick={() => setDistanceType(opt.value)}
                >
                  {opt.label}
                </ToggleBtn>
              ))}
            </div>
          </Field>

          {/* Custom distances */}
          {isCustom && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Swim (m)">
                <input type="number" value={customSwim} onChange={e => setCustomSwim(e.target.value)} required className="input" placeholder="1500" />
              </Field>
              <Field label="Bike (m)">
                <input type="number" value={customBike} onChange={e => setCustomBike(e.target.value)} required className="input" placeholder="40000" />
              </Field>
              <Field label="Run (m)">
                <input type="number" value={customRun} onChange={e => setCustomRun(e.target.value)} required className="input" placeholder="10000" />
              </Field>
            </div>
          )}

          {/* Distance summary */}
          {!isCustom && (
            <div className="flex gap-4 text-sm text-gray-400">
              <span>🏊 {formatDistance(distances.swim)}</span>
              <span>🚴 {formatDistance(distances.bike)}</span>
              <span>🏃 {formatDistance(distances.run)}</span>
            </div>
          )}

          {/* Race date */}
          <Field label="Race date">
            <input
              type="date"
              value={raceDate}
              onChange={e => setRaceDate(e.target.value)}
              required
              min={new Date().toISOString().split('T')[0]}
              className="input"
            />
          </Field>

          <hr className="border-gray-800" />

          {/* Course profiles */}
          <h3 className="text-lg font-semibold">Course Profile</h3>

          <Field label="🏊 Swim venue">
            <div className="flex flex-wrap gap-2">
              {SWIM_VENUES.map(opt => (
                <ToggleBtn
                  key={opt.value}
                  active={swimVenue === opt.value}
                  onClick={() => setSwimVenue(swimVenue === opt.value ? null : opt.value)}
                >
                  {opt.label}
                </ToggleBtn>
              ))}
            </div>
          </Field>

          <Field label="🚴 Bike terrain">
            <div className="flex flex-wrap gap-2">
              {TERRAIN_OPTIONS.map(opt => (
                <ToggleBtn
                  key={opt.value}
                  active={bikeTerrain === opt.value}
                  onClick={() => setBikeTerrain(bikeTerrain === opt.value ? null : opt.value)}
                >
                  {opt.label}
                </ToggleBtn>
              ))}
              {(bikeTerrain === 'rolling' || bikeTerrain === 'hilly') && (
                <input
                  type="number"
                  value={bikeElevation}
                  onChange={e => setBikeElevation(e.target.value)}
                  placeholder="Elev. gain (m)"
                  className="input w-36 text-sm"
                />
              )}
            </div>
          </Field>

          <Field label="🏃 Run terrain">
            <div className="flex flex-wrap gap-2">
              {TERRAIN_OPTIONS.map(opt => (
                <ToggleBtn
                  key={opt.value}
                  active={runTerrain === opt.value}
                  onClick={() => setRunTerrain(runTerrain === opt.value ? null : opt.value)}
                >
                  {opt.label}
                </ToggleBtn>
              ))}
            </div>
          </Field>

          <hr className="border-gray-800" />

          {/* Target times + paces */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Target Times</h3>
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setPaceUnit('km')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  paceUnit === 'km' ? 'bg-indigo-600 text-white' : 'text-gray-400'
                }`}
              >
                km
              </button>
              <button
                type="button"
                onClick={() => setPaceUnit('mi')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  paceUnit === 'mi' ? 'bg-indigo-600 text-white' : 'text-gray-400'
                }`}
              >
                mi
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <Field label="🏊 Swim">
              <TimePaceInput
                discipline="swim"
                distanceMeters={distances.swim}
                unit={paceUnit}
                value={swimTime}
                onChange={setSwimTime}
                placeholder="0:30:00"
              />
            </Field>

            <Field label="T1 (transition)">
              <input
                type="text"
                value={t1Time}
                onChange={e => setT1Time(e.target.value)}
                placeholder="2:00"
                className="input text-sm"
              />
            </Field>

            <Field label="🚴 Bike">
              <TimePaceInput
                discipline="bike"
                distanceMeters={distances.bike}
                unit={paceUnit}
                value={bikeTime}
                onChange={setBikeTime}
                placeholder="1:10:00"
              />
            </Field>

            <Field label="T2 (transition)">
              <input
                type="text"
                value={t2Time}
                onChange={e => setT2Time(e.target.value)}
                placeholder="2:00"
                className="input text-sm"
              />
            </Field>

            <Field label="🏃 Run">
              <TimePaceInput
                discipline="run"
                distanceMeters={distances.run}
                unit={paceUnit}
                value={runTime}
                onChange={setRunTime}
                placeholder="0:50:00"
              />
            </Field>

            {total !== null && (
              <div className="text-right text-sm text-gray-400">
                Total: <span className="text-white font-semibold text-base">{secondsToHms(total)}</span>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 text-white font-medium transition-colors"
          >
            {saving ? 'Saving…' : existingId ? 'Update Race Goal' : 'Save Race Goal'}
          </button>
        </form>
        </>
        )}
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-300 mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

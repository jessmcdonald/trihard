import { useState } from 'react'
import TimePaceInput from '@/components/TimePaceInput'
import { defaultDisciplineFitness } from '@/lib/plan-generator'
import type { CurrentFitness } from '@/lib/plan-generator'
import { formatPaceTime, hmsToSeconds, parsePaceTime } from '@/lib/format'
import {
  DEFAULT_CSS,
  SWIM_RACE_PRESETS,
  cssFrom400and200,
  estimateCssFromRace,
  swimZonePace,
} from '@/lib/swim-css'
import {
  BIKE_RACE_PRESETS,
  RUN_RACE_PRESETS,
  bikeZoneKmh,
  defaultBikeKmh,
  defaultRunSecPerKm,
  flatEquivalentBikeKmh,
  runMixHint,
  runPacesFromRaces,
  runZoneSecPerKm,
} from '@/lib/endurance-fitness'
import type { ExperienceLevel, RaceGoal } from '@/lib/database.types'

const SKILLS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

export interface SwimFitnessForm {
  skill: ExperienceLevel
  raceDistanceM: string
  raceTime: string
  cssPace: string
  trial400: string
  trial200: string
  cssTouched: boolean
}

export interface BikeFitnessForm {
  skill: ExperienceLevel
  raceDistanceKm: string
  raceTime: string
  elevationM: string
}

export interface RunRaceEntry {
  id: string
  distanceM: string
  time: string
}

export interface RunFitnessForm {
  skill: ExperienceLevel
  races: RunRaceEntry[]
}

export interface FitnessForm {
  swim: SwimFitnessForm
  bike: BikeFitnessForm
  run: RunFitnessForm
}

function emptyRunRace(id: string): RunRaceEntry {
  return { id, distanceM: '', time: '' }
}

export function buildFitnessForm(_goal: RaceGoal, skill: ExperienceLevel): FitnessForm {
  return {
    swim: {
      skill,
      raceDistanceM: '',
      raceTime: '',
      cssPace: formatPaceTime(DEFAULT_CSS[skill]),
      trial400: '',
      trial200: '',
      cssTouched: false,
    },
    bike: {
      skill,
      raceDistanceKm: '',
      raceTime: '',
      elevationM: '',
    },
    run: {
      skill,
      races: [emptyRunRace('short'), emptyRunRace('long')],
    },
  }
}

function parseOptionalRace(
  distance: number,
  timeStr: string,
  label: string,
): { distanceM: number; timeSec: number } | string | null {
  const hasDist = Number.isFinite(distance) && distance > 0
  const timeSec = timeStr ? hmsToSeconds(timeStr) : null
  if (!hasDist && !timeStr) return null
  if (!hasDist || timeSec === null || timeSec <= 0) {
    return `Enter ${label} distance and time, or clear it`
  }
  return { distanceM: distance, timeSec }
}

export function parseFitnessForm(form: FitnessForm, goal: RaceGoal): CurrentFitness | string {
  const css = parsePaceTime(form.swim.cssPace)
  if (css === null || css <= 0) return 'Enter critical swim speed as M:SS /100m'

  const swimRaceM = Number(form.swim.raceDistanceM)
  const swimParsed = parseOptionalRace(swimRaceM, form.swim.raceTime, 'past swim race')
  if (typeof swimParsed === 'string') return swimParsed
  const swimDefault = defaultDisciplineFitness('swim', goal.swim_distance_m, form.swim.skill)

  const bikeKm = Number(form.bike.raceDistanceKm)
  const bikeM = Number.isFinite(bikeKm) && bikeKm > 0 ? Math.round(bikeKm * 1000) : 0
  const bikeParsed = parseOptionalRace(bikeM, form.bike.raceTime, 'past bike race')
  if (typeof bikeParsed === 'string') return bikeParsed
  const elevRaw = Number(form.bike.elevationM)
  const bikeElev = Number.isFinite(elevRaw) && elevRaw > 0 ? elevRaw : 0
  const bikeDefault = defaultDisciplineFitness('bike', goal.bike_distance_m, form.bike.skill)
  const bikeFlat = bikeParsed
    ? flatEquivalentBikeKmh(bikeParsed.distanceM, bikeParsed.timeSec, bikeElev)
    : defaultBikeKmh(form.bike.skill)

  const runRaces: { distanceM: number; timeSec: number }[] = []
  for (const [i, row] of form.run.races.entries()) {
    const dist = Number(row.distanceM)
    const parsed = parseOptionalRace(
      Number.isFinite(dist) && dist > 0 ? dist : 0,
      row.time,
      `run race ${i + 1}`,
    )
    if (typeof parsed === 'string') return parsed
    if (parsed) runRaces.push(parsed)
  }
  const runDefault = defaultDisciplineFitness('run', goal.run_distance_m, form.run.skill)
  const runPaces = runRaces.length > 0 ? runPacesFromRaces(runRaces) : null

  return {
    swim: {
      skill: form.swim.skill,
      cssPace: css,
      easyPace: swimZonePace(css, 1),
      longestM: swimParsed ? swimParsed.distanceM : swimDefault.longestM,
      raceDistanceM: swimParsed?.distanceM,
      raceTimeSec: swimParsed?.timeSec,
    },
    bike: {
      skill: form.bike.skill,
      easyPace: bikeZoneKmh(bikeFlat, 1),
      longestM: bikeParsed ? bikeParsed.distanceM : bikeDefault.longestM,
      raceDistanceM: bikeParsed?.distanceM,
      raceTimeSec: bikeParsed?.timeSec,
      elevationGainM: bikeParsed ? bikeElev : undefined,
      raceFlatKmh: bikeParsed ? bikeFlat : undefined,
    },
    run: {
      skill: form.run.skill,
      easyPace: runPaces?.easySecPerKm ?? runDefault.easyPace,
      thresholdPace: runPaces?.thresholdSecPerKm,
      longestM: runPaces?.longestM ?? runDefault.longestM,
      raceDistanceM: runPaces?.longestM,
      races: runRaces.length > 0 ? runRaces : undefined,
    },
  }
}

interface Props {
  goal: RaceGoal
  form: FitnessForm
  onChange: (form: FitnessForm) => void
  onBack: () => void
  onGenerate: () => void
  error: string
}

function SkillToggle({
  value,
  onChange,
}: {
  value: ExperienceLevel
  onChange: (skill: ExperienceLevel) => void
}) {
  return (
    <div className="flex gap-1">
      {SKILLS.map(s => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            value === s.value
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

function SwimCard({
  goal,
  swim,
  onChange,
}: {
  goal: RaceGoal
  swim: SwimFitnessForm
  onChange: (swim: SwimFitnessForm) => void
}) {
  const raceM = Number(swim.raceDistanceM)
  const raceSec = swim.raceTime ? hmsToSeconds(swim.raceTime) : null
  const cssSec = parsePaceTime(swim.cssPace)
  const estimatedCss = raceM > 0 && raceSec && raceSec > 0
    ? estimateCssFromRace(raceM, raceSec)
    : null
  const trialCss = (() => {
    const t400 = swim.trial400 ? hmsToSeconds(swim.trial400) : null
    const t200 = swim.trial200 ? hmsToSeconds(swim.trial200) : null
    if (!t400 || !t200) return null
    return cssFrom400and200(t400, t200)
  })()

  const isCustom = raceM > 0 && !SWIM_RACE_PRESETS.some(p => p.m === raceM)
  const [customOpen, setCustomOpen] = useState(isCustom)
  const peakM = goal.swim_distance_m * 0.85
  const startM = raceM > 0 ? raceM : defaultDisciplineFitness('swim', goal.swim_distance_m, swim.skill).longestM

  function patch(next: Partial<SwimFitnessForm>) {
    onChange({ ...swim, ...next })
  }

  function applyRaceEstimate() {
    if (estimatedCss === null) return
    patch({ cssPace: formatPaceTime(estimatedCss), cssTouched: true })
  }

  function applyTrialCss() {
    if (trialCss === null) return
    patch({ cssPace: formatPaceTime(trialCss), cssTouched: true })
  }

  return (
    <div className="rounded-xl border border-cyan-800 bg-gray-900 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">🏊 Swim</h3>
        <SkillToggle
          value={swim.skill}
          onChange={skill => {
            patch({
              skill,
              cssPace: swim.cssTouched ? swim.cssPace : formatPaceTime(DEFAULT_CSS[skill]),
            })
          }}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-300">Past race</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setCustomOpen(false)
              patch({ raceDistanceM: '', raceTime: '' })
            }}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              !customOpen && !raceM
                ? 'bg-cyan-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            None
          </button>
          {SWIM_RACE_PRESETS.map(p => (
            <button
              key={p.m}
              type="button"
              onClick={() => {
                setCustomOpen(false)
                patch({ raceDistanceM: String(p.m) })
              }}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                !customOpen && raceM === p.m
                  ? 'bg-cyan-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomOpen(true)
              if (!isCustom) patch({ raceDistanceM: '' })
            }}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              customOpen
                ? 'bg-cyan-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Custom
          </button>
        </div>

        {customOpen && (
          <label className="block">
            <span className="text-xs text-gray-500 mb-0.5 block">Distance (m)</span>
            <input
              type="number"
              min={50}
              step={50}
              value={swim.raceDistanceM}
              onChange={e => patch({ raceDistanceM: e.target.value })}
              placeholder="e.g. 1000"
              className="input text-sm"
            />
          </label>
        )}

        {raceM > 0 && (
          <TimePaceInput
            discipline="swim"
            distanceMeters={raceM}
            unit="km"
            value={swim.raceTime}
            onChange={timeStr => {
              const secs = hmsToSeconds(timeStr)
              const next: Partial<SwimFitnessForm> = { raceTime: timeStr }
              if (!swim.cssTouched && secs && secs > 0) {
                const est = estimateCssFromRace(raceM, secs)
                if (est) next.cssPace = formatPaceTime(est)
              }
              patch(next)
            }}
            placeholder="0:20:00"
          />
        )}

        {estimatedCss !== null && (
          <p className="text-[11px] text-gray-500">
            Estimated CSS from this race: {formatPaceTime(estimatedCss)}/100m
            {cssSec !== null && formatPaceTime(cssSec) !== formatPaceTime(estimatedCss) && (
              <>
                {' · '}
                <button type="button" onClick={applyRaceEstimate} className="text-cyan-400 hover:text-cyan-300 underline">
                  Use estimate
                </button>
              </>
            )}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-300">Critical swim speed</p>
        <label className="block">
          <span className="text-xs text-gray-500 mb-0.5 block">CSS pace /100m</span>
          <input
            type="text"
            value={swim.cssPace}
            onChange={e => patch({ cssPace: e.target.value, cssTouched: true })}
            placeholder="1:45"
            className="input text-sm max-w-[8rem]"
          />
        </label>

        <p className="text-[11px] text-gray-500">Or calculate from 400m + 200m time trials</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500 mb-0.5 block">400m time</span>
            <input
              type="text"
              value={swim.trial400}
              onChange={e => {
                const trial400 = e.target.value
                const t400 = hmsToSeconds(trial400)
                const t200 = swim.trial200 ? hmsToSeconds(swim.trial200) : null
                const computed = t400 && t200 ? cssFrom400and200(t400, t200) : null
                patch({
                  trial400,
                  ...(computed ? { cssPace: formatPaceTime(computed), cssTouched: true } : {}),
                })
              }}
              placeholder="6:30"
              className="input text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 mb-0.5 block">200m time</span>
            <input
              type="text"
              value={swim.trial200}
              onChange={e => {
                const trial200 = e.target.value
                const t200 = hmsToSeconds(trial200)
                const t400 = swim.trial400 ? hmsToSeconds(swim.trial400) : null
                const computed = t400 && t200 ? cssFrom400and200(t400, t200) : null
                patch({
                  trial200,
                  ...(computed ? { cssPace: formatPaceTime(computed), cssTouched: true } : {}),
                })
              }}
              placeholder="3:05"
              className="input text-sm"
            />
          </label>
        </div>
        {trialCss !== null && (
          <p className="text-[11px] text-gray-500">
            From trials: {formatPaceTime(trialCss)}/100m
            {' · '}
            <button type="button" onClick={applyTrialCss} className="text-cyan-400 hover:text-cyan-300 underline">
              Use this CSS
            </button>
          </p>
        )}
      </div>

      {cssSec !== null && cssSec > 0 && (
        <p className="text-[11px] text-gray-400">
          Training paces · Easy {formatPaceTime(swimZonePace(cssSec, 1))}
          {' · '}Threshold {formatPaceTime(swimZonePace(cssSec, 2))}
          {' · '}Speed {formatPaceTime(swimZonePace(cssSec, 3))}
          {' /100m'}
        </p>
      )}

      <p className="text-[11px] text-gray-500">
        Long session: week 1 ~{Math.round(startM)}m → peak ~{Math.round(peakM)}m
      </p>
    </div>
  )
}

function BikeCard({
  goal,
  bike,
  onChange,
}: {
  goal: RaceGoal
  bike: BikeFitnessForm
  onChange: (bike: BikeFitnessForm) => void
}) {
  const km = Number(bike.raceDistanceKm)
  const raceM = Number.isFinite(km) && km > 0 ? Math.round(km * 1000) : 0
  const raceSec = bike.raceTime ? hmsToSeconds(bike.raceTime) : null
  const elevM = Number(bike.elevationM)
  const elev = Number.isFinite(elevM) && elevM > 0 ? elevM : 0
  const presetMatch = raceM > 0 && BIKE_RACE_PRESETS.some(p => p.m === raceM)
  const [customOpen, setCustomOpen] = useState(!presetMatch && raceM > 0)
  const peakM = goal.bike_distance_m * 0.85
  const startM = raceM > 0 ? raceM : defaultDisciplineFitness('bike', goal.bike_distance_m, bike.skill).longestM
  const actualKmh = raceM > 0 && raceSec && raceSec > 0
    ? (raceM / 1000) / (raceSec / 3600)
    : null
  const flatKmh = raceM > 0 && raceSec && raceSec > 0
    ? flatEquivalentBikeKmh(raceM, raceSec, elev)
    : null

  function patch(next: Partial<BikeFitnessForm>) {
    onChange({ ...bike, ...next })
  }

  return (
    <div className="rounded-xl border border-amber-800 bg-gray-900 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">🚴 Bike</h3>
        <SkillToggle value={bike.skill} onChange={skill => patch({ skill })} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-300">Recent race</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setCustomOpen(false)
              patch({ raceDistanceKm: '', raceTime: '', elevationM: '' })
            }}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              !customOpen && !raceM
                ? 'bg-amber-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            None
          </button>
          {BIKE_RACE_PRESETS.map(p => (
            <button
              key={p.m}
              type="button"
              onClick={() => {
                setCustomOpen(false)
                patch({ raceDistanceKm: String(p.m / 1000) })
              }}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                !customOpen && raceM === p.m
                  ? 'bg-amber-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomOpen(true)
              if (presetMatch) patch({ raceDistanceKm: '' })
            }}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              customOpen ? 'bg-amber-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Custom
          </button>
        </div>

        {customOpen && (
          <label className="block">
            <span className="text-xs text-gray-500 mb-0.5 block">Distance (km)</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={bike.raceDistanceKm}
              onChange={e => patch({ raceDistanceKm: e.target.value })}
              placeholder="e.g. 80"
              className="input text-sm"
            />
          </label>
        )}

        {raceM > 0 && (
          <>
            <TimePaceInput
              discipline="bike"
              distanceMeters={raceM}
              unit="km"
              value={bike.raceTime}
              onChange={timeStr => patch({ raceTime: timeStr })}
              placeholder="2:30:00"
            />
            <label className="block">
              <span className="text-xs text-gray-500 mb-0.5 block">Elevation gain (m)</span>
              <input
                type="number"
                min={0}
                step={10}
                value={bike.elevationM}
                onChange={e => patch({ elevationM: e.target.value })}
                placeholder="e.g. 850"
                className="input text-sm"
              />
            </label>
          </>
        )}

        {actualKmh !== null && flatKmh !== null && (
          <p className="text-[11px] text-gray-400">
            Race {actualKmh.toFixed(1)} km/h
            {elev > 0 && <> · ~{flatKmh.toFixed(1)} km/h flat-equivalent</>}
            {' · '}Easy {bikeZoneKmh(flatKmh, 1).toFixed(1)}
            {' · '}Tempo {bikeZoneKmh(flatKmh, 2).toFixed(1)}
            {' · '}Hard {bikeZoneKmh(flatKmh, 3).toFixed(1)}
          </p>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        Long ride: week 1 ~{(startM / 1000).toFixed(0)}km → peak ~{(peakM / 1000).toFixed(0)}km
      </p>
    </div>
  )
}

function RunRaceRow({
  label,
  hint,
  entry,
  onChange,
  onRemove,
}: {
  label: string
  hint: string
  entry: RunRaceEntry
  onChange: (entry: RunRaceEntry) => void
  onRemove?: () => void
}) {
  const dist = Number(entry.distanceM)
  const presetMatch = dist > 0 && RUN_RACE_PRESETS.some(p => p.m === dist)
  const [customOpen, setCustomOpen] = useState(!presetMatch && dist > 0)

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-gray-300">{label}</p>
          <p className="text-[11px] text-gray-500">{hint}</p>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-gray-500 hover:text-white">
            Remove
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {RUN_RACE_PRESETS.map(p => (
          <button
            key={p.m}
            type="button"
            onClick={() => {
              setCustomOpen(false)
              onChange({ ...entry, distanceM: String(p.m) })
            }}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              !customOpen && dist === p.m
                ? 'bg-green-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setCustomOpen(true)
            if (presetMatch) onChange({ ...entry, distanceM: '' })
          }}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
            customOpen ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Custom
        </button>
      </div>
      {customOpen && (
        <label className="block">
          <span className="text-xs text-gray-500 mb-0.5 block">Distance (km)</span>
          <input
            type="number"
            min={1}
            step={0.1}
            value={dist > 0 ? (dist / 1000).toString() : ''}
            onChange={e => {
              const km = Number(e.target.value)
              onChange({ ...entry, distanceM: Number.isFinite(km) && km > 0 ? String(Math.round(km * 1000)) : '' })
            }}
            placeholder="e.g. 8"
            className="input text-sm"
          />
        </label>
      )}
      {dist > 0 && (
        <TimePaceInput
          discipline="run"
          distanceMeters={dist}
          unit="km"
          value={entry.time}
          onChange={timeStr => onChange({ ...entry, time: timeStr })}
          placeholder={dist <= 10000 ? '0:22:00' : '1:45:00'}
        />
      )}
    </div>
  )
}

function RunCard({
  goal,
  run,
  onChange,
}: {
  goal: RaceGoal
  run: RunFitnessForm
  onChange: (run: RunFitnessForm) => void
}) {
  const filled = run.races.flatMap(r => {
    const d = Number(r.distanceM)
    const t = r.time ? hmsToSeconds(r.time) : null
    if (!Number.isFinite(d) || d <= 0 || !t || t <= 0) return []
    return [{ distanceM: d, timeSec: t }]
  })
  const paces = filled.length > 0 ? runPacesFromRaces(filled) : null
  const hint = runMixHint(filled)
  const peakM = goal.run_distance_m * 0.85
  const startM = paces?.longestM ?? defaultDisciplineFitness('run', goal.run_distance_m, run.skill).longestM
  const fallbackEasy = defaultRunSecPerKm(run.skill)

  function setRace(index: number, entry: RunRaceEntry) {
    const races = run.races.map((r, i) => (i === index ? entry : r))
    onChange({ ...run, races })
  }

  const rowMeta = [
    { label: 'Shorter race', hint: '5k or 10k — speed / threshold' },
    { label: 'Longer race', hint: 'Half or marathon — endurance' },
  ]

  return (
    <div className="rounded-xl border border-green-800 bg-gray-900 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">🏃 Run</h3>
        <SkillToggle value={run.skill} onChange={skill => onChange({ ...run, skill })} />
      </div>

      <p className="text-xs text-gray-400">
        Two races at different distances give a much better picture than one. Short for speed, long for endurance.
      </p>

      <div className="space-y-3">
        {run.races.map((entry, i) => (
          <RunRaceRow
            key={entry.id}
            label={rowMeta[i]?.label ?? `Race ${i + 1}`}
            hint={rowMeta[i]?.hint ?? 'Any recent race'}
            entry={entry}
            onChange={next => setRace(i, next)}
            onRemove={i >= 2 ? () => onChange({ ...run, races: run.races.filter((_, j) => j !== i) }) : undefined}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange({ ...run, races: [...run.races, emptyRunRace(`r-${Date.now()}`)] })}
        className="text-xs text-green-400 hover:text-green-300"
      >
        + Add another race
      </button>

      {hint && <p className="text-[11px] text-amber-400/90">{hint}</p>}

      {paces && (
        <p className="text-[11px] text-gray-400">
          Training paces · Easy {formatPaceTime(paces.easySecPerKm)}
          {' · '}Threshold {formatPaceTime(paces.thresholdSecPerKm)}
          {' · '}Speed {formatPaceTime(runZoneSecPerKm(paces.easySecPerKm, paces.thresholdSecPerKm, 3))}
          {' /km'}
        </p>
      )}

      {!paces && (
        <p className="text-[11px] text-gray-500">
          No races yet — using {formatPaceTime(fallbackEasy)}/km easy from skill level.
        </p>
      )}

      <p className="text-[11px] text-gray-500">
        Long run: week 1 ~{(startM / 1000).toFixed(1)}km → peak ~{(peakM / 1000).toFixed(1)}km
      </p>
    </div>
  )
}

export default function FitnessConfigStep({ goal, form, onChange, onBack, onGenerate, error }: Props) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">
          ← Back to phases
        </button>
        <p className="text-xs text-gray-500 mt-0.5">{goal.name}</p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-400 mb-1">Step 2 of 2</p>
          <h2 className="text-2xl font-bold mb-1">Current fitness</h2>
          <p className="text-sm text-gray-400">
            Past races set starting volume and training paces. Swim uses CSS, bike
            accounts for elevation, run wants a short and a long race if you have them.
          </p>
        </div>

        <div className="space-y-4">
          <SwimCard
            goal={goal}
            swim={form.swim}
            onChange={swim => onChange({ ...form, swim })}
          />
          <BikeCard
            goal={goal}
            bike={form.bike}
            onChange={bike => onChange({ ...form, bike })}
          />
          <RunCard
            goal={goal}
            run={form.run}
            onChange={run => onChange({ ...form, run })}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-3 text-white font-medium transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onGenerate}
            className="flex-[2] rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-3 text-white font-medium transition-colors text-lg"
          >
            Generate Plan
          </button>
        </div>
      </main>
    </div>
  )
}

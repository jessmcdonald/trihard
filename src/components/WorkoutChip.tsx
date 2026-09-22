import type { Discipline } from '@/lib/database.types'

const DISCIPLINE_COLORS: Record<Discipline, string> = {
  swim: 'bg-cyan-900/60 border-cyan-700 text-cyan-300',
  bike: 'bg-amber-900/60 border-amber-700 text-amber-300',
  run: 'bg-green-900/60 border-green-700 text-green-300',
  strength: 'bg-purple-900/60 border-purple-700 text-purple-300',
}

const DISCIPLINE_EMOJI: Record<Discipline, string> = {
  swim: '🏊',
  bike: '🚴',
  run: '🏃',
  strength: '🏋️',
}

export type ChipState = 'pending' | 'done' | 'skipped' | 'extra'

interface Props {
  discipline: Discipline
  workoutLabel: string
  onRemove?: () => void
  state?: ChipState
  optional?: boolean
}

export default function WorkoutChip({ discipline, workoutLabel, onRemove, state = 'pending', optional }: Props) {
  const stateClass =
    state === 'skipped' ? 'opacity-50 line-through' :
    state === 'done' ? 'ring-1 ring-green-500/60' :
    state === 'extra' ? 'opacity-80' :
    ''
  const optionalClass = optional && state !== 'done' ? 'border-dashed' : ''

  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${DISCIPLINE_COLORS[discipline]} ${stateClass} ${optionalClass}`}>
      <span>{DISCIPLINE_EMOJI[discipline]}</span>
      <span className="flex-1 truncate">
        {state === 'done' ? '✓ ' : state === 'skipped' ? '– ' : state === 'extra' ? '+ ' : ''}
        {workoutLabel}
        {optional ? ' · opt' : ''}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-50 hover:opacity-100 transition-opacity text-sm leading-none"
          aria-label="Remove workout"
        >
          ×
        </button>
      )}
    </div>
  )
}

export { DISCIPLINE_COLORS, DISCIPLINE_EMOJI }

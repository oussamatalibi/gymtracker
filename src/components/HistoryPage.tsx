import { useEffect, useState } from 'react'
import { deleteWorkoutFromHistory, getCompletedWorkoutSummaries, getWorkoutHistoryDetails, type WorkoutSummary } from '../data/history'
import type { SessionExercise, WorkoutSession, WorkoutSet } from '../data/models'

interface HistoryDetails {
  session: WorkoutSession
  exercises: SessionExercise[]
  sets: WorkoutSet[]
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, '0')}m`
    : `${minutes}m ${String(remainder).padStart(2, '0')}s`
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp)
}

function HistoryPage() {
  const [summaries, setSummaries] = useState<WorkoutSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<HistoryDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setSummaries(await getCompletedWorkoutSummaries())
    } catch {
      setError('Could not read workout history from this device.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  useEffect(() => {
    let mounted = true
    if (!selectedId) {
      setDetails(null)
      return () => { mounted = false }
    }
    void getWorkoutHistoryDetails(selectedId).then((record) => {
      if (mounted && record.session?.status === 'completed') {
        setDetails({ session: record.session, exercises: record.exercises, sets: record.sets })
      }
    }).catch(() => { if (mounted) setError('Could not open this workout.') })
    return () => { mounted = false }
  }, [selectedId])

  async function removeSession() {
    if (!selectedId || !window.confirm('Delete this workout from history? Its saved exercise and set details will also be deleted.')) return
    try {
      await deleteWorkoutFromHistory(selectedId)
      setSelectedId(null)
      setDetails(null)
      await refresh()
    } catch {
      setError('Could not delete this workout. Your saved record is still available.')
    }
  }

  if (details) {
    const completedSets = details.sets.filter((set) => set.completed)
    const exerciseById = new Map(details.exercises.map((exercise) => [exercise.id, exercise]))
    const volume = completedSets.reduce((sum, set) => sum + (exerciseById.get(set.sessionExerciseId)?.loadType === 'blocks' ? 0 : (set.weightKg ?? 0) * (set.reps ?? 0)), 0)
    const completedExercises = new Set(completedSets.map((set) => set.sessionExerciseId)).size
    return (
      <section className="history-page">
        <button className="back-button" onClick={() => { setSelectedId(null); setDetails(null) }}>← <span>Back to history</span></button>
        <p className="eyebrow">COMPLETED WORKOUT</p>
        <div className="history-title-row"><div><h1>{details.session.workoutName}</h1><p>{details.session.focus}</p><span>{formatDate(details.session.completedAt ?? details.session.startedAt)}</span></div><button className="delete-history" onClick={() => { void removeSession() }}>Delete workout</button></div>
        <div className="history-metrics">
          <div><span>DURATION</span><strong>{formatDuration(details.session.durationMs)}</strong></div>
          <div><span>EXERCISES</span><strong>{completedExercises} <small>/ {details.exercises.length}</small></strong></div>
          <div><span>COMPLETED SETS</span><strong>{completedSets.length} <small>/ {details.sets.length}</small></strong></div>
          <div><span>VOLUME</span><strong>{volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} <small>kg·reps</small></strong></div>
        </div>
        <div className="history-exercises">
          {details.exercises.map((exercise, index) => {
            const sets = details.sets.filter((set) => set.sessionExerciseId === exercise.id).sort((a, b) => a.setNumber - b.setNumber)
            return (
              <article className="history-exercise" key={exercise.id}>
                <div className="history-exercise-heading"><span className="exercise-number">{String(index + 1).padStart(2, '0')}</span><div><h2>{exercise.exerciseName}</h2><p>{exercise.muscleGroup}{exercise.repsNote ? ` · ${exercise.repsNote}` : ''} · target {exercise.minReps}–{exercise.maxReps}</p></div><span className="history-set-count">{sets.filter((set) => set.completed).length}/{sets.length} sets</span></div>
                <div className="history-set-list">
                  {sets.map((set) => { const byBlocks = exercise.loadType === 'blocks'; return <div className={`history-set ${set.completed ? '' : 'pending'}`} key={set.id}><span>Set {set.setNumber}</span><strong>{byBlocks ? `${set.blockCount ?? '—'} blocks` : set.weightKg === null ? '—' : `${set.weightKg} kg`} <small>×</small> {set.reps ?? '—'} reps</strong><span>{set.completed ? 'Completed' : 'Not completed'}</span></div> })}
                </div>
              </article>
            )
          })}
        </div>
        <p className="volume-note">Volume sums completed weighted sets as weight × reps; machine block counts are shown separately. For unilateral work, a logged “per side” set is counted once and is not doubled.</p>
      </section>
    )
  }

  return (
    <section className="history-page">
      <div className="history-heading"><div><p className="eyebrow">YOUR TRAINING LOG</p><h1>Workout history</h1><p>Completed sessions and the work you put in.</p></div><span className="history-count">{summaries.length} {summaries.length === 1 ? 'workout' : 'workouts'}</span></div>
      {error && <p className="session-error" role="alert">{error}</p>}
      {loading ? <div className="loading-state">Loading workout history…</div> : summaries.length === 0 ? (
        <div className="history-empty"><span>◷</span><h2>Your completed workouts will show up here</h2><p>Finish a workout to start building your training history.</p></div>
      ) : (
        <div className="history-list">
          {summaries.map(({ session, completedExerciseCount, completedSetCount, totalSetCount, volumeKgReps }) => (
            <button className="history-card" key={session.id} onClick={() => setSelectedId(session.id)}>
              <span className="history-calendar"><strong>{new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(session.completedAt ?? session.startedAt)}</strong><small>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(session.completedAt ?? session.startedAt).toUpperCase()}</small></span>
              <span className="history-card-main"><strong>{session.workoutName}</strong><small>{session.focus} · {formatDuration(session.durationMs)}</small><small>{completedExerciseCount} exercises · {completedSetCount}/{totalSetCount} sets complete</small></span>
              <span className="history-card-volume"><strong>{volumeKgReps.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong><small>kg·reps</small></span>
              <span className="history-card-arrow">→</span>
            </button>
          ))}
        </div>
      )}
      <p className="volume-note">Volume is the sum of weight × reps for completed sets. Unilateral sets are counted once, not doubled.</p>
    </section>
  )
}

export default HistoryPage

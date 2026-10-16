import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addWorkoutSet,
  cancelWorkout,
  changeRestTimer,
  finishWorkout,
  getLatestExercisePerformance,
  getSessionDetails,
  pauseWorkout,
  removeLastWorkoutSet,
  resumeWorkout,
  setWorkoutSetComplete,
  updateWorkoutSet,
} from '../data/sessions'
import type { SessionExercise, WorkoutSession, WorkoutSet } from '../data/models'

interface SessionDetails { exercises: SessionExercise[]; sets: WorkoutSet[] }

interface Props {
  session: WorkoutSession
  onSessionChange: (session: WorkoutSession | null) => void
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function WorkoutSessionPage({ session, onSessionChange }: Props) {
  const [details, setDetails] = useState<SessionDetails>({ exercises: [], sets: [] })
  const [previous, setPrevious] = useState<Record<string, WorkoutSet[]>>({})
  const [drafts, setDrafts] = useState<Record<string, { weight: string; reps: string }>>({})
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const result = await getSessionDetails(session.id)
    setDetails({ exercises: result.exercises, sets: result.sets })
    return result.session
  }, [session.id])

  useEffect(() => {
    let mounted = true
    void getSessionDetails(session.id).then(async (result) => {
      if (!mounted) return
      setDetails({ exercises: result.exercises, sets: result.sets })
      if (result.session) onSessionChange(result.session)
      const performances = await Promise.all(result.exercises.map(async (exercise) => [
        exercise.exerciseId,
        await getLatestExercisePerformance(exercise.exerciseId, session.id),
      ] as const))
      if (mounted) setPrevious(Object.fromEntries(performances))
    }).catch(() => { if (mounted) setError('Could not load this workout session.') })
    return () => { mounted = false }
  }, [session.id, onSessionChange])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  const elapsed = session.durationMs + (session.status === 'active' ? Math.max(0, now - (session.resumedAt ?? now)) : 0)
  const restRemaining = session.restEndsAt
    ? Math.max(0, Math.ceil((session.restEndsAt - now) / 1000))
    : Math.max(0, Math.ceil((session.restPausedRemainingMs ?? 0) / 1000))
  const completedCount = details.sets.filter((set) => set.completed).length
  const totalCount = details.sets.length
  const completedWeight = useMemo(() => details.sets.filter((set) => set.completed && set.weightKg !== null && set.reps !== null).reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0), [details.sets])

  async function runAction(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
      const current = await refresh()
      if (current) onSessionChange(current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that change.')
    }
  }

  async function changeSet(setId: string, field: 'weightKg' | 'reps', raw: string) {
    setDrafts((current) => ({
      ...current,
      [setId]: {
        weight: field === 'weightKg' ? raw : current[setId]?.weight ?? '',
        reps: field === 'reps' ? raw : current[setId]?.reps ?? '',
      },
    }))
    if (raw === '') return runAction(() => updateWorkoutSet(setId, field, null))
    if (field === 'weightKg' && /^\d+\.$/.test(raw)) return
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0 || (field === 'reps' && (!Number.isInteger(value) || value < 1))) {
      setError(field === 'reps' ? 'Reps must be a positive whole number.' : 'Weight must be zero or higher.')
      return
    }
    await runAction(() => updateWorkoutSet(setId, field, value))
  }

  async function finish() {
    if (!window.confirm(`Finish ${session.workoutName}? ${completedCount} of ${totalCount} sets are complete.`)) return
    const finished = await finishWorkout(session.id)
    if (finished) onSessionChange(null)
  }

  async function cancel() {
    if (!window.confirm('Cancel this workout? It will not count as a completed workout.')) return
    await cancelWorkout(session.id)
    onSessionChange(null)
  }

  return (
    <section className="active-workout">
      <header className="active-header">
        <div>
          <p className="eyebrow">WORKOUT IN PROGRESS</p>
          <h1>{session.workoutName}</h1>
          <p className="active-focus">{session.focus}</p>
        </div>
        <div className="session-clock"><span>ELAPSED</span><strong>{formatDuration(elapsed)}</strong><span className={`session-status ${session.status}`}>{session.status}</span></div>
      </header>

      <div className="session-progress"><div><span>SESSION PROGRESS</span><strong>{completedCount}<small> / {totalCount} sets</small></strong></div><div className="progress-track"><i style={{ width: `${totalCount ? completedCount / totalCount * 100 : 0}%` }} /></div><span className="volume-label">Logged volume <strong>{completedWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg × reps</strong></span></div>

      {session.status === 'paused' && <div className="paused-banner">Workout paused — the workout clock is stopped until you resume.</div>}
      {error && <p className="session-error" role="alert">{error}</p>}

      <div className="session-layout">
        <div className="session-exercises">
          {details.exercises.map((exercise, index) => {
            const exerciseSets = details.sets.filter((set) => set.sessionExerciseId === exercise.id).sort((a, b) => a.setNumber - b.setNumber)
            const previousSets = previous[exercise.exerciseId]?.filter((set) => set.completed) ?? []
            return (
              <article className="session-exercise" key={exercise.id}>
                <div className="session-exercise-heading"><span className="exercise-number">{String(index + 1).padStart(2, '0')}</span><div className="exercise-info"><h2>{exercise.exerciseName}</h2><span>{exercise.muscleGroup}{exercise.repsNote ? ` · ${exercise.repsNote}` : ''}</span></div><span className="target-chip">{exercise.minReps}–{exercise.maxReps} reps</span></div>
                <div className="set-head"><span>SET</span><span>WEIGHT (KG)</span><span>REPS</span><span>DONE</span></div>
                <div className="set-list">
                  {exerciseSets.map((set) => (
                    <div className={`set-row ${set.completed ? 'set-done' : ''}`} key={set.id}>
                      <span className="set-number">{String(set.setNumber).padStart(2, '0')}</span>
                      <input aria-label={`${exercise.exerciseName}, set ${set.setNumber}, weight in kilograms`} type="text" min="0" inputMode="decimal" placeholder="—" value={drafts[set.id]?.weight ?? (set.weightKg ?? '')} disabled={session.status === 'paused'} onChange={(event) => { void changeSet(set.id, 'weightKg', event.target.value) }} />
                      <input aria-label={`${exercise.exerciseName}, set ${set.setNumber}, repetitions`} type="text" inputMode="numeric" placeholder="—" value={drafts[set.id]?.reps ?? (set.reps ?? '')} disabled={session.status === 'paused'} onChange={(event) => { void changeSet(set.id, 'reps', event.target.value) }} />
                      <button className={`complete-set ${set.completed ? 'checked' : ''}`} aria-label={set.completed ? `Mark set ${set.setNumber} incomplete` : `Complete set ${set.setNumber}`} disabled={session.status === 'paused'} onClick={() => { void runAction(() => setWorkoutSetComplete(set.id, !set.completed)) }}>{set.completed ? '✓' : ''}</button>
                    </div>
                  ))}
                </div>
                <div className="set-actions"><button disabled={session.status === 'paused'} onClick={() => { void runAction(() => addWorkoutSet(session.id, exercise.id)) }}>＋ Add set</button><button disabled={session.status === 'paused' || exerciseSets.length <= 1} onClick={() => { void runAction(() => removeLastWorkoutSet(exercise.id)) }}>− Remove last</button></div>
                <div className="previous-performance"><span>PREVIOUS</span>{previousSets.length ? previousSets.map((set) => <b key={set.id}>{set.weightKg ?? '—'} kg × {set.reps ?? '—'}</b>) : <em>No completed performance yet</em>}</div>
              </article>
            )
          })}
        </div>

        <aside className="session-sidebar">
          <div className="timer-card">
            <p className="eyebrow">REST TIMER</p>
            <div className={`rest-clock ${session.restEndsAt && restRemaining === 0 ? 'timer-finished' : ''}`}>{`${String(Math.floor(restRemaining / 60)).padStart(2, '0')}:${String(restRemaining % 60).padStart(2, '0')}`}</div>
            <p className="timer-caption">{session.restEndsAt && restRemaining === 0 ? 'Rest complete' : session.restEndsAt ? 'Resting now' : session.restPausedRemainingMs !== null ? 'Timer paused' : 'Ready when you are'}</p>
            <div className="timer-presets">{[60, 90, 120, 180].map((seconds) => <button className={session.restDurationSeconds === seconds ? 'selected' : ''} key={seconds} onClick={() => { void runAction(() => changeRestTimer(session.id, 'start', seconds)) }}>{seconds < 60 ? seconds : `${seconds / 60}m`}</button>)}</div>
            <div className="timer-controls">
              {session.restEndsAt ? <button onClick={() => { void runAction(() => changeRestTimer(session.id, 'pause')) }}>Pause</button> : session.restPausedRemainingMs !== null ? <button onClick={() => { void runAction(() => changeRestTimer(session.id, 'resume')) }}>Resume</button> : <button className="timer-primary" onClick={() => { void runAction(() => changeRestTimer(session.id, 'start')) }}>Start {session.restDurationSeconds}s</button>}
              <button onClick={() => { void runAction(() => changeRestTimer(session.id, 'skip')) }}>Skip</button>
            </div>
          </div>
          <div className="session-controls"><button className="pause-button" onClick={() => { void runAction(() => session.status === 'active' ? pauseWorkout(session.id) : resumeWorkout(session.id)) }}>{session.status === 'active' ? 'Ⅱ  Pause workout' : '▶  Resume workout'}</button><button className="finish-button" onClick={() => { void finish() }}>Finish workout</button><button className="cancel-button" onClick={() => { void cancel() }}>Cancel workout</button></div>
          <div className="session-tip"><strong>Training tip</strong><p>Rest long enough to keep good technique. Stop if you feel dizzy, nauseated, or unusually breathless.</p></div>
        </aside>
      </div>
    </section>
  )
}

export default WorkoutSessionPage

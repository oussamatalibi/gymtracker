import { db, defaultUserSettings } from './database'
import type { SessionExercise, WorkoutPlan, WorkoutSession, WorkoutSet } from './models'
import { usesBlockCount } from './routine'

const makeId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

export async function getOpenSession() {
  return db.sessions.where('status').anyOf('active', 'paused').first()
}

export async function startOrResumeSession(plan: WorkoutPlan): Promise<WorkoutSession> {
  return db.transaction('rw', db.sessions, db.sessionExercises, db.workoutSets, db.userSettings, async () => {
    const existing = await db.sessions.where('status').anyOf('active', 'paused').first()
    if (existing) return existing

    const now = Date.now()
    const settings = await db.userSettings.get(defaultUserSettings.id) ?? defaultUserSettings
    const sessionId = makeId('session')
    const session: WorkoutSession = {
      id: sessionId,
      templateId: plan.template.id,
      workoutName: plan.template.name,
      focus: plan.template.focus,
      status: 'active',
      startedAt: now,
      resumedAt: now,
      durationMs: 0,
      restDurationSeconds: settings.defaultRestSeconds,
      restEndsAt: null,
      restPausedRemainingMs: null,
    }
    const sessionExercises: SessionExercise[] = plan.exercises.map((item, position) => ({
      id: `${sessionId}-exercise-${position + 1}`,
      sessionId,
      exerciseId: item.exerciseId,
      exerciseName: item.exercise.name,
      muscleGroup: item.exercise.muscleGroup,
      position,
      targetSets: item.targetSets,
      minReps: item.minReps,
      maxReps: item.maxReps,
      repsNote: item.repsNote,
      isUnilateral: Boolean(item.repsNote?.toLowerCase().includes('side')),
      loadType: usesBlockCount(item.exercise.name) ? 'blocks' : 'weight',
    }))
    const sets: WorkoutSet[] = sessionExercises.flatMap((exercise) =>
      Array.from({ length: exercise.targetSets }, (_, index) => ({
        id: `${exercise.id}-set-${index + 1}`,
        sessionId,
        sessionExerciseId: exercise.id,
        setNumber: index + 1,
        weightKg: null,
        blockCount: null,
        reps: null,
        completed: false,
        updatedAt: now,
      })),
    )

    await db.sessions.add(session)
    await db.sessionExercises.bulkAdd(sessionExercises)
    await db.workoutSets.bulkAdd(sets)
    return session
  })
}

export async function getSessionDetails(sessionId: string) {
  const [session, exercises, sets] = await Promise.all([
    db.sessions.get(sessionId),
    db.sessionExercises.where('sessionId').equals(sessionId).sortBy('position'),
    db.workoutSets.where('sessionId').equals(sessionId).toArray(),
  ])
  return { session, exercises, sets: sets.sort((a, b) => a.setNumber - b.setNumber) }
}

export async function updateWorkoutSet(setId: string, field: 'weightKg' | 'blockCount' | 'reps', value: number | null) {
  if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('Enter a valid non-negative value.')
  if (field === 'reps' && value !== null && !Number.isInteger(value)) throw new Error('Repetitions must be a whole number.')
  if (field === 'blockCount' && value !== null && !Number.isInteger(value)) throw new Error('Block count must be a whole number.')
  await db.workoutSets.update(setId, { [field]: value, updatedAt: Date.now() })
}

export async function setWorkoutSetComplete(setId: string, completed: boolean) {
  return db.transaction('rw', db.workoutSets, db.sessionExercises, db.sessions, db.userSettings, async () => {
    const set = await db.workoutSets.get(setId)
    if (!set) throw new Error('This set could not be found.')
    const exercise = await db.sessionExercises.get(set.sessionExerciseId)
    const load = exercise?.loadType === 'blocks' ? set.blockCount : set.weightKg
    if (completed && (load == null || set.reps === null || set.reps < 1)) {
      throw new Error(`Enter ${exercise?.loadType === 'blocks' ? 'a block count' : 'a weight'} and at least 1 rep before completing this set.`)
    }
    await db.workoutSets.update(setId, { completed, updatedAt: Date.now() })
    if (completed) {
      const session = await db.sessions.get(set.sessionId)
      const settings = await db.userSettings.get(defaultUserSettings.id) ?? defaultUserSettings
      if (session?.status === 'active' && settings.autoStartRest) {
        await db.sessions.update(session.id, {
          restEndsAt: Date.now() + session.restDurationSeconds * 1000,
          restPausedRemainingMs: null,
        })
      }
    }
  })
}

export async function addWorkoutSet(sessionId: string, sessionExerciseId: string) {
  const existing = await db.workoutSets.where('sessionExerciseId').equals(sessionExerciseId).sortBy('setNumber')
  const nextNumber = existing.reduce((maximum, set) => Math.max(maximum, set.setNumber), 0) + 1
  const newSet: WorkoutSet = {
    id: `${sessionExerciseId}-set-${nextNumber}`,
    sessionId,
    sessionExerciseId,
    setNumber: nextNumber,
    weightKg: existing.at(-1)?.weightKg ?? null,
    blockCount: existing.at(-1)?.blockCount ?? null,
    reps: existing.at(-1)?.reps ?? null,
    completed: false,
    updatedAt: Date.now(),
  }
  await db.workoutSets.add(newSet)
}

export async function removeLastWorkoutSet(sessionExerciseId: string) {
  await db.transaction('rw', db.workoutSets, async () => {
    const sets = await db.workoutSets.where('sessionExerciseId').equals(sessionExerciseId).sortBy('setNumber')
    if (sets.length <= 1) throw new Error('An exercise must keep at least one set.')
    const last = sets.at(-1)
    if (last) await db.workoutSets.delete(last.id)
  })
}

export async function pauseWorkout(sessionId: string) {
  const now = Date.now()
  const session = await db.sessions.get(sessionId)
  if (!session || session.status !== 'active') return session
  const remaining = session.restEndsAt ? Math.max(0, session.restEndsAt - now) : session.restPausedRemainingMs
  await db.sessions.update(sessionId, {
    status: 'paused',
    durationMs: session.durationMs + Math.max(0, now - (session.resumedAt ?? now)),
    resumedAt: null,
    restEndsAt: null,
    restPausedRemainingMs: remaining,
  })
  return db.sessions.get(sessionId)
}

export async function resumeWorkout(sessionId: string) {
  const session = await db.sessions.get(sessionId)
  if (!session || session.status !== 'paused') return session
  const now = Date.now()
  await db.sessions.update(sessionId, {
    status: 'active',
    resumedAt: now,
    restEndsAt: session.restPausedRemainingMs !== null ? now + session.restPausedRemainingMs : null,
    restPausedRemainingMs: null,
  })
  return db.sessions.get(sessionId)
}

export async function finishWorkout(sessionId: string) {
  const session = await db.sessions.get(sessionId)
  if (!session || (session.status !== 'active' && session.status !== 'paused')) return session
  const now = Date.now()
  const elapsed = session.status === 'active'
    ? session.durationMs + Math.max(0, now - (session.resumedAt ?? now))
    : session.durationMs
  await db.sessions.update(sessionId, {
    status: 'completed',
    durationMs: elapsed,
    completedAt: now,
    resumedAt: null,
    restEndsAt: null,
    restPausedRemainingMs: null,
  })
  return db.sessions.get(sessionId)
}

export async function cancelWorkout(sessionId: string) {
  await db.sessions.update(sessionId, {
    status: 'cancelled',
    resumedAt: null,
    restEndsAt: null,
    restPausedRemainingMs: null,
  })
}

export async function changeRestTimer(sessionId: string, action: 'start' | 'pause' | 'resume' | 'reset' | 'skip', seconds?: number) {
  const session = await db.sessions.get(sessionId)
  if (!session) return
  const now = Date.now()
  if (action === 'start') {
    const duration = seconds ?? session.restDurationSeconds
    await db.sessions.update(sessionId, { restDurationSeconds: duration, restEndsAt: now + duration * 1000, restPausedRemainingMs: null })
  } else if (action === 'pause' && session.restEndsAt) {
    await db.sessions.update(sessionId, { restEndsAt: null, restPausedRemainingMs: Math.max(0, session.restEndsAt - now) })
  } else if (action === 'resume' && session.restPausedRemainingMs !== null) {
    await db.sessions.update(sessionId, { restEndsAt: now + session.restPausedRemainingMs, restPausedRemainingMs: null })
  } else if (action === 'reset') {
    await db.sessions.update(sessionId, { restEndsAt: null, restPausedRemainingMs: null })
  } else if (action === 'skip') {
    await db.sessions.update(sessionId, { restEndsAt: null, restPausedRemainingMs: null })
  }
}

export async function getLatestExercisePerformance(exerciseId: string, excludingSessionId: string) {
  const allExercises = await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray()
  const otherExercises = allExercises.filter((entry) => entry.sessionId !== excludingSessionId)
  const candidates = await Promise.all(otherExercises.map(async (entry) => ({
    entry,
    session: await db.sessions.get(entry.sessionId),
  })))
  const previousExercise = candidates
    .filter((candidate) => candidate.session?.status === 'completed')
    .sort((a, b) => (b.session?.startedAt ?? 0) - (a.session?.startedAt ?? 0))[0]?.entry
  if (!previousExercise) return []
  return db.workoutSets.where('sessionExerciseId').equals(previousExercise.id).sortBy('setNumber')
}

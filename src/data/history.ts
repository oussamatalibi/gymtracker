import { db } from './database'
import type { SessionExercise, WorkoutSession, WorkoutSet } from './models'

export interface WorkoutSummary {
  session: WorkoutSession
  completedExerciseCount: number
  completedSetCount: number
  totalSetCount: number
  volumeKgReps: number
}

export async function getCompletedWorkoutSummaries(): Promise<WorkoutSummary[]> {
  const sessions = (await db.sessions.where('status').equals('completed').toArray())
    .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))

  return Promise.all(sessions.map(async (session) => {
    const sets = await db.workoutSets.where('sessionId').equals(session.id).toArray()
    const completedSets = sets.filter((set) => set.completed)
    const exerciseIdsWithCompletedSets = new Set(completedSets.map((set) => set.sessionExerciseId))
    return {
      session,
      completedExerciseCount: exerciseIdsWithCompletedSets.size,
      completedSetCount: completedSets.length,
      totalSetCount: sets.length,
      volumeKgReps: completedSets.reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
    }
  }))
}

export async function getWorkoutHistoryDetails(sessionId: string) {
  const [session, exercises, sets] = await Promise.all([
    db.sessions.get(sessionId),
    db.sessionExercises.where('sessionId').equals(sessionId).sortBy('position'),
    db.workoutSets.where('sessionId').equals(sessionId).toArray(),
  ])
  return {
    session,
    exercises,
    sets: sets.sort((a, b) => a.setNumber - b.setNumber),
  }
}

export async function deleteWorkoutFromHistory(sessionId: string) {
  await db.transaction('rw', db.sessions, db.sessionExercises, db.workoutSets, async () => {
    const [exercises, sets] = await Promise.all([
      db.sessionExercises.where('sessionId').equals(sessionId).toArray(),
      db.workoutSets.where('sessionId').equals(sessionId).toArray(),
    ])
    await db.workoutSets.bulkDelete(sets.map((set: WorkoutSet) => set.id))
    await db.sessionExercises.bulkDelete(exercises.map((exercise: SessionExercise) => exercise.id))
    await db.sessions.delete(sessionId)
  })
}

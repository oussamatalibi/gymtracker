import { db } from './database'
import type { SessionExercise, WorkoutSession, WorkoutSet } from './models'

export interface WeeklyProgress {
  weekKey: string
  label: string
  workoutCount: number
  completedSets: number
  volumeKgReps: number
}

export interface ExerciseProgressPoint {
  sessionId: string
  date: number
  topWeightKg: number
  topSetReps: number
  estimatedOneRepMaxKg: number | null
}

export interface ExerciseProgress {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  points: ExerciseProgressPoint[]
  bestWeightKg: number
  bestRepsAtBestWeight: number
}

export interface ProgressData {
  totalWorkouts: number
  workoutsThisWeek: number
  workoutsThisMonth: number
  completedWorkingSets: number
  totalVolumeKgReps: number
  weekly: WeeklyProgress[]
  exercises: ExerciseProgress[]
}

interface SessionRecords {
  session: WorkoutSession
  exercises: SessionExercise[]
  sets: WorkoutSet[]
}

function startOfMonday(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isValidCompletedSet(set: WorkoutSet): set is WorkoutSet & { weightKg: number; reps: number } {
  return set.completed && set.weightKg !== null && set.weightKg >= 0 && set.reps !== null && set.reps > 0
}

export async function getProgressData(): Promise<ProgressData> {
  const sessions = (await db.sessions.where('status').equals('completed').toArray())
    .sort((a, b) => a.startedAt - b.startedAt)
  const records: SessionRecords[] = await Promise.all(sessions.map(async (session) => {
    const [exercises, sets] = await Promise.all([
      db.sessionExercises.where('sessionId').equals(session.id).toArray(),
      db.workoutSets.where('sessionId').equals(session.id).toArray(),
    ])
    return { session, exercises, sets }
  }))

  const today = new Date()
  const thisMonday = startOfMonday(today)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  const weekIndex = new Map<string, WeeklyProgress>()
  for (let offset = 7; offset >= 0; offset -= 1) {
    const week = new Date(thisMonday)
    week.setDate(week.getDate() - offset * 7)
    const key = dateKey(week)
    weekIndex.set(key, {
      weekKey: key,
      label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(week),
      workoutCount: 0,
      completedSets: 0,
      volumeKgReps: 0,
    })
  }

  const workoutCountThisWeek = records.filter((record) => record.session.startedAt >= thisMonday.getTime()).length
  const workoutCountThisMonth = records.filter((record) => record.session.startedAt >= monthStart).length
  let completedWorkingSets = 0
  let totalVolumeKgReps = 0
  const exerciseBuckets = new Map<string, {
    name: string
    muscleGroup: string
    bySession: Map<string, { date: number; sets: Array<WorkoutSet & { weightKg: number; reps: number }> }>
  }>()

  for (const record of records) {
    const sessionDate = record.session.startedAt
    const week = weekIndex.get(dateKey(startOfMonday(new Date(sessionDate))))
    if (week) week.workoutCount += 1
    const exercisesById = new Map(record.exercises.map((exercise) => [exercise.id, exercise]))
    const completed = record.sets.filter(isValidCompletedSet)
    completedWorkingSets += completed.length
    const volume = completed.reduce((sum, set) => sum + set.weightKg * set.reps, 0)
    totalVolumeKgReps += volume
    if (week) {
      week.completedSets += completed.length
      week.volumeKgReps += volume
    }
    for (const set of completed) {
      const exercise = exercisesById.get(set.sessionExerciseId)
      if (!exercise) continue
      let bucket = exerciseBuckets.get(exercise.exerciseId)
      if (!bucket) {
        bucket = { name: exercise.exerciseName, muscleGroup: exercise.muscleGroup, bySession: new Map() }
        exerciseBuckets.set(exercise.exerciseId, bucket)
      }
      let sessionPoint = bucket.bySession.get(record.session.id)
      if (!sessionPoint) {
        sessionPoint = { date: sessionDate, sets: [] }
        bucket.bySession.set(record.session.id, sessionPoint)
      }
      sessionPoint.sets.push(set)
    }
  }

  const exercises: ExerciseProgress[] = [...exerciseBuckets.entries()].map(([exerciseId, bucket]) => {
    const points = [...bucket.bySession.entries()].map(([sessionId, point]) => {
      const topWeight = Math.max(...point.sets.map((set) => set.weightKg))
      const topWeightSet = point.sets.filter((set) => set.weightKg === topWeight).reduce((best, set) => set.reps > best.reps ? set : best)
      const estimates = point.sets.filter((set) => set.weightKg > 0 && set.reps <= 30).map((set) => set.weightKg * (1 + set.reps / 30))
      return {
        sessionId,
        date: point.date,
        topWeightKg: topWeight,
        topSetReps: topWeightSet.reps,
        estimatedOneRepMaxKg: estimates.length ? Math.max(...estimates) : null,
      }
    }).sort((a, b) => a.date - b.date)
    const allSets = [...bucket.bySession.values()].flatMap((point) => point.sets)
    const bestWeightKg = Math.max(...allSets.map((set) => set.weightKg))
    const bestRepsAtBestWeight = allSets.filter((set) => set.weightKg === bestWeightKg).reduce((best, set) => Math.max(best, set.reps), 0)
    return { exerciseId, exerciseName: bucket.name, muscleGroup: bucket.muscleGroup, points, bestWeightKg, bestRepsAtBestWeight }
  }).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))

  return {
    totalWorkouts: sessions.length,
    workoutsThisWeek: workoutCountThisWeek,
    workoutsThisMonth: workoutCountThisMonth,
    completedWorkingSets,
    totalVolumeKgReps,
    weekly: [...weekIndex.values()],
    exercises,
  }
}

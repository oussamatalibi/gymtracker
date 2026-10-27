import Dexie, { type EntityTable } from 'dexie'
import type { Exercise, SessionExercise, TemplateExercise, UserSettings, WorkoutSession, WorkoutSet, WorkoutTemplate } from './models'
import { seedExercises, seedTemplateExercises, seedTemplates, usesBlockCount, usesBlocksInSession } from './routine'

class GymTrackerDatabase extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  templates!: EntityTable<WorkoutTemplate, 'id'>
  templateExercises!: EntityTable<TemplateExercise, 'id'>
  sessions!: EntityTable<WorkoutSession, 'id'>
  sessionExercises!: EntityTable<SessionExercise, 'id'>
  workoutSets!: EntityTable<WorkoutSet, 'id'>
  userSettings!: EntityTable<UserSettings, 'id'>

  constructor() {
    super('gymtracker')
    this.version(1).stores({
      exercises: 'id, name, muscleGroup, isCustom, archived',
      templates: 'id, dayIndex',
      templateExercises: 'id, templateId, exerciseId, [templateId+position]',
    })
    this.version(2).stores({
      exercises: 'id, name, muscleGroup, isCustom, archived',
      templates: 'id, dayIndex',
      templateExercises: 'id, templateId, exerciseId, [templateId+position]',
      sessions: 'id, status, startedAt, templateId',
      sessionExercises: 'id, sessionId, exerciseId, [sessionId+position]',
      workoutSets: 'id, sessionId, sessionExerciseId, [sessionExerciseId+setNumber], completed',
    })
    this.version(3).stores({
      exercises: 'id, name, muscleGroup, isCustom, archived',
      templates: 'id, dayIndex',
      templateExercises: 'id, templateId, exerciseId, [templateId+position]',
      sessions: 'id, status, startedAt, templateId',
      sessionExercises: 'id, sessionId, exerciseId, [sessionId+position]',
      workoutSets: 'id, sessionId, sessionExerciseId, [sessionExerciseId+setNumber], completed',
      userSettings: 'id',
    })
    this.version(4).stores({
      exercises: 'id, name, muscleGroup, isCustom, archived',
      templates: 'id, dayIndex',
      templateExercises: 'id, templateId, exerciseId, [templateId+position]',
      sessions: 'id, status, startedAt, templateId',
      sessionExercises: 'id, sessionId, exerciseId, [sessionId+position]',
      workoutSets: 'id, sessionId, sessionExerciseId, [sessionExerciseId+setNumber], completed',
      userSettings: 'id',
    }).upgrade(async (transaction) => {
      const openSessions = await transaction.table('sessions').where('status').anyOf('active', 'paused').toArray()
      const openSessionIds = new Set(openSessions.map((session: { id: string }) => session.id))
      const exercises = await transaction.table('sessionExercises').toArray()
      await Promise.all(exercises.filter((exercise: { sessionId: string }) => openSessionIds.has(exercise.sessionId)).map((exercise: { id: string; exerciseName: string }) =>
        transaction.table('sessionExercises').update(exercise.id, { loadType: usesBlockCount(exercise.exerciseName) ? 'blocks' : 'weight' }),
      ))
    })
    this.version(5).stores({
      exercises: 'id, name, muscleGroup, isCustom, archived',
      templates: 'id, dayIndex',
      templateExercises: 'id, templateId, exerciseId, [templateId+position]',
      sessions: 'id, status, startedAt, templateId',
      sessionExercises: 'id, sessionId, exerciseId, [sessionId+position]',
      workoutSets: 'id, sessionId, sessionExerciseId, [sessionExerciseId+setNumber], completed',
      userSettings: 'id',
    }).upgrade(async (transaction) => {
      const [openSessions, exercises] = await Promise.all([
        transaction.table('sessions').where('status').anyOf('active', 'paused').toArray(),
        transaction.table('sessionExercises').toArray(),
      ])
      const openSessionIds = new Map(openSessions.map((session: { id: string; templateId: string }) => [session.id, session.templateId]))
      await Promise.all(exercises.flatMap((exercise: { id: string; sessionId: string; exerciseName: string }) => {
        const templateId = openSessionIds.get(exercise.sessionId)
        return templateId ? [transaction.table('sessionExercises').update(exercise.id, {
          loadType: usesBlocksInSession(templateId, exercise.exerciseName) ? 'blocks' : 'weight',
        })] : []
      }))
    })
  }
}

export const db = new GymTrackerDatabase()

export const defaultUserSettings: UserSettings = {
  id: 'preferences',
  defaultRestSeconds: 120,
  autoStartRest: true,
  weightUnit: 'kg',
  theme: 'dark',
}

export async function seedRoutineIfNeeded() {
  await db.transaction('rw', db.exercises, db.templates, db.templateExercises, db.userSettings, async () => {
    for (const exercise of seedExercises) {
      if (!(await db.exercises.get(exercise.id))) await db.exercises.add(exercise)
    }
    for (const template of seedTemplates) {
      if (!(await db.templates.get(template.id))) await db.templates.add(template)
    }
    for (const entry of seedTemplateExercises) {
      if (!(await db.templateExercises.get(entry.id))) await db.templateExercises.add(entry)
    }
    const lowerLegPress = seedTemplateExercises.find((entry) => entry.id === 'lower-3')
    const existingLowerExercise = await db.templateExercises.get('lower-3')
    if (lowerLegPress && existingLowerExercise?.exerciseId === 'exercise-hip-thrust') {
      await db.templateExercises.update('lower-3', { exerciseId: lowerLegPress.exerciseId })
    }
    if (!(await db.userSettings.get(defaultUserSettings.id))) await db.userSettings.add(defaultUserSettings)
  })
}

import Dexie, { type EntityTable } from 'dexie'
import type { Exercise, SessionExercise, TemplateExercise, UserSettings, WorkoutSession, WorkoutSet, WorkoutTemplate } from './models'
import { seedExercises, seedTemplateExercises, seedTemplates } from './routine'

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
    if (!(await db.userSettings.get(defaultUserSettings.id))) await db.userSettings.add(defaultUserSettings)
  })
}

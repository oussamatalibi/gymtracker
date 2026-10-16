import { db } from './database'
import { seedTemplateExercises, seedTemplates } from './routine'
import type { Exercise, MuscleGroup, TemplateExercise, WorkoutPlan, WorkoutTemplate } from './models'

const makeId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

export async function getManagementData(): Promise<{ plans: WorkoutPlan[]; exercises: Exercise[] }> {
  const [templates, entries, exercises] = await Promise.all([
    db.templates.toArray(),
    db.templateExercises.toArray(),
    db.exercises.toArray(),
  ])
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const plans = templates.map((template) => ({
    template,
    exercises: entries
      .filter((entry) => entry.templateId === template.id)
      .sort((a, b) => a.position - b.position)
      .flatMap((entry) => {
        const exercise = exerciseById.get(entry.exerciseId)
        return exercise ? [{ ...entry, exercise }] : []
      }),
  })).sort((a, b) => {
    if (a.template.isCustom !== b.template.isCustom) return a.template.isCustom ? 1 : -1
    return a.template.dayIndex - b.template.dayIndex || a.template.name.localeCompare(b.template.name)
  })
  return { plans, exercises: exercises.sort((a, b) => a.name.localeCompare(b.name)) }
}

export async function saveWorkoutTemplate(template: WorkoutTemplate, entries: TemplateExercise[]) {
  if (!template.name.trim()) throw new Error('Give this workout a name.')
  if (!template.focus.trim()) throw new Error('Add a short workout focus.')
  for (const entry of entries) {
    if (!Number.isInteger(entry.targetSets) || entry.targetSets < 1 || entry.targetSets > 30) throw new Error('Set targets must be whole numbers from 1 to 30.')
    if (!Number.isInteger(entry.minReps) || !Number.isInteger(entry.maxReps) || entry.minReps < 1 || entry.maxReps < entry.minReps) throw new Error('Check each exercise’s repetition range.')
  }
  await db.transaction('rw', db.templates, db.templateExercises, async () => {
    const original = await db.templateExercises.where('templateId').equals(template.id).toArray()
    const retained = new Set(entries.map((entry) => entry.id))
    await db.templateExercises.bulkDelete(original.filter((entry) => !retained.has(entry.id)).map((entry) => entry.id))
    await db.templates.put({ ...template, name: template.name.trim(), focus: template.focus.trim() })
    await db.templateExercises.bulkPut(entries.map((entry, position) => ({ ...entry, position, templateId: template.id })))
  })
}

export async function createCustomTemplate(name = 'New workout') {
  const template: WorkoutTemplate = {
    id: makeId('template'),
    name,
    focus: 'Custom workout',
    dayIndex: -1,
    dayName: 'Flexible',
    restSeconds: 120,
    isCustom: true,
  }
  await db.templates.add(template)
  return template
}

export async function duplicateWorkoutTemplate(source: WorkoutPlan) {
  const template: WorkoutTemplate = {
    ...source.template,
    id: makeId('template'),
    name: `${source.template.name} Copy`,
    dayIndex: -1,
    dayName: 'Flexible',
    isCustom: true,
  }
  const entries = source.exercises.map((entry, position) => ({
    id: `${template.id}-${position + 1}`,
    templateId: template.id,
    exerciseId: entry.exerciseId,
    position,
    targetSets: entry.targetSets,
    minReps: entry.minReps,
    maxReps: entry.maxReps,
    repsNote: entry.repsNote,
    restSeconds: entry.restSeconds,
  }))
  await db.transaction('rw', db.templates, db.templateExercises, async () => {
    await db.templates.add(template)
    await db.templateExercises.bulkAdd(entries)
  })
  return template
}

export async function deleteCustomTemplate(templateId: string) {
  const template = await db.templates.get(templateId)
  if (!template?.isCustom) throw new Error('Predefined workouts can be restored but not deleted.')
  await db.transaction('rw', db.templates, db.templateExercises, async () => {
    await db.templateExercises.where('templateId').equals(templateId).delete()
    await db.templates.delete(templateId)
  })
}

export async function addExerciseToTemplate(templateId: string, exercise: Exercise) {
  const existing = await db.templateExercises.where('templateId').equals(templateId).toArray()
  if (existing.some((entry) => entry.exerciseId === exercise.id)) throw new Error('This exercise is already in the workout.')
  const entry: TemplateExercise = {
    id: makeId('template-exercise'),
    templateId,
    exerciseId: exercise.id,
    position: existing.length,
    targetSets: 3,
    minReps: 8,
    maxReps: 12,
    restSeconds: 120,
  }
  await db.templateExercises.add(entry)
  return entry
}

export async function createCustomExercise(input: { name: string; muscleGroup: MuscleGroup; category: 'compound' | 'isolation'; equipment: string; instructions: string }) {
  const name = input.name.trim()
  if (!name) throw new Error('Enter an exercise name.')
  const exercise: Exercise = {
    id: makeId('exercise'),
    name,
    muscleGroup: input.muscleGroup,
    category: input.category,
    equipment: input.equipment.trim() || undefined,
    instructions: input.instructions.trim() || undefined,
    isCustom: true,
    archived: false,
  }
  await db.exercises.add(exercise)
  return exercise
}

export async function updateCustomExercise(exercise: Exercise) {
  if (!exercise.isCustom) throw new Error('Only custom exercises can be edited.')
  if (!exercise.name.trim()) throw new Error('Enter an exercise name.')
  await db.exercises.put({ ...exercise, name: exercise.name.trim(), equipment: exercise.equipment?.trim() || undefined, instructions: exercise.instructions?.trim() || undefined })
}

export async function setExerciseArchived(exerciseId: string, archived: boolean) {
  const exercise = await db.exercises.get(exerciseId)
  if (!exercise) throw new Error('Exercise not found.')
  await db.exercises.update(exerciseId, { archived })
}

export async function deleteUnusedCustomExercise(exerciseId: string) {
  const exercise = await db.exercises.get(exerciseId)
  if (!exercise?.isCustom) throw new Error('Only custom exercises can be deleted.')
  const templateReferences = await db.templateExercises.where('exerciseId').equals(exerciseId).count()
  if (templateReferences > 0) throw new Error('This exercise is used in a workout template. Archive it instead to keep that workout intact.')
  await db.exercises.delete(exerciseId)
}

export async function restorePredefinedTemplates() {
  const predefinedIds = new Set(seedTemplates.map((template) => template.id))
  await db.transaction('rw', db.templates, db.templateExercises, async () => {
    await db.templateExercises.where('templateId').anyOf([...predefinedIds]).delete()
    await db.templates.bulkPut(seedTemplates)
    await db.templateExercises.bulkPut(seedTemplateExercises)
  })
}

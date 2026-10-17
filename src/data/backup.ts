import { db, defaultUserSettings } from './database'
import type { Exercise, MuscleGroup, SessionExercise, TemplateExercise, UserSettings, WorkoutSession, WorkoutSet, WorkoutTemplate } from './models'

export interface GymTrackerBackup {
  format: 'gymtracker-backup'
  schemaVersion: 1
  exportedAt: number
  data: {
    exercises: Exercise[]
    templates: WorkoutTemplate[]
    templateExercises: TemplateExercise[]
    sessions: WorkoutSession[]
    sessionExercises: SessionExercise[]
    sets: WorkoutSet[]
    settings: UserSettings
  }
}

const groups: MuscleGroup[] = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core']
function invalid(message: string): never { throw new Error(message) }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isBool = (value: unknown): value is boolean => typeof value === 'boolean'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isNullableNumber = (value: unknown): value is number | null => value === null || isNumber(value)
const hasId = (value: unknown): value is Record<string, unknown> & { id: string } => isRecord(value) && isString(value.id) && value.id.length > 0

function parseRows<T>(value: unknown, label: string, parse: (row: unknown) => T): T[] {
  if (!Array.isArray(value)) invalid(`Backup is missing its ${label} list.`)
  const rows = value.map(parse)
  const ids = rows.map((row) => (row as { id: string }).id)
  if (new Set(ids).size !== ids.length) invalid(`Backup has duplicate IDs in ${label}.`)
  return rows
}

function parseExercise(value: unknown): Exercise {
  if (!hasId(value) || !isString(value.name) || !groups.includes(value.muscleGroup as MuscleGroup) || !isBool(value.isCustom) || !isBool(value.archived)) invalid('Backup contains an invalid exercise.')
  if (value.category !== undefined && value.category !== 'compound' && value.category !== 'isolation') invalid('Backup contains an invalid exercise category.')
  if (value.equipment !== undefined && !isString(value.equipment)) invalid('Backup contains invalid equipment information.')
  if (value.instructions !== undefined && !isString(value.instructions)) invalid('Backup contains invalid exercise notes.')
  return value as unknown as Exercise
}

function parseTemplate(value: unknown): WorkoutTemplate {
  if (!hasId(value) || !isString(value.name) || !isString(value.focus) || !isNumber(value.dayIndex) || !Number.isInteger(value.dayIndex) || value.dayIndex < -1 || value.dayIndex > 6 || !isString(value.dayName) || !isNumber(value.restSeconds) || value.restSeconds < 1 || value.restSeconds > 3600) invalid('Backup contains an invalid workout template.')
  if (value.isCustom !== undefined && !isBool(value.isCustom)) invalid('Backup contains an invalid template type.')
  return value as unknown as WorkoutTemplate
}

function parseTemplateExercise(value: unknown): TemplateExercise {
  if (!hasId(value) || !isString(value.templateId) || !isString(value.exerciseId) || !isNumber(value.position) || !Number.isInteger(value.position) || value.position < 0 || !isNumber(value.targetSets) || !Number.isInteger(value.targetSets) || value.targetSets < 1 || value.targetSets > 30 || !isNumber(value.minReps) || !Number.isInteger(value.minReps) || value.minReps < 1 || !isNumber(value.maxReps) || !Number.isInteger(value.maxReps) || value.maxReps < value.minReps || !isNumber(value.restSeconds) || value.restSeconds < 1 || value.restSeconds > 3600) invalid('Backup contains an invalid template exercise target.')
  if (value.repsNote !== undefined && !isString(value.repsNote)) invalid('Backup contains an invalid repetition note.')
  return value as unknown as TemplateExercise
}

function parseSession(value: unknown): WorkoutSession {
  if (!hasId(value) || !isString(value.templateId) || !isString(value.workoutName) || !isString(value.focus) || !['active', 'paused', 'completed', 'cancelled'].includes(String(value.status)) || !isNumber(value.startedAt) || !isNullableNumber(value.resumedAt) || !isNumber(value.durationMs) || value.durationMs < 0 || !isNumber(value.restDurationSeconds) || value.restDurationSeconds < 1 || value.restDurationSeconds > 3600 || !isNullableNumber(value.restEndsAt) || !isNullableNumber(value.restPausedRemainingMs)) invalid('Backup contains an invalid workout session.')
  if (value.completedAt !== undefined && !isNumber(value.completedAt)) invalid('Backup contains an invalid completion date.')
  return value as unknown as WorkoutSession
}

function parseSessionExercise(value: unknown): SessionExercise {
  if (!hasId(value) || !isString(value.sessionId) || !isString(value.exerciseId) || !isString(value.exerciseName) || !groups.includes(value.muscleGroup as MuscleGroup) || !isNumber(value.position) || !Number.isInteger(value.position) || value.position < 0 || !isNumber(value.targetSets) || !Number.isInteger(value.targetSets) || value.targetSets < 1 || !isNumber(value.minReps) || !Number.isInteger(value.minReps) || value.minReps < 1 || !isNumber(value.maxReps) || !Number.isInteger(value.maxReps) || value.maxReps < value.minReps || !isBool(value.isUnilateral)) invalid('Backup contains an invalid session exercise snapshot.')
  if (value.repsNote !== undefined && !isString(value.repsNote)) invalid('Backup contains an invalid session repetition note.')
  if (value.loadType !== undefined && value.loadType !== 'weight' && value.loadType !== 'blocks') invalid('Backup contains an invalid exercise load type.')
  return { ...value, loadType: value.loadType ?? 'weight' } as unknown as SessionExercise
}

function parseSet(value: unknown): WorkoutSet {
  if (!hasId(value) || !isString(value.sessionId) || !isString(value.sessionExerciseId) || !isNumber(value.setNumber) || !Number.isInteger(value.setNumber) || value.setNumber < 1 || !isNullableNumber(value.weightKg) || (value.weightKg !== null && value.weightKg < 0) || !isNullableNumber(value.reps) || (value.reps !== null && (!Number.isInteger(value.reps) || value.reps < 0)) || !isBool(value.completed) || !isNumber(value.updatedAt)) invalid('Backup contains an invalid workout set.')
  if (value.blockCount !== undefined && value.blockCount !== null && (!isNumber(value.blockCount) || value.blockCount < 0 || !Number.isInteger(value.blockCount))) invalid('Backup contains an invalid block count.')
  if (value.completed && ((value.weightKg === null && value.blockCount == null) || value.reps === null || value.reps < 1)) invalid('Backup contains a completed set without valid load and reps.')
  return { ...value, blockCount: value.blockCount ?? null } as unknown as WorkoutSet
}

function parseSettings(value: unknown): UserSettings {
  if (!isRecord(value) || value.id !== 'preferences' || !isNumber(value.defaultRestSeconds) || value.defaultRestSeconds < 1 || value.defaultRestSeconds > 3600 || !isBool(value.autoStartRest) || !['kg', 'lb'].includes(String(value.weightUnit)) || !['dark', 'light', 'system'].includes(String(value.theme))) invalid('Backup contains invalid application settings.')
  return value as unknown as UserSettings
}

function ensureReferences(data: GymTrackerBackup['data']) {
  const templateIds = new Set(data.templates.map((item) => item.id))
  const exerciseIds = new Set(data.exercises.map((item) => item.id))
  const sessionIds = new Set(data.sessions.map((item) => item.id))
  const templateExerciseIds = new Set(data.templateExercises.map((item) => item.id))
  const sessionExerciseIds = new Set(data.sessionExercises.map((item) => item.id))
  if (data.templateExercises.some((item) => !templateIds.has(item.templateId) || !exerciseIds.has(item.exerciseId))) invalid('Backup has a workout exercise that refers to a missing template or exercise.')
  if (data.sessionExercises.some((item) => !sessionIds.has(item.sessionId))) invalid('Backup has a session exercise that refers to a missing workout.')
  if (data.sets.some((item) => !sessionIds.has(item.sessionId) || !sessionExerciseIds.has(item.sessionExerciseId))) invalid('Backup has a set that refers to a missing workout or exercise snapshot.')
  const exerciseSession = new Map(data.sessionExercises.map((item) => [item.id, item.sessionId]))
  if (data.sets.some((item) => exerciseSession.get(item.sessionExerciseId) !== item.sessionId)) invalid('Backup has a set linked to the wrong workout.')
  const openSessions = data.sessions.filter((session) => session.status === 'active' || session.status === 'paused')
  if (openSessions.length > 1) invalid('Backup contains more than one unfinished workout. Finish or cancel the extras before exporting.')
  if (templateExerciseIds.size !== data.templateExercises.length) invalid('Backup contains duplicate template exercise references.')
}

export function parseGymTrackerBackup(input: unknown): GymTrackerBackup {
  if (!isRecord(input) || input.format !== 'gymtracker-backup' || input.schemaVersion !== 1 || !isNumber(input.exportedAt) || !isRecord(input.data)) invalid('This file is not a supported GymTracker backup.')
  const exportedAt = input.exportedAt as number
  const raw = input.data
  const sessions = parseRows(raw.sessions, 'session', parseSession).map((session) => {
    if (session.status !== 'active') return session
    const restRemaining = session.restEndsAt === null ? session.restPausedRemainingMs : Math.max(0, session.restEndsAt - exportedAt)
    return {
      ...session,
      status: 'paused' as const,
      durationMs: session.durationMs + Math.max(0, exportedAt - (session.resumedAt ?? exportedAt)),
      resumedAt: null,
      restEndsAt: null,
      restPausedRemainingMs: restRemaining,
    }
  })
  const data: GymTrackerBackup['data'] = {
    exercises: parseRows(raw.exercises, 'exercise', parseExercise),
    templates: parseRows(raw.templates, 'template', parseTemplate),
    templateExercises: parseRows(raw.templateExercises, 'template exercise', parseTemplateExercise),
    sessions,
    sessionExercises: parseRows(raw.sessionExercises, 'session exercise', parseSessionExercise),
    sets: parseRows(raw.sets, 'set', parseSet),
    settings: parseSettings(raw.settings),
  }
  ensureReferences(data)
  return { format: 'gymtracker-backup', schemaVersion: 1, exportedAt, data }
}

export async function createGymTrackerBackup(): Promise<GymTrackerBackup> {
  const exportedAt = Date.now()
  const [exercises, templates, templateExercises, sessions, sessionExercises, sets, savedSettings] = await db.transaction('r', [db.exercises, db.templates, db.templateExercises, db.sessions, db.sessionExercises, db.workoutSets, db.userSettings], async () => Promise.all([
    db.exercises.toArray(), db.templates.toArray(), db.templateExercises.toArray(), db.sessions.toArray(),
    db.sessionExercises.toArray(), db.workoutSets.toArray(), db.userSettings.get(defaultUserSettings.id),
  ]))
  const snapshotSessions = sessions.map((session) => {
    if (session.status !== 'active') return session
    const restRemaining = session.restEndsAt === null ? session.restPausedRemainingMs : Math.max(0, session.restEndsAt - exportedAt)
    return {
      ...session,
      status: 'paused' as const,
      durationMs: session.durationMs + Math.max(0, exportedAt - (session.resumedAt ?? exportedAt)),
      resumedAt: null,
      restEndsAt: null,
      restPausedRemainingMs: restRemaining,
    }
  })
  const backup: GymTrackerBackup = {
    format: 'gymtracker-backup',
    schemaVersion: 1,
    exportedAt,
    data: { exercises, templates, templateExercises, sessions: snapshotSessions, sessionExercises, sets, settings: savedSettings ?? defaultUserSettings },
  }
  return parseGymTrackerBackup(backup)
}

export async function applyGymTrackerBackup(backup: GymTrackerBackup, mode: 'merge' | 'replace') {
  return db.transaction('rw', [db.exercises, db.templates, db.templateExercises, db.sessions, db.sessionExercises, db.workoutSets, db.userSettings], async () => {
    if (mode === 'replace') {
      await db.exercises.clear()
      await db.templates.clear()
      await db.templateExercises.clear()
      await db.sessions.clear()
      await db.sessionExercises.clear()
      await db.workoutSets.clear()
      await db.userSettings.clear()
      const { data } = backup
      await db.exercises.bulkAdd(data.exercises)
      await db.templates.bulkAdd(data.templates)
      await db.templateExercises.bulkAdd(data.templateExercises)
      await db.sessions.bulkAdd(data.sessions)
      await db.sessionExercises.bulkAdd(data.sessionExercises)
      await db.workoutSets.bulkAdd(data.sets)
      await db.userSettings.add(data.settings)
      return { added: data.exercises.length + data.templates.length + data.templateExercises.length + data.sessions.length + data.sessionExercises.length + data.sets.length + 1, skipped: 0 }
    }

    const [existingExercises, existingTemplates, existingTemplateExercises, existingSessions, existingSessionExercises, existingSets, existingSettings] = await Promise.all([
      db.exercises.toArray(), db.templates.toArray(), db.templateExercises.toArray(), db.sessions.toArray(), db.sessionExercises.toArray(), db.workoutSets.toArray(), db.userSettings.get(defaultUserSettings.id),
    ])
    const incomingOpen = backup.data.sessions.filter((session) => session.status === 'active' || session.status === 'paused')
    const existingOpen = existingSessions.filter((session) => session.status === 'active' || session.status === 'paused')
    const newIncomingOpen = incomingOpen.filter((incoming) => !existingSessions.some((current) => current.id === incoming.id && current.startedAt === incoming.startedAt))
    if (existingOpen.length && newIncomingOpen.length) invalid('Both this device and the backup contain an unfinished workout. Finish/cancel the device workout or choose Replace to restore the backup workout.')

    let skipped = 0
    function merge<T extends { id: string }>(incomingRows: T[], existingRows: T[], adjust: (row: T) => T, same: (left: T, right: T) => boolean = (left, right) => JSON.stringify(left) === JSON.stringify(right)) {
      const existing = new Map(existingRows.map((row) => [row.id, row]))
      const idMap = new Map<string, string>()
      const additions: T[] = []
      for (const row of incomingRows) {
        const candidate = adjust(row)
        const collision = existing.get(row.id)
        if (!collision) {
          idMap.set(row.id, row.id)
          additions.push(candidate)
        } else if (same(collision, candidate)) {
          idMap.set(row.id, row.id)
          skipped += 1
        } else {
          const remappedId = `import-${backup.exportedAt}-${row.id}`
          const remappedExisting = existing.get(remappedId)
          idMap.set(row.id, remappedId)
          if (!remappedExisting) additions.push({ ...candidate, id: remappedId })
          else skipped += 1
        }
      }
      return { rows: additions, idMap }
    }

    const exerciseMerge = merge(backup.data.exercises, existingExercises, (row) => row)
    const templateMerge = merge(backup.data.templates, existingTemplates, (row) => row)
    const templateExerciseMerge = merge(backup.data.templateExercises, existingTemplateExercises, (row) => ({
      ...row,
      templateId: templateMerge.idMap.get(row.templateId) ?? row.templateId,
      exerciseId: exerciseMerge.idMap.get(row.exerciseId) ?? row.exerciseId,
    }))
    const sessionMerge = merge(backup.data.sessions, existingSessions, (row) => ({
      ...row,
      templateId: templateMerge.idMap.get(row.templateId) ?? row.templateId,
    }), (existing, incoming) => existing.id === incoming.id && existing.startedAt === incoming.startedAt)
    const sessionExerciseMerge = merge(backup.data.sessionExercises, existingSessionExercises, (row) => ({
      ...row,
      sessionId: sessionMerge.idMap.get(row.sessionId) ?? row.sessionId,
      exerciseId: exerciseMerge.idMap.get(row.exerciseId) ?? row.exerciseId,
    }), (existing, incoming) => existing.id === incoming.id && existing.sessionId === incoming.sessionId)
    const setMerge = merge(backup.data.sets, existingSets, (row) => ({
      ...row,
      sessionId: sessionMerge.idMap.get(row.sessionId) ?? row.sessionId,
      sessionExerciseId: sessionExerciseMerge.idMap.get(row.sessionExerciseId) ?? row.sessionExerciseId,
    }), (existing, incoming) => existing.id === incoming.id && existing.sessionId === incoming.sessionId && existing.sessionExerciseId === incoming.sessionExerciseId && existing.setNumber === incoming.setNumber)

    await db.exercises.bulkAdd(exerciseMerge.rows)
    await db.templates.bulkAdd(templateMerge.rows)
    await db.templateExercises.bulkAdd(templateExerciseMerge.rows)
    await db.sessions.bulkAdd(sessionMerge.rows)
    await db.sessionExercises.bulkAdd(sessionExerciseMerge.rows)
    await db.workoutSets.bulkAdd(setMerge.rows)
    if (!existingSettings) await db.userSettings.add(backup.data.settings)
    else skipped += 1
    const added = exerciseMerge.rows.length + templateMerge.rows.length + templateExerciseMerge.rows.length + sessionMerge.rows.length + sessionExerciseMerge.rows.length + setMerge.rows.length + (existingSettings ? 0 : 1)
    return { added, skipped }
  })
}

export function downloadBackup(backup: GymTrackerBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `gymtracker-backup-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

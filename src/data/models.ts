export type MuscleGroup = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core'

export interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
  category?: 'compound' | 'isolation'
  equipment?: string
  instructions?: string
  isCustom: boolean
  archived: boolean
}

export interface WorkoutTemplate {
  id: string
  name: string
  focus: string
  dayIndex: number
  dayName: string
  restSeconds: number
  isCustom?: boolean
}

export interface TemplateExercise {
  id: string
  templateId: string
  exerciseId: string
  position: number
  targetSets: number
  minReps: number
  maxReps: number
  repsNote?: string
  restSeconds: number
}

export interface WorkoutPlan {
  template: WorkoutTemplate
  exercises: Array<TemplateExercise & { exercise: Exercise }>
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'cancelled'

export interface WorkoutSession {
  id: string
  templateId: string
  workoutName: string
  focus: string
  status: SessionStatus
  startedAt: number
  resumedAt: number | null
  durationMs: number
  completedAt?: number
  restDurationSeconds: number
  restEndsAt: number | null
  restPausedRemainingMs: number | null
}

export interface SessionExercise {
  id: string
  sessionId: string
  exerciseId: string
  exerciseName: string
  muscleGroup: MuscleGroup
  position: number
  targetSets: number
  minReps: number
  maxReps: number
  repsNote?: string
  isUnilateral: boolean
}

export interface WorkoutSet {
  id: string
  sessionId: string
  sessionExerciseId: string
  setNumber: number
  weightKg: number | null
  reps: number | null
  completed: boolean
  updatedAt: number
}

export interface UserSettings {
  id: 'preferences'
  defaultRestSeconds: number
  autoStartRest: boolean
  weightUnit: 'kg' | 'lb'
  theme: 'dark' | 'light' | 'system'
}

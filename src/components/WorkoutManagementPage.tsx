import { useEffect, useMemo, useState } from 'react'
import {
  addExerciseToTemplate,
  createCustomExercise,
  createCustomTemplate,
  deleteCustomTemplate,
  deleteUnusedCustomExercise,
  duplicateWorkoutTemplate,
  getManagementData,
  restorePredefinedTemplates,
  saveWorkoutTemplate,
  setExerciseArchived,
  updateCustomExercise,
} from '../data/management'
import type { Exercise, MuscleGroup, TemplateExercise, WorkoutPlan, WorkoutTemplate } from '../data/models'

type Section = 'templates' | 'library'
const muscleGroups: MuscleGroup[] = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core']
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function WorkoutManagementPage() {
  const [section, setSection] = useState<Section>('templates')
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [templateDraft, setTemplateDraft] = useState<WorkoutTemplate | null>(null)
  const [entryDraft, setEntryDraft] = useState<TemplateExercise[]>([])
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('All muscle groups')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    const result = await getManagementData()
    setPlans(result.plans)
    setExercises(result.exercises)
    return result
  }

  useEffect(() => {
    let mounted = true
    void getManagementData().then((result) => {
      if (!mounted) return
      setPlans(result.plans)
      setExercises(result.exercises)
      setSelectedId(result.plans[0]?.template.id ?? null)
    }).catch(() => { if (mounted) setError('Could not load workout templates and exercises.') }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const selectedPlan = plans.find((plan) => plan.template.id === selectedId)
  useEffect(() => {
    if (selectedPlan && templateDraft?.id !== selectedPlan.template.id) {
      setTemplateDraft({ ...selectedPlan.template })
      setEntryDraft(selectedPlan.exercises.map((entry) => ({ ...entry })))
    } else if (!selectedPlan && templateDraft) {
      setTemplateDraft(null)
      setEntryDraft([])
    }
  }, [selectedPlan, templateDraft])

  const filteredExercises = useMemo(() => exercises.filter((exercise) => {
    const matchesSearch = exercise.name.toLowerCase().includes(search.toLowerCase())
    const matchesMuscle = muscleFilter === 'All muscle groups' || exercise.muscleGroup === muscleFilter
    return matchesSearch && matchesMuscle
  }), [exercises, search, muscleFilter])
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId)
  const availableToAdd = exercises.filter((exercise) => !exercise.archived && !entryDraft.some((entry) => entry.exerciseId === exercise.id))

  async function execute(action: () => Promise<unknown>) {
    setError('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the change.') }
  }

  async function saveTemplate() {
    if (!templateDraft) return
    await execute(async () => {
      await saveWorkoutTemplate(templateDraft, entryDraft)
      const result = await refresh()
      const saved = result.plans.find((plan) => plan.template.id === templateDraft.id)
      if (saved) {
        setTemplateDraft({ ...saved.template })
        setEntryDraft(saved.exercises.map((entry) => ({ ...entry })))
      }
    })
  }

  async function makeTemplate() {
    await execute(async () => {
      const template = await createCustomTemplate()
      await refresh()
      setSelectedId(template.id)
      setSection('templates')
      setTemplateDraft(template)
      setEntryDraft([])
    })
  }

  async function duplicatePlan(plan: WorkoutPlan) {
    await execute(async () => {
      const template = await duplicateWorkoutTemplate(plan)
      await refresh()
      setSelectedId(template.id)
      setSection('templates')
    })
  }

  async function restoreDefaults() {
    if (!window.confirm('Restore the four original workouts? This replaces edits to those four templates. Custom workouts and completed workout history will be kept.')) return
    await execute(async () => {
      await restorePredefinedTemplates()
      await refresh()
      setSelectedId('upper-a')
    })
  }

  async function removeTemplate(plan: WorkoutPlan) {
    if (!plan.template.isCustom || !window.confirm(`Delete “${plan.template.name}”? Completed workout history will be kept.`)) return
    await execute(async () => {
      await deleteCustomTemplate(plan.template.id)
      const result = await refresh()
      setSelectedId(result.plans[0]?.template.id ?? null)
    })
  }

  function editEntry(id: string, changes: Partial<TemplateExercise>) {
    setEntryDraft((current) => current.map((entry) => entry.id === id ? { ...entry, ...changes } : entry))
  }

  function moveEntry(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= entryDraft.length) return
    setEntryDraft((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function addExercise() {
    if (!templateDraft || !selectedExerciseId) return
    const exercise = exercises.find((item) => item.id === selectedExerciseId)
    if (!exercise) return
    await execute(async () => {
      const entry = await addExerciseToTemplate(templateDraft.id, exercise)
      setEntryDraft((current) => [...current, entry])
      setSelectedExerciseId(null)
    })
  }

  return (
    <section className="management-page">
      <header className="management-heading"><div><p className="eyebrow">MAKE THE PLAN YOURS</p><h1>Workouts & exercises</h1><p>Template edits affect future workouts. Saved session history keeps its original snapshot.</p></div></header>
      <div className="management-tabs" role="tablist" aria-label="Workout management sections">
        <button className={section === 'templates' ? 'active' : ''} role="tab" aria-selected={section === 'templates'} onClick={() => setSection('templates')}>Workout templates</button>
        <button className={section === 'library' ? 'active' : ''} role="tab" aria-selected={section === 'library'} onClick={() => setSection('library')}>Exercise library <span>{exercises.filter((exercise) => !exercise.archived).length}</span></button>
      </div>
      {error && <p className="session-error" role="alert">{error}</p>}
      {loading ? <div className="loading-state">Loading your library…</div> : section === 'templates' ? (
        <div className="management-layout">
          <aside className="template-list-panel">
            <div className="management-list-heading"><h2>Templates</h2><button aria-label="Create workout template" title="Create workout template" onClick={() => { void makeTemplate() }}>＋</button></div>
            <div className="template-picker">
              {plans.map((plan) => <button key={plan.template.id} className={plan.template.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(plan.template.id)}><span><strong>{plan.template.name}</strong><small>{plan.template.dayName} · {plan.template.focus}</small></span><span>{plan.exercises.length}</span></button>)}
            </div>
            <button className="restore-defaults" onClick={() => { void restoreDefaults() }}>Restore original workouts</button>
          </aside>
          {templateDraft && selectedPlan ? (
            <div className="template-editor">
              <div className="template-editor-top"><div><p className="eyebrow">{templateDraft.isCustom ? 'CUSTOM TEMPLATE' : 'PREDEFINED TEMPLATE'}</p><h2>Edit workout</h2></div><div className="template-actions"><button onClick={() => { void duplicatePlan({ ...selectedPlan, template: templateDraft, exercises: entryDraft.flatMap((entry) => { const exercise = exercises.find((item) => item.id === entry.exerciseId); return exercise ? [{ ...entry, exercise }] : [] }) }) }}>Duplicate</button>{templateDraft.isCustom && <button className="danger-outline" onClick={() => { void removeTemplate({ ...selectedPlan, template: templateDraft }) }}>Delete</button>}</div></div>
              <div className="template-fields"><label>Workout name<input value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></label><label>Focus<input value={templateDraft.focus} onChange={(event) => setTemplateDraft({ ...templateDraft, focus: event.target.value })} /></label><label>Scheduled day<select value={templateDraft.dayIndex} onChange={(event) => { const index = Number(event.target.value); setTemplateDraft({ ...templateDraft, dayIndex: index, dayName: index >= 0 ? days[index] : 'Flexible' }) }}><option value={-1}>Flexible / unscheduled</option>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label></div>
              <div className="template-exercise-editor-heading"><div><h3>Exercises</h3><span>{entryDraft.length} movements · {entryDraft.reduce((sum, entry) => sum + entry.targetSets, 0)} working sets</span></div></div>
              <div className="template-exercise-editor-list">
                {entryDraft.map((entry, index) => {
                  const exercise = exercises.find((item) => item.id === entry.exerciseId)
                  return <article className="template-exercise-editor" key={entry.id}>
                    <div className="template-exercise-title"><span className="exercise-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{exercise?.name ?? 'Missing exercise'}</strong><small>{exercise?.muscleGroup}{exercise?.archived ? ' · archived' : ''}</small></div><div className="order-controls"><button title="Move up" aria-label="Move exercise up" disabled={index === 0} onClick={() => moveEntry(index, -1)}>↑</button><button title="Move down" aria-label="Move exercise down" disabled={index === entryDraft.length - 1} onClick={() => moveEntry(index, 1)}>↓</button><button title="Remove exercise" aria-label="Remove exercise" className="remove-exercise" onClick={() => setEntryDraft((current) => current.filter((item) => item.id !== entry.id))}>×</button></div></div>
                    <div className="target-fields"><label>Sets<input type="number" min="1" max="30" value={entry.targetSets} onChange={(event) => editEntry(entry.id, { targetSets: Number(event.target.value) })} /></label><label>Min reps<input type="number" min="1" value={entry.minReps} onChange={(event) => editEntry(entry.id, { minReps: Number(event.target.value) })} /></label><label>Max reps<input type="number" min="1" value={entry.maxReps} onChange={(event) => editEntry(entry.id, { maxReps: Number(event.target.value) })} /></label><label>Note<input placeholder="e.g. per side" value={entry.repsNote ?? ''} onChange={(event) => editEntry(entry.id, { repsNote: event.target.value || undefined })} /></label></div>
                  </article>
                })}
                {entryDraft.length === 0 && <div className="template-no-exercises">No exercises in this template yet. Add one from your exercise library below.</div>}
              </div>
              <div className="add-template-exercise"><select value={selectedExerciseId ?? ''} onChange={(event) => setSelectedExerciseId(event.target.value || null)}><option value="">Choose an exercise to add</option>{availableToAdd.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name} · {exercise.muscleGroup}</option>)}</select><button disabled={!selectedExerciseId} onClick={() => { void addExercise() }}>Add exercise</button></div>
              <div className="save-template-row"><span>Existing workout history is unchanged.</span><button className="primary-button" onClick={() => { void saveTemplate() }}>Save template</button></div>
            </div>
          ) : <div className="template-no-selection">Choose a template or create a new one.</div>}
        </div>
      ) : (
        <div className="library-layout">
          <div className="library-browser"><div className="library-controls"><input aria-label="Search exercises" placeholder="Search exercises" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter by muscle group" value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value)}><option>All muscle groups</option>{muscleGroups.map((group) => <option key={group}>{group}</option>)}</select></div>
            <div className="library-exercise-list">{filteredExercises.map((exercise) => <button className={`library-exercise ${exercise.id === selectedExerciseId ? 'selected' : ''} ${exercise.archived ? 'archived' : ''}`} key={exercise.id} onClick={() => setSelectedExerciseId(exercise.id)}><span className="library-exercise-icon">{exercise.muscleGroup.slice(0, 1)}</span><span><strong>{exercise.name}</strong><small>{exercise.muscleGroup}{exercise.isCustom ? ' · custom' : ' · program'}</small></span><span className="library-status">{exercise.archived ? 'Archived' : ''}</span></button>)}</div>
          </div>
          <ExerciseEditor key={selectedExercise?.id ?? 'new'} exercise={selectedExercise} onChanged={async () => { await refresh() }} onError={setError} onCreate={async (exercise) => { await refresh(); setSelectedExerciseId(exercise.id) }} />
        </div>
      )}
    </section>
  )
}

function ExerciseEditor({ exercise, onChanged, onError, onCreate }: { exercise?: Exercise; onChanged: () => Promise<void>; onError: (message: string) => void; onCreate: (exercise: Exercise) => Promise<void> }) {
  const [name, setName] = useState(exercise?.name ?? '')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>(exercise?.muscleGroup ?? 'Chest')
  const [category, setCategory] = useState<'compound' | 'isolation'>(exercise?.category ?? 'compound')
  const [equipment, setEquipment] = useState(exercise?.equipment ?? '')
  const [instructions, setInstructions] = useState(exercise?.instructions ?? '')
  const [busy, setBusy] = useState(false)
  const isCustom = exercise?.isCustom ?? false

  async function save() {
    onError('')
    setBusy(true)
    try {
      if (exercise) await updateCustomExercise({ ...exercise, name, muscleGroup, category, equipment, instructions })
      else {
        const created = await createCustomExercise({ name, muscleGroup, category, equipment, instructions })
        await onCreate(created)
        return
      }
      await onChanged()
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not save this exercise.') }
    finally { setBusy(false) }
  }

  async function toggleArchive() {
    if (!exercise) return
    onError('')
    try { await setExerciseArchived(exercise.id, !exercise.archived); await onChanged() }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not update this exercise.') }
  }

  async function deleteExercise() {
    if (!exercise || !window.confirm(`Delete ${exercise.name}? It can only be deleted when no workout template uses it.`)) return
    onError('')
    try { await deleteUnusedCustomExercise(exercise.id); await onChanged() }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Could not delete this exercise.') }
  }

  return <aside className="exercise-editor-panel"><div><p className="eyebrow">{exercise ? (isCustom ? 'CUSTOM EXERCISE' : 'PROGRAM EXERCISE') : 'ADD TO YOUR LIBRARY'}</p><h2>{exercise ? (isCustom ? 'Edit exercise' : 'Exercise details') : 'Create an exercise'}</h2></div>
    <label>Exercise name<input value={name} disabled={Boolean(exercise && !isCustom)} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ring dips" /></label>
    <label>Muscle group<select value={muscleGroup} disabled={Boolean(exercise && !isCustom)} onChange={(event) => setMuscleGroup(event.target.value as MuscleGroup)}>{muscleGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
    <label>Category<select value={category} disabled={Boolean(exercise && !isCustom)} onChange={(event) => setCategory(event.target.value as 'compound' | 'isolation')}><option value="compound">Compound</option><option value="isolation">Isolation</option></select></label>
    <label>Equipment <span>Optional</span><input value={equipment} disabled={Boolean(exercise && !isCustom)} onChange={(event) => setEquipment(event.target.value)} placeholder="e.g. Dumbbells" /></label>
    <label>Instructions or notes <span>Optional</span><textarea value={instructions} disabled={Boolean(exercise && !isCustom)} onChange={(event) => setInstructions(event.target.value)} rows={3} placeholder="Notes about setup or technique" /></label>
    {exercise && !isCustom && <p className="read-only-note">Predefined exercises can be added to templates. You can archive them from your add-exercise choices.</p>}
    {exercise && <div className="exercise-editor-actions"><button onClick={() => { void toggleArchive() }}>{exercise.archived ? 'Restore exercise' : 'Archive exercise'}</button>{isCustom && <button className="danger-outline" onClick={() => { void deleteExercise() }}>Delete</button>}</div>}
    {(!exercise || isCustom) && <button className="primary-button exercise-save-button" disabled={busy} onClick={() => { void save() }}>{busy ? 'Saving…' : exercise ? 'Save exercise' : 'Add exercise'}</button>}
  </aside>
}

export default WorkoutManagementPage

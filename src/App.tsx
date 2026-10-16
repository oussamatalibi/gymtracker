import { useCallback, useEffect, useMemo, useState } from 'react'
import { db, seedRoutineIfNeeded } from './data/database'
import type { WorkoutPlan, WorkoutSession } from './data/models'
import { getOpenSession, startOrResumeSession } from './data/sessions'
import WorkoutSessionPage from './components/WorkoutSessionPage'
import HistoryPage from './components/HistoryPage'
import ProgressPage from './components/ProgressPage'
import WorkoutManagementPage from './components/WorkoutManagementPage'
import SettingsPage from './components/SettingsPage'
import './App.css'

type Page = 'home' | 'program' | 'manage' | 'history' | 'progress' | 'settings'

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getTodayIndex() {
  return (new Date().getDay() + 6) % 7
}

function App() {
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [page, setPage] = useState<Page>('home')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null)
  const [startingError, setStartingError] = useState('')
  const todayIndex = getTodayIndex()

  const reloadAppData = useCallback(async () => {
    await seedRoutineIfNeeded()
    const [templates, entries, exercises, openSession] = await Promise.all([
      db.templates.orderBy('dayIndex').toArray(),
      db.templateExercises.toArray(),
      db.exercises.toArray(),
      getOpenSession(),
    ])
    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
    const loadedPlans = templates.map((template) => ({
      template,
      exercises: entries
        .filter((entry) => entry.templateId === template.id)
        .sort((a, b) => a.position - b.position)
        .flatMap((entry) => {
          const exercise = exerciseById.get(entry.exerciseId)
          return exercise ? [{ ...entry, exercise }] : []
        }),
    }))
    setPlans(loadedPlans)
    setActiveSession(openSession ?? null)
    setLoadError(false)
  }, [])

  useEffect(() => {
    let mounted = true
    void reloadAppData().catch(() => { if (mounted) setLoadError(true) }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [reloadAppData])

  const handleSessionChange = useCallback((session: WorkoutSession | null) => setActiveSession(session), [])

  async function beginWorkout(plan: WorkoutPlan) {
    setStartingError('')
    try {
      const session = await startOrResumeSession(plan)
      setActiveSession(session)
    } catch {
      setStartingError('Could not save your workout. Check that browser storage is available and try again.')
    }
  }

  const todayPlan = plans.find((plan) => plan.template.dayIndex === todayIndex)
  const nextPlan = useMemo(() => {
    if (plans.length === 0) return undefined
    const nextDay = [...plans]
      .map((plan) => ({ plan, offset: (plan.template.dayIndex - todayIndex + 7) % 7 || 7 }))
      .sort((a, b) => a.offset - b.offset)[0]
    return nextDay?.plan
  }, [plans, todayIndex])
  const selectedPlan = plans.find((plan) => plan.template.id === selectedId)

  function openPlan(plan: WorkoutPlan) {
    setSelectedId(plan.template.id)
    setPage('program')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setPage('home'); setSelectedId(null) }}>
          <span className="brand-mark">G</span>
          <span>gym<span className="brand-accent">tracker</span></span>
        </a>
        <div className="topbar-right">
          <span className="local-badge"><span /> Saved on this device</span>
          <button className="avatar" aria-label="Profile">M</button>
        </div>
      </header>

      <main className="content">
        {loadError ? (
          <section className="error-card" role="alert">
            <h1>Could not load your program</h1>
            <p>Your browser may have blocked local storage. Refresh the page to try again.</p>
          </section>
        ) : loading ? (
          <div className="loading-state">Preparing your training plan…</div>
        ) : activeSession ? (
          <WorkoutSessionPage session={activeSession} onSessionChange={handleSessionChange} />
        ) : page === 'program' && selectedPlan ? (
          <RoutinePage plan={selectedPlan} onBack={() => { setPage('home'); setSelectedId(null) }} onStart={() => { void beginWorkout(selectedPlan) }} />
        ) : page === 'history' ? (
          <HistoryPage />
        ) : page === 'progress' ? (
          <ProgressPage />
        ) : page === 'manage' ? (
          <WorkoutManagementPage />
        ) : page === 'settings' ? (
          <SettingsPage onImported={reloadAppData} />
        ) : (
          <>
            <section className="welcome-row">
              <div>
                <p className="eyebrow">YOUR TRAINING SPACE</p>
                <h1>Build strength.<br /><span>Show up again.</span></h1>
                <p className="welcome-copy">A steady plan for muscle, strength, and the skills you're working toward.</p>
              </div>
              <div className="date-card">
                <span className="date-icon">◷</span>
                <span className="date-label">TODAY</span>
                <strong>{new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date())}</strong>
                <span>{new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' }).format(new Date())}</span>
              </div>
            </section>

            {startingError && <p className="session-error" role="alert">{startingError}</p>}
            <section className="today-card">
              <div className="today-copy">
                <span className="pill">{todayPlan ? "TODAY'S PLAN" : 'RECOVERY DAY'}</span>
                <h2>{todayPlan ? `${todayPlan.template.name} — ${todayPlan.template.focus}` : 'Rest & recover'}</h2>
                <p>{todayPlan ? `${todayPlan.exercises.length} exercises · ${totalSets(todayPlan)} working sets` : 'Your next training day is coming up. Recovery is part of the program.'}</p>
                {todayPlan && <button className="primary-button" onClick={() => openPlan(todayPlan)}>Review today’s plan <span>→</span></button>}
              </div>
              <div className="today-art" aria-hidden="true"><span>✳</span><i /></div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">YOUR WEEK</p><h2>Training rhythm</h2></div>
                <button className="text-button" onClick={() => setPage('manage')}>Manage workouts <span>→</span></button>
              </div>
              <div className="week-grid">
                {weekdays.map((day, index) => {
                  const plan = plans.find((item) => item.template.dayIndex === index)
                  return (
                    <button
                      className={`day-card ${index === todayIndex ? 'is-today' : ''} ${plan ? 'has-workout' : 'is-rest'}`}
                      key={day}
                      onClick={() => plan && openPlan(plan)}
                      disabled={!plan}
                    >
                      <span className="day-name">{day.slice(0, 3)}</span>
                      <span className="day-dot">{plan ? '•' : '–'}</span>
                      <span className="day-workout">{plan ? plan.template.name : 'Rest'}</span>
                      {plan && <span className="day-focus">{plan.template.focus}</span>}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="section-block workouts-section">
              <div className="section-heading">
                <div><p className="eyebrow">FOUR DAY SPLIT</p><h2>Your workouts</h2></div>
                {nextPlan && <div className="next-up">NEXT UP <strong>{nextPlan.template.name}</strong></div>}
              </div>
              <div className="workout-grid">
                {plans.map((plan, index) => (
                  <button className="workout-card" key={plan.template.id} onClick={() => openPlan(plan)}>
                    <div className={`workout-symbol tone-${index + 1}`}>{String(index + 1).padStart(2, '0')}</div>
                    <span className="workout-day">{plan.template.dayName.toUpperCase()}</span>
                    <h3>{plan.template.name}</h3>
                    <p>{plan.template.focus}</p>
                    <div className="workout-meta"><span>{plan.exercises.length} exercises</span><span>{totalSets(plan)} sets</span></div>
                    <span className="card-arrow">↗</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="principle-card">
              <div className="principle-icon">↗</div>
              <div><p className="eyebrow">THE PROGRESSION RULE</p><p>When every working set reaches the top of its rep range with good technique, consider a small weight increase next time.</p></div>
            </section>
          </>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className={page === 'home' ? 'active' : ''} onClick={() => { setPage('home'); setSelectedId(null) }}><span>⌂</span>Home</button>
        <button className={page === 'program' || page === 'manage' ? 'active' : ''} onClick={() => { setPage('manage'); setSelectedId(null) }}><span>▤</span>Workouts</button>
        <button className={page === 'history' ? 'active' : ''} onClick={() => { setPage('history'); setSelectedId(null) }}><span>◷</span>History</button>
        <button className={page === 'progress' ? 'active' : ''} onClick={() => { setPage('progress'); setSelectedId(null) }}><span>↗</span>Progress</button>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => { setPage('settings'); setSelectedId(null) }}><span>⚙</span>Settings</button>
      </nav>
    </div>
  )
}

function totalSets(plan: WorkoutPlan) {
  return plan.exercises.reduce((sum, item) => sum + item.targetSets, 0)
}

function RoutinePage({ plan, onBack, onStart }: { plan: WorkoutPlan; onBack: () => void; onStart: () => void }) {
  return (
    <section className="routine-page">
      <button className="back-button" onClick={onBack}>← <span>Back to overview</span></button>
      <p className="eyebrow">{plan.template.dayName.toUpperCase()} · WORKOUT PLAN</p>
      <div className="routine-title-row"><div><h1>{plan.template.name}</h1><p>{plan.template.focus}</p></div><div className="routine-total"><strong>{totalSets(plan)}</strong><span>working sets</span></div></div>
      <div className="routine-note">Warm up before your first major lift. Warm-up sets are not included in the working-set count.</div>
      <button className="primary-button routine-start" onClick={onStart}>Start workout <span>→</span></button>
      <div className="exercise-list">
        {plan.exercises.map((item, index) => (
          <article className="exercise-row" key={item.id}>
            <span className="exercise-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="exercise-info"><h2>{item.exercise.name}</h2><span>{item.exercise.muscleGroup}{item.repsNote ? ` · ${item.repsNote}` : ''}</span></div>
            <div className="exercise-target"><strong>{item.targetSets} <small>sets</small></strong><span>{item.minReps}–{item.maxReps} reps</span></div>
          </article>
        ))}
      </div>
      <section className="rest-guidance"><span>⏱</span><div><strong>Rest between sets</strong><p>2–3 min for compound lifts · 60–120 sec for isolation work</p></div></section>
      <p className="coming-note">Log each working set during your session. Your workout is saved on this device.</p>
    </section>
  )
}

export default App

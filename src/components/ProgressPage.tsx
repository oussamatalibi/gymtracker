import { useEffect, useMemo, useState } from 'react'
import { getProgressData, type ExerciseProgress, type ProgressData, type WeeklyProgress } from '../data/progress'

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    void getProgressData().then((result) => {
      if (mounted) {
        setData(result)
        setSelectedId(result.exercises[0]?.exerciseId ?? '')
      }
    }).catch(() => {
      if (mounted) setError('Could not load progress from this device.')
    }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const selected = useMemo(() => data?.exercises.find((exercise) => exercise.exerciseId === selectedId), [data, selectedId])
  if (loading) return <section className="progress-page"><div className="loading-state">Calculating your progress…</div></section>
  if (error || !data) return <section className="progress-page"><p className="session-error" role="alert">{error || 'No progress data is available.'}</p></section>

  return (
    <section className="progress-page">
      <header className="progress-heading"><div><p className="eyebrow">MEASURED FROM YOUR LOGS</p><h1>Your progress</h1><p>Every number here comes from your completed workouts.</p></div><span className="local-data-badge">LOCAL DATA</span></header>

      <div className="progress-stats">
        <Stat label="TOTAL WORKOUTS" value={data.totalWorkouts} detail="completed sessions" />
        <Stat label="THIS WEEK" value={data.workoutsThisWeek} detail="completed workouts" />
        <Stat label="THIS MONTH" value={data.workoutsThisMonth} detail="completed workouts" />
        <Stat label="WORKING SETS" value={data.completedWorkingSets} detail="completed sets" />
      </div>

      {data.totalWorkouts === 0 ? (
        <section className="progress-empty"><span>↗</span><h2>Your progress will take shape as you train</h2><p>Complete and save a workout to see your weekly activity and exercise trends here. No sample records are shown.</p></section>
      ) : (
        <>
          <section className="progress-section">
            <div className="progress-section-heading"><div><p className="eyebrow">LAST 8 WEEKS</p><h2>Training consistency</h2></div><span>Monday to Sunday</span></div>
            <div className="weekly-charts">
              <WeeklyBars title="Workouts per week" data={data.weekly} field="workoutCount" unit="workouts" />
              <WeeklyBars title="Completed working sets" data={data.weekly} field="completedSets" unit="sets" />
              <WeeklyBars title="Training volume" data={data.weekly} field="volumeKgReps" unit="kg·reps" formatValue={(value) => numberFormat.format(value)} />
            </div>
          </section>

          <section className="progress-section exercise-progress-section">
            <div className="progress-section-heading exercise-progress-heading"><div><p className="eyebrow">EXERCISE HISTORY</p><h2>Strength trends</h2></div><label className="exercise-select-label">EXERCISE<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{data.exercises.map((exercise) => <option key={exercise.exerciseId} value={exercise.exerciseId}>{exercise.exerciseName}</option>)}</select></label></div>
            {selected ? <ExerciseProgressView exercise={selected} /> : <div className="chart-empty">Complete a valid set for an exercise to see its trend.</div>}
          </section>
          <p className="progress-footnote">Training volume is weight × reps for completed sets. A logged unilateral set is counted once, not doubled. Estimated 1RM uses Epley’s formula and is an estimate, not a measured max.</p>
        </>
      )}
    </section>
  )
}

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <article className="progress-stat"><span>{label}</span><strong>{numberFormat.format(value)}</strong><small>{detail}</small></article>
}

function WeeklyBars({ title, data, field, unit, formatValue = (value: number) => String(value) }: {
  title: string
  data: WeeklyProgress[]
  field: 'workoutCount' | 'completedSets' | 'volumeKgReps'
  unit: string
  formatValue?: (value: number) => string
}) {
  const max = Math.max(1, ...data.map((week) => week[field]))
  return (
    <article className="weekly-chart-card">
      <h3>{title}</h3>
      <div className="weekly-bars" role="img" aria-label={`${title} over the last eight weeks`}>
        {data.map((week) => {
          const value = week[field]
          const height = value ? Math.max(5, value / max * 100) : 0
          return <div className="weekly-bar-column" key={week.weekKey} title={`${week.label}: ${formatValue(value)} ${unit}`}><span className="weekly-bar-value">{value ? formatValue(value) : ''}</span><div className="weekly-bar-track"><i style={{ height: `${height}%` }} /></div><span className="weekly-bar-label">{week.label}</span></div>
        })}
      </div>
      <p>Eight weeks including this week · {unit}</p>
    </article>
  )
}

function ExerciseProgressView({ exercise }: { exercise: ExerciseProgress }) {
  const bestEstimate = exercise.points.reduce<number | null>((best, point) => point.estimatedOneRepMaxKg === null ? best : Math.max(best ?? 0, point.estimatedOneRepMaxKg), null)
  const recent = [...exercise.points].reverse().slice(0, 6)
  return (
    <>
      <div className="exercise-progress-summary">
        <div><span>MUSCLE GROUP</span><strong>{exercise.muscleGroup}</strong></div>
        <div><span>BEST LOGGED WEIGHT</span><strong>{numberFormat.format(exercise.bestWeightKg)} kg</strong><small>{exercise.bestRepsAtBestWeight} reps at this weight</small></div>
        <div><span>ESTIMATED 1RM</span><strong>{bestEstimate === null ? '—' : `${numberFormat.format(bestEstimate)} kg`}</strong><small>{bestEstimate === null ? 'More valid data needed' : 'Best logged estimate'}</small></div>
      </div>
      {exercise.points.length ? <StrengthChart exercise={exercise} /> : <div className="chart-empty">There is not enough completed set data for this exercise yet.</div>}
      <div className="exercise-recent-heading"><h3>Recent sessions</h3><span>Most recent first</span></div>
      <div className="exercise-history-table">
        <div className="exercise-history-row table-header"><span>DATE</span><span>TOP WORKING SET</span><span>EST. 1RM</span></div>
        {recent.map((point) => <div className="exercise-history-row" key={point.sessionId}><span>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(point.date)}</span><strong>{numberFormat.format(point.topWeightKg)} kg × {point.topSetReps}</strong><span>{point.estimatedOneRepMaxKg === null ? '—' : `${numberFormat.format(point.estimatedOneRepMaxKg)} kg`}</span></div>)}
      </div>
    </>
  )
}

function StrengthChart({ exercise }: { exercise: ExerciseProgress }) {
  const width = 640
  const height = 210
  const left = 48
  const right = 16
  const top = 16
  const bottom = 34
  const values = exercise.points.flatMap((point) => [point.topWeightKg, point.estimatedOneRepMaxKg].filter((value): value is number => value !== null))
  const max = Math.max(1, ...values) * 1.12
  const x = (index: number) => exercise.points.length === 1 ? (width - left - right) / 2 + left : left + index * (width - left - right) / (exercise.points.length - 1)
  const y = (value: number) => top + (max - value) / max * (height - top - bottom)
  const topPoints = exercise.points.map((point, index) => `${x(index)},${y(point.topWeightKg)}`).join(' ')
  const estimatedPoints = exercise.points.flatMap((point, index) => point.estimatedOneRepMaxKg === null ? [] : [`${x(index)},${y(point.estimatedOneRepMaxKg)}`]).join(' ')
  const gridValues = [0, max / 2, max]
  return (
    <div className="strength-chart-wrap">
      <div className="strength-legend"><span><i />Top working weight</span><span><i />Estimated 1RM</span></div>
      <svg className="strength-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${exercise.exerciseName} top working weight and estimated one rep max over time`}>
        {gridValues.map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid-line" /><text x={left - 8} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{numberFormat.format(value)}</text></g>)}
        {exercise.points.length > 1 && <polyline points={topPoints} className="chart-weight-line" />}
        {exercise.points.length > 1 && estimatedPoints && <polyline points={estimatedPoints} className="chart-estimate-line" />}
        {exercise.points.map((point, index) => <g key={point.sessionId}><circle cx={x(index)} cy={y(point.topWeightKg)} r="4" className="chart-weight-point"><title>{new Date(point.date).toLocaleDateString()}: {numberFormat.format(point.topWeightKg)} kg top set</title></circle>{point.estimatedOneRepMaxKg !== null && <circle cx={x(index)} cy={y(point.estimatedOneRepMaxKg)} r="3.5" className="chart-estimate-point"><title>Estimated 1RM: {numberFormat.format(point.estimatedOneRepMaxKg)} kg</title></circle>}</g>)}
        {exercise.points.map((point, index) => index === 0 || index === exercise.points.length - 1 || exercise.points.length <= 6 ? <text key={`${point.sessionId}-date`} x={x(index)} y={height - 8} textAnchor="middle" className="chart-axis-label">{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(point.date)}</text> : null)}
      </svg>
      <p className="chart-caption">Weight in kilograms · one point per completed session</p>
    </div>
  )
}

export default ProgressPage

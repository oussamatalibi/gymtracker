import { useEffect, useRef, useState } from 'react'
import { applyGymTrackerBackup, createGymTrackerBackup, downloadBackup, parseGymTrackerBackup, type GymTrackerBackup } from '../data/backup'
import { db, defaultUserSettings } from '../data/database'
import type { UserSettings } from '../data/models'

function SettingsPage({ onImported }: { onImported: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings)
  const [backup, setBackup] = useState<GymTrackerBackup | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { void db.userSettings.get(defaultUserSettings.id).then((saved) => { if (saved) setSettings(saved) }) }, [])

  async function saveSettings(changes: Partial<UserSettings>) {
    const next = { ...settings, ...changes }
    setError('')
    try {
      await db.userSettings.put(next)
      setSettings(next)
      setMessage('Settings saved on this device.')
    } catch {
      setError('Could not save this setting.')
    }
  }

  async function exportData() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await createGymTrackerBackup()
      downloadBackup(result)
      setMessage(`Backup downloaded with ${result.data.sessions.length} workout sessions, ${result.data.templates.length} templates, and ${result.data.exercises.length} exercises.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the backup file.')
    } finally { setBusy(false) }
  }

  async function selectBackup(file?: File) {
    setError(''); setMessage(''); setBackup(null)
    if (!file) return
    setBusy(true)
    try {
      const parsed = parseGymTrackerBackup(JSON.parse(await file.text()) as unknown)
      setBackup(parsed)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This file could not be read as a GymTracker backup.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function importBackup(mode: 'merge' | 'replace') {
    if (!backup) return
    const records = `${backup.data.sessions.length} workouts, ${backup.data.templates.length} templates, and ${backup.data.exercises.length} exercises`
    const confirmation = mode === 'replace'
      ? `Replace all GymTracker data on this device with the backup containing ${records}? Current local data will be deleted.`
      : `Merge the backup containing ${records} into this device? Conflicting IDs will be remapped or existing records kept; local settings stay unchanged.`
    if (!window.confirm(confirmation)) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await applyGymTrackerBackup(backup, mode)
      await onImported()
      setBackup(null)
      setMessage(mode === 'replace'
        ? `Backup restored. ${result.added} records imported.`
        : `Backup merged. ${result.added} records added; ${result.skipped} matching records or settings kept.`)
    } catch (cause) {
      setError(cause instanceof Error ? `Import error: ${cause.message}` : 'The backup could not be fully imported. Refresh the page and check your data.')
    } finally { setBusy(false) }
  }

  return (
    <section className="settings-page">
      <header className="settings-heading"><div><p className="eyebrow">YOUR DEVICE, YOUR DATA</p><h1>Settings</h1><p>Preferences and backups stay on this device unless you export a file.</p></div></header>
      {error && <p className="session-error" role="alert">{error}</p>}
      {message && <p className="settings-message" role="status">{message}</p>}

      <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon">⏱</span><div><h2>Workout defaults</h2><p>Choose how your next workout session starts.</p></div></div>
        <label className="setting-row"><span><strong>Default rest timer</strong><small>Used for new workouts and automatic rest after sets.</small></span><select value={settings.defaultRestSeconds} onChange={(event) => { void saveSettings({ defaultRestSeconds: Number(event.target.value) }) }}><option value={60}>60 seconds</option><option value={90}>90 seconds</option><option value={120}>120 seconds</option><option value={150}>150 seconds</option><option value={180}>180 seconds</option></select></label>
        <label className="setting-row"><span><strong>Start rest timer after a set</strong><small>Begin the countdown when you mark a set complete.</small></span><input className="setting-switch" type="checkbox" checked={settings.autoStartRest} onChange={(event) => { void saveSettings({ autoStartRest: event.target.checked }) }} /></label>
        <div className="setting-row"><span><strong>Units and appearance</strong><small>Weights are stored in kilograms. Dark appearance is currently used.</small></span><span className="setting-value">KG · DARK</span></div>
      </section>

      <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon">↓</span><div><h2>Export a backup</h2><p>Download a versioned JSON file with exercises, templates, workout history, sets, and settings.</p></div></div>
        <button className="primary-button settings-action" disabled={busy} onClick={() => { void exportData() }}>{busy ? 'Working…' : 'Download backup'} <span>↓</span></button>
      </section>

      <section className="settings-card"><div className="settings-card-heading"><span className="settings-icon">↑</span><div><h2>Import a backup</h2><p>Validate a GymTracker JSON backup, then choose whether to merge or replace local records.</p></div></div>
        <input ref={fileRef} className="visually-hidden-file" type="file" accept="application/json,.json" onChange={(event) => { void selectBackup(event.target.files?.[0]) }} />
        <button className="secondary-action" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Reading file…' : 'Choose backup file'}</button>
        {backup && <div className="backup-preview"><div><strong>Backup looks valid</strong><span>Exported {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(backup.exportedAt)}</span><span>{backup.data.templates.length} templates · {backup.data.exercises.length} exercises · {backup.data.sessions.length} sessions · {backup.data.sets.length} sets</span></div><div className="backup-actions"><button disabled={busy} onClick={() => { void importBackup('merge') }}>Merge into this device</button><button className="replace-action" disabled={busy} onClick={() => { void importBackup('replace') }}>Replace local data</button></div></div>}
        <p className="settings-note">Merge keeps existing records when IDs match and safely remaps conflicting IDs. Replace deletes all local workout data before restoring the file. Both actions ask for confirmation.</p>
      </section>

      <p className="settings-storage-note">Browser data may be removed if you clear site data or uninstall the app. Keep an exported backup somewhere safe.</p>
    </section>
  )
}

export default SettingsPage

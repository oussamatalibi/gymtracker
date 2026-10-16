# My understanding of the GymTracker project

## Goal

Build **GymTracker** as a complete, mobile-first workout tracking Progressive Web App. I will use it mainly on an Android phone during gym sessions, through a mobile browser or as an installed home-screen app. This replaces the earlier native Android plan: there should be no APK, Android Studio, Android SDK, or Android-specific build system.

The app should have no login, backend, cloud database, ads, subscriptions, analytics, paid services, or unnecessary network requests. Workout records live locally on the device, and core features work offline after the app's initial assets have been cached.

## Technology and structure

- React, TypeScript in strict mode, Vite, and Tailwind CSS.
- Accessible reusable UI components; shadcn/ui where useful, Lucide React icons, and responsive charts such as Recharts.
- IndexedDB through Dexie.js as the source of truth for workout records. React state and Context manage UI state; localStorage is only for small, noncritical preferences.
- Vitest and React Testing Library for automated tests, with Playwright browser checks when supported.
- A clear separation between screens/components, database and repositories, domain calculations, and utilities.

## Mobile experience and PWA

Use a professional dark theme by default, with high contrast, large controls, readable numbers, and quick set entry without wide tables or horizontal scrolling. Mobile navigation should make Home, Workouts, History, Progress, and Settings easy to reach; exercise management can sit under Workouts or Settings.

Configure a real installable PWA with a GymTracker manifest, icons, standalone display mode, service worker, cached app shell/static assets, and an offline fallback. Workout data stays in IndexedDB rather than the static asset cache. Explain that deployment normally needs HTTPS, and that clearing browser data or uninstalling may remove local records. Do not claim installation or offline behavior is verified until it has been checked on the available setup.

## Schedule and workout templates

Show the weekly schedule on Home, while allowing any workout to be started on any day:

- Monday: Upper A — Chest and Back.
- Tuesday: Lower — Legs and Core.
- Wednesday: Rest.
- Thursday: Upper B — Back and Shoulders.
- Friday: Rest.
- Saturday: Upper C — Chest and Arms.
- Sunday: Rest.

Seed the four supplied templates with their exact exercise names, order, set counts, and repetition targets: Upper A — Chest and Back; Lower — Legs and Core; Upper B — Back and Shoulders; and Upper C — Chest and Arms. Use kilograms by default and make templates editable. Seed idempotently. Template changes apply only to future sessions; each session keeps a snapshot of its exercises and targets.

## Home and workout execution

Home should show today's date and scheduled workout, a prominent Start Workout action, the next workout, weekly workout/set counts, the latest workout, a recent performance summary, and a resume action for an unfinished session. Use honest empty states; never seed fake workout history.

The active workout is the highest-priority screen. It should support per-set decimal weight, reps, and completion status; editing completed sets; adding/removing sets and exercises; copying the previous set's values; and left/right tracking for unilateral movements where useful. Validate inputs, save promptly to IndexedDB, and preserve progress through navigation, refresh, and browser restarts. Pending sets do not count as completed work. Show the last actual performance for each exercise, or an empty state when none exists.

Prevent repeated taps from creating duplicate sessions. Support explicit pause/resume, completion, and cancellation with confirmation. Cancelled sessions must not be counted as completed workouts. History should retain exercise names as they were logged, regardless of later renames or archiving.

## Timers

- Independent workout duration timer: based on timestamps, excludes explicit paused time, persists enough state to recover after refresh, and can resume an unfinished session.
- Rest timer: 120-second default, 60/90/120/180 presets, custom durations, start/pause/resume/reset/skip, a clear completion state, and configurable automatic start after a set.
- Derive timer values from deadlines/timestamps and recalculate when a tab becomes visible; do not treat a once-per-second UI counter as the source of truth.
- Persist enough rest-timer state to recover after refresh. Sound or browser notifications are optional and must be user-configurable; request notification permission only after a clear user action. Explain browser background and notification limitations without promising guaranteed alarms.

## Exercises, templates, history, and progress

Exercise records need stable IDs, name, muscle group, compound/isolation category, optional equipment/instructions, predefined/custom status, and active/archived status. Support custom exercise creation/editing, search/filtering, adding to templates or active workouts, and safe archiving. Preserve historical names and records.

Template management should allow renaming, changing/reordering exercises and targets, duplication, creating templates, and restoring the defaults with confirmation. History should show completed workouts with date, duration, completed exercises/sets, calculable volume, set-by-set detail, and optional notes; deletion requires confirmation.

Progress must use real saved data: total and weekly/monthly workout counts, completed sets, frequency, exercise weight/reps history, bests, recent performance, progression charts, and estimated 1RM using Epley where there is enough valid data. Label estimated values as estimates. Calculate volume as weight × reps from valid completed sets only and explain how unilateral work is counted. Include optional dated body measurements (body weight, waist, chest, arm, thigh, hip, notes) with editing, deletion, and trends. Provide useful empty states when history is insufficient.

Progression assistance should explain its criteria, compare results with rep targets, remain optional and dismissible, and never change loads automatically or encourage training through concerning symptoms.

## Storage, backup, and settings

Use a versioned Dexie/IndexedDB schema for exercises, templates, template exercises, sessions, session snapshots, sets, measurements, and settings. Preserve stable IDs and relationships, use safe migrations, validate inputs, seed defaults idempotently, handle storage errors, and recover active sessions. IndexedDB is the source of truth; browser storage may still be cleared or evicted.

Provide user-initiated, versioned JSON export with an export timestamp and relevant records/settings. Import, if included, must validate schema, values, IDs, and relationships; explain merge/replacement behavior, require confirmation, and avoid silent data loss. If import is not implemented, state that clearly. Settings should include default rest, automatic rest start, units, dark/light/system theme, optional sound/notifications, export/import, restore defaults, and clear-data actions. Destructive actions require clear consequences and confirmation. Unit changes must convert display values without corrupting stored history.

## Verification and delivery

Test calculations and critical logic (volume, estimated 1RM, progression suggestions, duration, rest timers, validation, completion/cancellation, and import validation); test persistence and historical integrity; and use Playwright for the primary workflow and mobile viewport where available. Fix failures rather than merely reporting them.

Inspect the workspace and Node/npm environment first. Deliver the source project, package manifest and lockfile, README, development/build/test commands, deployment and Android installation instructions, and documented limitations. The configured commands should include working equivalents of `npm install`, `npm run dev`, `npm run build`, and `npm run test`. Verify the production build and, where possible, the browser workflow, persistence, mobile layout, installability, and offline behavior. Deploy only if it actually succeeds; do not claim unverified results.

The expected deployment is to static HTTPS hosting such as Cloudflare Pages, Netlify, or GitHub Pages. Installation instructions should explain opening the deployed HTTPS URL in Android Chrome and using Install app/Add to Home screen, noting browser/device differences.

## Overall priority

Deliver a real end-to-end tracker, not a visual prototype. Prioritize fast gym use, accurate timers, reliable local persistence, history integrity, and offline operation. Make ordinary technical choices independently, fix errors encountered, and clearly document anything that remains incomplete or could not be verified.

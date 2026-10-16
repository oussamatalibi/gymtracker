# GymTracker

GymTracker is a mobile-first workout tracking Progressive Web App built with React, TypeScript, and Vite. Workout records are stored locally in IndexedDB.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run locally

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

The production build is written to `dist/`.

## Current status

- The initial React + TypeScript + Vite project is set up.
- Your four day schedule and exercise targets are seeded into IndexedDB on first launch, without creating duplicates on later visits.
- The dashboard and workout reference screens display the seeded routine.
- Starting a routine creates a persistent session snapshot. Set weight/reps and completion, add/remove sets, rest timer state, and elapsed workout time are saved locally.
- An active or paused session is restored after a page refresh. Completed sets show the most recent completed performance for that exercise.
- Completed sessions appear in Workout History with date, duration, completed sets, and volume; opening a session shows its set-by-set snapshot. History entries can be deleted with confirmation.
- The Progress screen summarizes completed workouts and sets, shows eight-week frequency/set/volume bars, and plots per-exercise top weight plus estimated 1RM when valid data exists.
- Workout templates can be edited, reordered, duplicated, and created; custom exercises can be added and managed. Restoring the original templates leaves custom templates and saved workout history intact.
- Settings persist the default rest timer and automatic rest-start preference. Versioned JSON backup export and validated merge/replace import are available.
- The app includes a web app manifest, install icon, and service worker that caches the app shell and same-origin static assets for offline use. Workout records remain in IndexedDB and are not placed in the service worker cache.

## Install and offline use

Run `npm run build` and serve the `dist/` directory over HTTPS (or use `localhost` during development). Open the site in a supported browser and use its **Install app** or **Add to Home Screen** action. Open the app once while online so the service worker can cache the app shell; previously loaded static assets and locally saved workout data are then available offline. Browser storage can be cleared by the user or reclaimed by the browser, so use Settings to export a backup periodically.

## Deploy to Netlify

The project is configured for Netlify with `npm run build` as the build command and `dist` as the publish directory. The `public/_redirects` file is copied into the build output and sends app routes to the React entry point.

1. Push this project to a GitHub, GitLab, or Bitbucket repository.
2. In Netlify, choose **Add new site → Import an existing project** and connect the repository.
3. Set the build command to `npm run build` and the publish directory to `dist`, then deploy.
4. Open the HTTPS site once while online, then install it from the browser on your phone.

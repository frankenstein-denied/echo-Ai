# Plan: Firebase email/password login, Firestore feature collections, security rules

Spec: the user's request (no separate spec file): "add a native login on login page (already enabled on Firebase), create collection for the features and give me firebase rules", plus the Firebase web config below.

## Global Constraints

- Next.js 16 App Router, React 19, TypeScript, Tailwind v4. Firebase JS SDK v12 (modular API only: `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/analytics`).
- Package manager: pnpm. pnpm is not on PATH; run it as `npx -y pnpm@10 <args>`. `node_modules` is not installed yet; run `npx -y pnpm@10 install` first if missing.
- "Native login" = Firebase **Email/Password** provider. The existing "Continue with Google" button stays and is wired to `signInWithPopup(GoogleAuthProvider)`; it must show a readable error if that provider is not enabled.
- Firebase config is read from `NEXT_PUBLIC_FIREBASE_*` env vars in `.env.local` (git-ignored); the real values live only there. Keys:
  ```
  NEXT_PUBLIC_FIREBASE_API_KEY=<your-value>
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-value>
  NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your-value>
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<your-value>
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your-value>
  NEXT_PUBLIC_FIREBASE_APP_ID=<your-value>
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=<your-value>
  ```
  `.env.example` (committed) lists the same keys with empty values.
- Firebase must only initialize in the browser-safe way: `getApps().length ? getApp() : initializeApp(cfg)`. Analytics only via `isSupported()` and only when `typeof window !== 'undefined'`. `next build` must succeed (no SSR crash).
- Code style: new files use single quotes, no semicolons, 2-space indent (like `lib/utils.ts`). Edits inside `app/page.tsx` keep its existing compact one-line-per-component style and existing Tailwind classes/visual language (glass cards, cyan/violet accents, `Orb`).
- Verification for every task: `npx tsc --noEmit` and `npx -y pnpm@10 build` both pass. There is no test framework; do not add one.
- Data model (Firestore) — all user data lives under `users/{uid}`; nothing is readable or writable by other users:
  - `users/{uid}` profile: `uid` string, `email` string|null, `displayName` string|null, `photoURL` string|null, `preferredName` string, `priorities` string[], `yearGoals` string[], `importantPeople` string[], `tone` string, `checkInTime` string ("HH:MM"), `remindersEnabled` bool, `onboarded` bool, `createdAt` timestamp, `updatedAt` timestamp.
  - `users/{uid}/notes/{id}`: `title` string, `body` string, `category` string, `tags` string[], `createdAt`, `updatedAt`.
  - `users/{uid}/goals/{id}`: `title` string, `category` string, `progress` number 0–100, `streak` number ≥0, `milestones` list of `{text: string, done: bool}`, `createdAt`, `updatedAt`.
  - `users/{uid}/healthLogs/{YYYY-MM-DD}`: `date` string, `mood` number 1–10, `sleepMinutes` number ≥0, `waterGlasses` number ≥0, `energy` 'low'|'medium'|'high', `createdAt`, `updatedAt`.
  - `users/{uid}/reminders/{id}`: `title` string, `dueAt` timestamp, `done` bool, `source` 'chat'|'routine'|'manual', `createdAt`, `updatedAt`.
  - `users/{uid}/routines/{id}`: `title` string, `cadence` string, `confidence` number 0–1, `createdAt`, `updatedAt`.
  - `users/{uid}/messages/{id}` (Home chat): `role` 'user'|'assistant', `text` string, `createdAt`.
  - `users/{uid}/connectors/{provider}`: `name` string, `connected` bool, `updatedAt`.
  - `users/{uid}/memories/{id}` (2nd Brain nodes): `label` string, `type` 'diary'|'task'|'goal'|'health'|'person'|'connector', `links` string[], `createdAt`.
  - Timestamps are written with `serverTimestamp()`.

## Task 1: Firebase SDK setup

Files: `package.json`, `pnpm-lock.yaml`, `lib/firebase.ts` (new), `.env.local` (new, git-ignored, NOT committed), `.env.example` (new).

- Install `firebase` (`npx -y pnpm@10 add firebase`).
- `lib/firebase.ts`: reads the env vars into a config object; exports `app`, `auth` (`getAuth(app)`), `db` (`getFirestore(app)`), and `initAnalytics(): Promise<Analytics | null>` (uses `isSupported()`; returns null on server/unsupported). Throw a clear error at module load if `NEXT_PUBLIC_FIREBASE_API_KEY` or `NEXT_PUBLIC_FIREBASE_PROJECT_ID` is missing.
- Write `.env.local` with the exact values from Global Constraints and `.env.example` with empty values.
- Commit (`feat: add Firebase SDK setup`). Verify `.env.local` is not in the commit.

## Task 2: Email/password authentication on the login page

Files: `lib/auth-context.tsx` (new), `app/layout.tsx`, `app/page.tsx`.

- `lib/auth-context.tsx` ('use client'): `AuthProvider` subscribes to `onAuthStateChanged`, exposes via `useAuth()`: `user: User | null`, `loading: boolean`, `signIn(email, password)`, `signUp(name, email, password)` (creates user then `updateProfile` with displayName), `signInWithGoogle()`, `resetPassword(email)`, `signOut()`. Also calls `initAnalytics()` once on mount. Export `authErrorMessage(err: unknown): string` mapping at least: `auth/invalid-credential`, `auth/user-not-found`, `auth/wrong-password`, `auth/email-already-in-use`, `auth/weak-password`, `auth/invalid-email`, `auth/too-many-requests`, `auth/network-request-failed`, `auth/popup-closed-by-user`, `auth/operation-not-allowed` to friendly sentences, with a generic fallback.
- `app/layout.tsx`: wrap `{children}` in `<AuthProvider>`.
- `app/page.tsx` `Login`: keep the existing card/header. Add a sign-in / create-account toggle and a form: name (create-account mode only), email, password (min 6 chars), submit button with loading state, inline error text (via `authErrorMessage`), "Forgot password?" link that sends a reset email to the entered email and shows a confirmation. Below a divider "or", keep the Google button wired to `signInWithGoogle`. `Login` no longer takes `onStart`.
- `Page`: if `loading` show a centered `Orb` on `grid-bg`; if no `user` render `Login`; if user, keep the local `'onboarding'|'app'` flow (Task 3 will replace this with the profile flag).
- `Sidebar`: replace hard-coded "Peter Polo"/"4th-year CS student"/"P" with the user's displayName (fallback: email prefix), email, and initial; add a sign-out button (lucide `LogOut`) in that footer that calls `signOut()`.
- Commit (`feat: email/password login with Firebase Auth`).

## Task 3: Firestore feature collections + onboarding persistence

Files: `lib/firestore.ts` (new), `app/page.tsx`.

- `lib/firestore.ts`: TypeScript types for every entity in the Global Constraints data model; typed collection/doc refs (`userDoc(uid)`, `notesCol(uid)`, `goalsCol(uid)`, `healthLogsCol(uid)`, `remindersCol(uid)`, `routinesCol(uid)`, `messagesCol(uid)`, `connectorsCol(uid)`, `memoriesCol(uid)`) and functions:
  - `ensureUserProfile(user: User): Promise<UserProfile>` — creates `users/{uid}` with defaults (`onboarded: false`, empty arrays, `tone: 'Gentle coach'`, `checkInTime: '20:30'`, `remindersEnabled: true`, `preferredName` = displayName or email prefix or '') if missing, otherwise returns it.
  - `completeOnboarding(uid, answers)` — writes the onboarding answers and `onboarded: true` to the profile and, in the same `writeBatch`, seeds starter docs so every collection exists: one doc per entry in `answers.yearGoals` in `goals` (progress 0, streak 0, milestones []), one welcome note, one reminder for today at `checkInTime` with source 'routine', one routine "Daily check-in", connector docs for `google-calendar`, `gmail`, `github`, `notion`, `spotify`, `weather` (all `connected: false`), one assistant welcome message, one `memories` node per important person (type 'person').
  - `addNote`, `addGoal`, `addReminder`, `addMessage`, `upsertHealthLog(uid, date, fields)` helpers that stamp `createdAt`/`updatedAt` with `serverTimestamp()`.
- `app/page.tsx` `Onboarding`: the 6 questions become real inputs (text inputs; priorities/goals/people entered comma-separated and split/trimmed; tone as a select of 'Gentle coach'|'Direct'|'Cheerful'; check-in time as `<input type="time">` plus a reminders checkbox), prefilled from the profile. "Finish" calls `completeOnboarding`, shows saving state and errors. The done screen greets the user's `preferredName` instead of "Peter".
- `Page`: after auth, call `ensureUserProfile`; show the Orb loader while it loads; show `Onboarding` when `!profile.onboarded`, else `Dashboard`. Home greeting "Good evening, Peter." uses `preferredName`. Other dashboard mock content stays as is (out of scope).
- Commit (`feat: Firestore feature collections and onboarding persistence`).

## Task 4: Firestore security rules and Firebase config files

Files: `firestore.rules` (new), `firestore.indexes.json` (new), `firebase.json` (new), `.firebaserc` (new).

- `firestore.rules` (`rules_version = '2'`): default deny everything. Helper `isOwner(uid)` = signed in and `request.auth.uid == uid`. `users/{uid}`: read/delete if owner; create/update if owner, `request.resource.data.uid == uid`, only allowed keys (`hasOnly`) from the profile schema, and type checks for the listed fields. Each subcollection: read/delete if owner; create/update if owner with `hasOnly` key sets and type/range checks per the data model (e.g. goal `progress` 0–100, health `mood` 1–10, enums for `energy`/`source`/`role`/`type`). Rules must accept every write performed by Task 3's `lib/firestore.ts` (including `serverTimestamp()` values, which arrive as `timestamp`).
- `firestore.indexes.json`: `{ "indexes": [], "fieldOverrides": [] }`.
- `firebase.json`: `{ "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" } }`. `.firebaserc`: default project `echo-ai-9f0e5`.
- Commit (`feat: Firestore security rules`).

# Period filters, new-day diary, interests from searches — plan

Spec: none (user request, 2026-11-03). Rulings are provisional.

User request (verbatim): "for notes goals health, reminder add a per day, per week, per month filtering, the default is today, and for the diary, once user opens the app in a new day a new diary should open, and for searches if the websearch is showing interest then label the search as interest that should also be updated on the 2nd brain"

## Global Constraints

- Periods are local calendar periods in the user's time zone:
  - `today`: local midnight today → local midnight tomorrow.
  - `week`: this calendar week, Monday 00:00 → next Monday 00:00.
  - `month`: this calendar month, 1st 00:00 → 1st of next month 00:00.
  - `all`: no filter.
- Period options, in this order, with these labels: `today` "Today", `week` "This week", `month` "This month", `all` "All". Default is `today` on every view. The choice is NOT persisted (a fresh view always starts on Today).
- The switcher is the existing `Segmented` component from `components/echo/ui` (ariaLabel "Time period").
- When a period has no items, show the view's existing empty state with text naming the period, e.g. "Nothing for today." plus a hint to pick another period (exact wording per view is the implementer's, but keep it one short line).
- No Firestore query or rules changes: filter client-side on data already loaded.
- Tests: vitest (`npx vitest run <files>`); every existing test keeps passing. Pure logic goes in `lib/echo/*` with unit tests; components are not unit-tested in this repo.
- Follow existing component and Tailwind patterns in each view; mobile layout must not overflow.

## Task 1: Period helper

Create `lib/echo/period.ts` and `lib/echo/period.test.ts`.

- `export type Period = 'today' | 'week' | 'month' | 'all'`
- `export const PERIOD_OPTIONS: { value: Period; label: string }[]` — the four options above, in order.
- `export const DEFAULT_PERIOD: Period = 'today'`
- `export function periodRange(period: Period, now: Date = new Date()): { start: number; end: number } | null` — epoch ms, start inclusive, end exclusive, local time; `null` for `all`. Week starts Monday (a Sunday belongs to the week that began the previous Monday).
- `export function inPeriod(ms: number | null | undefined, period: Period, now?: Date): boolean` — `true` for `all`; `false` for null/undefined ms otherwise.
- `export function periodDates(period: Exclude<Period, 'all'>, now?: Date): string[]` — every local `YYYY-MM-DD` key in the range, in order (use `localDateKey` from `lib/echo/view-helpers.ts`).
- `export function emptyPeriodText(period: Period): string` — "Nothing for today." / "Nothing this week." / "Nothing this month." / "Nothing yet."
- Tests: ranges for a mid-week day, a Sunday, a Monday, month boundaries (Jan 31, Feb in a leap year 2028), `inPeriod` edges (start included, end excluded), `periodDates` lengths (today 1, week 7, month = days in month), `all` behaviour.

## Task 2: Notes, Goals, Reminders filters

Files: `components/echo/notes-view.tsx`, `components/echo/goals-view.tsx`, `components/echo/reminders-view.tsx`, plus pure selectors and tests in `lib/echo/view-helpers.ts` / `lib/echo/view-helpers.test.ts`.

Add a period `Segmented` near each view's header/filters, default `today`, using Task 1's helpers.

- Notes: a note is in the period if its `createdAt` OR `updatedAt` is in it. Combine with the existing search and category filters (all must match).
- Goals: a goal is in the period if `createdAt` OR `updatedAt` is in it, OR its `targetDate` (YYYY-MM-DD) falls in it. Any summary that counts goals (e.g. area shares) uses the filtered list.
- Reminders: a reminder is in the period if `dueAt` is in it. Additionally, for `today`, `week` and `month`, overdue reminders that are not done (dueAt before now) are always shown so nothing is missed. Routines are unaffected.
- Add pure selectors with tests: `notesInPeriod`, `goalsInPeriod`, `remindersInPeriod` (take items with millisecond fields + period + now).

## Task 3: Health filter

File: `components/echo/health-view.tsx` (and `components/echo/health/week-charts.tsx`, `lib/echo/view-helpers.ts` / tests as needed).

Add the period `Segmented`, default `today`.
- `today`: exactly the current behaviour (today's log editor, today's meals, the 7-day charts as today).
- `week`: the mood and calorie charts show the 7 days of this calendar week (Mon–Sun, future days empty); the meals list shows this week's meals grouped by day (newest first); show averages for the period: average mood, average sleep, total and daily-average calories (only over days that have data).
- `month`: same as week, over every day of this calendar month.
- `all`: same as month but over the last 90 days (ruling: an unbounded health history is too large to chart).
- The today log editor appears only on `today`.
- Load the extra logs/meals for the chosen range with the existing collections (a `where(documentId() ...)`/date range query on `healthLogs` and `meals` keyed by `date` is allowed — these are read queries, no rules change; if an index would be needed, filter client-side instead).
- Generalise `lastSevenDays` (or add a sibling) so the charts accept a list of date keys; unit-test the new pure helpers (period averages, grouping meals by day).

## Task 4: A new diary page each new day

Files: `components/echo/diary-view.tsx`, `lib/echo/diary.ts`, `lib/echo/diary.test.ts`.

- Add `export function isFromToday(createdAtMs: number | undefined, now: Date = new Date()): boolean` (local date compare) with tests.
- On first landing (the "Land on the most recently updated page once" effect): if the newest page was created today, open it as now. Otherwise open a fresh, empty "today" page state: `sel.id = null`, mobile open, so the user sees the empty greeting (Home with no page). The page document is created lazily by the existing `ensurePage` when the user first sends a message or starts a call — no empty page docs are created just by opening the app.
- Day rollover while the app stays open: on `visibilitychange` to visible and on window `focus`, if the local date differs from the date when the current page was opened AND the open page was not created today AND no call is active, switch to the fresh today state the same way. Do not interrupt a page the user explicitly opened from the list earlier the same day.
- An `openPageId` request from elsewhere always wins over the auto behaviour.

## Task 5: Searches that show an interest go to the 2nd Brain

Files: `lib/echo/prompt.ts` (SYSTEM_INSTRUCTION), `lib/server/live.ts` (LIVE_PERSONA), tests `lib/echo/prompt.test.ts`, `lib/server/live.test.ts`.

- Typed chat (SYSTEM_INSTRUCTION), in the memories rules add exactly:
  `- Web searches: when a web_search question shows a lasting interest of the user (a hobby, team, artist, product, place or subject they care about, e.g. "latest Lakers score" -> Lakers), also return an "interest" memory for it (reuse a KNOWN MEMORIES label when it is the same thing). Do not make one for one-off practical lookups (opening hours, weather, a single fact).`
- Calls (LIVE_PERSONA), in the save_memories bullet add exactly:
  `When you call web_search for something that shows a lasting interest of the user (a hobby, team, artist, product, place or subject they care about), also call save_memories with an interest memory for it; not for one-off practical lookups (opening hours, weather, a single fact).`
- Tests: each prompt contains `lasting interest` and `interest memory`.

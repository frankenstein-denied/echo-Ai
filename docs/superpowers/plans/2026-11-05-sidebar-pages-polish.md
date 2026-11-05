# Sidebar, Goals, Reminders, Connectors polish — implementation plan

Spec: `docs/superpowers/specs/2026-11-05-sidebar-pages-polish-design.md` (read the section for your task).
Branch: `feat/page-polish-2`.

## Global constraints

- Next.js in this repo has breaking changes vs. training data; read `node_modules/next/dist/docs/` before touching
  Next-specific APIs (these tasks are plain client components, so this rarely matters).
- Package manager pnpm. Verify with `pnpm test` (vitest) and `pnpm exec tsc --noEmit`. Both must pass.
- Pure logic lives in `lib/echo/*.ts` with a co-located `*.test.ts` (vitest, see existing `lib/echo/*.test.ts` for
  style). React components in `components/echo/`. No new dependencies.
- Reuse existing pieces: `ORB_COLOR`, `ORB_KINDS`, `OrbKind` (`lib/echo/orbs.ts`), `glowCardStyle`, `tagStyle`
  (`lib/echo/glow.ts`), `OrbSwatch` (`components/echo/memory-orb.tsx`), `ProgressRing`, `GlowDot`, `TimeChip`
  (`components/echo/glow.tsx`), `localDateKey` (`lib/echo/view-helpers.ts`), `useDay` (`components/echo/use-day.ts`),
  UI kit in `components/echo/ui`, `FOCUS_RING` (`lib/echo/ui-classes`).
- Dark theme tokens in `app/globals.css` (`--color-*`). Text must stay AA readable: never use `text-subtle` for text.
- Every interactive element keeps a visible focus ring and an accessible name. Animations must respect
  `prefers-reduced-motion` (the global rule in globals.css already zeroes animation durations; use the existing
  `echo-pulse` class for pulsing).
- Mobile (< lg) layouts of these pages must keep working; the mobile tab bar and More sheet are not changed.
- No Firestore rules changes, no new collections. Commit after each task with a conventional message
  (`feat(sidebar): …`, `feat(goals): …`, etc.) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task 1: Sidebar helpers (`lib/echo/sidebar.ts`)

Create `lib/echo/sidebar.ts` and `lib/echo/sidebar.test.ts`.

```ts
export type NavName = 'Diary' | 'Notes' | 'Goals' | 'Health' | 'Reminders' | 'Connectors' | '2nd Brain' | 'Settings'
export const NAV_GROUPS: { label: 'Capture' | 'Track' | 'Mind'; items: Exclude<NavName, 'Settings'>[] }[]
// = [{Capture: Diary, Notes}, {Track: Goals, Health, Reminders}, {Mind: 2nd Brain, Connectors}] in that order
export const NAV_COLOR: Record<Exclude<NavName, 'Settings' | '2nd Brain'>, string>
// Diary '#2dd4bf', Notes ORB_COLOR.note, Goals ORB_COLOR.goal, Health ORB_COLOR.health,
// Reminders ORB_COLOR.reminder, Connectors '#94a3b8'
export const BRAIN_GRADIENT: string // `conic-gradient(${ORB_KINDS colours…, first colour repeated at end})`

/** Not-done reminders due before the start of tomorrow (local time), overdue included. */
export function dueTodayCount(items: { dueMs: number; done: boolean }[], now: Date): number

/** Local YYYY-MM-DD keys Monday..Sunday of the week containing `now`. */
export function weekDates(now: Date): string[]
/** Local midnight (ms) of the Monday of the week containing `now`. */
export function weekStartMs(now: Date): number

export type WeekPage = { id: string; mix?: Partial<Record<'note' | 'goal' | 'reminder' | 'health', number>>; createdMs: number | null; lastMs: number | null }
export type WeekDay = { date: string; letter: string; state: 'used' | 'empty' | 'future'; isToday: boolean; counts: Record<OrbKind, number>; pageId: string | null }
export function weekStrip(pages: WeekPage[], now: Date): WeekDay[]
```

`weekStrip` rules: 7 entries for `weekDates(now)`, letters `M T W T F S S`. A page belongs to a day when
`localDateKey(new Date(createdMs))` or `localDateKey(new Date(lastMs))` equals that date (a page can belong to two
days). `counts` = sum of the mixes of that day's pages (non-numeric/negative values ignored; `person`/`interest`
always 0). `pageId` = that day's page with the greatest `lastMs ?? createdMs`. `state`: `future` if date > today's
key; else `used` if it has ≥1 page; else `empty`. `isToday` true for today's key.

Tests (at least): dueTodayCount counts overdue from yesterday, today later, excludes tomorrow and done; weekDates for a
Sunday and a Monday (Monday-first, local); weekStrip: page created Mon last used Wed appears on both; mix summed;
pageId picks latest; future/empty/used states; today flag.

## Task 2: Sidebar UI

Depends on Task 1. Files: create `components/echo/sidebar.tsx` and `components/echo/use-sidebar-data.ts`; edit
`components/echo/shell.tsx`.

- `shell.tsx`: `View` becomes an alias of `NavName` (keep `export type View`). `NAV` stays (used for `?view=`
  validation) or derive from NAV_GROUPS + Settings. Move `Sidebar`/`NavList`/`UserFooter` out into `sidebar.tsx`.
  `Dashboard` calls `useSidebarData(user?.uid)` and passes `dueCount`, `week`, and `onOpenPage={openDiaryPage}` to
  `<Sidebar>`. Settings is reached via the footer gear (`IconButton` with `Settings` icon, label "Settings",
  `aria-current="page"` and tinted when active).
- `use-sidebar-data.ts`: `useSidebarData(uid: string | undefined): { dueCount: number; week: WeekDay[] }`. Two
  `onSnapshot` listeners: `query(remindersCol(uid), where('done', '==', false))` → map to `{dueMs, done}` →
  `dueTodayCount`; `query(diaryPagesCol(uid), where('lastMessageAt', '>=', Timestamp.fromMillis(weekStartMs(now))))`
  → `WeekPage[]` (`createdMs`/`lastMs` via `toMillis()` with `serverTimestamps: 'estimate'`) → `weekStrip`. Recompute
  when `useDay()` changes (and re-subscribe the pages query when the week changes). On listener error log
  `console.error` and fall back to 0 / all-empty week. A `setInterval` is not needed beyond `useDay`.
- `sidebar.tsx` visuals (desktop only, same `hidden lg:flex` aside, widths `w-64`/`w-20`, existing brand row and
  collapse button):
  - Group label: `text-[10px] uppercase tracking-wider text-muted-foreground` above each group; collapsed → a 1px
    `border-border` divider instead.
  - Item: same button semantics as now (`aria-current`, `aria-label`/`title` when collapsed, `FOCUS_RING`), a 10px
    round dot in `NAV_COLOR` (2nd Brain: `BRAIN_GRADIENT`) with `box-shadow: 0 0 8px <colour>`; no lucide icon.
    Active: inline style background `color-mix(in srgb, C 14%, transparent)`, `box-shadow: inset 0 0 0 1px
    color-mix(in srgb, C 35%, transparent), 0 0 18px -6px C`, text colour `color-mix(in srgb, C 55%, white)`; for
    2nd Brain use `ORB_COLOR.interest` as C.
  - Reminders badge: when `dueCount > 0`, a pill `ml-auto rounded-full px-2 text-[11px] font-semibold` with danger
    tint (text `color-mix(in srgb, var(--color-danger) 80%, white)`), text = count, `aria-label="{n} due"`;
    collapsed → 8px danger dot at the dot's top-right, and the button label becomes "Reminders, {n} due".
  - Week card (expanded only), above footer: bordered rounded card; header "Day {days}" (when days !== null) and
    "This week"; 7 cells each 18px orb + letter under it. used → `OrbSwatch counts size 18` inside a `<button>`
    (aria-label "Open {Weekday}'s diary page", calls `onOpenPage(pageId)`); empty → `bg-surface-2` dot;
    future → 1px dashed `border-border-strong` circle. Today's cell gets a 1px teal ring offset. Non-button cells
    have an aria-label like "Wednesday, no diary" / "Friday, upcoming" on a `role="img"` span.
  - Footer: avatar + name/email (expanded), gear (Settings) and Sign out buttons; collapsed stacks them vertically.
- Remove the old "Day N with Echo" line (the week card shows it). Collapsed sidebar keeps no day text.

No component tests required; verify `pnpm exec tsc --noEmit` and `pnpm test`.

## Task 3: Goal helpers + milestone `doneAt`

Files: `lib/firestore.ts` (type only), create `lib/echo/goals-helpers.ts` + `lib/echo/goals-helpers.test.ts`, edit
`lib/echo/client.ts` `applyMilestone` and its tests.

- `Milestone = { text: string; done: boolean; doneAt?: number }`.
- `toggleMilestone(list: Milestone[], i: number, nowMs: number): Milestone[]` — flips `done` of index i; when it
  becomes done set `doneAt: nowMs`; when it becomes not done drop the `doneAt` key entirely (Firestore rejects
  `undefined`, so build the object without the key).
- `applyMilestone(list, m, nowMs = Date.now())`: same `doneAt` rules when it changes an existing milestone's done
  state (unchanged state keeps the existing doneAt); a newly appended done milestone gets `doneAt: nowMs`; a newly
  appended not-done one has no `doneAt`. Keep existing behaviour/tests passing.
- `overallProgress(goals: { progress: number }[]): number` — rounded mean clamped 0..100 (non-finite → 0); 0 for [].
- `yearProgress(now: Date): number` — rounded % of the local calendar year elapsed (day-of-year / days-in-year × 100).
- `milestonesDoneThisWeek(goals: { milestones?: Milestone[] }[], now: Date): number` — done milestones with numeric
  `doneAt >= weekStartMs(now)` (import from `./sidebar`).
- `milestonePath(list: Milestone[], max = 10): { steps: { text: string; index: number; state: 'done' | 'next' | 'todo' }[]; more: number }`
  — `next` is the first not-done milestone; steps are the first `max` milestones, `more` = how many were cut.

Tests for each, including doneAt add/remove, applyMilestone appended-done gets doneAt, `more` count, next detection
when all done (no next).

## Task 4: Goals UI (B)

Depends on Task 3. File: `components/echo/goals-view.tsx` (may add a small component file).

- Replace the "Your year in view" card body top with an overall card: SVG double ring (~72px; outer stroke amber
  `ORB_COLOR.goal` = `overallProgress(goals)` with the same drop-shadow glow style as `ProgressRing`; inner stroke
  teal `var(--color-primary)` = `yearProgress(now)`), `role="img"` with aria-label "Goals {x}% done, {y}% of the
  year gone". Beside it: heading "{x}% done · {y}% of the year gone", a sub line "Outer ring: your goals. Inner ring:
  the year.", and "{n} milestone(s) finished this week ✨" only when n > 0. Card background uses
  `glowCardStyle('goal')`. Keep the area share bar + legend below inside the same card; drop the old thin year bar
  and Jan/Dec labels (the ring replaces them).
- GoalCard: between the progress slider and the checklist, render the milestone path when there is ≥1 milestone: a
  horizontal row; each step is a `<button>` (≥24px hit area, `FOCUS_RING`, aria-label "Mark '{text}' done" /
  "Mark '{text}' not done", `aria-pressed={done}`) drawing a 14px dot: done = filled amber with glow; next = 16px
  amber ring with `echo-pulse`; todo = dashed `border-border-strong`. Between dots a 2px flex-1 line, amber when the
  dot on its left is done, else `bg-border`. If `more > 0` add a "+{more}" label at the end. Under the row, the next
  step's text in amber-ish text ("Next: {text}") or "All milestones done 🎉" when none left. Clicking a dot uses
  `toggleMilestone(goal.milestones, index, Date.now())` then `saveMilestones`.
- The checklist checkbox `onChange` must also use `toggleMilestone` (so doneAt is recorded).
- Mobile: path row must not overflow at 360px width (dots shrink lines, not dots).

## Task 5: Reminder helpers

Files: create `lib/echo/reminders-helpers.ts` + test.

```ts
export type Timeline<T> = { overdue: T[]; doneToday: T[]; upcoming: T[]; tomorrow: T[]; thisWeek: T[]; later: T[]; doneEarlier: T[] }
export function reminderTimeline<T extends { dueMs: number; done: boolean }>(items: T[], now: Date): Timeline<T>
export function cadenceMatches(cadence: string, day: Date): boolean
export function routinesToday<T extends { cadence: string }>(routines: T[], now: Date): T[]
```

Timeline buckets (local days; each list sorted by dueMs ascending): overdue = not done & dueMs < now; upcoming = not
done & now ≤ dueMs < start of tomorrow; tomorrow = not done & due tomorrow; thisWeek = not done & due from start of
day+2 to before start of day+7; later = not done & due ≥ start of day+7; doneToday = done & due today; doneEarlier =
done & not due today (any other day, past or future).

`cadenceMatches` (case-insensitive, trims): true for `daily`, `every day`, `everyday`, `each day`, `nightly`,
`every night`, `every morning`; `weekdays` → Mon–Fri; `weekends` → Sat/Sun; otherwise tokenise on non-letters and
match day tokens: mon/monday, tue/tues/tuesday, wed/weds/wednesday, thu/thur/thurs/thursday, fri/friday,
sat/saturday, sun/sunday → true if today's weekday is listed. Anything else (e.g. `Weekly`, `Monthly`, '') → false.

Tests: every bucket boundary (exactly now, midnight tomorrow, day+2, day+7), done buckets, sorting; cadence cases
listed above incl. "Mon/Wed/Fri" on a Wednesday and Thursday, "Weekly" false, "Tues & Thurs".

## Task 6: Reminders UI (A)

Depends on Task 5. File: `components/echo/reminders-view.tsx` (may split into a small component file).

- Remove the period `Segmented` and its state from this page (keep imports clean). Keep the add form, error alerts,
  loading skeleton, empty state, ConfirmDialog, and the existing row affordances (checkbox, GlowDot, TimeChip, source
  badge, delete), restyled as timeline cards.
- Layout: single main column (drop the right routines card). Card titled "Today · {Weekday}" containing:
  - "↻ Today's routines" row of chips (`tagStyle('reminder')`-like tint with ↻) when `routinesToday` is non-empty.
  - A vertical timeline: relative container with an absolute 2px line on the left; each item has a 12px node on the
    line: overdue = danger filled with glow, doneToday = reminder-colour filled at 50% opacity (row faded,
    line-through), upcoming = 2px reminder-colour ring on background. Order: overdue, doneToday (sorted by time),
    then a "now · {h:mm a}" marker (teal 18px tick on the line + teal text, updates with a 60s interval while
    mounted), then upcoming. Overdue item cards get a danger-tinted border; the first upcoming card gets a soft
    reminder-colour glow and its chip text uses `TimeChip`.
  - Nothing today at all → a short line "Nothing else today." after the now marker.
- Below the card: fold buttons in a row (`Tomorrow (n) · This week (n) · Later (n) · Done earlier (n)`, hide those
  with n = 0) — each is a toggle button (`aria-expanded`) that reveals a simple list of the same rows; plus an
  "All routines (n)" toggle listing `title · cadence` with the confidence % on the right (keep the existing thin
  confidence bar).
- `items.length === 0` keeps the existing EmptyState.

## Task 7: Connectors live tiles (B)

Files: create `lib/echo/connector-tiles.ts` + test; edit `components/echo/connectors-view.tsx`.

```ts
export const TILE_COLOR: Partial<Record<ConnectorId, string>> // weather '#38bdf8', nutrition ORB_COLOR.health, 'web-search' ORB_COLOR.interest
export function weatherTileFacts(data: ForecastData, now: Date): { temp: string; condition: string; hint: string }
// temp: `${Math.round(current.temperature_2m)}°`; condition: weatherCodeText(current.weather_code) (capitalised first letter);
// hint: first hourly slot from the current local hour through today (hourly.time 'YYYY-MM-DDTHH:00' local) with
// precipitation_probability >= 50 → `Rain likely around ${h} ${AM|PM}` (12-hour, e.g. '4 PM', '12 PM', '12 AM');
// else if daily[0] max/min numeric → `High ${round(max)}° · Low ${round(min)}°`; else ''.
export function connectedSummary(statuses: { status: ConnectorStatus }[]): string // `${connected} of ${available} connected` where available = not coming_soon
```

Tests: hint picks the first ≥50 slot at/after the current hour and ignores earlier hours and tomorrow; high/low
fallback; 12 AM/PM formatting; summary counts.

UI:
- Under the PageHeader, a muted line with `connectedSummary`.
- Grid of tiles only for connectors whose status is not `coming_soon`. Connected tile: `Card` with inline style
  background `linear-gradient(160deg, color-mix(in srgb, C 18%, transparent), transparent 60%), var(--color-surface)`,
  border `color-mix(in srgb, C 35%, var(--color-border))`, soft glow `0 0 22px -12px C`; header row icon + name and an
  8px success dot with glow (with sr-only "Connected"). Body:
  - Weather: a `WeatherLive` sub-component fetching `fetchForecast(lat, lon)` once per mount/location (abort-safe,
    ignore results after unmount); shows temp in `text-3xl font-semibold`, `{place} · {condition}`, hint muted; while
    loading a small Skeleton; on error just `{place}`. Then the existing `WeatherBody` controls (change/disconnect).
    The connectors doc already has `lat`/`lon` (see `docs` state) — pass them through.
  - Nutrition / Web search: "Ready" in `text-lg font-semibold` + description, then existing disconnect control.
- Not connected (available) tile: `border-dashed`, icon + name, description, and the existing connect control
  (Nutrition Connect button, Tavily login + note, WeatherBody picker).
- Coming-soon connectors: no tiles; one muted line at the bottom "Coming soon: {names joined with ', '}".
- Keep notice/error alerts and loading skeletons as they are.

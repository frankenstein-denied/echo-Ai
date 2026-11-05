# Sidebar, Goals, Reminders and Connectors polish — design

Date: 2026-11-05. Follows `2026-11-04-ui-polish-design.md` (landing, health, diary, notes, 2nd Brain are done).

## Why

The landing, Health, Diary, Notes and 2nd Brain pages now glow with the orb colours. The desktop sidebar is still a
plain list of links and Goals, Reminders and Connectors still look like the older app. The goal is that every screen
feels like the same living app, and that the sidebar and these pages *show* something, not just link somewhere.

Picked from browser mockups (`.superpowers/brainstorm/4475-1793847153/content/`): **Sidebar C, Goals B, Reminders A,
Connectors B**.

## Non-goals / anti-goals

- No change to the mobile tab bar or More sheet (phone layout stays as is).
- No new Firestore collections, no usage counting for connectors, no rules change.
- No fake numbers: every figure shown comes from data Echo already stores (or starts storing in this change).
- Must not regress accessibility (focus rings, aria labels, AA text contrast, reduced motion) or the mobile layout.

## Sidebar (C · grouped + week of orbs) — desktop only (`lg:`)

- Links grouped under small uppercase labels: **Capture** (Diary, Notes), **Track** (Goals, Health, Reminders),
  **Mind** (2nd Brain, Connectors). Settings moves to a gear button in the footer next to Sign out.
- Each link shows a glowing colour dot instead of its icon. Colours: Diary `#2dd4bf` (Echo teal), Notes, Goals,
  Health, Reminders = `ORB_COLOR.note/goal/health/reminder`, Connectors `#94a3b8`, 2nd Brain = a conic rainbow of the
  orb colours.
- Active link: a tinted pill in its own colour with a soft glow (replaces the teal left bar).
- Reminders shows a red count badge of reminders that are not done and due before the end of today (includes
  overdue). Hidden at 0.
- Week card above the footer: "Day N" (existing days-with-Echo count) and 7 small orbs for this week, Monday first,
  with day letters. A day with diary activity shows an orb swatch of that day's page mix; a past/today day without
  activity is a dark dot; a future day is a dashed outline. Clicking a day with activity opens that day's most recent
  diary page.
- Collapsed sidebar: group labels become thin dividers, week card hidden, dots centred with the name as tooltip;
  reminders badge becomes a small red dot.

## Goals (B · milestone path + overall ring)

- Top card replaces "Your year in view": a double ring (outer amber = average progress of all goals, inner teal = share
  of the year passed), text "X% done · Y% of the year gone", and "N milestones finished this week ✨" when N > 0.
  The area share bar and legend stay underneath.
- Each goal card gets a milestone path: dots joined by a line; done dots glow amber, the first not-done dot pulses
  ("next"), the rest are dashed. Dots toggle the milestone. The checklist (text, remove, add) stays below.
- Milestones gain an optional `doneAt` (epoch ms) set when ticked (by the user or by Echo) and cleared when unticked.
  Only milestones with `doneAt` count toward "this week". Firestore rules do not inspect milestone elements, so no
  rules deploy is needed.

## Reminders (A · today timeline)

- The main column becomes a timeline for today: a vertical line, overdue items (not done, due before now, any day) at
  the top in red, today's done items faded, a glowing "now · h:mm" marker, then today's upcoming items.
- Learned routines whose cadence matches today appear in a "↻ Today's routines" row at the top of the timeline
  (routines have no time of day). Cadence matching: daily / every day / nightly / each day; weekdays; weekends; day
  names (Mon, Tue/Tues, …, full names) in any separator; anything else (e.g. "Weekly") never matches.
- Below the timeline, folds: Tomorrow (n) · This week (n, day+2…day+6) · Later (n) · Done earlier (n), and an
  "All routines" fold listing title · cadence · confidence %. The period filter is removed from this page.
- Add form, checkbox, source badge and delete keep working as today.

## Connectors (B · live tiles)

- Header line "N of M connected".
- Connected connectors are tiles tinted in their own colour (Weather `#38bdf8`, Nutrition `ORB_COLOR.health`,
  Web search `ORB_COLOR.interest`) with a green status dot and one live fact:
  - Weather: current temperature large ("29°"), "Place · condition", and a hint "Rain likely around 4 PM" (first hour
    today from now with precipitation probability ≥ 50) or else "High 31° · Low 24°". Fetched in the browser with the
    existing `fetchForecast`; on failure show the place only. Existing change/disconnect controls stay.
  - Nutrition and Web search have no stored live data, so they show "Ready" plus their description.
- Available but not connected: dashed tile with description and its existing connect control.
- Coming-soon connectors are not tiles; one line at the bottom: "Coming soon: Spotify, Google Calendar, …".

## Decisions the builder owns

Exact spacing, tile/ring sizes, animation timing, and component file split, as long as it matches the existing
`glow.tsx` / `glowCardStyle` visual language.

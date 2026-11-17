# Connectors Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Connectors page into layout "A": search + category chips on top, then every category as its own section with a card grid; coming-soon connectors become dimmed cards inside their section.

**Architecture:** Each connector gets a `category` in the catalog (`lib/echo/connectors.ts`). Pure filter/group helpers (`lib/echo/connector-filter.ts`) decide what shows; the view only renders. The 357-line `connectors-view.tsx` is split so later projects (news, AI keys, music, fitness) add a card file instead of growing one file.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching Next APIs — see AGENTS.md), React, Tailwind, lucide-react, Vitest (node env, `lib/**/*.test.ts` only — no component tests exist).

**Spec:** Agreed in chat 2026-11-17 (small change, no design doc). Summary: layout A from the mockup `.superpowers/brainstorm/5079-1794925044/content/connectors-layout.html`; sections in this order — AI models · Music · Health & Fitness · Productivity · Live info; chip filters to one section, "All" shows all; search matches name + description across sections; empty result shows a "Nothing matches" message; connected cards keep today's glow + live data (Weather) or "Ready"; coming-soon become dimmed cards labelled "Coming soon"; no change to connect flows, Firestore, rules or chat behaviour.

## Global Constraints

- Work on branch `feat/connectors-redesign` from `main`. Do NOT commit the pre-existing uncommitted changes (`lib/echo/guide.ts`, `lib/echo/guide.test.ts`, `documentation/`, `promotion/`, `public/guide/chathead.webp`) — stage files by name.
- No new dependencies. Reuse `components/echo/ui` (`Card`, `PageHeader`, `Input`, `Button`, `Alert`, `Skeleton`, `EmptyState`, `Badge`).
- Category ids and labels, exactly: `ai` "AI models", `music` "Music", `health` "Health & Fitness", `productivity` "Productivity", `live` "Live info"; plus the filter value `all` "All".
- Current assignments: nutrition → `health`; web-search, weather → `live`; spotify → `music`; google-calendar, gmail, github, notion → `productivity`. `ai` is empty for now and its section/chip is hidden while empty.
- Header count keeps using `connectedSummary` (counts only available connectors).
- Behaviour of Nutrition toggle, Tavily login/disconnect, Weather location picker, and the `notice` alert must be unchanged.
- Phone width: chip row wraps (no horizontal page scroll); grid is 1 col, `md:` 2, `xl:` 3 as today.

## Review Focus

1. Search text with regex characters (`(`, `+`, `\`) — must not throw; plain substring match. (Test in Task 1.)
2. A category whose connectors are all coming soon (Music) — chip still shows the section with its dimmed cards. (Test in Task 1.)
3. Category chip + search that together match nothing — shows "Nothing matches" with a Clear button that resets both. (Task 2 manual check.)
4. Connecting/disconnecting while filtered — Firestore snapshot re-renders but the selected chip and search text stay. (Task 2 manual check; state lives in the view, not derived from docs.)
5. Leading/trailing spaces or mixed case in search (" WEATHER ") — still matches. (Test in Task 1.)

---

### Task 1: Categories in the catalog + filter/group helpers

**Files:**
- Modify: `lib/echo/connectors.ts` (add `ConnectorCategory`, `CONNECTOR_CATEGORIES`, `category` on each def)
- Create: `lib/echo/connector-filter.ts`
- Test: `lib/echo/connector-filter.test.ts`, extend `lib/echo/connectors.test.ts`

**Interfaces:**
- Produces:
  - `type ConnectorCategory = 'ai' | 'music' | 'health' | 'productivity' | 'live'`
  - `const CONNECTOR_CATEGORIES: readonly { id: ConnectorCategory; label: string }[]` in the order above
  - `ConnectorDef.category: ConnectorCategory`
  - `type CategoryFilter = ConnectorCategory | 'all'`
  - `filterConnectors(defs: readonly ConnectorDef[], filter: { category: CategoryFilter; query: string }): ConnectorDef[]` — keeps catalog order
  - `groupByCategory(defs: readonly ConnectorDef[]): { id: ConnectorCategory; label: string; items: ConnectorDef[] }[]` — CONNECTOR_CATEGORIES order, empty groups dropped
  - `categoryChips(defs: readonly ConnectorDef[]): { id: CategoryFilter; label: string }[]` — `all` first, then only non-empty categories

- [ ] **Step 1: Write failing tests** in `lib/echo/connector-filter.test.ts`:
  - `every connector has a known category` — each `CONNECTORS[i].category` is in `CONNECTOR_CATEGORIES` ids (put in `connectors.test.ts`).
  - `filters by category` — `filterConnectors(CONNECTORS, { category: 'live', query: '' }).map(c => c.id)` equals `['web-search', 'weather']`.
  - `all + empty query returns the whole catalog in order`.
  - `query matches name or description, trimmed and case-insensitive` — `' WEATHER '` → `['weather']`; `'usda'` → `['nutrition']`; `'emails'` → `['gmail']` (from description "Summarize and draft emails.").
  - `query and category combine` — `{ category: 'productivity', query: 'weather' }` → `[]`.
  - `regex characters are literal` — `{ category: 'all', query: '(+\\' }` does not throw and returns `[]`.
  - `groupByCategory drops empty groups and keeps section order` — on `CONNECTORS`: ids `['music', 'health', 'productivity', 'live']`; Music group items `['spotify']` (coming-soon-only section still present).
  - `categoryChips` — on `CONNECTORS`: ids `['all', 'music', 'health', 'productivity', 'live']`, first label `'All'`.

- [ ] **Step 2: Run** `npx vitest run lib/echo/connector-filter.test.ts lib/echo/connectors.test.ts` — expect FAIL (module/field missing).

- [ ] **Step 3: Implement** the types/constant/field in `connectors.ts` and the three functions in `connector-filter.ts` (substring via `toLowerCase().includes`, no RegExp).

- [ ] **Step 4: Run** `npm test` — expect all pass (existing suites untouched).

- [ ] **Step 5: Commit**
```bash
git add lib/echo/connectors.ts lib/echo/connectors.test.ts lib/echo/connector-filter.ts lib/echo/connector-filter.test.ts
git commit -m "feat(connectors): categories and filter/group helpers"
```

### Task 2: Sectioned page with search, chips and coming-soon cards

**Files:**
- Create: `components/echo/connectors/weather-card.tsx` — move `WeatherLive`, `WeatherBody`, `geoMessage` out of the view unchanged (export `WeatherLive`, `WeatherBody`).
- Create: `components/echo/connectors/connector-card.tsx` — `ConnectorCard({ def, status, children }: { def: ConnectorDef; status: ConnectorStatus; children?: ReactNode })`: the card shell (icon, title, green dot, glow when connected, dashed when not connected, dimmed `opacity-60` + `Badge` "Coming soon" + description when coming soon). Owns the `ICONS` map.
- Create: `components/echo/connectors/connector-filters.tsx` — `ConnectorFilters({ chips, category, onCategory, query, onQuery })`: search `Input` (label "Search connectors", `type="search"`, `maxLength={60}`) and a wrapping row of chip `button`s with `aria-pressed`, selected chip styled with `--color-primary-soft` bg / `--color-primary` border+text (as mockup).
- Modify: `components/echo/connectors-view.tsx` — keeps props/exports (`ConnectorsView`, `ConnectorNotice`) so `components/echo/shell.tsx` is untouched; holds `category`/`query` state; renders `PageHeader`, alerts, `connectedSummary`, `ConnectorFilters`, then for each `groupByCategory(filterConnectors(CONNECTORS, …))` a section (`<section aria-labelledby>`, small uppercase heading like the mockup) with the card grid; per-card action bodies (Nutrition toggle, Tavily login/disconnect, Weather) passed as `ConnectorCard` children exactly as today. When no groups: `EmptyState` (icon `Search`) title "Nothing matches", description quoting the query if any, action `Button` "Clear" → `category='all'`, `query=''`. Skeleton while loading unchanged. The old "Coming soon: …" text line is removed.

**Interfaces:**
- Consumes: `filterConnectors`, `groupByCategory`, `categoryChips`, `CategoryFilter` (Task 1).

- [ ] **Step 1: Move weather code** into `weather-card.tsx`; run `npx tsc --noEmit` — expect clean.
- [ ] **Step 2: Build `ConnectorCard` and `ConnectorFilters`**, then rewrite the view to use them.
- [ ] **Step 3: Verify** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` — all clean.
- [ ] **Step 4: Manual check in `npm run dev`** (desktop and ~375px wide): sections in order Music · Health & Fitness · Productivity · Live info; chips filter; " WEATHER " finds Weather; "zzz" + Productivity shows "Nothing matches" and Clear resets; toggling Nutrition while on the Health chip keeps the chip; Weather card still shows temperature and the location picker; Tavily button still present; no horizontal scroll at phone width. (The owner's QA tests the live app — if no browser is available, say so instead of claiming it was checked.)
- [ ] **Step 5: Commit**
```bash
git add components/echo/connectors-view.tsx components/echo/connectors/
git commit -m "feat(connectors): sectioned page with search, category chips and coming-soon cards"
```

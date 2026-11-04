# Memory Orbs — Implementation Plan

Spec: `docs/superpowers/specs/2026-11-04-memory-orbs-design.md` (read it; it is the authority).
Branch/worktree: `feat/memory-orbs` at `C:\Users\THISPC\desktop\echo-ai-orbs`.

## Global Constraints
- Next.js 16 / React 19 / TypeScript 5.7. Read `node_modules/next/dist/docs/` before using any Next API you are unsure of (see AGENTS.md).
- Package manager is pnpm 12 (`npx -y pnpm@12.3.4 ...`). Do not add dependencies.
- Verify every task with: `npx vitest run` (all pass) and `npx tsc --noEmit` (clean).
- Dark theme only. Respect `prefers-reduced-motion` (no orb animation).
- Color meanings, verbatim:
  | kind | color | meaning |
  |---|---|---|
  | note | `#60a5fa` | Thoughts you wrote down |
  | goal | `#fbbf24` | Goals you're chasing |
  | reminder | `#fb923c` | Things to do |
  | health | `#34d399` | Body and mood |
  | person | `#f472b6` | People in your life |
  | interest | `#a78bfa` | Interests and topics |
  Neutral pearl for a page with no content kinds: `#cbd5e1`.
- Firestore writes must satisfy `firestore.rules`; every diary page update must set `updatedAt: serverTimestamp()`.
- Commit at the end of each task with a conventional message, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Page content mix (data)

Files: `firestore.rules`, `lib/firestore.ts`, `lib/echo/client.ts`, `lib/echo/apply-pages.test.ts`.

1. `lib/firestore.ts`:
   - Add `export type PageMix = Partial<Record<'note' | 'goal' | 'reminder' | 'health', number>>`.
   - Add `mix?: PageMix` to `DiaryPage`.
   - Add `export async function bumpPageMix(uid: string, pageId: string, delta: PageMix): Promise<void>`: drop keys whose value is not a positive integer; if none remain, return without writing; otherwise `updateDoc(doc(diaryPagesCol(uid), pageId), { 'mix.<kind>': increment(n) ..., updatedAt: serverTimestamp() })`.
2. `firestore.rules`, `match /diaryPages/{pageId}` `validPage(d)`: add `'mix'` to `hasOnly` (NOT to `hasAll`), and require `(!('mix' in d) || validMix(d.mix))`, where `validMix(m)` = `m is map && m.keys().hasOnly(['note','goal','reminder','health'])` and, for each of the four keys, `(!('k' in m) || (m.k is int && m.k >= 0))`.
3. `lib/echo/client.ts` `applyActions`:
   - Resolve the page id **at most once** per call, shared by memories and the mix: `opts.pageId`, else `await opts.getPageId()` (errors logged as today, giving `undefined`). Only resolve it when it's needed (there are memories, or the mix delta is non-empty). Keep the existing behaviour that `getPageId` is not called when nothing needs it.
   - After all actions, build the delta from `saved`: count items whose `type` is `note | goal | reminder | health` and whose `op !== 'delete'` (meals are saved with type `health`, so they count as health).
   - If the delta is non-empty and a page id exists, `await bumpPageMix(uid, pageId, delta)` inside try/catch. A failure is `console.error`ed and **not** added to `failed` (the user's items were saved; only the orb color is stale).
   - The `bumpPageMix` call happens before the memory upsert's `run(...)` or after it, your choice, but both must use the same resolved page id.
4. Tests in `lib/echo/apply-pages.test.ts` (mock `bumpPageMix` like `upsertMemories`):
   - a note + a reminder + a meal_log + a note_delete applied with `pageId: 'p'` → `bumpPageMix('u', 'p', { note: 1, reminder: 1, health: 1 })` (exact delta, delete not counted). Mock whatever Firestore helpers those actions call so they succeed.
   - no countable saves → `bumpPageMix` not called.
   - with `getPageId` and both memories and a note → `getPageId` called exactly once.
   - `bumpPageMix` rejecting → `applyActions` still resolves, `failed` is empty.
   - Add a unit test for `bumpPageMix`'s delta cleaning if you extract it as a pure helper (recommended: `export function cleanMix(delta: PageMix): PageMix`).

---

### Task 2: Orb model (pure logic)

Create `lib/echo/orbs.ts` and `lib/echo/orbs.test.ts`. No React and no Firestore imports (types only from `@/lib/firestore` are OK).

```ts
export const ORB_KINDS = ['note', 'goal', 'reminder', 'health', 'person', 'interest'] as const
export type OrbKind = (typeof ORB_KINDS)[number]
export const ORB_COLOR: Record<OrbKind, string>      // Global Constraints table
export const ORB_MEANING: Record<OrbKind, string>    // Global Constraints table
export const ORB_NOUN: Record<OrbKind, [string, string]> // singular/plural: note/notes, goal/goals, reminder/reminders, health log/health logs, person/people, interest/interests
export const PEARL = '#cbd5e1'

export type OrbPage = { id: string; title?: string; lastMessageMs?: number; messageCount?: number; mix?: PageMix }
export type OrbMemory = { id: string; label?: string; type?: string; mentions?: number; pages?: string[] }
export type OrbMember = { id: string; label: string; kind: OrbKind; mentions: number }
export type Orb = {
  id: string            // 'orb-' + pageId
  pageId: string
  label: string         // trimmed title, or 'Untitled page'
  ms: number            // lastMessageMs ?? 0
  messageCount: number
  counts: Record<OrbKind, number>
  members: OrbMember[]  // memories on this page with a non-null kind, mentions desc then label asc
  involvement: number
  radius: number
}
export type Thread = { source: string; target: string; kind: OrbKind; via: string[] } // orb ids; via = shared member labels

export function memoryKind(type: string | undefined): OrbKind | null
// person→person; interest|topic→interest; goal→goal; task→reminder; health→health; anything else→null
export function buildOrbs(memories: OrbMemory[], pages: OrbPage[]): Orb[]
export function orbShares(counts: Record<OrbKind, number>): { kind: OrbKind; share: number }[]
export function orbBlobs(orbId: string, counts: Record<OrbKind, number>): { kind: OrbKind; color: string; cx: number; cy: number; r: number }[]
export function buildThreads(orbs: Orb[]): Thread[]
export function filterOrbs(orbs: Orb[], period: Period, now?: Date): Orb[]
export function searchOrbs(orbs: Orb[], q: string): Set<string>
export function orbSummary(counts: Record<OrbKind, number>): { kind: OrbKind; count: number; text: string }[]
export function orbAriaLabel(orb: Orb): string
```

Rules:
- **buildOrbs**: one orb per page. Memories map to pages through `pages` (deduped; unknown page ids ignored; memories with a null kind ignored). `counts.person` / `counts.interest` = number of such members. For goal / reminder / health: `Math.max(mix?.[k] ?? 0, number of members of that kind)`. `counts.note = mix?.note ?? 0`. A page is skipped only when `messageCount` is 0 (or missing) **and** every count is 0. `involvement = sum(counts) + messageCount * 0.25`. `radius = clamp(16 + 8 * Math.sqrt(involvement), 16, 60)`. Output sorted by `ms` ascending.
- **orbShares**: kinds with count > 0, sorted by count desc (ties in ORB_KINDS order), at most **4** (the rest are dropped), shares renormalised to sum to 1. Empty input → `[]`.
- **orbBlobs**: one blob per `orbShares` entry, in the same order, in unit space (orb radius = 1). Deterministic for the same `(orbId, counts)` (seed from a simple string hash of orbId). Every `|(cx, cy)| ≤ 0.7` and `0 < r ≤ 1.2`. The dominant blob is the largest and sits closest to the centre. Empty shares → `[]`.
- **buildThreads**: for each member id that appears in 2+ orbs, sort those orbs by `ms` (then id) and link **consecutive** pairs only (a chain through time, not every pair). Merge links for the same unordered pair: `via` collects member labels (deduped), and `kind` is the kind of the member with the most mentions among them. `source`/`target` = earlier orb, later orb. Deterministic output order.
- **filterOrbs**: keep orbs whose `ms` is in the period, using `inPeriod` from `./period`.
- **searchOrbs**: trimmed, case-insensitive substring match on the orb label or any member label; empty query → empty set.
- **orbSummary**: entries for count > 0 in ORB_KINDS order; `text` = `${count} ${singular|plural}`.
- **orbAriaLabel**: e.g. `Wed, Nov 4. 2 notes, 1 goal, 1 person: Ana. 5 messages.` Name the people (at most 3, then `and N more`). Pearl case: `Wed, Nov 4. 5 messages.`

Tests: cover every rule above, including the dedupe of `pages`, the max() fallback, the empty-page skip, the radius clamp at both ends, the 4-kind cap, blob determinism and bounds, the chain (3 orbs sharing Ana → 2 threads, not 3), the via/kind merge, period filtering with a fixed `now`, search on member labels, and singular/plural.

---

### Task 3: Orb rendering

Create `components/echo/memory-orb.tsx` (client component), and add keyframes to `app/globals.css` if you use CSS animation.

Exports:
- `OrbDefs()`: SVG `<defs>` placed once inside the graph `<svg>`. Shared filters use `primitiveUnits="objectBoundingBox"` so one filter suits every orb size: a soft blur for color blobs, a wider blur for the outer glow, a radial "shine" gradient (white highlight up and to the left) and a "shade" gradient (transparent centre to a dark rim) that make the orb read as a sphere.
- `MemoryOrb({ orb, selected, highlighted, dimmed, reducedMotion })`: an SVG `<g>` centred at 0,0 (the caller translates it). It has:
  1. An outer glow halo in the dominant color (`PEARL` when there are no blobs), stronger when selected or highlighted.
  2. A clip-path circle (unique id via `useId`) containing a base fill in the dominant color plus the `orbBlobs` circles scaled by `orb.radius`, blurred so the colors **melt into each other**. The blob group turns slowly (one full turn in 30–60 s, speed varying per orb by seed) unless `reducedMotion`.
  3. The shade overlay, the shine overlay, and a thin light rim (`rgba(255,255,255,0.28)`).
  4. When `selected`, a crisp ring outside the orb.
  `dimmed` lowers opacity to about 0.25.
- `orbSwatchStyle(counts): React.CSSProperties`: for HTML swatches (detail panel, key, chips). Layered `radial-gradient`s of the orbShares colors, a shine highlight, `border-radius: 50%`, and a `box-shadow` glow in the dominant color. Pearl when empty.
- `OrbSwatch({ counts, size = 16 })`: a `<span aria-hidden>` using that style.

Quality bar (spec anti-goals): it must never look like a pie chart, stripes or muddy brown. Blend in screen space by stacking blurred translucent blobs (opacity about 0.85) over the dominant base. Do not mix RGB values arithmetically into one flat fill.

Tests: a small vitest for `orbSwatchStyle` (pearl when empty; includes every orbShares color; deterministic). You don't need DOM tests for the SVG.

---

### Task 4: 2nd Brain view uses orbs

Files: `components/echo/brain-view.tsx` (rewrite in place, keeping its pan, zoom, pinch, drag, pin, keyboard, mobile sheet and transcript behaviour), `lib/echo/app-guide.ts`; `lib/echo/graph.ts` + `graph.test.ts` only if they become unused.

1. Data: keep the memories listener. Extend the pages listener to read `title`, `lastMessageAt` ms, `messageCount` and `mix`. `orbs = buildOrbs(memories, pages)`.
2. Period: a `Segmented` (`components/echo/ui`, as in goals-view) with `PERIOD_OPTIONS`, default `'week'`. `shown = filterOrbs(orbs, period)`. `threads = buildThreads(shown)`.
3. Simulation: nodes = `shown` (radius from the orb); links = threads with distance `ra + rb + 50`; collide `radius + 10`; the rest as today. Node ids are orb ids.
4. Drawing, in order: `<OrbDefs/>`; threads as lines in `ORB_COLOR[kind]` (opacity about 0.35, width 2.5/k; a thread touching the selected orb has opacity 0.9 and width 3.5/k); orbs via `<MemoryOrb>` inside the existing interactive `<g>` (role button, tabIndex, `aria-label={orbAriaLabel(orb)}`, aria-pressed, the same pointer and keyboard handlers, a transparent 44 px hit circle on mobile, the dashed pin ring); the label **centred below** the orb (`y = radius + 14/k`), shown with the same rules as today. Search: matches are highlighted, non-matches dimmed.
5. Side panel (desktop) and sheets (mobile):
   - Filter card / filter sheet: the period control.
   - Details (selected orb): title with an `OrbSwatch`, the date (`Intl.DateTimeFormat` medium date + short time); a **"What's inside"** list of `orbSummary` chips, each with a dot in its color; a **People & interests** list (members of kind person / interest, each with a colored dot); a **"Linked pages"** list (threads touching this orb: the other orb's label plus "via Ana, Guitar", each a button that selects and centres that orb); the pin/release row; `PageTranscript`; Open in Diary.
   - A key card titled **"What the colors mean"**: one row per ORB_KIND with a single-color `OrbSwatch`, the meaning text and the kind's plural noun in muted text, then `Bigger orbs: more happened on that page. Threads: pages that share a person, interest or goal.`
   - Hint when nothing is selected: `Tap an orb to see what's inside.`
6. Empty states: no orbs at all → the existing EmptyState with description `Chat with Echo and each diary page will appear here as a glowing memory orb.`; orbs exist but none in the period → a message inside the graph area, `No pages <emptyPeriodText-like wording for the period>`, plus a `Show all` button that sets the period to `'all'`.
7. Header description: `Each diary page is a memory orb. Its colors show what's inside.` Bottom hint texts: desktop `Drag orbs to arrange · double-tap to unpin · drag the background to pan · scroll to zoom`; mobile `Tap an orb for details · pinch to zoom · drag to pan`.
8. `lib/echo/app-guide.ts`, the 2nd Brain line becomes: `- 2nd Brain: each diary page is a glowing memory orb. Its colors show what's inside (blue notes, gold goals, amber reminders, green health, rose people, violet interests); bigger orbs mean more happened; glowing threads link pages that share a person, interest or goal. Filter by Today, This week, This month or All, search by name, and tap an orb for details.` Update any test that asserts the old text.
9. If nothing imports `lib/echo/graph.ts` any more (`grep -r "echo/graph" app components lib`), delete it and `graph.test.ts`. Leave the `--color-node-*` CSS tokens alone unless nothing references them.

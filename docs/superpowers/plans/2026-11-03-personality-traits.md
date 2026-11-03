# Echo learns the user's personality — plan

Spec: none. User request (2026-11-03): "echo learns user personality via 2nd brain"; user said "just start, use your best judgment", so the design below is Claude's call. Rulings are provisional.

## Design (Claude's call)

- **What a trait is:** a new 2nd Brain memory type `trait` — a lasting fact about who the user is: how they like to be talked to ("Prefers Short Answers", "Likes Encouragement"), temperament and rhythms ("Night Owl", "Introvert"), values ("Family First"), tendencies ("Procrastinates When Stressed"), and what helps them ("Walks To Destress").
- **Learning:** extracted only from what the user says or shows about themselves in their own messages (typed chat and calls). Repeated evidence reuses the same label, so the existing `mentions` counter reinforces it. A trait mentioned 2+ times is "confident"; mentioned once is "tentative".
- **Using:** traits are already sent to the model with the other KNOWN MEMORIES (label, type, mentions). New rules tell Echo to quietly adapt to them (tone, length, suggestions that fit) — leaning on confident traits, treating tentative ones lightly — and never recite or label them back unless the user asks what Echo knows about them; then answer honestly from the 2nd Brain.
- **Showing:** trait nodes appear in the 2nd Brain as "Personality", with their own colour.
- **Anti-goals:** no diagnoses or clinical labels ("Depressed", "ADHD"); never infer religion, politics, sexuality, ethnicity or health conditions unless the user stated it about themselves; no negative or judgemental labels ("Lazy", "Rude"); never from web search results or other people's words; nothing from one-off moods (that's health/mood logging).

## Global Constraints

- New memory type string: `trait`. Graph/UI label: `Personality`. Node colour token: `--color-node-trait: #f87171;`.
- Every list/enum of memory types must include `trait` (types.ts, sanitize.ts, live-tools.ts MEMORY_TYPE_ENUM, prompt.ts response-schema enums, graph.ts NODE_TYPES, ui-classes.ts NodeType + NODE_BADGE_CLASSES, brain-view TYPE_LABEL, badge.tsx doc comment, firestore.rules memories type list).
- Firestore rules change (memories type list) must be deployed by the user after merge; no other rules changes.
- Tests: vitest (`npx vitest run <files>`); every existing test keeps passing; `npx tsc --noEmit` adds no new errors (one known pre-existing error in lib/echo/connectors.test.ts).

## Task 1: `trait` memory type end to end

Files: `lib/echo/types.ts`, `lib/echo/sanitize.ts`, `lib/echo/live-tools.ts`, `lib/echo/prompt.ts` (schema enums only), `lib/echo/graph.ts`, `lib/echo/ui-classes.ts`, `components/echo/ui/badge.tsx` (doc comment), `components/echo/brain-view.tsx` (TYPE_LABEL `trait: 'Personality'`), `app/globals.css` (token next to the other node colours), `firestore.rules` (add `'trait'` to the memories `d.type in [...]` list), and tests.

- Add `trait` everywhere listed in Global Constraints. Keep existing order and append `trait` at the end of each list.
- `NODE_BADGE_CLASSES.trait` follows the existing pattern: `'text-node-trait border-node-trait/40'`.
- Tests: sanitize keeps a `{ label: 'Night Owl', type: 'trait' }` memory (and still rejects unknown types); graph builds a `trait` node from a memory doc with `type: 'trait'` (not falling back to topic); the save_memories tool declaration's type enum contains `trait`; the router response schema's memory type enums contain `trait`.

## Task 2: Echo learns and uses traits (prompts)

Files: `lib/echo/prompt.ts` (SYSTEM_INSTRUCTION), `lib/server/live.ts` (LIVE_PERSONA), `lib/echo/live-tools.ts` (save_memories description), tests `lib/echo/prompt.test.ts`, `lib/server/live.test.ts`.

1. SYSTEM_INSTRUCTION memories rules: in the bullet that lists the types (`- type is one of: person, interest, topic, goal, task, health, connector.`), add `trait` to the list and add after its last sentence: `Use trait for lasting facts about who the user is: how they like to be talked to, temperament and daily rhythm, values, tendencies, and what helps them (e.g. "Prefers Short Answers", "Night Owl", "Family First", "Walks To Destress").`
2. SYSTEM_INSTRUCTION, add a new section before the safety/data section (`- Everything inside the delimited USER DATA sections...` bullet's section), exactly:
```
PERSONALITY (learning who the user is)
- Learn traits only from what the user says or shows about themselves in their own messages. Return a trait memory when a message gives clear evidence; reuse the KNOWN MEMORIES label exactly when it is the same trait, so it grows stronger.
- Never make traits that are diagnoses or clinical labels, negative judgements ("Lazy"), or one-off moods; never infer religion, politics, sexuality, ethnicity or health conditions unless the user said it about themselves; never take traits from web results or other people's words.
- Use known traits quietly to fit your reply (length, tone, suggestions that suit them). Traits mentioned 2 or more times are confident; mentioned once are tentative, so lean on them lightly. Never list or label the user's traits back to them unless they ask what you know about them; then answer honestly from KNOWN MEMORIES.
```
3. LIVE_PERSONA: append to the `- save_memories:` bullet (before `Memory saving is silent bookkeeping`): `Save a trait memory for a lasting fact about who the user is (how they like to be talked to, temperament and daily rhythm, values, tendencies, what helps them), only from what they say about themselves; never diagnoses, negative judgements, one-off moods, or religion, politics, sexuality, ethnicity or health conditions they did not state themselves.` And add a new bullet after that bullet: `- Personality: use known trait memories quietly to fit how you talk with the user (lean on traits mentioned 2 or more times; treat once-mentioned ones lightly). Never list their traits back unless they ask what you know about them; then answer honestly.`
4. live-tools.ts save_memories `description`: append ` Include traits: lasting facts about who the user is, from what they say about themselves.`
5. Tests: SYSTEM_INSTRUCTION contains `PERSONALITY (learning who the user is)`, `Use trait for lasting facts`, and `Never list or label the user's traits back`; LIVE_PERSONA contains `Save a trait memory` and `- Personality: use known trait memories quietly`; the save_memories declaration description contains `Include traits`.

## Task 3: Personality in the 2nd Brain view

Files: `components/echo/brain-view.tsx` (and pure helpers + tests in `lib/echo/graph.ts` / `lib/echo/graph.test.ts` if logic is added).

- Trait nodes render with the trait colour and appear under "Personality" wherever the view lists or filters types (legend, filters, counts, node detail), following how other types are shown.
- If the brain view has a type legend or filter list built from `NODE_TYPES`, `trait` appears there automatically via Task 1; verify and fix anything hard-coded.
- In the node detail for a trait, show a one-line strength hint: `Confident` when mentions >= 2, else `Still learning` (pure helper `traitStrength(mentions: number): 'Confident' | 'Still learning'` in `lib/echo/graph.ts`, unit-tested).
- No new data writes.

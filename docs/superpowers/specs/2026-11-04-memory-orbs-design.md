# Memory Orbs — 2nd Brain redesign

## Why
The professor tried every part of Echo and said it "works but is still bare". On the 2nd Brain specifically: a plain color legend is weak UX, because colors should *mean* something. Today the graph shows one flat dot per memory (person, interest, topic, goal…) plus one per diary page, so it grows crowded and reads as random dots.

The user's idea, inspired by the glowing memory orbs in the film Inside Out (the concept only, not the film's characters or art):
- **One orb = one diary page.** Everything that happened on that page lives inside it. Separate memory dots go away, so there are far fewer nodes and the view reads as a calm overview.
- **Color = what's inside.** Each kind of content has a color with a meaning, and they **blend inside the orb as soft glowing light**. It must look designed (glowing, blended, marble-like), never a pie chart or a random split.
- **Size = involvement.** The more that happened on a page, the bigger its orb.

## Goals
- The 2nd Brain shows one glowing orb per diary page with content, in the chosen time window.
- Orb colors blend from the page's content mix; each color has a stated meaning.
- Orb size grows with how much happened on the page.
- Orbs that share a person, interest, topic or goal are joined by a faint glowing thread in that thing's color *(controller's call; the user had not yet answered this)*.
- Time filter: Today / This week / This month / All. Default **This week** *(controller's call)*.
- Tapping an orb shows what's inside it: counts by kind, the people and interests, the threads, the transcript, and Open in Diary.
- Search finds orbs by page title or by anything inside them.

## Non-goals
- App-wide color language (the same colors on note, goal and reminder cards) is a likely follow-up, not part of this work. The palette is defined once so it can be reused later.
- No mood/emotion coloring.
- No changes to how Gemini extracts memories.

## Anti-goals
- Orbs that look like pie charts, a striped flag, or muddy brown mixes.
- A legend that has to be read before the colors make sense. The key names meanings, not only categories.
- Slower or janky graph interaction (drag, pan, pinch, zoom must keep working).

## Color meanings (fixed)
| Kind | Color | Meaning shown in the key |
|---|---|---|
| note | `#60a5fa` sky blue | Thoughts you wrote down |
| goal | `#fbbf24` gold | Goals you're chasing |
| reminder | `#fb923c` amber | Things to do |
| health | `#34d399` green | Body and mood |
| person | `#f472b6` rose | People in your life |
| interest | `#a78bfa` violet | Interests and topics |

A page with no content kinds renders as a neutral pearl `#cbd5e1`.

## Data
- Memories already carry `pages: string[]`, so person / interest / topic / goal / task / health memories map onto page orbs.
- Notes and reminders aren't memories, so pages gain an optional **`mix`** map: `{ note?, goal?, reminder?, health? }` of non-negative ints. It's incremented when chat or a call saves items on that page. This needs a `firestore.rules` change, and **rules deploy before code**.
- For pages without `mix` (older pages), goal / reminder / health counts fall back to the page's memories of type goal / task / health.

## Constraints
- Next.js 16 / React 19 / TypeScript; the existing d3-force + SVG graph with pan, zoom, drag and pin is kept.
- Dark theme only (the app is dark-only).
- `prefers-reduced-motion`: no swirl animation.
- Keyboard and screen reader: every orb is focusable with a descriptive label.
- Mobile: the existing sheet patterns are kept.

## Left to the builder
Exact blob geometry, glow strength and animation timing, within the "glowing blended marble" brief.

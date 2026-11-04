# UI Polish — making Echo feel alive, not "bare"

## Why
The professor tried every part of Echo and said it "works but is still bare". A screen audit on 2026-11-04 found:
1. Every screen is dark grey plus one teal, so color means nothing.
2. A new diary page is nearly empty (tiny icon, two lines, a button), and it's the first thing people see after signing in.
3. Notes, Goals and Reminders are plain text cards with grey tags.
4. Health is a form (number boxes and buttons), not a picture of how you're doing.
5. The landing page shows a headline and a sign-in form, never the product.

The 2nd Brain is already fixed: diary pages are glowing memory orbs whose blended colors show what's inside (shipped 2026-11-04, `lib/echo/orbs.ts`, `components/echo/memory-orb.tsx`). This project carries that **orb color language** to the rest of the app, so color means the same thing everywhere and the 2nd Brain becomes where it all comes together.

Success: the professor opens Echo and sees color with meaning on every screen, a living first screen, a Health page that's a picture, and a landing page that shows what Echo is.

## Color language (binding)
Same meanings as the orbs (`ORB_COLOR` in `lib/echo/orbs.ts` is the single source):

| Kind | Color | Meaning |
|---|---|---|
| note | `#60a5fa` blue | Thoughts you wrote down |
| goal | `#fbbf24` gold | Goals you're chasing |
| reminder | `#fb923c` amber | Things to do |
| health | `#34d399` green | Body and mood |
| person | `#f472b6` rose | People in your life |
| interest | `#a78bfa` violet | Interests and topics |

Health-page fills (user decision): **water is aqua `#38bdf8`**, so it isn't confused with notes blue. Calories are amber-to-gold (`#c2410c` → `#fbbf24`), reading as energy. Echo's brand teal (`--color-primary`) stays for actions (buttons, focus, links); it isn't a content color.

## Part 1 — Glow cards (user picked "B · Glow")
Applies to Notes, Goals and Reminders cards, the Today panel/drawer items (`home-panels.tsx`), and the save tags under Echo's chat replies.
- Each card gets a **small glowing orb** (about 12–14 px) in its kind's color, with a shine highlight and a soft glow, at the start of the title row. Reuse `OrbSwatch` / `orbSwatchStyle` from `memory-orb.tsx` with a single-kind count.
- Each card gets **soft colored light from the top-right corner** (a radial gradient of the kind color at about 20% strength fading to transparent) and a border tinted with the kind color (about 30%).
- Tags are tinted with their meaning: a "Note" tag is blue, and a tag naming a person known as a `person` memory is rose. Other tags keep today's neutral style.
- **Goals:** a circular **progress ring** in gold, with a faint glow, showing `progress`, beside the title. Due date and percent go in the subtitle.
- **Reminders:** a **time chip** (clock icon plus local time, e.g. "3:00 PM") tinted amber. Overdue chips use the app's danger color, done reminders a muted look.
- **Chat save tags** (Note / Health / Reminder… under Echo's replies) use the same tinted colors.
- Mockup reference: `.superpowers/brainstorm/3029-1793800464/content/cards-color.html`, option B.

## Part 2 — "Today's orb" on a new page (user picked "A")
Replaces the empty state of a diary page that has no user messages yet (the "Good evening, … Talk to Echo" block in `components/echo/home.tsx`).
- A **big glowing orb** (about 110–140 px) for *today's page*, centered. Empty, it's a softly **breathing pearl** (`PEARL`, slow scale/glow pulse). As things get saved on the page (its `mix` and memories, the same data as the 2nd Brain orb), it **fills with those colors**, rendered with `MemoryOrb` at large size.
- Below it: the greeting (existing "Good evening, Peter." logic), then one line: "This is today's orb. It fills with color as you tell me about your day."
- **Quick-start chips:** "How was your day?" (puts that text in the composer, or sends it), "💧 Log water" (logs +1 glass through the existing health helper and shows the save), "🎯 Set a goal" (puts "I want to…" in the composer). The builder can pick the exact chip actions, as long as each does something visible and immediate.
- The existing **Talk to Echo** call button stays, below the chips.
- Reduced motion: no breathing.
- Mockup: `content/new-page.html`, option A.

## Part 3 — Health as a picture (user picked "A · two bodies")
Top of the Health view (`components/echo/health-view.tsx`), Today period:
- **Two faceless male body silhouettes side by side** (simple, smooth, gender-typical male proportions, no face or features), each about 220–280 px tall on desktop and smaller on mobile.
  - **Water body:** fills from the feet up with aqua liquid (a gradient from a deep blue `#1d4ed8` up to aqua `#38bdf8`) with a gently moving **wave** at the surface. Level = glasses / 8 (8 glasses is the daily target; no setting exists today). At 8+, it's full with a soft glow.
  - **Calories body:** fills with the amber-to-gold gradient. Level = today's kcal / `calorieGoal`. **Over the goal:** full, and the top glows red-orange (not a reward look). **No goal set:** show today's total with the body partly lit by a neutral rule (builder's call; e.g. scaled to 2,000 kcal) plus a "Set a goal" link to Settings. **Calories turned off** (`caloriesEnabled === false`): only the water body shows.
  - **Numbers beside the bodies**, smaller than the picture: "5 / 8 glasses · 3 to go" and "1,350 of 2,000 kcal · 650 left" (or "· 200 over").
  - When a value changes (a tap, or saved from chat or a call), the fill **animates up** to the new level (about 600–900 ms, eased). Reduced motion: instant, no wave.
  - Accessible: each body has a text label with the same numbers (`role="img"` + `aria-label`).
  - The existing +/− water controls and "Add meal" stay reachable, placed near their body.
- **Mood, sleep, energy** become visual instead of form-like:
  - Mood: a row of glowing feeling chips (the existing 7 moods), with the selected one glowing.
  - Sleep: a moon-shaped arc that fills to hours slept out of 8 h, keeping an accessible editor for hours/minutes.
  - Energy: a 3-step glowing bar (low / medium / high).
- **This week / This month:** the bodies show the **average day**, plus a **strip of mini-bodies**, one per day, each filled to that day's water (and calories, when enabled). Existing week charts can stay below.
- Mockup: `content/health-body.html`, option A.

## Part 4 — Landing with floating memory orbs (user picked "A")
`components/echo/landing.tsx` hero:
- The headline "A diary that speaks back." with one line of copy (e.g. "Talk about your day. Echo remembers it, and every day becomes a glowing memory.") and two buttons: **Start talking to Echo** (primary) and **Sign in**.
- The **sign-in/create-account card moves into a dialog** opened by those buttons (both modes, Google sign-in, forgot password: the existing `AuthCard` content). The current always-visible form leaves the hero.
- Beside the headline: **4–6 floating glowing memory orbs** of different sizes and color mixes (rendered with `MemoryOrb` from fixed sample data), joined by faint colored threads and drifting gently. Reduced motion: still.
- Mobile: orbs sit above or behind the headline at reduced size; the buttons stay at the top of the screen.
- The landing's existing small graph illustration (`BrainMock`, old dot style) is replaced with orbs.
- Mockup: `content/landing.html`, option A.

## Goals
- Color carries the same meaning on every screen (cards, tags, Today panel, Health, landing, 2nd Brain).
- A new page, Health and the landing each have a visual centerpiece.

## Non-goals
- No new data, features or AI behavior. Exception: the new-page chips and Health bodies call existing helpers.
- No light theme.
- No changes to the 2nd Brain orbs beyond reusing their components.
- No water-goal setting (8 glasses stays fixed).

## Anti-goals
- Rainbow noise: color used without meaning, or brand teal used for content kinds.
- Busy, cluttered cards. The glow is soft; text stays readable (WCAG AA contrast for text).
- Janky animation, or animation that ignores `prefers-reduced-motion`.
- Anything that copies Inside Out's art or characters; we borrow only the idea of glowing memory orbs.

## Constraints
- Next.js 16 / React 19 / TypeScript / Tailwind 4 / existing `components/echo/ui` primitives. Read `node_modules/next/dist/docs/` before using a Next API you're unsure of (AGENTS.md).
- Dark theme only. Mobile-first layouts must keep working (existing sheets, tab bar, 44 px touch targets).
- Reuse `ORB_COLOR`, `PEARL`, `MemoryOrb`, `OrbSwatch` / `orbSwatchStyle`; add the aqua water color in one place.
- Keep all existing behaviors and tests passing; add tests for new pure logic (fill levels, over-goal state, week averages, tag-to-color mapping).

## Order (controller's call)
1. Part 1 Glow cards + the shared color helpers (the foundation the rest reuses).
2. Part 2 Today's orb.
3. Part 3 Health bodies.
4. Part 4 Landing.
Each part ships on its own and is visible on its own.

## Answers to the builder check (controller's calls unless marked)
- **Today's orb data (Part 2):** `home.tsx` loads only the top 40 memories and no page `mix`. Add a small hook that listens to the current page doc (`diaryPagesCol(uid)/pageId`, for `mix`/`messageCount`) and to `memoriesCol(uid)` with `where('pages', 'array-contains', pageId)`, then builds the orb with `buildOrbs`. A new page may not have a Firestore doc yet (pages are created lazily), so show a synthetic empty pearl orb until it does. *(Answered from the code.)*
- **Chip actions (Part 2):** "How was your day?" **sends** that message. "🎯 Set a goal" **fills** the composer with "I want to " and focuses it. "💧 Log water" adds +1 glass to today's health log through the existing `upsertHealthLog` / `saveHealthChanges` path (extract a tiny `addWaterGlass(uid, day)` helper if needed; that's not new data) and shows a short confirmation. The welcome block (greeting, chips) stays until the **first user message**, and the orb is visible the whole time on an empty page.
- **Rose person tags (Part 1):** a tag is rose when it matches, case-insensitively and exactly after trimming, the `label` of a `person` memory. The Notes view adds one memories listener (`where('type','==','person')`). Elsewhere (Goals, Reminders, chat tags, Today panel), if person data isn't already loaded, tags keep the card's kind tint. Don't plumb memories through everything.
- **Week/month (Part 3):** days with no log are **skipped** in the average (the average is over logged days; with no logged days, show empty bodies plus "No logs yet"). In the strip, a day with no log is an empty outline body. Week = 7 mini-bodies in a row. Month = a horizontally scrollable strip on mobile, wrapping rows on desktop.
- **Health data (Part 3):** `health-view.tsx` already holds today's log (`waterGlasses`), the meals in range and the calorie settings (`watchCalorieSettings`), and these update live from Firestore, so saves from chat or calls animate the fill without extra wiring. *(Answered from the code.)*
- **Landing dialog (Part 4):** "Start talking to Echo" opens the dialog in **create-account** mode, and "Sign in" in **sign-in** mode. Use the existing `Sheet` component (`components/echo/sheet.tsx`, already a focus-trapped `role="dialog"`) around the existing `AuthCard`. Keep its redirect and error handling unchanged.
- **Contrast:** WCAG AA applies to all text, including time chips and tinted tags. The builder adjusts tint strength to pass.

## Left to the builder
The exact silhouette path, glow strengths, animation timings, chip actions within the stated intent, the no-goal calorie rule, and mobile placement details.

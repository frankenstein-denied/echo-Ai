# Echo — a diary that speaks back

Echo is an AI companion app (installable web app + Android). You type or talk to it; it replies and quietly saves what matters: notes, goals, reminders, health, meals. It also builds a "2nd Brain" map of your life.

- **Repository:** https://github.com/frankenstein-denied/echo-Ai
- **Project board:** Kaneo (the board links back to this repository)
- **Framework:** Scrum

## Team

| Full name | Scrum role(s) |
|---|---|
| Peter Paul Poloan | Product Owner, Scrum Master, Development Team (developer, tester, documentation) |

This group has one member, who holds every Scrum role. Details: [`docs/scrum.md`](docs/scrum.md).

## Folder structure

| Folder | What it holds |
|---|---|
| `app/`, `components/`, `lib/` | **Source code**: the Next.js app (pages, API routes), UI components, and app logic |
| `android/`, `mobile-shell/` | **Source code**: the Android app (Capacitor shell + native Kotlin) |
| `engine/` | **Source code**: the Echo Legacy engine (CS 413 project): diary model, entry types, pure pipeline, hash chain, policy lexer, Prolog bridge |
| `prolog/` | **Prolog rules**: the Legacy engine's access rules (deny by default, deny beats allow) |
| `grammar/` | **Grammar**: the Legacy Policy language in EBNF, with sample programs |
| `tests/` | **Tests**: engine tests (`tests/engine/`), fictional test data (`tests/fixtures/`). App unit tests sit next to their code as `lib/**/*.test.ts` |
| `project-docs/` | **Project documents** (CS 413): proposal, technology decision, UML, wireframes, test plan, AI-use log, AI design note, grammar. Start at [`project-docs/README.md`](project-docs/README.md) |
| `docs/` | **Docs**: Scrum process, design specs and implementation plans |
| `documentation/` | Architecture diagram, tech-stack guide, presentation |
| `reports/` | **Reports**: sprint reports and the report template |
| `scripts/` | Build and release scripts |
| `public/` | Static files (icons, service worker) |

## Getting started

Needs Node.js 24 and pnpm. Nothing else: the Prolog rules run inside Node through [tau-prolog](http://tau-prolog.org/), which `pnpm install` brings in.

```bash
git clone https://github.com/frankenstein-denied/echo-Ai.git
cd echo-Ai
pnpm install
pnpm test           # every test: app + Legacy engine (Vitest) — one command
pnpm engine:demo    # small program: TypeScript asks the Prolog access rules about Maria
pnpm dev            # app at http://localhost:3000
```

If `pnpm` is not found, use `corepack pnpm` (Corepack ships with Node).

The app needs Firebase and Gemini keys in `.env.local`. Never commit that file.

## Branching convention

- `main` is always releasable, and Vercel deploys it. Nobody commits work straight to `main`.
- Every change gets its own short-lived branch from the latest `main`:

  | Prefix | Use for | Example |
  |---|---|---|
  | `feat/` | a new feature | `feat/goal-subgoals` |
  | `fix/` | a bug fix | `fix/diary-bigger-mic` |
  | `docs/` | documentation only | `docs/repo-setup` |
  | `test/` | tests only | `test/prolog-grammar` |
  | `refactor/` | code change with no behaviour change | `refactor/sanitize-actions` |
  | `chore/` | tooling, dependencies, config | `chore/bump-next` |

- Branch names are lower case, with words joined by hyphens. Add the Kaneo task number when there is one: `feat/12-weather-card`.
- Before merging: tests pass (`pnpm test`), the type check passes (`pnpm exec tsc --noEmit`), and the change is reviewed (pull request on GitHub).
- Merge with a merge commit (`git merge --no-ff`, message `Merge <branch>: <what it does>`), then delete the branch.
- Android releases are tagged `android-v<versionCode>` (see `scripts/release-android.sh`).

## Commit message convention

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

<optional body: what changed and why>
```

- **type:** `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `perf`, `chore`.
- **scope:** the area touched, e.g. `goals`, `chathead`, `grammar`, `prolog`, `android`.
- **summary:** imperative mood, lower case, no full stop, 72 characters or fewer. Write "add", not "added".
- One logical change per commit. Mention the Kaneo task in the body when there is one (`Kaneo: #12`).

Examples:

```
feat(goals): progress from sub-goals (min 2) or done/not done
fix(chathead): keep the bubble above the keyboard
docs(readme): add branching and commit conventions
test(grammar): cover reminders with am/pm times
```

## Definition of Done

A Kaneo task is done when:
- its acceptance criteria are met;
- tests are written and passing;
- it is merged into `main`;
- the docs are updated.

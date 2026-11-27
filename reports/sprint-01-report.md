# Sprint 1 report: shared repository setup

| | |
|---|---|
| **Sprint goal** | Create the shared repository that holds the source code, grammar, Prolog rules, tests and reports |
| **Product Owner** | Peter Paul Poloan |
| **Scrum Master** | Peter Paul Poloan |
| **Development Team** | Peter Paul Poloan |

## Sprint backlog

| User story | Status |
|---|---|
| As the team, we want one shared repository with a clear folder structure, branching and commit conventions, and a README that lists the team, so everyone works the same way. | Done |

## Acceptance

| Criterion | Result |
|---|---|
| A repository exists and every member can clone, commit and push. | Met: https://github.com/frankenstein-denied/echo-Ai. The team's only member owns it and pushes to it. |
| Folders exist for source code, Prolog rules, grammar, tests, docs and reports. | Met: source code in `app/`, `components/`, `lib/`, `android/`; plus `prolog/`, `grammar/`, `tests/`, `docs/` and `reports/`. |
| A branching and commit message convention is written in the README. | Met: README, sections "Branching convention" and "Commit message convention". |
| The README lists the complete and correct names of all members. | Met: README, "Team" section. The group has one member, who holds every Scrum role. |
| The repository link is added to the Kaneo project. | Done by the Product Owner on the Kaneo board. |

## Increment

- README rewritten: team and roles, folder guide, getting started, branching convention, commit convention, Definition of Done.
- `prolog/echo_rules.pl`: Echo's goal-progress, check-in, delete-safety and lookup rules.
- `grammar/echo-commands.ebnf` and `grammar/echo_commands.pl`: the command grammar, as EBNF and as a Prolog DCG.
- `tests/prolog/`: plunit tests for the rules and the grammar (`pnpm test:prolog`).
- `docs/scrum.md`: roles, artifacts, events and board workflow.
- `reports/`: this report and the sprint report template.

## Retrospective

- **Went well:** the folders map directly onto the course deliverables.
- **To improve:** run the Prolog tests in CI, not only on a laptop.
- **Action for next sprint:** add a GitHub Actions job that runs `pnpm test` and `pnpm test:prolog` on every pull request.

> Later change (2026-11-28): the placeholder Echo-command Prolog and grammar files listed above were replaced by the Legacy engine's access rules and policy grammar; see sprint-02-report.md.

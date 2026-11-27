# Scrum process

Echo is built with Scrum. The team has one member, so the same person holds every role.

## Roles

| Role | Member | Responsibilities |
|---|---|---|
| Product Owner | Peter Paul Poloan | Owns and orders the product backlog in Kaneo, writes user stories and acceptance criteria, accepts finished work |
| Scrum Master | Peter Paul Poloan | Runs the Scrum events, keeps the board current, removes blockers |
| Development Team | Peter Paul Poloan | Designs, builds, tests and documents each backlog item |

## Artifacts

- **Product backlog:** user stories in the Kaneo project, ordered by value.
- **Sprint backlog:** the stories chosen for the current sprint (Kaneo sprint column).
- **Increment:** what is merged into `main` and released (web on Vercel, APK on GitHub Releases).

## Events

| Event | When | Output |
|---|---|---|
| Sprint planning | First day of each sprint | Sprint goal + sprint backlog |
| Daily scrum | Every working day, 15 min | Board updated: done, next, blockers |
| Sprint review | Last day of the sprint | Demo of the increment; backlog updated |
| Sprint retrospective | After the review | One or two improvements for the next sprint |

Sprints last two weeks. Each sprint gets a report in [`reports/`](../reports/), written from [`reports/templates/sprint-report-template.md`](../reports/templates/sprint-report-template.md).

## Workflow on the board

`Backlog → To do (sprint) → In progress → In review → Done`

A card moves to **Done** only when it meets the Definition of Done in the [README](../README.md#definition-of-done).

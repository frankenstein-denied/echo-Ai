# Sprint 2 report: Echo Legacy engine — design documents and first components

| | |
|---|---|
| **Sprint date** | 2026-11-28 |
| **Sprint goal** | Finalize the requirements and design of the Echo Legacy engine (CS 413 final project) and build its first tested components |
| **Product Owner** | Peter Paul Poloan |
| **Scrum Master** | Peter Paul Poloan |
| **Development Team** | Peter Paul Poloan |

## Sprint backlog

| Kaneo task | User story | Points | Status |
|---|---|---|---|
| 1.03 | Project proposal and finalized requirements | 5 | Done (team approval pending) |
| 1.04 | Technology decision + Prolog demo program | 3 | Done |
| 1.05 | UML: use case, sequence, class diagrams | 8 | Done (team review pending) |
| 1.06 | Wireframes and user flow | 5 | Done (FE/BE check pending) |
| 1.07 | Test plan, fictional data, access test table | 5 | Done |
| 1.08 | AI-use log and AI design note | 3 | Done (log rows to verify) |
| 2.01 | Policy grammar in EBNF with samples | 5 | Done (team agreement pending) |
| 2.02 | OO classes: Owner, Beneficiary, Vault, Protocol, Grant | 5 | Done (review pending) |
| 2.03 | Entry base class and two entry types | 5 | Done |
| 2.04 | Pure entry pipeline | 5 | Done |
| 2.05 | Append-only hash chain with TamperDetected | 5 | Done |
| 2.10 | Pipeline and hash chain tests | 3 | Done |
| 2.11 | Policy lexer | 5 | Done (review pending) |
| | **Total** | **62** | |

## Increment

All of this is on branch `feat/legacy-engine`; the documents are indexed in [`project-docs/README.md`](../project-docs/README.md).

- **Documents:** proposal, technology decision, UML (3 draw.io files, 5 diagrams), 9 wireframes with a user flow (SVG and PNG), test plan, access test table, AI-use log, AI design note, policy grammar write-up.
- **Code:** `engine/src/`:
  - `entries/`: Entry, DiaryEntry, LetterOfWishes;
  - `model/`: Owner, Beneficiary, Vault, Protocol, Grant;
  - `pipeline/`: normalize, extract, correct, diff;
  - `chain/`: hash chain;
  - `policy/`: lexer;
  - `prolog/`: tau-prolog bridge;
  - `errors.ts`: the typed exceptions.
- **Rules and grammar:** `prolog/access_rules.pl` (starter rules), `grammar/policy.ebnf` with four sample programs.
- **Demo:** `pnpm engine:demo`, in which TypeScript asks the Prolog rules about Maria.

## Acceptance

Most criteria are met in the repository. These need the team (the Product Owner) to finish:
- **Kaneo links:** add the Kaneo link for every deliverable (1.03, 1.04, 1.06, 1.07, 1.08, 2.01). Links are listed in `project-docs/README.md`.
- **Reviews and approvals:**
  - approve the proposal (1.03);
  - review the diagrams (1.05);
  - agree on the grammar's meaning (2.01);
  - confirm the wireframes can be built (1.06);
  - review the code before merging (2.02, 2.11).
- **Instructor link:** share the diagrams with the instructor through the GitHub folder link (1.05, 1.06).
- **Failed tests as bugs:** log any failed test as a Kaneo bug (2.10). None are failing now.
- **AI-use log:** check each row marked "pending review" and remove the marker (1.08).

## Tests

| Command | Result |
|---|---|
| `pnpm test` (whole repository) | 104 files, **1,264 tests passed** |
| `npx vitest run tests/engine` (engine only) | 8 files, **89 tests passed** |
| `pnpm exec tsc --noEmit` | No type errors |
| `pnpm engine:demo` | `e1 existence: yes` · `e3 summary: no` · `may summarise: e1, e2` |

## Change from Sprint 1

The Sprint 1 placeholders are gone. The Prolog rules and grammar for Echo's chat commands (`prolog/echo_rules.pl`, `grammar/echo_commands.pl`, `grammar/echo-commands.ebnf`, `tests/prolog/`) did not match the course handout, so they were removed. The engine's access rules and the Legacy Policy grammar replace them.

## Retrospective

- **Went well:**
  - Every code component was written test-first.
  - The handout's six Maria scenarios already pass at the vault level.
  - Running Prolog inside Node removed the "install Prolog" step for everyone.
- **To improve:**
  - Diagrams were checked by geometry only. They still need a visual pass in draw.io.
  - AI-use log rows need the team's verification.
- **Action for next sprint:**
  - recursive-descent parser and interpreter;
  - full Prolog rules (release dates, death trigger, frozen policy);
  - writing-mode classes;
  - the grounded Q&A script;
  - a CI job that runs `pnpm test` on every pull request.

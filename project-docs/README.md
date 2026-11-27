# Project documents — Echo Legacy (CS 413)

**Project:** Echo — a personal AI diary with a Legacy policy
**Course:** CS 413 Programming Languages, final project
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

Every project document is in this folder. The code lives in [`engine/`](../engine/), [`prolog/`](../prolog/), [`grammar/`](../grammar/) and [`tests/`](../tests/).

| Ticket | Deliverable | File | Status | Kaneo link |
|---|---|---|---|---|
| 1.03 | Project proposal and requirements | [`01-project-proposal.md`](01-project-proposal.md) | Done — awaiting team approval | add |
| 1.04 | Technology decision | [`02-technology-decision.md`](02-technology-decision.md) | Done | add |
| 1.04 | Small program calling a Prolog rule | [`engine/demo.ts`](../engine/demo.ts) (`pnpm engine:demo`) | Done | add |
| 1.05 | Use case diagram | [`03-uml/use-case-diagram.drawio`](03-uml/use-case-diagram.drawio) | Done — awaiting team review | add |
| 1.05 | Sequence diagrams (3 pages) | [`03-uml/sequence-diagrams.drawio`](03-uml/sequence-diagrams.drawio) | Done — awaiting team review | add |
| 1.05 | Class diagram | [`03-uml/class-diagram.drawio`](03-uml/class-diagram.drawio) | Done — awaiting team review | add |
| 1.06 | Wireframes and user flow | [`04-wireframes/`](04-wireframes/) | Done — awaiting FE/BE check | add |
| 1.07 | Test plan | [`05-test-plan.md`](05-test-plan.md) | Done | add |
| 1.07 | Access test table | [`05-access-test-table.csv`](05-access-test-table.csv) | Done | add |
| 1.07 | Fictional owner and entries | [`tests/fixtures/ramon-owner.json`](../tests/fixtures/ramon-owner.json) | Done | add |
| 1.08 | AI-use log | [`06-ai-use-log.md`](06-ai-use-log.md) | Started — rows marked "pending review" | add |
| 1.08 | AI design note | [`07-ai-design-note.md`](07-ai-design-note.md) | First version | add |
| 2.01 | Policy grammar (EBNF, samples, derivations) | [`08-policy-grammar.md`](08-policy-grammar.md), [`grammar/policy.ebnf`](../grammar/policy.ebnf) | Done — awaiting team agreement | add |
| 2.02–2.05, 2.10, 2.11 | Code and tests | [`engine/src/`](../engine/src/), [`tests/engine/`](../tests/engine/) | Done — awaiting review | add |

## How to open the files

- **`.md`** files read directly on GitHub or in any editor.
- **`.drawio`** files open in [draw.io / diagrams.net](https://app.diagrams.net/) (File → Open from → Device) or in the VS Code "Draw.io Integration" extension.
- **`.svg`** wireframes can be dragged straight into Figma (see [`04-wireframes/README.md`](04-wireframes/README.md)); PNG previews are in `04-wireframes/previews/`.
- **`.csv`** opens in Excel or Google Sheets.

**To share with the instructor:** use the GitHub link to this folder:

https://github.com/frankenstein-denied/echo-Ai/tree/main/project-docs

**How to check the code:** run `pnpm install` and then `pnpm test`.

**Fictional data:** every person, business and diary entry in these documents and in the test data is invented.

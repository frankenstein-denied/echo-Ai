# 06 — AI-use log

**Project:** Echo — a personal AI diary with a Legacy policy · CS 413 Programming Languages, final project
**Ticket:** 1.08 (owner: Documentator lead, Back End)
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

The course allows AI coding assistants **with accountability**. This log records every AI-assisted part of the project:
- what we asked;
- what came back;
- what we changed or rejected;
- who verified it.

Every member must be able to explain and defend any AI-assisted code.

## How to add a row

1. Add a row at the bottom of the table, with the next number.
2. **Date:** the day of the AI session (YYYY-MM-DD).
3. **Part:** the ticket number and the file or component.
4. **Prompt:** what you asked, in a sentence or two. Quote the key words.
5. **Response:** what the AI produced: the files, functions or text.
6. **Changes or rejections:** what you changed, what you threw away and why, and which mistakes you caught.
7. **Verified by:** the full name of the member who checked it, and how (tests run, read line by line, compared with the handout).
   - If nobody has checked it yet, write the name followed by **(pending review)**.
   - Remove "(pending review)" only after you have actually checked it.
8. Commit the log together with the work it describes.

## Log

| # | Date | Part | Prompt (what was asked) | Response (what came back) | Changes or rejections | Verified by |
|---|---|---|---|---|---|---|
| 1 | 2026-10-24 → 2026-11-25 | Whole Echo app (before this course project) | The Echo app (web and Android) was built with an AI coding assistant, **Claude Code** (Anthropic), feature by feature from the owner's requests. | Code, tests, specs and plans for the app. In the git history, 324 of 329 commits carry a `Co-Authored-By: Claude` line, which marks them as AI-assisted. | The owner chose every feature, reviewed each change, and tested the live app; bugs were reported and fixed in later commits. The full record is the git history. | Peter Paul Poloan (owner review and live-app testing) |
| 2 | 2026-11-28 | Repo setup ticket: README, folders | Pasted the "create the shared repository" ticket: "make sure my repo has these". | A README with team, folder guide, branching and commit conventions; `docs/scrum.md`; a Sprint 1 report. It also added Prolog rules and a grammar **for Echo's chat commands** as folder content, with plunit tests. | The AI guessed the owner's full name from the Git username and asked for it to be confirmed. It could not run the Prolog tests: installing SWI-Prolog was not allowed. The Echo-command Prolog and grammar files were **later rejected and removed**: they did not match the course handout (see row 7). | Peter Paul Poloan (pending review) |
| 3 | 2026-11-28 | Process | "I am dropping bulk tasks from my ticket board, what skills should I call?" | A suggested order of work: plan → isolate → build test-first → verify → review → merge. | Used as given. | Peter Paul Poloan |
| 4 | 2026-11-28 | Tickets 1.03–1.08, 2.01–2.05, 2.10, 2.11: scoping | Pasted the 13 tickets. Asked for documents in one folder, Figma-ready prototypes based on the real system, draw.io diagrams, and a check for existing diagrams. | The AI found that the four UML diagrams on the owner's desktop belong to a different project (SCRIBE), and that Echo had only an architecture diagram. It asked for the course handout before writing anything, then offered two ways to build. | **Correction by the owner:** do not use the course handout's project name; call the system Echo. The owner picked "a separate engine inside the repo" over wiring it into the live app. For this log, the owner picked an honest summary plus detailed rows. | Peter Paul Poloan |
| 5 | 2026-11-28 | Design and plan (`docs/superpowers/specs/2026-11-28-echo-legacy-engine-design.md`, `docs/superpowers/plans/2026-11-28-echo-legacy-engine.md`) | Write the design, have it checked, then a step-by-step plan. | A design doc, reviewed by a second AI agent acting as "a builder who must plan from it". It raised 3 questions, and a 12-task plan followed. | From the review: all 13 tickets' acceptance criteria were copied into the design; the Sprint 1 report was **not** rewritten (a dated note points to Sprint 2 instead). The owner approved the design. | Peter Paul Poloan |
| 6 | 2026-11-28 | 2.03 Entry types (`engine/src/entries/`) | Build Entry, DiaryEntry and LetterOfWishes test-first. | Classes with private fields, polymorphic `describe()`, `summarize()` and `isReadableOn()`, plus 10 tests. | The AI found the plan's record format had no letter **title**, so a letter could not be rebuilt from its record; `title` was added. | Peter Paul Poloan (pending review) |
| 7 | 2026-11-28 | 2.05 Hash chain (`engine/src/chain/hash-chain.ts`) | Build the append-only chain with `TamperDetected` test-first. | SHA-256 chain, `verifyChain()` naming the first broken link, and 13 tests (changed, removed, reordered, re-hashed, renumbered entries). | One extra tamper case beyond the plan was added: a deleted entry with the indexes renumbered. | Peter Paul Poloan (pending review) |
| 8 | 2026-11-28 | 2.04 Pipeline (`engine/src/pipeline/`) | Build normalize, extract, correct and diff as pure functions, test-first. | Four pure functions plus `processEntryText`, with 18 tests. | The plan said to remove doubled words before fixing misspellings. The plan's own test ("teh the" → "the") needed the opposite order, so the order was swapped. | Peter Paul Poloan (pending review) |
| 9 | 2026-11-28 | 2.02 Diary model (`engine/src/model/`) | Build Owner, Beneficiary, Vault, Protocol, Grant with an encapsulated vault, test-first. | Classes with `#private` fields, deny by default, deny beats allow, release dates, `AmbiguousName` and `PolicyFrozen`, plus 16 tests. | Kept as planned. | Peter Paul Poloan (pending review) |
| 10 | 2026-11-28 | 2.01 Grammar and 2.11 Lexer (`grammar/`, `engine/src/policy/`) | Write the EBNF from the handout's sample, three samples, and the lexer with line and column. | `policy.ebnf` with five statement types; four sample programs; the lexer; 11 tests; and the grammar write-up (`08-policy-grammar.md`). | **AI mistake caught:** the first test expected wrong column numbers for two tokens (33 and 54). They were measured from the file and corrected to 39 and 56. The full-read clause was changed to `may read <selector>` (no "of") so it reads naturally. | Peter Paul Poloan (pending review) |
| 11 | 2026-11-28 | 1.04 Prolog bridge and demo (`prolog/access_rules.pl`, `engine/src/prolog/bridge.ts`, `engine/demo.ts`) | Call a Prolog rule from TypeScript on every machine. | Starter rules (deny by default, deny beats allow), a tau-prolog bridge, 8 tests, and the demo. | tau-prolog was chosen **because installing SWI-Prolog was blocked** in the AI session. It runs inside Node, so every machine gets it with `pnpm install`. Demo output checked by running it. | Peter Paul Poloan (pending review) |
| 12 | 2026-11-28 | 1.07 Test data and test plan (`tests/fixtures/ramon-owner.json`, `05-test-plan.md`, `05-access-test-table.csv`) | Invent an owner with about 20 entries and write the test plan and the access table. | 20 invented entries (Ramon Dela Cruz), 10 tests covering the handout's six Maria scenarios at vault level, the test plan, and an access table with 11 rows. | **AI mistake caught:** the plan said 4 entries were tagged health; counting the fixture gave 3, and it was corrected. | Peter Paul Poloan (pending review) |
| 13 | 2026-11-28 | 1.03, 1.04, 1.08 Documents (`01-project-proposal.md`, `02-technology-decision.md`, `07-ai-design-note.md`, this log) | Write the proposal, the technology decision, the AI design note and this log. | The four documents. | This log's rows were written only from what actually happened in the sessions; nothing was invented. | Peter Paul Poloan (pending review) |

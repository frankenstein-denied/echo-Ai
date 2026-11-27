# Kaneo guide: what was done per ticket, and what to submit

**Project:** Echo — a personal AI diary with a Legacy policy · CS 413 Programming Languages, final project
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
**Last updated:** 2026-11-28 (main at `0c9e87c`)

Use this file three ways:

1. **Kaneo:** for each ticket, paste the links from its **Submit / link in Kaneo** box.
2. **Study:** read each ticket's **What was done** and **Be ready to explain** before the defense.
3. **Checklist:** the ☐ boxes are the parts only you can do: approvals, reviews and Kaneo links.

Every link below works now because `main` is pushed. The base address is:

`https://github.com/frankenstein-denied/echo-Ai/blob/main/` (files) · `https://github.com/frankenstein-denied/echo-Ai/tree/main/` (folders)

---

## Contents

| Ticket | Title | Status |
|---|---|---|
| [Repo](#repo-setup--shared-repository) | Shared repository, folders, conventions, team README | Done |
| [1.03](#103--project-proposal-and-requirements) | Project proposal and requirements | Done — your approval pending |
| [1.04](#104--technology-decision) | Technology decision + small Prolog program | Done |
| [1.05](#105--uml-diagrams) | UML diagrams | Done — your review pending |
| [1.06](#106--wireframes-and-user-flow) | Wireframes and user flow | Done — your FE/BE check pending |
| [1.07](#107--test-plan-and-test-data) | Test plan, fictional data, access test table | Done |
| [1.08](#108--ai-use-log-and-ai-design-note) | AI-use log and AI design note | Done — log rows to verify |
| [2.01](#201--policy-grammar-ebnf) | Policy grammar (EBNF) | Done — your agreement pending |
| [2.02](#202--oo-classes-owner-beneficiary-vault-protocol-grant) | OO classes: Owner, Beneficiary, Vault, Protocol, Grant | Done — your review pending |
| [2.03](#203--entry-types) | Entry base class and entry types | Done |
| [2.04](#204--pure-entry-pipeline) | Pure entry pipeline | Done |
| [2.05](#205--append-only-hash-chain) | Append-only hash chain | Done |
| [2.10](#210--pipeline-and-hash-chain-tests) | Pipeline and hash chain tests | Done |
| [2.11](#211--policy-lexer) | Policy lexer | Done — your review pending |
| [2.06 / 2.07](#206--207--prolog-facts-and-first-access-rules) | Prolog facts and first access rules | Done (2.07 has the same text as 2.06) |
| [2.09](#209--high-fidelity-screens-style-guide-error-messages) | High-fidelity screens, style guide, error messages | Done — share with FE |
| [2.12](#212--lexer-tests) | Lexer tests | Done |
| [Not started](#tickets-not-started-yet) | 1.09, 2.08 | Waiting on you |

---

## Before anything: commands you must be able to run

```bash
corepack pnpm install      # once; pnpm is not on your PATH, so always prefix with corepack
corepack pnpm test         # every test, one command (1,315 tests; 140 are the engine's)
corepack pnpm engine:demo  # TypeScript asks the Prolog rules about Maria
```

The demo prints:

```
Can Maria see entry e1 (existence)? yes
Can Maria read summary of e3 (business)? no
Entries Maria may summarise: e1, e2
```

## The big picture (memorize this)

The handout requires six components, each in a different **paradigm**:

| Component | Paradigm | Where it is | Built? |
|---|---|---|---|
| Diary model | Object-oriented | `engine/src/model/`, `engine/src/entries/` | ✔ |
| Entry processing | Functional | `engine/src/pipeline/`, `engine/src/chain/` | ✔ |
| Writing modes | Object-oriented | (planned) | — |
| Access rules | Logic (Prolog) | `prolog/access_rules.pl` | Facts + three levels ✔; release dates, death trigger planned |
| Legacy Policy language | Language design | `grammar/policy.ebnf`, `engine/src/policy/lexer.ts` | Grammar + lexer ✔; parser, interpreter planned |
| Grounded AI Q&A | Scripting | (planned) | — |

**The fictional test owner:**

| Person | Who they are |
|---|---|
| **Ramon Dela Cruz** | The owner |
| **Maria** | His daughter, the main asker |
| **Adam Jr.** | His son |
| **Lito Santos** | The trustee |
| **Carmen** | His late wife (mentioned in entries only) |

Ramon has **20 invented entries**, plus one Letter of Wishes "To my daughter" that opens on **2040-05-01**. File: `tests/fixtures/ramon-owner.json`.

**The access rules in one breath:**
- Nothing is shown by default (**deny by default**).
- A grant gives its level and the weaker ones: **existence < summary < full**.
- A deny hides its level and every stronger one, and **deny beats allow**.
- After the death trigger the policy is **frozen**.
- The vault answers only people the owner **registered**.
- A person with no access gets the **neutral reply**: "I don't have anything I can share about that."

---

## Repo setup — shared repository

**What it asked:** a shared repo with folders for source code, Prolog rules, grammar, tests, docs and reports; a branching and commit convention in the README; the full names of all members; the repo link in Kaneo.

**What was done:**
- **README:** team table (you in every role), folder guide, branching convention (`feat/`, `fix/`, `docs/`, `test/`… merged into `main`), Conventional Commits format, Definition of Done.
- **Folders:**

  | Content | Folder |
  |---|---|
  | Source code | `app/`, `components/`, `lib/`, `engine/` |
  | Prolog rules | `prolog/` |
  | Grammar | `grammar/` |
  | Tests | `tests/` |
  | Docs | `docs/`, `project-docs/` |
  | Reports | `reports/` |

- **Scrum process:** `docs/scrum.md`.

| Criterion | Evidence | Status |
|---|---|---|
| Repo exists; members can clone, commit, push | github.com/frankenstein-denied/echo-Ai — you own it and push to it | ✔ |
| Folders for source, Prolog, grammar, tests, docs, reports | See the folder table above | ✔ |
| Branching and commit convention in README | `README.md` → "Branching convention", "Commit message convention" | ✔ |
| Full, correct names of all members | `README.md` → "Team" (one member) | ✔ — check your full name is spelled right |
| Repo link added to Kaneo | — | ☐ **you** |

**Submit / link in Kaneo:**
- `https://github.com/frankenstein-denied/echo-Ai`
- `README.md`
- `docs/scrum.md`
- `reports/sprint-01-report.md`

**Be ready to explain:** why each change gets its own branch, what `feat(goals): …` means, and what your Definition of Done says.

---

## 1.03 — Project proposal and requirements

**What was done:** `project-docs/01-project-proposal.md` contains:
- problem, purpose and users (owner, registered askers, trustees);
- scope, with the six components and their paradigms;
- **34 functional requirements** (FR-1…FR-34), grouped by component, plus the AI's model, tools and instructions;
- **17 non-functional requirements** (NFR-1…NFR-17): security, privacy, AI honesty, reliability, usability;
- assumptions, out of scope, the not-a-legal-will disclaimer, and an approval table.

| Criterion | Evidence | Status |
|---|---|---|
| States purpose, users and scope | Sections 2, 3, 4 | ✔ |
| FRs cover all six components + AI model, tools, instructions | Section 5: C1–C6 and FR-31…FR-33 | ✔ |
| NFRs: security (deny by default), privacy, AI honesty, reliability | Section 6: NFR-1…NFR-15 | ✔ |
| Out-of-scope items and the disclaimer | Sections 8 and 9 | ✔ |
| Fictional data only; reviewed and approved by all members | Fictional note at the top; approval table in section 10 | ☐ **you** tick the approval |
| Stored in repo and linked in Kaneo | `project-docs/01-project-proposal.md` | ☐ **you** add the link |

**Submit / link in Kaneo:** `project-docs/01-project-proposal.md`

**Be ready to explain:**
- **What the death trigger is.** Echo's inactivity release: if the owner doesn't open Echo for the months they chose, the legacy is released and the policy freezes.
- **Why the AI speaks *about* the owner, never *as* him.** The handout's honesty rule.
- **The disclaimer, word for word:** "A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice."

---

## 1.04 — Technology decision

**What was done:**
- **The decision note** `project-docs/02-technology-decision.md` gives one reason per choice:
  - TypeScript for the OO and functional parts;
  - Prolog run by **tau-prolog** for the rules;
  - a hand-written lexer and parser for the policy language;
  - a plain JavaScript script for the Q&A (scripting);
  - Gemini as the AI model;
  - Next.js for the interface;
  - Vitest for tests.
- **The small program** `engine/demo.ts` loads `prolog/access_rules.pl` and asks a rule through `engine/src/prolog/bridge.ts`.
- **Dependencies** are listed in `package.json` (`tau-prolog`, `tsx`).

| Criterion | Evidence | Status |
|---|---|---|
| Decision note: each technology and why it fits its paradigm | `02-technology-decision.md` → "Why each choice fits" | ✔ |
| Small program runs on every machine and calls a Prolog rule from the main language | `corepack pnpm engine:demo` (output above); tau-prolog needs no Prolog install | ✔ |
| Dependencies listed in a repo file | `package.json`, `pnpm-lock.yaml` | ✔ |
| Note linked in Kaneo | — | ☐ **you** |

**Submit / link in Kaneo:**
- `project-docs/02-technology-decision.md`
- `engine/demo.ts`
- `engine/src/prolog/bridge.ts`
- `prolog/access_rules.pl`
- `package.json`

**Be ready to explain:**
- **"Why Prolog instead of if statements?"**
  - Rules are written as facts and rules.
  - Deny by default comes free from Prolog's closed world: what can't be proven is false.
  - "Deny beats allow" is one line: `can_see(A,L,E) :- allowed(A,L,E), \+ denied(A,L,E).`
- **Why tau-prolog:** it is a Prolog interpreter written in JavaScript. It runs inside Node, so `pnpm install` is the whole setup.

---

## 1.05 — UML diagrams

**What was done:** three draw.io files, generated by `scripts/project-docs/gen-uml.mjs`, in `project-docs/03-uml/`:

| File | Contents |
|---|---|
| `use-case-diagram.drawio` | Actors: Owner, Registered Asker, Trustee, Gemini, Clock (death trigger). Use cases with «include» and «extend». |
| `sequence-diagrams.drawio` | 3 pages: **Ask a question**, **Write an entry**, **Compile a policy**. Uses `alt` frames. |
| `class-diagram.drawio` | Every built class with its real fields and methods (+ public, - private, {static}, «abstract»); planned classes dashed and marked «planned»; inheritance, composition (◆), aggregation (◇), multiplicities, «use»/«throw» dependencies, exception hierarchy. |

| Criterion | Evidence | Status |
|---|---|---|
| Use case diagram with actors and interactions | `use-case-diagram.drawio` | ✔ |
| Sequence diagram for key processes | `sequence-diagrams.drawio` (3 processes) | ✔ |
| Class diagram: classes, attributes, methods, relationships | `class-diagram.drawio` — names match `engine/src` | ✔ |
| Consistent with the proposal | Same actors, components, exceptions as `01-project-proposal.md` | ✔ |
| Proper UML notation | UML shapes, stereotypes, multiplicities | ✔ — ☐ open them once in draw.io and tidy the layout |
| Reviewed and agreed by all members | — | ☐ **you** |
| Accessible through a shared link to the instructor | `https://github.com/frankenstein-denied/echo-Ai/tree/main/project-docs/03-uml` | ☐ **you** send it |

**Submit / link in Kaneo:** the folder `project-docs/03-uml/`. For a viewer link, open each file in app.diagrams.net (File → Open from → URL, paste the GitHub "raw" link) and share that.

**Be ready to explain:**
- the difference between «include» (always happens) and «extend» (sometimes happens);
- why Vault ◆— ChainLink is composition (links don't exist without their vault);
- what «planned» means: writing modes, parser, interpreter and the Q&A script come in later tickets.

---

## 1.06 — Wireframes and user flow

**What was done:** `project-docs/04-wireframes/` contains:
- 9 mobile screens (390 × 844) in Echo's real colours and layout, plus `user-flow.svg`;
- PNG previews in `previews/`;
- a README with the screen list, Figma steps and a buildability table.

**Screens:**

| Screen | What it shows |
|---|---|
| 01 | Sign in |
| 02 | Write entry: writing-mode picker and a preview of the fixes |
| 03 | Entry list: dates, tags, sealed letter, "Chain verified" |
| 04 | Policy editor: syntax error at line 3, column 7, and the disclaimer |
| 05 | Ask a question |
| 06 | Cited answer: dates as citations, letter shown word for word, disclaimer |
| 07 | Access denied: no names, no details |
| 08 | Release date not reached: disclaimer |
| 09 | Neutral reply |

| Criterion | Evidence | Status |
|---|---|---|
| Sign-in, write entry, entry list, policy editor, ask question, cited answer | Screens 01–06 | ✔ |
| Access denied, release date not reached, neutral reply | Screens 07, 08, 09 | ✔ |
| User flow for owner and asker | `user-flow.svg` (two lanes) | ✔ |
| Clear place for the not-a-legal-will disclaimer | Amber "Not a legal will" box on 04, 06, 08 | ✔ |
| FE and BE confirm the wireframes can be built | Table in `04-wireframes/README.md` | ☐ **you** tick it |
| Shared link, linked in Kaneo | `https://github.com/frankenstein-denied/echo-Ai/tree/main/project-docs/04-wireframes` | ☐ **you** |

**Submit / link in Kaneo:**
- the folder `project-docs/04-wireframes/`;
- for Figma, drag the `.svg` files onto a canvas and share the Figma file link;
- the `previews/*.png` files are easiest to attach directly.

**Be ready to explain:**
- **Neutral reply (09) vs access denied (07).** A person with no protocol who *asks* always gets the neutral reply (handout case M6). Screen 07 is only for opening an item directly, and it names nobody.
- **Why the release-date screen may say the date:** the handout's M3 says "Refuses. The release date has not been reached."

---

## 1.07 — Test plan and test data

**What was done:**
- **Test plan** `project-docs/05-test-plan.md`: scope, approach, environment, bug process, exit criteria. It has case tables for the parser, access rules, entry pipeline, hash chain, writing modes, AI answers and the diary model, each marked ✔ Automated or Planned.
- **Access test table** `project-docs/05-access-test-table.csv`: **11 rows**, the handout's six Maria cases (M1–M6) plus A1–A5.
- **Fictional owner** `tests/fixtures/ramon-owner.json`:
  - 20 entries, 2019-03-02 → 2026-10-30;
  - tags: family 11, business 7, health 3, travel 2, faith 2;
  - 7 entries mention Maria;
  - one letter, e20 "To my daughter", to maria, release 2040-05-01.
- **Tests** `tests/engine/fixtures.test.ts`: 10 tests, including M1–M6 run against the vault.

| Criterion | Evidence | Status |
|---|---|---|
| Plan covers parser, access rules, pipeline, hash chain, writing modes, AI answers | Test plan sections 3.1–3.6 | ✔ |
| Fictional owner and entries, no real data | Fixture `_note` and `"fictional": true`; test plan section 5 | ✔ |
| Entries have dates, tags (family, business) and one letter with a release date | Fixture; checked by `fixtures.test.ts` | ✔ |
| Access table template with ≥ the six handout scenarios | CSV rows M1–M6 (+5 more) | ✔ |
| Stored in repo and linked in Kaneo | — | ☐ **you** |

**Submit / link in Kaneo:**
- `project-docs/05-test-plan.md`
- `project-docs/05-access-test-table.csv`
- `tests/fixtures/ramon-owner.json`
- `tests/engine/fixtures.test.ts`

**Be ready to explain:** each of M1–M6 and its expected behaviour.
- **M1:** "yes" and a count, no content.
- **M2:** family summaries, each with its date.
- **M3:** refused before 2040-05-01.
- **M4:** the letter word for word on or after that date.
- **M5:** the neutral reply.
- **M6:** the neutral reply to every question.

---

## 1.08 — AI-use log and AI design note

**What was done:**
- **The log** `project-docs/06-ai-use-log.md`:
  - columns: prompt, response, changes or rejections, verified by;
  - a "How to add a row" section;
  - **17 rows**. Row 1 is the honest summary that Echo was built with Claude Code: 314 of 319 commits before this project carry `Co-Authored-By: Claude`. The other rows each record real work, including the AI's mistakes that were caught.
- **The design note** `project-docs/07-ai-design-note.md` covers:
  - **the model:** Gemini, kept on the server, with an offline stand-in for tests;
  - **the tools**, with signatures: `search_entries`, `check_access`, `fetch_entry`;
  - **the first-draft system prompt;**
  - **failure handling.**

| Criterion | Evidence | Status |
|---|---|---|
| Log with columns prompt, response, changes/rejections, verifier name | `06-ai-use-log.md` table | ✔ |
| Every member knows how to add entries | "How to add a row" section | ✔ |
| Note lists model, planned tools, first-draft instructions | `07-ai-design-note.md` sections 1–3 | ✔ |
| Note states the model never reads the vault directly | Quote at the top of section 1, repeated in section 2 | ✔ |
| Stored in repo and linked in Kaneo | — | ☐ **you** |
| (Integrity) rows verified | Rows marked "(pending review)" | ☐ **you** check each row, then remove the marker |

**Submit / link in Kaneo:** `project-docs/06-ai-use-log.md`, `project-docs/07-ai-design-note.md`

**Be ready to explain:**
- **"How do you stop the AI from seeing an entry the asker may not read?"** The tools filter first: they ask the Prolog rules before returning anything, and the model only ever sees tool results.
- **"Which part did AI write, and how did you check it?"** Point to the log, the tests, and the review fixes in row 17.

---

## 2.01 — Policy grammar (EBNF)

**What was done:**
- **The grammar** `grammar/policy.ebnf`, in ISO EBNF, with **5 statement types**:
  1. `protocol` block with `may` / `may not` clauses;
  2. `release letter … when date >= …`;
  3. `transfer custody … if trustee unavailable for N days`;
  4. `default writing mode: …`;
  5. `trustee …`.
- **The samples** in `grammar/samples/`: `handout.policy` (the handout's sample, verbatim), then `01-family-only`, `02-deny-and-release` and `03-trustee-and-custody`.
- **The write-up** `project-docs/08-policy-grammar.md` covers:
  - the meaning of every statement, and the Prolog fact it compiles to;
  - deny semantics;
  - a leftmost derivation of the handout sample;
  - a derivation for each of the three samples;
  - invalid examples;
  - a team review table.

| Criterion | Evidence | Status |
|---|---|---|
| EBNF defines at least four statement types | Five, in `policy.ebnf` | ✔ |
| Handout sample can be derived | `08-policy-grammar.md` section 4 | ✔ |
| Three sample programs, each accepted on paper | Section 5 (derivations); the lexer test also tokenizes every sample | ✔ |
| Stored in repo and linked in Kaneo | — | ☐ **you** |
| Team agrees on the meaning of each statement | Section 7 table | ☐ **you** tick it |

**Submit / link in Kaneo:** `grammar/policy.ebnf`, the folder `grammar/samples/`, and `project-docs/08-policy-grammar.md`

**Be ready to explain:**
- **"What happens when two rules conflict?"** Deny beats allow.
- **Level reach:** a deny hides its level and every stronger one. `may not see existence of entries tagged "health"` hides health entries completely, even from someone allowed to `read` family entries.

---

## 2.02 — OO classes: Owner, Beneficiary, Vault, Protocol, Grant

**What was done:** `engine/src/model/` has five classes:

| Class | What it does |
|---|---|
| `Owner` | Holds the vault and the beneficiaries; `freezePolicy()`; `findBeneficiary()` raises `AmbiguousName` |
| `Beneficiary` | Holds 0..1 `Protocol` |
| `Protocol` | Holds `Grant[]`; `decide()` gives deny by default and deny beats allow |
| `Grant` | Level + selector + allow/deny |
| `Vault` | Holds the hash chain in a **true private field** `#chain` |

Every field is `#private`. The vault hands out only fresh frozen copies, and it answers only beneficiaries its owner registered.

| Criterion | Evidence | Status |
|---|---|---|
| Classes match the class diagram (or differences noted) | `class-diagram.drawio` was regenerated after the review fixes | ✔ |
| Vault contents can't be read directly from outside | Tests "exposes nothing of its contents from outside", "returned entries are frozen copies…", "a forged beneficiary … gets nothing" | ✔ |
| A Beneficiary holds a Protocol; a Protocol holds Grants | Test "a Beneficiary holds a Protocol and a Protocol holds Grants" | ✔ |
| Unit tests for each class's main behaviour | `tests/engine/model.test.ts` (16) + `review-fixes.test.ts` (11) | ✔ |
| Reviewed by another member and merged to main | Merged (`e27de81`); an AI reviewer checked it (log row 17) | ☐ **you** review it as "another member" |

**Submit / link in Kaneo:** the folder `engine/src/model/`, plus `tests/engine/model.test.ts` and `tests/engine/review-fixes.test.ts`

**Be ready to explain:**
- **Encapsulation:** `#chain` is enforced by JavaScript at runtime, not just by TypeScript, and `Object.keys(vault)` is empty.
- **Why a made-up `Beneficiary` gets nothing:** the vault's claim/admit key. Only the Owner that claimed the vault can register people.

---

## 2.03 — Entry types

**What was done:** `engine/src/entries/` has:
- `Entry`: abstract, with date, text and tags;
- `DiaryEntry`;
- `LetterOfWishes`: adds a title, a **recipient** and a **release date**; its summary never reveals the text; it is readable only by the recipient on or after the date. It also carries the `DISCLAIMER`.

`describe()`, `summarize()` and `isReadableOn()` are polymorphic.

| Criterion | Evidence | Status |
|---|---|---|
| Base Entry + at least two subclasses | `entry.ts`, `diary-entry.ts`, `letter-of-wishes.ts` | ✔ |
| Letter stores release date and recipient | Test "letters store a recipient and a release date" | ✔ |
| Common method called on any type without checking its type | Test "describe and summarize work on any entry type without checking its type" | ✔ |
| Entries store date, text, tags | Test "diary entries store date, text and cleaned tags" | ✔ |
| Unit tests for each entry type | `tests/engine/entries.test.ts` (10) | ✔ |

**Submit / link in Kaneo:** the folder `engine/src/entries/` and `tests/engine/entries.test.ts`

**Be ready to explain:** polymorphism. The loop `for (const e of entries) e.describe()` never asks what kind `e` is; each subclass answers its own way.

---

## 2.04 — Pure entry pipeline

**What was done:** `engine/src/pipeline/` has four separate pure functions, and `processEntryText()` only composes them.

| Function | What it does |
|---|---|
| `normalize` | Spaces, line endings, quotes, NFC |
| `extractNamesAndTopics` | Names, including Filipino ones like "Juan Dela Cruz" and "Niño"; topics from tags and keywords |
| `correct` | A fixed list of misspellings, doubled words, "i" → "I", capitals, final full stop |
| `diff` | Word-level LCS. `renderDiff` shows `[-old-] {+new+}` |

| Criterion | Evidence | Status |
|---|---|---|
| Separate pure functions | One file each in `engine/src/pipeline/` | ✔ |
| Don't modify inputs; no shared state | Test "does not change its inputs and freezes its outputs" | ✔ |
| Same input → same output | Test "the same input always gives the same output" | ✔ |
| Diff clearly shows what changed | Test "shows what changed from the original": `[-i-] {+I+} went to [-teh store-] {+the store.+}` | ✔ |
| Normal and edge cases (empty text, repeated names) | `tests/engine/pipeline.test.ts` (18): empty, blank, repeated names, diacritics… | ✔ |

**Submit / link in Kaneo:** the folder `engine/src/pipeline/` and `tests/engine/pipeline.test.ts`

**Be ready to explain:**
- **What makes a function pure:** no input changes, no shared state, same output every time.
- **Why the original is always kept:** the diff and the writing modes need it.

---

## 2.05 — Append-only hash chain

**What was done:** `engine/src/chain/hash-chain.ts`.
- **How a link is hashed:** each link stores `prevHash` and `hash = SHA-256(prevHash + canonical JSON of the entry)`.
- **What `appendLink` returns:** a new frozen chain. There is **no edit or delete function**.
- **What `verifyChain` does:** it walks the chain from the start and throws `TamperDetected("broken link at entry #i (id): reason")` at the first broken link.

| Criterion | Evidence | Status |
|---|---|---|
| Append only; no edit or delete | Test "offers no way to edit or delete" | ✔ |
| Each entry stores the previous hash | Test "each link stores the hash of the previous one…" | ✔ |
| Detects changed, removed and reordered entries | Tests "detects a changed / removed / reordered entry" (+ re-hashed and renumbered forgeries) | ✔ |
| TamperDetected names the first broken link | `expectBroken` checks the index and "entry #i" | ✔ |
| Tests for valid and tampered chains | `tests/engine/hash-chain.test.ts` (13) | ✔ |

**Submit / link in Kaneo:** `engine/src/chain/hash-chain.ts`, `engine/src/errors.ts`, `tests/engine/hash-chain.test.ts`

**Be ready to explain:**
- **"Why are entries immutable and hash-chained?"** Changing any entry changes its hash, which breaks the next link's `prevHash`, so tampering is caught at the first broken link.
- **Known limit:** removing the *very last* entry isn't detectable from the chain alone. Fixing that needs the last hash stored separately, which is in the deferred list.

---

## 2.10 — Pipeline and hash chain tests

| Criterion | Evidence | Status |
|---|---|---|
| Tests run with one command documented in the README | `pnpm test`: README "Getting started" and `tests/README.md` | ✔ |
| Every pipeline function, normal + edge cases | `pipeline.test.ts`: normalize 3, extract 6, correct 3, diff 3, purity 3 | ✔ |
| At least three kinds of tampering detected | Changed, removed, reordered, re-hashed, renumbered (5 kinds) | ✔ |
| Failed tests logged as Kaneo bugs with an owner | None fail now (1,275/1,275) | ☐ **you** log a bug if any ever fails |

**Submit / link in Kaneo:** `tests/engine/pipeline.test.ts`, `tests/engine/hash-chain.test.ts`, `tests/README.md`, and a screenshot of `corepack pnpm test` passing

---

## 2.11 — Policy lexer

**What was done:** `engine/src/policy/lexer.ts` and `tokens.ts`.
- **What each token stores:** type, value, line and column.
- **Token types:** keywords, names, strings, dates, numbers, `:`, operators (`>=` …), newlines, EOF.
- **What it ignores:** comments (`#`) and blank lines.
- **Line endings:** Windows line endings are handled.
- **Errors:** unknown characters and unterminated strings throw `PolicySyntaxError` with the line and column.

| Criterion | Evidence | Status |
|---|---|---|
| Tokenizes the handout sample correctly | Test "tokenizes the handout's sample policy" (exact token list) | ✔ |
| Tokens store type, value, line, column | Test "every token keeps its line and column" | ✔ |
| Unknown characters and unterminated strings raise a clear error | Tests "an unknown character…", "an unterminated string…" | ✔ |
| Keywords, names, strings, dates, numbers recognized | Exact-token test + "recognises every operator, and dates before numbers" | ✔ |
| Reviewed by another member and merged | Merged; AI reviewer checked it | ☐ **you** review it |

**Submit / link in Kaneo:** `engine/src/policy/lexer.ts`, `engine/src/policy/tokens.ts`, `tests/engine/lexer.test.ts`

**Be ready to explain:** why DATE is tried before NUMBER (otherwise `2040` would be read as a number), and why STRING's column is its opening quote.


---

## 2.06 / 2.07 — Prolog facts and first access rules

> In Kaneo, 2.07 has exactly the same text as 2.06. Both are covered here. If 2.07 should be something else, tell me.

**What was done:**
- **The rules** `prolog/access_rules.pl` now has a full **fact structure**:

  | Fact | Meaning |
  |---|---|
  | `person(P)` | P is a registered person |
  | `protocol(P)` | P has a protocol from the owner |
  | `entry(E, date(Y,M,D), Kind)` | An entry and its date |
  | `tag(E, T)` | Entry E is tagged T |
  | `mentions(E, P)` | Entry E mentions person P |
  | `letter(E, Title, Recipient, date(...))` | A Letter of Wishes |
  | `grant(P, Level, Selector)` | An allow |
  | `deny(P, Level, Selector)` | A denial |

- **The rule** `can_see(P, Level, E)`: deny by default; three levels (existence < summary < full); deny beats allow; a weaker deny blocks stronger levels; a Letter of Wishes is visible **only to its recipient**, and never in full until the release rules exist. Helpers: `visible/3`, `visible_count/3`.
- **The facts builder** `engine/src/prolog/facts.ts` (`factsFor`) builds the facts from the engine's real entries and grants, with every name safely quoted. It checks mentions for every name a grant uses, so Prolog and the TypeScript model always agree.
- **The tests** `tests/engine/access-table.test.ts` read the access table CSV and run **7 rows** through Prolog against the fictional owner: **M1, M2, M5, M6, A1, A3, A4**. The other 4 rows are listed as later work: M3 and M4 need release dates, A2 needs the death trigger, A5 needs the AI.

| Criterion | Evidence | Status |
|---|---|---|
| The Prolog file loads without errors from the main program | Test "the rule file loads from the main program"; `corepack pnpm engine:demo` | ✔ |
| A person with no protocol is denied everything | Tests "a person with no protocol is denied everything", "…even with a stray grant"; access-table row M6 | ✔ |
| Rules distinguish existence, summary and full | Tests "summary access… also gives existence", "the three levels are distinct…"; rows M1, A4 | ✔ |
| At least five access-table rows pass | 7 rows pass (M1, M2, M5, M6, A1, A3, A4) | ✔ |
| Stored in the repo and linked in Kaneo | `prolog/access_rules.pl` | ☐ **you** add the link |

**Submit / link in Kaneo:**
- `prolog/access_rules.pl`
- `engine/src/prolog/facts.ts`
- `tests/engine/access-table.test.ts`
- `tests/engine/prolog-bridge.test.ts`
- `tests/engine/prolog-facts.test.ts`
- `project-docs/05-access-test-table.csv`

**Be ready to explain:**
- **How `can_see` reads in English:** "P can see E at level L if P is registered, has a protocol, some grant reaches L and picks out E, and no denial reaches L and picks out E."
- **Why a person with no protocol sees nothing:** `protocol(P)` can't be proven, so `can_see` fails. That's the closed-world assumption.
- **Row A3:** Adam Jr. has a family grant and can summarise other family entries, but gets nothing about the letter to Maria. That's the recipient-only rule `not_for/2`.

---

## 2.09 — High-fidelity screens, style guide, error messages

**What was done:**

| Deliverable | Where | Contents |
|---|---|---|
| High-fidelity screens | `project-docs/11-hifi/` | **12 screens**: the 9 wireframe screens in final form (real lucide icons, final wording, no annotations), plus owner home (10), asker home (11), and a write-entry error state (12). PNG previews included. Generated by `scripts/project-docs/gen-hifi.mjs` |
| Style guide | `project-docs/09-style-guide.md` | Echo's real colour tokens (from `app/globals.css`), what each colour means, type scale, spacing, radii, icons, components, wording rules |
| Error message catalog | `project-docs/10-error-messages.md` | **One message per error type**: AccessDenied, AmbiguousName, TamperDetected, PolicySyntaxError, PolicyFrozen, UnknownEntryType, plus a generic fallback. Each has an owner version and an asker version, and there are rules for writing new ones. **Every asker message is the handout's neutral reply** |
| The same messages in code | `engine/src/messages.ts` | `messageFor(error, audience)`. Tested in `tests/engine/messages.test.ts` (7 tests), which also checks that the document and the code use the same words |

| Criterion | Evidence | Status |
|---|---|---|
| High-fidelity designs for all owner and asker screens | `11-hifi/README.md` lists the owner screens and the asker screens | ✔ |
| Style guide: colours, fonts, component styles | `09-style-guide.md` sections 1, 2, 5 | ✔ |
| One message for each error type | `10-error-messages.md`; test "has one message for each error type" | ✔ |
| Denied-access messages never reveal that a protected entry exists | Tests "denied access reads the same whatever the hidden reason", "no asker-facing message reveals that a protected entry exists", "askers get the neutral reply…" | ✔ |
| Shared with Front End and linked in Kaneo | Table in `11-hifi/README.md` | ☐ **you** tick it and add the links |

**Submit / link in Kaneo:**
- the folder `project-docs/11-hifi/` (and a Figma link if you import the SVGs)
- `project-docs/09-style-guide.md`
- `project-docs/10-error-messages.md`
- `engine/src/messages.ts`

**Be ready to explain:**
- **Why an asker sees the neutral reply for every error, including AccessDenied:** the handout says a person with no protocol gets "the same neutral reply, with no detail", and any other wording could reveal that a protected entry, or a particular person, exists.
- **The two audiences:** only the owner sees details about their own diary.

---

## 2.12 — Lexer tests

**What was done:** `tests/engine/lexer.test.ts` now has **19 tests**, with one clearly named case per criterion. A table in `project-docs/05-test-plan.md` (section 3.1) maps each criterion to its tests.

| Criterion | Evidence | Status |
|---|---|---|
| At least ten test cases | 19 | ✔ |
| Valid tokens, dates, quoted strings, comments, blank lines | Tests named "valid tokens…", "dates…", "quoted strings…" (×2), "comments…", "blank lines…" | ✔ |
| Unknown symbols and unterminated strings | Tests "invalid: an unknown symbol…", "invalid: an unterminated string on a later line…", and the earlier two | ✔ |
| All pass, or failures logged in Kaneo | All 19 pass | ✔ |

**Submit / link in Kaneo:** `tests/engine/lexer.test.ts`, and `project-docs/05-test-plan.md` (section 3.1)

---

## Tickets not started yet

| Ticket | What it needs | Notes |
|---|---|---|
| **1.09** UI structure | Layout, navigation (owner and asker areas), placeholder sign-in, empty home | You chose a separate `studio/` Next.js app, then put it on hold |
| **2.08** Owner screens | Write entry + entry list, saved to the append-only store, no edit/delete, approved error messages | Needs 1.09. The messages (`engine/src/messages.ts`) and hi-fi screens are ready for it |

---

## Your checklist (everything only you can do)

- ☐ Add the repo link to Kaneo.
- ☐ Add the links above to each ticket in Kaneo.
- ☐ Tick the approvals:
  - proposal (`01`, section 10);
  - grammar meanings (`08`, section 7);
  - wireframe buildability (`04-wireframes/README.md`).
- ☐ Open the three `.drawio` files in diagrams.net and tidy anything that looks off.
- ☐ Drag the wireframe SVGs into Figma once and share the Figma link.
- ☐ Read every AI-log row and remove "(pending review)" from the ones you've checked.
- ☐ Review the code for 2.02 and 2.11 as "another member".
- ☐ Tick "Received the designs" in `11-hifi/README.md` (2.09).
- ☐ Check what ticket 2.07 is meant to be.
- ☐ Run `corepack pnpm test` and `corepack pnpm engine:demo` yourself.
- ☐ Ask your instructor to confirm that a one-member group is acceptable (the handout asks for five).

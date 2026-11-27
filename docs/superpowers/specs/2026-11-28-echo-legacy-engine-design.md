# Echo Legacy engine (CS 413 final project) — design

Date: 2026-11-28 · Status: draft for owner approval
Team: Peter Paul Poloan (Front End, Back End, Q/A, UI/UX Designer, Documentator — one-member group)

## Intent

The CS 413 Programming Languages final project ("Alaala" in the handout,
`C:\Users\THISPC\Downloads\Alaala_Student_Handout.pdf`) is delivered as **Echo**. The name "Alaala"
is not used anywhere. The project shows that each part of a diary-after-death system uses the right
programming paradigm, and that the team can defend each choice.

This batch covers Kaneo tickets 1.03–1.08 (proposal, tech decision, UML, wireframes, test plan +
data, AI-use log + AI design note) and 2.01–2.05, 2.10, 2.11 (policy grammar, OO diary model,
entry types, pure pipeline, hash chain, pipeline/chain tests, lexer).

## Approach (owner picked option 1)

1. **Picked — a separate engine inside the echo-ai repo.** TypeScript, Prolog through tau-prolog
   (pure JavaScript, installs with `pnpm install`, no system install). Own tests and a CLI demo.
   Wireframes show it as Echo screens. Fast, safe for the live app, meets every acceptance criterion.
2. Rejected — wiring it into the live Echo app (Firestore, rules, Legacy page). Weeks of work and risk
   to the live app; not needed for any criterion in this batch.

The live Echo app is **not changed** in this batch.

## Goals

- Every acceptance criterion of the 13 tickets is met in the repo, except the ones only the owner can
  do (linking in Kaneo, "reviewed by all members", logging failed tests as Kaneo bugs).
- All project documents in **one folder**: `project-docs/`.
- Diagrams open in draw.io; wireframes open in Figma.
- Wireframes match Echo's real look (colors, fonts, layout of `components/echo/legacy/*`, sidebar).
- Fictional data only.
- Every document and source file carries the team line (one name, every role).

## Non-goals (this batch)

- Recursive-descent parser, interpreter, the full Prolog access rules, writing-mode classes,
  grounded Q&A script. Those are later tickets. The design and docs describe them (the proposal,
  UML, test plan and AI note must cover the whole system), but only the pieces the tickets list get
  built now — plus the one small Prolog bridge 1.04 requires.
- Changing Echo's live Legacy feature (its memorial chat speaks as the owner; the engine's Q&A
  speaks *about* the owner, as the handout requires). The proposal says the engine's Q&A follows
  the handout's honesty rule.
- `.docx`/PDF copies of the documents (Markdown renders on GitHub and links from Kaneo; can be
  exported later).

## Anti-goals

- Any real personal data in data, tests or docs.
- A document that presents the Letter of Wishes as a legal will.
- Vault contents reachable from outside the class (must be truly private, not just by convention).
- A design where the AI reads the vault directly.
- Wireframes that invent a look Echo doesn't have.

## Layout

```
project-docs/                     ← every document, one folder
  README.md                       index: ticket → file
  01-project-proposal.md          1.03
  02-technology-decision.md       1.04
  03-uml/                         1.05
    use-case-diagram.drawio
    sequence-diagrams.drawio      (pages: ask a question, write an entry, compile a policy)
    class-diagram.drawio
  04-wireframes/                  1.06
    01-sign-in.svg … 09-neutral-reply.svg, user-flow.svg
    README.md                     how to open in Figma, screen list
  05-test-plan.md                 1.07
  05-access-test-table.csv        1.07 (asker, entry, expected result)
  06-ai-use-log.md                1.08
  07-ai-design-note.md            1.08
  08-policy-grammar.md            2.01 (explains grammar/policy.ebnf + 3 samples + derivation)
engine/                           Echo Legacy engine (TypeScript)
  src/model/      owner.ts beneficiary.ts vault.ts protocol.ts grant.ts      2.02
  src/entries/    entry.ts diary-entry.ts letter-of-wishes.ts                2.03
  src/pipeline/   normalize.ts extract.ts correct.ts diff.ts index.ts        2.04
  src/chain/      hash-chain.ts                                              2.05
  src/policy/     tokens.ts lexer.ts                                         2.11
  src/errors.ts   AccessDenied, AmbiguousName, TamperDetected, PolicySyntaxError, PolicyFrozen
  src/prolog/     bridge.ts (tau-prolog)                                     1.04
  demo.ts         1.04 small program: loads prolog/access_rules.pl, asks one rule
grammar/policy.ebnf               2.01 canonical grammar
grammar/samples/*.policy          2.01 handout sample + 3 sample programs
prolog/access_rules.pl            1.04 starter rules (deny by default, one allow rule); grown later
tests/engine/*.test.ts            2.02–2.05, 2.10, 2.11 (Vitest)
tests/fixtures/ramon-owner.json   1.07 fictional owner + ~20 entries
```

The Echo-command Prolog and grammar files added in the repo-setup commit
(`prolog/echo_rules.pl`, `grammar/echo_commands.pl`, `grammar/echo-commands.ebnf`,
`tests/prolog/*`) are **removed** — they were placeholders and would confuse graders. READMEs and
`package.json` (`test:prolog` removed) are updated to match. The sprint 1 report is a past record
and is **not rewritten**: it gets one dated "Later change" line pointing to a new sprint 2 report
(`reports/sprint-02-report.md`), which records the removal and this batch.

`vitest.config.ts` `include` gains `tests/**/*.test.ts`. `pnpm test` runs everything (2.10's
"one command documented in the README").

## Technology (content of 1.04)

| Part | Choice | Why it fits the paradigm |
|---|---|---|
| OO diary model, entry types, writing modes | TypeScript classes | Real inheritance, abstract classes, `#private` fields give runtime encapsulation |
| Functional pipeline, hash chain | TypeScript, pure functions over `Readonly`/frozen data | First-class functions, `Object.freeze`, no shared state |
| Access rules | Prolog via **tau-prolog** | Rules as facts + rules; deny-by-default falls out of closed-world negation; runs in Node with no system install |
| Policy language | Hand-written lexer + recursive-descent parser in TypeScript, emitting Prolog facts | Shows language design directly, no generator |
| Grounded Q&A | Plain JavaScript script (`.mjs`) orchestrating tools | Scripting paradigm: glue that calls the engine, the rules and the model |
| AI model | Google Gemini via `@google/genai` (already in Echo), with a deterministic offline stand-in for tests | Same provider Echo uses; tests never need a key |
| UI | Next.js 16 / React 19 (Echo) | The real app's framework; wireframes follow its components |
| Tests | Vitest | Already in Echo |

`package.json` gains `tau-prolog` (dependency) and scripts `engine:demo` (`node engine/demo.ts`,
Node 24 strips types natively). Dependencies are therefore listed in `package.json` (1.04 criterion).

## Domain decisions

- **Fictional owner:** Ramon Dela Cruz (invented), daughter **Maria**, son **Adam Jr.** (`adam_jr`),
  trustee **Lito Santos** (invented). About 20 entries 2019–2026, tagged `family`, `business`,
  `health`, `travel`, etc.; several mention Maria; one **Letter of Wishes** "To my daughter" to
  maria, release 2040-05-01. All names invented; the test plan states so.
- **Entry** (abstract): `id, date (YYYY-MM-DD), text, tags[]`; methods `describe()`, `summarize()`,
  `isReadableBy(asker, today)` (polymorphic). `DiaryEntry` and `LetterOfWishes` (adds `recipient`,
  `releaseDate`; readable only by recipient on/after release). Original text always kept.
- **Vault:** holds the hash chain privately (`#chain`). Public methods only: `append(entry)`,
  `count()`, `verify()`, and access-checked reads that take a `Grant` decision. No getter returns the
  array.
- **Beneficiary** holds 0..1 `Protocol`; **Protocol** holds `Grant[]`. **Grant** = `{ level:
  'existence' | 'summary' | 'full', selector: { kind: 'mentions' | 'tag' | 'letter', value } }`.
- **Pipeline:** `normalize` (trim, collapse spaces, NFC, straight quotes), `extractNamesAndTopics`
  (names = capitalized words not at sentence start + known-people list; topics = tags + keyword
  map; unique, sorted), `correct` (small deterministic rule set: doubled words, common
  misspellings list, sentence capitalization, "i" → "I"), `diff` (word-level LCS → `{op:'same'|'del'|'add', text}[]` plus a readable `-/+` rendering). All return new frozen values.
- **Hash chain:** entry record = `{ index, prevHash, entry, hash }`, `hash = SHA-256(prevHash +
  canonicalJSON(entry))`, genesis `prevHash = "0"*64`. `verify()` walks from 0 and throws
  `TamperDetected("broken link at entry #i (<id>): <reason>")` naming the **first** broken link;
  detects changed entry, removed entry, reordered entries. No edit/delete API exists.
- **Lexer:** tokens `{type, value, line, column}`; types: KEYWORD, NAME, STRING, DATE, NUMBER,
  COLON, OPERATOR (`>=`, `<=`, `>`, `<`, `=`), NEWLINE, INDENT/DEDENT not used (statements are
  line-based; protocol body lines start with `may`), EOF. Unknown character and unterminated string
  throw `PolicySyntaxError` with line and column.
- **Policy grammar (2.01):** at least these statement types, superset of the handout sample:
  `protocol <name>:` block of `may see existence of | may read summary of | may read` clauses and
  `may not read …` (deny); `release letter "<title>" to <name> when date >= <date>`;
  `transfer custody to <name> if trustee unavailable for <n> days`; `trustee <name>`;
  `default writing mode: verbatim | light_fix | review`. Selectors: `entries mentioning <name>`,
  `entries tagged "<tag>"`. Three sample programs + the handout sample, each with a written
  derivation in `08-policy-grammar.md`.
- **Prolog starter (1.04):** `prolog/access_rules.pl` with `allowed/3`, `denied/3`, and
  `can_see(Asker, Level, Entry) :- allowed(...), \+ denied(...)`; the demo loads it with a few
  facts and prints Maria's answer to one query. Full rules (release dates, frozen policy, death
  trigger) come with a later ticket.
- **Writing modes, Q&A, death trigger:** described in proposal, UML, AI note and test plan; built later.
  Death trigger = Echo's inactivity release (owner sets months); after it fires the policy is frozen
  (`PolicyFrozen`).

## Wireframes (1.06)

SVG, 390×844 mobile frames (Echo is mobile-first), Echo's palette and type taken from
`app/globals.css` and the Legacy components; grey-box wireframe fidelity with real labels.
Screens: sign-in, write entry (with writing-mode picker), entry list, policy editor (with
syntax-error line), ask question, cited answer, access denied, release date not reached, neutral
reply. Not-a-legal-will disclaimer appears on the policy editor, the letter screens and the cited
answer of a letter. `user-flow.svg` shows owner and asker paths. Figma: File → Import or drag the
SVGs onto the canvas; text stays editable.

## UML (1.05)

draw.io files, UML 2 notation. Use case: actors Owner, Registered Asker, Trustee, Gemini (external),
Clock/death trigger; include/extend used correctly. Sequence: ask a question (asker → UI → Q&A
script → tools → Prolog → vault → model), write an entry (pipeline + writing mode + chain), compile a
policy (lexer → parser → interpreter → Prolog facts). Class: the classes above with attributes,
methods, visibility, inheritance, composition (Vault ◆ entries), aggregation, multiplicities,
exceptions. Consistent with the proposal; style matches `documentation/echo-architecture.drawio`.

## AI-use log (1.08) — owner decided

`project-docs/06-ai-use-log.md`, a Markdown table with columns: #, date, part, prompt (what was
asked), response (what came back), changes or rejections, verified by. Row 1 is an honest summary:
the Echo app was built with an AI coding assistant (Claude Code); the `Co-Authored-By` lines in the
git history mark AI-assisted commits; the owner reviewed and tested each change. Then one row per
piece of this project's work, written only from what actually happened in the sessions (requests,
outputs, corrections, rejections). Verifier: Peter Paul Poloan. Nothing invented. The top of the
file explains how to add a row.

## Left to the builder

Exact keyword list of the correction rules and names, SVG drawing details, test names, wording of
docs within the ground rules above.

## Appendix — ticket acceptance criteria (copied from Kaneo, 2026-11-28)

Owner-only criteria are marked (owner): the builder prepares everything they need but cannot do them.

**1.03 Project proposal** (DOC lead, BE, UX · 5 pts) — purpose, users (owner, registered askers,
trustees) and scope stated · functional requirements cover all six components and the AI's model,
tools and instructions · non-functional cover security (deny by default), privacy, AI honesty,
reliability · out-of-scope items and the not-a-legal-will disclaimer stated · fictional data only ·
reviewed and approved by all members (owner) · stored in repo, linked in Kaneo (owner).

**1.04 Technology decision** (BE lead, FE · 3) — decision note lists each technology and why it fits
its paradigm · a small program runs on every member's machine and calls a Prolog rule from the main
language · dependencies listed in a repo file · note linked in Kaneo (owner).

**1.05 UML** (BE lead, UX, DOC · 8) — use case diagram (actors + interactions) · sequence diagram for
key processes · class diagram (classes, attributes, methods, relationships) · consistent with the
proposal · proper UML notation · reviewed by all (owner) · shared link for the instructor (owner;
GitHub file links work).

**1.06 Wireframes** (UX lead, FE · 5) — sign-in, write entry, entry list, policy editor, ask
question, cited answer · access denied, release date not reached, neutral reply · user flow for owner
and asker · clear place for the not-a-legal-will disclaimer · FE and BE confirm buildable (owner) ·
shared link, linked in Kaneo (owner).

**1.07 Test plan + data** (QA lead, BE · 5) — covers parser, access rules, entry pipeline, hash
chain, writing modes, AI answers · fictional owner and entries, no real data · entries have dates
and tags such as family and business, and one letter with a release date · access test table
template (asker, entry, expected result) with at least the handout's six Maria scenarios · in repo,
linked in Kaneo (owner).

**1.08 AI-use log + AI design note** (DOC lead, BE · 3) — log with columns prompt, response,
changes/rejections, verifier name · every member knows how to add entries (instructions in the log)
· note lists the chosen model, planned tools, first-draft instructions · note states the model never
reads the vault directly · in repo, linked in Kaneo (owner).

**2.01 Policy grammar** (BE lead, DOC · 5) — EBNF with at least four statement types · handout
sample derivable from it · three sample programs, each accepted on paper (written derivation) · in
repo, linked in Kaneo (owner) · team agrees on the meaning of each statement (owner).

**2.02 OO classes** (BE lead, QA · 5) — Owner, Beneficiary, Vault, Protocol, Grant match the class
diagram (or differences noted and diagram updated) · vault contents not readable from outside ·
Beneficiary holds a Protocol, Protocol holds Grants · unit tests for each class's main behaviour ·
reviewed by another member and merged (owner reviews; builder merges after review).

**2.03 Entry types** (BE lead, FE · 5) — base Entry + at least two subclasses · letter stores release
date and recipient · a common method called on any entry type without type checks · entries store
date, text, tags · unit tests per entry type.

**2.04 Pure pipeline** (BE lead, QA · 5) — normalize, extract names and topics, correct, diff are
separate pure functions · no input mutation, no shared state · deterministic · diff clearly shows
changes · tests for normal and edge cases (empty text, repeated names).

**2.05 Hash chain** (BE lead, QA · 5) — append only, no edit/delete · each entry stores previous
hash · verify detects changed, removed and reordered entries · TamperDetected names the first broken
link · tests for valid and tampered chains.

**2.10 Pipeline + chain tests** (QA lead, BE · 3) — one command documented in the README · every
pipeline function with normal and edge cases · at least three kinds of tampering detected · failed
tests logged as Kaneo bugs with an owner (owner).

**2.11 Lexer** (BE lead, QA · 5) — tokenizes the handout sample correctly · tokens store type, value,
line, column · unknown characters and unterminated strings raise a clear error · keywords, names,
strings, dates, numbers recognized · reviewed and merged (owner reviews).

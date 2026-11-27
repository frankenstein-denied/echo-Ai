# Echo Legacy Engine (CS 413 batch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Kaneo tickets 1.03–1.08, 2.01–2.05, 2.10, 2.11 for the CS 413 final project as Echo: a tested TypeScript engine (diary model, entry types, pure pipeline, hash chain, policy lexer, Prolog bridge) plus every project document in `project-docs/`.

**Architecture:** A self-contained engine under `engine/src/` (no imports from the Next.js app, and the app does not import it). Tests live in `tests/engine/` and run with the existing Vitest via `pnpm test`. Prolog runs in-process through tau-prolog. Documents are Markdown, UML is draw.io XML, wireframes are SVG.

**Tech Stack:** TypeScript 5 (strict), Vitest, tau-prolog 0.3.4, tsx (demo runner), node:crypto SHA-256, draw.io, SVG.

**Spec:** `docs/superpowers/specs/2026-11-28-echo-legacy-engine-design.md` (read it first; its appendix holds every ticket's acceptance criteria). Course handout: `C:\Users\THISPC\Downloads\Alaala_Student_Handout.pdf`.

## Global Constraints

- The handout's project name appears nowhere in the repo. The system is **Echo** (the engine is the "Echo Legacy engine").
- Every new document and source file starts with the team line: `Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)`. In code files it goes in the top comment.
- Fictional data only: owner **Ramon Dela Cruz**, daughter **Maria** (`maria`), son **Adam Jr.** (`adam_jr`), trustee **Lito Santos** (`lito`). No real people, emails, addresses.
- The Letter of Wishes is never called a will. Disclaimer text, verbatim everywhere it appears: **"A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice."**
- Engine code under `engine/src/` must not import from `app/`, `components/`, `lib/`, and must pass `pnpm exec tsc --noEmit` (the Next build type-checks every `**/*.ts`).
- Imports are extensionless (repo style); the demo runs with `tsx`.
- No change to the live Echo app (`app/`, `components/`, `lib/`, `firestore.rules`, `android/`).
- Commits: Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feat/legacy-engine`.
- Run `pnpm test` (all suites) before each commit; it must stay green.

## Review Focus

- **Vault leaking through returned objects:** a caller mutating an entry/array returned by the vault must not change the stored chain → test in Task 5 (`returned entries are frozen copies; mutating them throws and verify() still passes`).
- **Tamper after construction via a stored reference:** an entry object passed to `append` and mutated afterwards by the caller must not affect the chain → test in Task 3 (`mutating the original object after append does not change the chain`).
- **Policy text with Windows line endings and tabs:** `\r\n` and tabs must lex the same as `\n`/spaces, with correct line/column → test in Task 6 (`CRLF input gives the same tokens and line numbers`).
- **Names with apostrophes/hyphens and Filipino diacritics** ("Niño", "O'Brien", "Dela Cruz") in extract and normalize → test in Task 4 (`extracts names with diacritics and multi-word surnames`).
- **Empty chain and single-entry chain verify** → test in Task 3 (`verify on an empty chain passes`, `removing the only entry from a 2-entry chain is detected`).

---

### Task 1: Cleanup, scaffolding, typed errors

**Files:**
- Delete: `prolog/echo_rules.pl`, `grammar/echo_commands.pl`, `grammar/echo-commands.ebnf`, `tests/prolog/` (whole folder)
- Modify: `package.json` (remove `test:prolog`; add dependency `tau-prolog@0.3.4`, devDependency `tsx`; add script `"engine:demo": "tsx engine/demo.ts"`), `vitest.config.ts` (`include: ['lib/**/*.test.ts', 'tests/**/*.test.ts']`)
- Modify: `prolog/README.md`, `grammar/README.md`, `tests/README.md` → one short paragraph each saying what will live there (access rules / policy grammar / engine tests) and the run command `pnpm test`; `reports/sprint-01-report.md` → append one line: `> Later change (2026-11-28): the placeholder Echo-command Prolog and grammar files listed above were replaced by the Legacy engine's access rules and policy grammar; see sprint-02-report.md.`
- Create: `engine/src/errors.ts`, `engine/src/prolog/tau-prolog.d.ts` (`declare module 'tau-prolog'` and `'tau-prolog/modules/promises.js'` as `any`-typed)
- Test: `tests/engine/errors.test.ts`

**Interfaces:**
- Produces: `class EchoLegacyError extends Error`; subclasses `AccessDenied`, `AmbiguousName`, `PolicySyntaxError`, `PolicyFrozen`, `TamperDetected`. `PolicySyntaxError` has readonly `line: number`, `column: number`; constructor `(message: string, line: number, column: number)`, `message` becomes `` `${message} (line ${line}, column ${column})` ``. `TamperDetected` has readonly `index: number`; constructor `(message: string, index: number)`. Every subclass sets `this.name` to its class name. No TS parameter properties.

- [ ] **Step 1:** Write `tests/engine/errors.test.ts`: each class is `instanceof EchoLegacyError` and `Error`, `.name` equals the class name; `new PolicySyntaxError('Unknown character "@"', 3, 7).message === 'Unknown character "@" (line 3, column 7)'` and `.line === 3`, `.column === 7`; `new TamperDetected('x', 4).index === 4`.
- [ ] **Step 2:** Run `pnpm exec vitest run tests/engine/errors.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Do the deletions and file modifications above, `pnpm add tau-prolog@0.3.4 && pnpm add -D tsx`, implement `engine/src/errors.ts`.
- [ ] **Step 4:** Run `pnpm test` → all pass (existing ~1,000 + new). Run `pnpm exec tsc --noEmit` → no errors.
- [ ] **Step 5:** Commit `chore(engine): scaffold Legacy engine, typed errors; drop placeholder Prolog/grammar`.

### Task 2: Entry types (2.03)

**Files:**
- Create: `engine/src/entries/entry.ts`, `engine/src/entries/diary-entry.ts`, `engine/src/entries/letter-of-wishes.ts`, `engine/src/entries/index.ts`
- Test: `tests/engine/entries.test.ts`

**Interfaces:**
- Produces:
  - `type EntryData = { id: string; date: string /* YYYY-MM-DD */; text: string; tags: readonly string[] }`
  - `abstract class Entry` — constructor `(data: EntryData)`; validates date with `/^\d{4}-\d{2}-\d{2}$/` and a real calendar date, non-empty id; tags lower-cased, trimmed, de-duplicated; stores frozen data. Getters `id`, `date`, `text`, `tags`. Abstract `get kind(): string`. Methods: `describe(): string` (abstract), `summarize(maxWords?: number): string` (default 20 words, appends `…` when cut; subclasses may override), `isReadableOn(today: string, asker: string): boolean` (base: `true`), `toRecord(): EntryRecord` where `type EntryRecord = EntryData & { kind: string; recipient?: string; releaseDate?: string }` (plain JSON used for hashing).
  - `class DiaryEntry extends Entry` — kind `'diary'`; `describe()` → `` `Diary entry, ${date}: ${summarize(8)}` ``.
  - `class LetterOfWishes extends Entry` — constructor `(data: EntryData & { title: string; recipient: string; releaseDate: string })`; kind `'letter'`; getters `title`, `recipient`, `releaseDate`; `isReadableOn(today, asker)` → `asker === recipient && today >= releaseDate`; `describe()` → `` `Letter of Wishes "${title}" to ${recipient}, release ${releaseDate}` ``; `summarize()` → `` `A letter to ${recipient} (sealed until ${releaseDate}).` `` (never reveals text). Exposes `static readonly DISCLAIMER` = the disclaimer string from Global Constraints.
  - `entryFromRecord(r: EntryRecord): Entry` in `index.ts`.

- [ ] **Step 1:** Write tests: diary stores date/text/tags (tags `['Family',' family ','Business']` → `['family','business']`); letter stores `recipient` and `releaseDate`; a loop over `[diary, letter]` calls `describe()` and `summarize()` with no type check and gets the two exact strings above; `letter.isReadableOn('2040-04-30','maria') === false`, `('2040-05-01','maria') === true`, `('2041-01-01','adam_jr') === false`; letter `summarize()` does not contain any word of its text; `new DiaryEntry({...date:'2026-02-30'})` throws; `summarize(3)` of "one two three four" is `"one two three…"`; `entryFromRecord(e.toRecord())` round-trips both kinds; `LetterOfWishes.DISCLAIMER` equals the constraint text.
- [ ] **Step 2:** Run `pnpm exec vitest run tests/engine/entries.test.ts` → FAIL.
- [ ] **Step 3:** Implement the classes.
- [ ] **Step 4:** Run the test file → PASS; `pnpm exec tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(engine): Entry base class with DiaryEntry and LetterOfWishes`.

### Task 3: Hash chain (2.05)

**Files:**
- Create: `engine/src/chain/hash-chain.ts`
- Test: `tests/engine/hash-chain.test.ts`

**Interfaces:**
- Consumes: `Entry`, `EntryRecord`, `TamperDetected`.
- Produces:
  - `type ChainLink = Readonly<{ index: number; prevHash: string; record: Readonly<EntryRecord>; hash: string }>`
  - `GENESIS_HASH = '0'.repeat(64)`
  - `canonicalJson(value: unknown): string` — JSON with object keys sorted recursively.
  - `linkHash(prevHash: string, record: EntryRecord): string` — `sha256hex(prevHash + canonicalJson(record))` via `node:crypto`.
  - `appendLink(chain: readonly ChainLink[], entry: Entry): readonly ChainLink[]` — pure; returns a new frozen array with a deep-frozen new link (record from `entry.toRecord()`, structured-cloned).
  - `verifyChain(chain: readonly ChainLink[]): true` — walks from 0; for link i checks in order: `index === i`, `prevHash === (i === 0 ? GENESIS_HASH : chain[i-1].hash)`, `hash === linkHash(prevHash, record)`. First failure throws `new TamperDetected(\`broken link at entry #${i} (${record.id}): ${reason}\`, i)` with reason one of `index out of order`, `previous hash does not match`, `entry content changed`.
  - No edit or delete function is exported.

- [ ] **Step 1:** Write tests (build chains with a helper that creates 4 DiaryEntries): valid chain verifies; `verify on an empty chain passes`; first link's prevHash is GENESIS; each link's prevHash equals previous hash; **changed** entry (rebuild link 2 with altered text but old hash) → throws `TamperDetected`, `index === 2`, message contains `entry #2` and `entry content changed`; **removed** entry (drop link 1) → index 1, `index out of order`; **reordered** (swap links 1 and 2) → index 1; `removing the only entry from a 2-entry chain is detected` (drop link 0) → index 0; tamper that also recomputes the hash of link 2 → detected at link 3 (`previous hash does not match`); `mutating the original object after append does not change the chain`; returned chain and links are frozen (`Object.isFrozen`); module exports contain no name matching `/edit|delete|remove|update/i`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(engine): append-only hash chain with TamperDetected`.

### Task 4: Pure entry pipeline (2.04)

**Files:**
- Create: `engine/src/pipeline/normalize.ts`, `extract.ts`, `correct.ts`, `diff.ts`, `index.ts`
- Test: `tests/engine/pipeline.test.ts`

**Interfaces:**
- Produces:
  - `normalize(text: string): string` — NFC; `\r\n`→`\n`; curly quotes → straight (`‘’`→`'`, `“”`→`"`); runs of spaces/tabs → one space; trim each line; collapse 3+ newlines to 2; trim.
  - `type Extracted = Readonly<{ names: readonly string[]; topics: readonly string[] }>`; `extractNamesAndTopics(text: string, tags: readonly string[] = [], knownPeople: readonly string[] = []): Extracted` — names: known people found case-insensitively (returned in their known spelling) plus capitalised word sequences (incl. letters with diacritics, `'` and `-`, joined particles `de|dela|del|delos|san|santa` between capitalised words) that are not the first word of a sentence and not in a stop list (`I, The, A, An, My, Our, We, He, She, They, It, Today, Monday…Sunday, January…December`); topics: lower-cased tags plus keyword map hits `{ family: [family, daughter, son, wife, husband, mother, father, apo, kids], business: [business, store, sales, supplier, profit, customers, shop], health: [doctor, hospital, medicine, check-up, sick], travel: [trip, travel, flight, beach, visit], faith: [church, mass, pray] }`; both unique and sorted. Repeated names appear once.
  - `correct(text: string): string` — applies, in order: remove doubled words (`the the`→`the`, case-insensitive); fix a fixed misspelling map (`teh→the, recieve→receive, alot→a lot, definately→definitely, seperate→separate, untill→until, wich→which, becuase→because, tommorow→tomorrow, occured→occurred`); standalone `i`→`I`; capitalise the first letter of each sentence; ensure a final `.` if the text ends with a letter or digit. Empty → empty.
  - `type DiffPart = Readonly<{ op: 'same' | 'del' | 'add'; text: string }>`; `diff(original: string, corrected: string): readonly DiffPart[]` — word-level LCS (tokens split on whitespace, kept with no spacing), adjacent parts with the same op merged with single spaces; `renderDiff(parts): string` → `same` as-is, `del` as `[-text-]`, `add` as `{+text+}`, joined by spaces.
  - `processEntryText(text: string, tags?, knownPeople?): Readonly<{ original: string; normalized: string; corrected: string; extracted: Extracted; changes: readonly DiffPart[] }>` in `index.ts` — composition only.
  - All outputs frozen; no module-level mutable state.

- [ ] **Step 1:** Write tests: normalize of `"  Hello   world \r\n\r\n\r\n “hi”  "` → `'Hello world\n\n"hi"'`; normalize('') → ''; `extracts names with diacritics and multi-word surnames` (`"Met Niño and Juan Dela Cruz at church. Niño laughed."` → names `['Juan Dela Cruz','Niño']`, topics include `faith`); repeated names appear once; sentence-start words not taken as names (`"Today Maria came."` → `['Maria']`); knownPeople `['adam_jr']`-style ids are ignored, `['Adam Jr.']` found case-insensitively; topics from tags + keywords sorted; correct(`"i went to teh the store"`) → `"I went to the store."`; correct('') → ''; diff(`'i went to teh store'`, `'I went to the store.'`) parts and `renderDiff` = `'[-i-] {+I+} went to [-teh store-] {+the store.+}'`; diff of identical text is one `same` part; diff('', 'a b') → one `add`; purity: frozen input arrays are not mutated, outputs are frozen, calling each function twice with the same input gives deep-equal results; `processEntryText` returns original unchanged.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (LCS: classic O(n·m) table over word arrays).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(engine): pure entry pipeline (normalize, extract, correct, diff)`.

### Task 5: OO diary model (2.02)

**Files:**
- Create: `engine/src/model/grant.ts`, `protocol.ts`, `beneficiary.ts`, `vault.ts`, `owner.ts`, `index.ts`
- Test: `tests/engine/model.test.ts`

**Interfaces:**
- Consumes: `Entry`, `entryFromRecord`, `appendLink`, `verifyChain`, `ChainLink`, `AccessDenied`, `AmbiguousName`, `PolicyFrozen`.
- Produces:
  - `type AccessLevel = 'existence' | 'summary' | 'full'`; `type Selector = { kind: 'mentions'; name: string } | { kind: 'tag'; tag: string } | { kind: 'letter'; title: string }`
  - `class Grant` — constructor `(level: AccessLevel, selector: Selector, effect: 'allow' | 'deny' = 'allow')`; getters; `matches(entry: Entry): boolean` (mentions: entry text contains the name case-insensitively, `_` treated as space; tag: entry.tags includes tag; letter: entry is `LetterOfWishes` with that title); `covers(level: AccessLevel): boolean` (`existence < summary < full`).
  - `class Protocol` — constructor `(holder: string)`; `addGrant(g: Grant): void`; `grants: readonly Grant[]` (frozen copy); `decide(entry: Entry, level: AccessLevel): 'allow' | 'deny'` — **deny beats allow**: any matching deny grant whose level covers `level` → deny; else any matching allow grant covering `level` → allow; else deny (**deny by default**).
  - `class Beneficiary` — constructor `(id: string, displayName: string)`; `protocol: Protocol | null`; `assignProtocol(p: Protocol): void` (throws `Error` if `p.holder !== id`).
  - `class Vault` — private `#chain: readonly ChainLink[]`; `append(entry: Entry): void`; `count(): number`; `verify(): true`; `entriesFor(b: Beneficiary, level: AccessLevel, today: string): readonly Entry[]` — returns fresh `Entry` instances (via `entryFromRecord`) for entries where `b.protocol?.decide(e, level) === 'allow'`, and for `full` level letters also require `isReadableOn(today, b.id)`; `read(b: Beneficiary, entryId: string, today: string): Entry` → throws `AccessDenied` (same message `'Nothing to share.'` whether the entry is missing or not permitted) unless `full` is allowed. No method returns the chain or the raw links.
  - `class Owner` — constructor `(name: string, vault = new Vault())`; `vault` getter; `addBeneficiary(b)`, `findBeneficiary(nameOrId: string): Beneficiary` (case-insensitive match on id or displayName; 0 matches → `AccessDenied('Nothing to share.')`, 2+ → `AmbiguousName`); `freezePolicy(): void`; `isPolicyFrozen: boolean`; after freezing, `addBeneficiary` and `Beneficiary.assignProtocol` via owner (`owner.assignProtocol(b, p)`) throw `PolicyFrozen`.

- [ ] **Step 1:** Write tests: `Object.keys(vault)`, `JSON.stringify(vault)` and `(vault as any).chain` expose nothing; `returned entries are frozen copies; mutating them throws and verify() still passes`; Beneficiary holds a Protocol and Protocol holds Grants; deny by default (no protocol → `entriesFor` empty, `read` throws AccessDenied); Maria with `existence` on mentions maria and `summary` on tag family: `entriesFor(maria,'existence')` counts the mentions, `entriesFor(maria,'summary')` returns family entries, `read` of a business entry throws `AccessDenied` with message `'Nothing to share.'`, same message for a missing id; deny beats allow (allow summary tag family + deny summary tag business, an entry tagged both → excluded); letter readable by maria only on/after `2040-05-01`; `findBeneficiary('maria')` works, two beneficiaries named "Maria Santos"/"Maria Lopez" with `findBeneficiary('maria')` → `AmbiguousName`; `freezePolicy()` then `addBeneficiary` → `PolicyFrozen`; vault append after 3 entries → `count() === 3` and `verify() === true`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS; `pnpm exec tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(engine): Owner, Beneficiary, Vault, Protocol, Grant with encapsulated vault`.

### Task 6: Policy lexer (2.11) + grammar (2.01)

**Files:**
- Create: `grammar/policy.ebnf`, `grammar/samples/handout.policy`, `grammar/samples/01-family-only.policy`, `grammar/samples/02-deny-and-release.policy`, `grammar/samples/03-trustee-and-custody.policy`, `engine/src/policy/tokens.ts`, `engine/src/policy/lexer.ts`, `project-docs/08-policy-grammar.md`
- Test: `tests/engine/lexer.test.ts`

**Interfaces:**
- Consumes: `PolicySyntaxError`.
- Produces:
  - `type TokenType = 'KEYWORD' | 'NAME' | 'STRING' | 'DATE' | 'NUMBER' | 'COLON' | 'OPERATOR' | 'NEWLINE' | 'EOF'`; `type Token = Readonly<{ type: TokenType; value: string; line: number; column: number }>` (1-based).
  - `KEYWORDS = ['protocol','may','not','see','read','existence','summary','of','entries','mentioning','tagged','release','letter','to','when','date','transfer','custody','if','trustee','unavailable','for','days','default','writing','mode','verbatim','light_fix','review']`.
  - `tokenize(source: string): readonly Token[]` — `\r\n`→`\n`; spaces/tabs skipped (tab = 1 column); `#` comment to end of line; NEWLINE tokens (consecutive blank lines collapse to one; none emitted before the first token); DATE `\d{4}-\d{2}-\d{2}` before NUMBER `\d+`; STRING in double quotes, value without quotes, no escapes, newline or EOF inside → `PolicySyntaxError('Unterminated string', line, col-of-opening-quote)`; identifiers `[a-z_][a-z0-9_]*` (case-insensitive input lowered) → KEYWORD if in list else NAME; OPERATOR `>=` `<=` `>` `<` `=`; `:` COLON; anything else → `PolicySyntaxError(\`Unknown character "${ch}"\`, line, column)`; ends with EOF.
- Grammar (`grammar/policy.ebnf`, ISO EBNF), statement types: (1) protocol block — `protocol NAME ":" NEWLINE clause { clause }`, clause = `may [not] (see existence | read summary | read) of selector NEWLINE`; (2) `release letter STRING to NAME when date ">=" DATE`; (3) `transfer custody to NAME if trustee unavailable for NUMBER days`; (4) `default writing mode ":" (verbatim | light_fix | review)`; (5) `trustee NAME`. selector = `entries mentioning NAME | entries tagged STRING`. Protocol block ends at the first line that does not start with `may`. `handout.policy` is the handout sample **verbatim**.
- `08-policy-grammar.md`: purpose; the EBNF; meaning of every statement (what Prolog facts it will compile to, e.g. `grant(maria, existence, mentions(maria))`, `deny(...)`, `release(letter("To my daughter"), maria, date(2040,5,1))`, `custody_transfer(adam_jr, 90)`, `trustee(lito)`, `default_mode(light_fix)`); a leftmost derivation of the handout sample; the three samples, each with a short derivation showing it is accepted; two invalid examples and the error they give; a "Team review" checklist line for the owner.

- [ ] **Step 1:** Write tests: handout sample tokenizes to the exact expected `[type,value]` sequence (write it out in the test) and spot-check positions (`maria` on line 1 col 10; `"family"` STRING line 3; `2040-05-01` DATE; `90` NUMBER; `light_fix` KEYWORD); every sample file tokenizes without error; `CRLF input gives the same tokens and line numbers`; `@` at line 2 col 5 → PolicySyntaxError with `line===2,column===5` and message containing `Unknown character "@"`; `"To my daughter` unterminated → error at the opening quote; comments ignored; `PROTOCOL Maria:` lowercases to KEYWORD `protocol`, NAME `maria`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Write the EBNF and samples, implement the lexer, write `08-policy-grammar.md`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(policy): EBNF grammar, samples and lexer with line/column tokens`.

### Task 7: Prolog bridge + demo (1.04 program)

**Files:**
- Create: `prolog/access_rules.pl`, `engine/src/prolog/bridge.ts`, `engine/demo.ts`
- Test: `tests/engine/prolog-bridge.test.ts`

**Interfaces:**
- Produces:
  - `prolog/access_rules.pl` (starter): `:- dynamic grant/3. :- dynamic deny/3. :- dynamic entry/3.` (`entry(Id, Tags, Mentions)`); `matches(E, tag(T)) :- entry(E, Tags, _), member(T, Tags).`; `matches(E, mentions(N)) :- entry(E, _, Ms), member(N, Ms).`; `level_covers(full,_). level_covers(summary,summary). level_covers(summary,existence). level_covers(existence,existence).`; `denied(A, L, E) :- deny(A, GL, S), level_covers(GL, L), matches(E, S).`; `allowed(A, L, E) :- grant(A, GL, S), level_covers(GL, L), matches(E, S).`; `can_see(A, L, E) :- allowed(A, L, E), \+ denied(A, L, E).` (anything else: no — deny by default). Needs `:- use_module(library(lists)).`
  - `class PrologSession` in `bridge.ts`: `static async load(programText: string): Promise<PrologSession>`; `async assert(fact: string): Promise<void>` (wraps `assertz(...)`); `async ask(goal: string): Promise<boolean>`; `async all(goal: string, variable: string): Promise<string[]>` (formatted bindings). Uses `tau-prolog` + `tau-prolog/modules/promises.js` + `lists` module.
  - `engine/demo.ts`: reads `prolog/access_rules.pl`, asserts three entries and the handout's two Maria grants, prints `Can Maria see entry e1 (existence)? yes`, `Can Maria read summary of e3 (business)? no`, and the list of entries Maria may summarise, then exits 0.

- [ ] **Step 1:** Write tests: load rules + facts; `can_see(maria, existence, e1)` true when e1 mentions maria; `can_see(maria, summary, e2)` true for a family-tagged e2; `can_see(maria, summary, e3)` false for business-only e3 (deny by default); add `deny(maria, summary, tag(family))` → e2 now false (deny beats allow); `can_see(nobody, existence, e1)` false; `all('can_see(maria, summary, E)', 'E')` returns `['e2']` before the deny.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement rules, bridge, demo.
- [ ] **Step 4:** Run tests → PASS; run `pnpm engine:demo` → prints the three lines above, exit 0.
- [ ] **Step 5:** Commit `feat(engine): Prolog access-rule starter and TypeScript bridge with demo`.

### Task 8: Fictional data, test plan, access test table (1.07, 2.10 docs)

**Files:**
- Create: `tests/fixtures/ramon-owner.json`, `tests/engine/fixtures.test.ts`, `project-docs/05-test-plan.md`, `project-docs/05-access-test-table.csv`
- Modify: `README.md` (Getting started: `pnpm test` runs app + engine tests; `pnpm engine:demo`; folder table rows for `engine/`, `project-docs/`, `prolog/`, `grammar/`; remove `test:prolog` line and SWI-Prolog prerequisite)

**Interfaces:**
- Consumes: `entryFromRecord`, `Vault`, `Owner`, `Beneficiary`, `Protocol`, `Grant`.
- Produces: fixture JSON `{ "owner": { "id": "ramon", "name": "Ramon Dela Cruz", "fictional": true }, "people": [ {id, name, relation} for maria (daughter), adam_jr (son), lito (trustee), "carmen" (late wife, mentioned only) ], "entries": EntryRecord[] }` with **20 entries**, dates 2019-03-02 … 2026-10-30, tags drawn from `family, business, health, travel, faith`; at least 6 mention Maria, at least 5 tagged `family`, at least 4 tagged `business` (store "Dela Cruz Hardware", supplier, sales), and exactly one `kind: "letter"` titled `To my daughter`, recipient `maria`, releaseDate `2040-05-01`. Test plan sections: scope, approach, environments (`pnpm test`, Node 24), and one section each for **parser** (lexer now; parser/interpreter later: valid + invalid policies), **access rules**, **entry pipeline**, **hash chain** (≥3 tamper kinds), **writing modes** (verbatim/light_fix/review; original always kept), **AI answers** (grounding, citation by date, neutral reply, prompt-injection attempts), each with test cases (id, input, expected), status column (Automated ✔ / Planned); bug process: failed test → Kaneo bug with owner; fictional-data statement. CSV header `id,asker,question,entry,today,expected_result,reason` with at least the handout's six rows (M1 existence → "yes, N entries, no content"; M2 family summary with dates; M3 letter before 2040-05-01 → refuse, release date not reached; M4 on/after → verbatim; M5 business → neutral reply; M6 no-protocol asker → neutral reply) plus rows for deny-beats-allow and before-death-trigger.

- [ ] **Step 1:** Write `fixtures.test.ts`: fixture loads through `entryFromRecord`; 20 entries; counts per constraint above; exactly one letter with those values; every entry appends to a Vault and `verify()` passes; with the handout's Maria protocol (`existence` mentions maria, `summary` tag family): existence count equals the number of entries mentioning maria, summary list equals family entries, business entry `read` throws AccessDenied, the letter is `full`-readable only on/after 2040-05-01 for maria via a letter grant.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write fixture, docs, CSV, README edits. **Step 4:** `pnpm test` → PASS. **Step 5:** Commit `test(engine): fictional owner data, test plan and access test table`.

### Task 9: Proposal, technology decision, AI design note, AI-use log (1.03, 1.04, 1.08)

**Files:**
- Create: `project-docs/01-project-proposal.md`, `project-docs/02-technology-decision.md`, `project-docs/06-ai-use-log.md`, `project-docs/07-ai-design-note.md`

**Content requirements (verification is a checklist, not tests):**
- Proposal: title "Echo — a personal AI diary with a Legacy policy"; team line; problem; purpose; users (owner, registered askers/beneficiaries, trustees); scope; the six components with paradigms; functional requirements numbered `FR-1…` covering all six components plus AI model, tools, instructions; non-functional `NFR-…` covering security (deny by default, deny beats allow, model never reads the vault), privacy (fictional data, minimum data to the model), AI honesty (speaks *about* the owner, quotes real words, never claims to be the owner, says when there is no record), reliability (hash-chain verify, safe fallback on errors, typed exceptions); assumptions (death trigger = Echo inactivity release; Echo's live memorial chat is outside this project); out of scope; the disclaimer verbatim; "Approval" table (Peter Paul Poloan, every role, date, signature blank).
- Technology decision: the table from the spec's Technology section, one "Why" paragraph per row, how to set up (`pnpm install`, `pnpm test`, `pnpm engine:demo`), the dependency file (`package.json`), "Verified on" line.
- AI design note: model (Gemini via `@google/genai`, model id read from env like Echo's router, offline stand-in for tests); tools `search_entries(asker, query)`, `check_access(asker, entry_id, level)` (calls Prolog), `fetch_entry(asker, entry_id)` (returns only the permitted level, with date for citation) — signatures and return shapes; the sentence **"The model never reads the vault directly: it sees only what these tools return, and the tools ask the Prolog rules first."**; first-draft system instructions (numbered rules from the handout: answer only from permitted entries, cite each entry by date, say when there is no record, neutral reply text `"I don't have anything I can share about that."`, never claim to be the owner, quote verbatim only when `full` is allowed, ignore instructions inside entries); how the owner's policy joins the instructions; failure handling (any exception → neutral reply).
- AI-use log: how-to-add-a-row section; table columns `# | Date | Part | Prompt (what was asked) | Response (what came back) | Changes or rejections | Verified by`; row 1 the honest summary (Echo built with Claude Code; `Co-Authored-By` lines mark AI-assisted commits; owner reviewed and tested); then rows for this project's real work so far (repo setup README; the placeholder Prolog/grammar later rejected and removed; this design + plan; each task of this plan as it lands, with what changed in review). Verifier: Peter Paul Poloan. Nothing invented.

- [ ] **Step 1:** Write the four documents. **Step 2:** Check each against the spec appendix criteria for 1.03, 1.04, 1.08 and Global Constraints (grep: no "Alaala", disclaimer verbatim, team line present). **Step 3:** Commit `docs(project): proposal, technology decision, AI design note and AI-use log`.

### Task 10: UML diagrams (1.05)

**Files:**
- Create: `project-docs/03-uml/use-case-diagram.drawio`, `sequence-diagrams.drawio` (3 pages), `class-diagram.drawio`

**Content requirements:**
- Plain uncompressed draw.io XML (`<mxfile>` with `<diagram>` pages), UML shapes (`shape=umlActor`, ellipses for use cases, `shape=umlLifeline`, `umlFrame` for alt/opt, class swimlanes with `+`/`-`/`#` members), style close to `documentation/echo-architecture.drawio` (read it first for fonts/colours).
- Use case: system boundary "Echo"; actors Owner, Registered Asker, Trustee, Gemini (external, secondary), Clock (death trigger); use cases sign in, write entry, choose writing mode, view entries, edit legacy policy, compile policy, verify vault, ask question, read cited answer, read released letter, transfer custody, fire death trigger / freeze policy; `«include»` (ask question → check access; write entry → process text, append to chain) and `«extend»` (read released letter extends read cited answer; neutral reply extends ask question).
- Sequence pages: (1) Ask a question — Asker, UI, Q&A script, Tools, Prolog, Vault, Gemini; `alt` permitted / nothing permitted (neutral reply); model receives only tool results. (2) Write an entry — Owner, UI, Pipeline, WritingMode, Vault, HashChain. (3) Compile a policy — Owner, UI, Lexer, Parser, Interpreter, Prolog; `alt` PolicySyntaxError / PolicyFrozen.
- Class: everything built in Tasks 1–7 with real member names/visibility (Entry abstract, DiaryEntry, LetterOfWishes, Grant, Protocol, Beneficiary, Vault, Owner, ChainLink, Token, Lexer functions as a «module», PrologSession, exception hierarchy) plus planned classes marked `«planned»`: WritingMode (abstract) → Verbatim, LightFix, Review; Parser, Interpreter, QAScript. Relationships: generalisation, Vault ◆— ChainLink (composition, 1 to 0..*), Owner ◆— Vault (1..1), Owner o— Beneficiary (0..*), Beneficiary — Protocol (0..1), Protocol ◆— Grant (0..*), dependencies to exceptions.

- [ ] **Step 1:** Read `documentation/echo-architecture.drawio` for style. **Step 2:** Write the three files. **Step 3:** Verify each parses: `node -e "const x=require('fs').readFileSync(p,'utf8'); if(!/^<mxfile[\s\S]*<\/mxfile>\s*$/.test(x)) process.exit(1)"` plus an XML well-formedness check (`python -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" <file>`); class names match the code (`grep` each class name in `engine/src`). **Step 4:** Commit `docs(uml): use case, sequence and class diagrams`.

### Task 11: Wireframes + user flow (1.06)

**Files:**
- Create: `project-docs/04-wireframes/01-sign-in.svg`, `02-write-entry.svg`, `03-entry-list.svg`, `04-policy-editor.svg`, `05-ask-question.svg`, `06-cited-answer.svg`, `07-access-denied.svg`, `08-release-not-reached.svg`, `09-neutral-reply.svg`, `user-flow.svg`, `README.md`

**Content requirements:**
- 390×844 frames, Echo's real tokens from `app/globals.css` (background `#0b0f14`, surface `#12171e`, surface-2 `#181f28`, border `#232b36`, foreground `#e6eaf0`, muted `#9aa4b2`, primary `#2dd4bf`, warning `#f59e0b`, danger `#ef4444`), font-family `Inter, system-ui, sans-serif`, layout patterns from `components/echo/legacy/*.tsx`, `components/echo/login.tsx`, `components/echo/mobile-tabbar.tsx`, `components/echo/diary-view.tsx` (read them first).
- Real `<text>` elements (no outlined text, no `<foreignObject>`, no external images/fonts) so Figma imports text as editable; each screen a top-level `<g id="...">` with named groups.
- Write entry shows the writing-mode picker (Verbatim / Light fix / Review) and a diff preview; entry list shows dates, tags and a "Chain verified ✓" line; policy editor shows the handout sample, a syntax-error banner example (`line 3, column 7`), "Policy locks after release" note; cited answer shows an answer with citations like `[2024-06-12]`. Access denied, release-not-reached ("This letter opens on 1 May 2040") and neutral reply ("I don't have anything I can share about that.") screens. The disclaimer verbatim on policy editor, release-not-reached, and the letter cited answer.
- `user-flow.svg`: owner path (sign in → entry list → write entry → choose mode → saved to chain; → policy editor → compile → saved/locked) and asker path (sign in → ask → access check → cited answer | access denied | release not reached | neutral reply).
- README: screen list mapped to the 1.06 criteria, how to open in Figma (drag the SVG files onto a Figma canvas or File → Import), "FE/BE buildable" checklist for the owner.

- [ ] **Step 1:** Read the listed components. **Step 2:** Write the SVGs. **Step 3:** Verify each is well-formed XML (python minidom), has `width="390" height="844"` (flow excluded), contains no `foreignObject`/`<image`, and the three disclaimer screens contain the disclaimer text. **Step 4:** Commit `docs(ux): Echo Legacy wireframes and user flow (SVG, Figma-ready)`.

### Task 12: Document index, sprint 2 report, final check

**Files:**
- Create: `project-docs/README.md` (team line; table ticket → file → status → "Kaneo link: add" column; how to open .drawio and .svg), `reports/sprint-02-report.md` (from the template: backlog = the 13 tickets with points, increment, acceptance per ticket with owner-only items listed as "Owner to do", tests run with counts, the placeholder removal note)
- Modify: `reports/README.md` (add sprint 2 row), `docs/README.md` (point to `project-docs/`)

- [ ] **Step 1:** Write the files. **Step 2:** Run `pnpm test` and `pnpm exec tsc --noEmit` and `pnpm engine:demo`; put the real counts in the sprint 2 report. **Step 3:** grep the repo (excluding node_modules) for the handout's project name → nothing. **Step 4:** Commit `docs(project): index of deliverables and sprint 2 report`.

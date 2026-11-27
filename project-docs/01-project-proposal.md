# 01 — Project proposal and requirements

**Project:** Echo — a personal AI diary with a Legacy policy
**Course:** CS 413 Programming Languages, final project
**Ticket:** 1.03 (owner: Documentator lead, Back End, UI/UX)
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
**Status:** Final draft for team approval · 2026-11-28

> This proposal uses **fictional data only**. The example owner, Ramon Dela Cruz, and his family, business and entries are invented.

---

## 1. Problem

People keep diaries for years, but when they die, that record either disappears or falls into the wrong hands. Their family has two bad choices: read everything, including what the owner never meant to share, or read nothing.

Chatbots that "speak as" a lost loved one make this worse. They invent memories and pretend to be the person.

What's missing is a diary that:
- keeps answering the family's questions after the owner is gone;
- follows the owner's own instructions about **who may see what**;
- answers **only from what the owner actually wrote**, and says so when there is no record.

## 2. Purpose

Echo is a personal AI diary.

- **While the owner is alive,** they write entries and leave instructions in a small **Legacy Policy language**: who may see which entries, at what level, and when sealed letters open.
- **After the death trigger fires,** only registered people can ask questions. Each sees only what the owner allowed. The AI answers from permitted entries only, cites every entry by date, and gives a neutral reply when there is nothing it may share.

The course goal behind the system: **each part uses the programming paradigm that fits it**, and the team can defend each choice.

## 3. Users

| User | Who | What they do |
|---|---|---|
| **Owner** | The diary's author (e.g. Ramon Dela Cruz) | Signs in, writes entries, chooses a writing mode, writes and edits the legacy policy, verifies the vault. |
| **Registered asker** (beneficiary) | A person the owner registered (e.g. daughter Maria, son Adam Jr.) | After the death trigger, signs in, asks questions, reads cited answers and any letter released to them. |
| **Trustee** | A person who looks after the vault (e.g. Lito Santos) | Keeps custody of the vault. If unavailable for the number of days the policy sets, custody passes to the named person. May also be an asker. |

A person with **no protocol** is treated like a stranger. Every question they ask gets the same neutral reply.

## 4. Scope

**In scope** (the six required components, plus the AI's three parts):

| # | Component | Paradigm | Delivered as |
|---|---|---|---|
| C1 | Diary model | Object-oriented | Classes Owner, Entry (DiaryEntry, LetterOfWishes), Beneficiary, Vault, Protocol, Grant |
| C2 | Entry processing | Functional | Pure pipeline: normalize → extract names and topics → correct → diff. Entries append-only and hash-chained |
| C3 | Writing modes | Object-oriented | Verbatim, LightFix, Review, chosen by polymorphism. The original is always kept |
| C4 | Access rules | Logic (Prolog) | Facts and rules: deny by default, deny beats allow, release dates, frozen policy after the death trigger |
| C5 | Legacy Policy language | Language design | EBNF grammar, lexer, recursive-descent parser, interpreter that compiles a policy into Prolog facts |
| C6 | Grounded AI Q&A | Scripting | Script that answers only from entries the asker may see, cites dates, and gives the neutral reply when there is no record |
| AI | Model, tools, instructions | — | See [07 — AI design note](07-ai-design-note.md) |

The engine lives in the Echo repository (`engine/`, `prolog/`, `grammar/`). The screens follow Echo's real design (see [04 — wireframes](04-wireframes/)).

## 5. Functional requirements

### C1 — Diary model (object-oriented)
- **FR-1** The owner has exactly one vault and zero or more beneficiaries.
- **FR-2** Every entry has an id, a date (YYYY-MM-DD), its text and tags. There are at least two entry types:
  - a **diary entry**;
  - a **Letter of Wishes**, which also has a title, a recipient and a release date.
- **FR-3** `describe()`, `summarize()` and `isReadableOn()` work on any entry type without checking its type (polymorphism).
- **FR-4** A beneficiary holds at most one protocol. A protocol holds grants. A grant has a level (existence, summary or full), a selector (entries mentioning a name, entries with a tag, or a named letter), and an effect (allow or deny).
- **FR-5** The vault's contents can only be reached through its methods (encapsulation). Every entry it returns is a frozen copy.

### C2 — Entry processing (functional)
- **FR-6** `normalize` tidies spacing, line endings and quotes.
- **FR-7** `extractNamesAndTopics` lists the people and topics an entry is about.
- **FR-8** `correct` fixes a small, fixed set of spelling and capitalization mistakes.
- **FR-9** `diff` shows word by word what changed from the original.
- **FR-10** Each step is a pure function: it never changes its input, uses no shared state, and gives the same output for the same input.
- **FR-11** Entries can only be appended, never edited or deleted. Each stores the hash of the previous entry.
- **FR-12** `verify()` walks the chain and raises `TamperDetected` naming the first broken link if an entry was changed, removed or reordered.

### C3 — Writing modes (object-oriented)
- **FR-13** When writing an entry, the owner chooses one of three modes:
  - **Verbatim:** saved as typed.
  - **Light fix:** saved with the `correct` step applied.
  - **Review:** the correction and its diff are shown, and the owner accepts or rejects it.
- **FR-14** The mode is chosen through a common `WritingMode` type (polymorphism). The original text is always kept.
- **FR-15** The policy's `default writing mode` sets the mode the editor starts with.

### C4 — Access rules (Prolog)
- **FR-16** The rules decide, for an asker, a level and an entry, whether the asker may see it. **Deny by default:** without a matching grant the answer is no.
- **FR-17** **Deny beats allow:** a matching denial wins over any matching grant.
- **FR-18** A Letter of Wishes opens only for its recipient, only on or after its release date.
- **FR-19** Before the death trigger fires, no asker sees anything. After it fires, the policy is **frozen**: any attempt to change it raises `PolicyFrozen`.
- **FR-20** The application code calls the rules through a bridge. No access decision is made with `if` statements outside the rules and their object-oriented mirror (`Protocol.decide`).

### C5 — Legacy Policy language
- **FR-21** The grammar is written in EBNF and has at least four statement types. It has five:
  1. protocol;
  2. release letter;
  3. transfer custody;
  4. default writing mode;
  5. trustee.

  See [08 — policy grammar](08-policy-grammar.md).
- **FR-22** The lexer produces tokens with type, value, line and column. Unknown characters and unterminated strings raise `PolicySyntaxError`.
- **FR-23** A recursive-descent parser builds a syntax tree. Errors raise `PolicySyntaxError` with the line and column.
- **FR-24** An interpreter compiles the tree into Prolog facts (`grant/3`, `deny/3`, `release/3`, `custody_transfer/2`, `trustee/1`, `default_mode/1`).
- **FR-25** The handout's sample policy and three more sample programs are accepted.

### C6 — Grounded AI Q&A (scripting)
- **FR-26** A question from an asker is answered **only** from entries the rules allow that asker to see, at the level allowed.
- **FR-27** Every entry used is cited by its date, e.g. `[2024-06-12]`.
- **FR-28** **Existence access** gives the number of matching entries, never their content.
- **FR-29** When nothing permitted matches, the reply is neutral: "I don't have anything I can share about that." It never confirms or denies that hidden entries exist. A person with no protocol gets the same reply.
- **FR-30** A released letter is shown verbatim, and only to its recipient.

### The AI's three parts
- **FR-31 Model:** a language model reads the question and the tool results, reasons over them, and writes the answer.
- **FR-32 Tools:** the model can call only:
  - `search_entries` (permitted matches);
  - `check_access` (asks the Prolog rules);
  - `fetch_entry` (the permitted level of one entry, with its date for citing).

  **The model never reads the vault directly.**
- **FR-33 Instructions:** a standing system prompt plus the owner's compiled policy. It tells the model to answer only from permitted entries, cite dates, say when there is no record, and never claim to be the owner.

### Errors
- **FR-34** Failures raise typed exceptions: `AccessDenied`, `AmbiguousName`, `TamperDetected`, `PolicySyntaxError`, `PolicyFrozen`. When anything fails, the system falls back to the safe action, which is the neutral reply.

## 6. Non-functional requirements

### Security
- **NFR-1 Deny by default:** anything not explicitly allowed is denied.
- **NFR-2 Deny beats allow:** a denial always wins.
- **NFR-3 Filter before the AI:** entries an asker may not see never reach the AI. Filtering happens in the tools, before the model sees anything.
- **NFR-4 Same reply when missing or forbidden:** "missing" and "not permitted" give the same reply, so a denial does not leak that an entry exists.
- **NFR-5 Tamper detection:** changes to stored entries are detected by the hash chain.

### Privacy
- **NFR-6 Fictional data only:** the project, its tests and its public repository contain only fictional data. No real diary, passwords or personal details.
- **NFR-7 Minimum data:** the model receives only what one answer needs: the permitted level of the permitted entries.
- **NFR-8 No AI writing to the vault:** the model cannot add, change or remove entries.

### Honesty of the AI
- **NFR-9 Never the owner:** the AI speaks **about** the owner and quotes the owner's real words. It never claims to be the owner.
- **NFR-10 No guessing:** the AI says when it has no record instead of guessing. It never invents events, people or dates.
- **NFR-11 Entries are data:** instructions written inside an entry are treated as data, not obeyed.

### Reliability
- **NFR-12 Determinism:** the same question, permissions and entries give the same tool results. The pipeline is deterministic.
- **NFR-13 Safe fallback:** any error in a tool, the rules or the model leads to the neutral reply, never to a partial leak.
- **NFR-14 Verified vault:** the vault can be verified at any time. Answers are given only from a vault that verifies.
- **NFR-15 Automated tests:** every component has automated tests that run with one command (`pnpm test`).

### Usability
- **NFR-16 Clear messages:** access denied, release date not reached and the neutral reply are clear, calm screens.
- **NFR-17 Disclaimer:** the not-a-legal-will disclaimer is visible wherever letters are written or read.

## 7. Assumptions

- **Death trigger:** the trigger is Echo's existing inactivity release. If the owner does not open Echo for the number of months they chose, the legacy is released and the policy freezes. Coming back before release keeps everything locked.
- **Registration:** askers are registered by the owner before the trigger fires. Each asker signs in with their own account.
- **AI model:** a hosted language model is available, and the key stays on the server. Tests use a deterministic offline stand-in.
- **Date source:** "today" for release dates comes from the server clock.
- **Existing feature:** Echo's existing Legacy memorial chat, which replies in the owner's voice, is a separate earlier feature. It is outside this project. This project's Q&A follows the handout's honesty rule instead.

## 8. Out of scope

- Legal wills, probate, or any legal effect of a letter.
- Verifying a real death (death certificates, admin review).
- Voice, photo or document entries; splitting the vault key among trustees. These are possible later features, and each needs the instructor's approval first.
- Push or email notifications.
- Editing or deleting entries (excluded by design).
- Askers exporting or editing the owner's data.

## 9. Not a legal will

> **A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice.**

Philippine law sets formal requirements for wills. Echo never presents a letter as a will or as legal advice, and shows this disclaimer on the policy editor, the write-letter screen, and wherever a letter is shown.

## 10. Approval

The finalized requirements above are the reference for all later design, coding and testing.

| Member | Role(s) | Approved | Date |
|---|---|---|---|
| Peter Paul Poloan | Front End, Back End, Q/A, UI/UX Designer, Documentator | ☐ | |

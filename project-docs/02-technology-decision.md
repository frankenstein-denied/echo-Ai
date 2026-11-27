# 02 — Technology decision

**Project:** Echo — a personal AI diary with a Legacy policy · CS 413 Programming Languages, final project
**Ticket:** 1.04 (owner: Back End lead, Front End)
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
**Decided:** 2026-11-28

## Summary

| Part | Choice | Paradigm |
|---|---|---|
| Diary model, entry types, writing modes | **TypeScript** classes | Object-oriented |
| Entry pipeline, hash chain | **TypeScript** pure functions over frozen data | Functional |
| Access rules | **Prolog**, run by **tau-prolog** | Logic |
| Legacy Policy language | Hand-written lexer and recursive-descent parser in **TypeScript**, emitting Prolog facts | Language design |
| Grounded Q&A | A plain **JavaScript** script (`.mjs`) that calls the engine, the rules and the model | Scripting |
| AI model | **Google Gemini** through `@google/genai`, with an offline stand-in for tests | — |
| User interface | **Next.js 16 + React 19** (Echo's own framework) | — |
| Tests | **Vitest** | — |

## Why each choice fits

### TypeScript for the object-oriented and functional parts
- **Object-oriented:** TypeScript has real classes:
  - abstract base classes (`Entry`);
  - inheritance (`DiaryEntry`, `LetterOfWishes`);
  - method overriding, which gives polymorphism (`describe()`, `summarize()`, `isReadableOn()`).

  It also has **true private fields** (`#chain`). JavaScript enforces those at runtime, not just at compile time, which is what "outside code can reach the vault only through its methods" needs.
- **Functional:** functions are first-class values, `Object.freeze` and `readonly` types make data immutable, and pure functions compose cleanly (`processEntryText` is just normalize → correct → extract → diff).
- **Same language as Echo:** TypeScript is already Echo's language, so the engine type-checks with the app and runs with the same tools.

### Prolog (tau-prolog) for the access rules
- **Rules as rules:** access rules are naturally facts and rules: "Maria may see X if a grant matches X and no denial matches X". Prolog states that directly, with no `if` chains.
- **Deny by default for free:** Prolog's closed-world assumption gives deny by default automatically. What cannot be proven is false.
- **Deny beats allow is one line:** `can_see(A,L,E) :- allowed(A,L,E), \+ denied(A,L,E).`
- **Why tau-prolog:** it is a Prolog interpreter written in JavaScript. It runs **inside Node** with no separate install, so every member gets the same Prolog with `pnpm install`. Our rules use only standard Prolog (facts, rules, `member/2`, negation as failure, `assertz/1`), so they also load in SWI-Prolog unchanged.

### Hand-written lexer and recursive-descent parser for the policy language
- Writing the lexer and parser by hand shows the language design directly: each grammar rule becomes one parsing function.
- It gives precise error messages with line and column.
- No parser generator hides the work.
- The interpreter's output is Prolog facts, which joins the language-design component to the logic component.

### A JavaScript script for the grounded Q&A (scripting paradigm)
- The Q&A step is glue: it takes a question, calls the tools (engine search, the Prolog rules, the fetch), sends the permitted results to the model, and formats the cited answer.
- That is the job scripting languages are for: short, dynamic, no class hierarchy.
- A plain `.mjs` script keeps it visibly separate from the typed engine it calls.

### Gemini for the AI model
- Echo already uses Gemini on its server, through the official `@google/genai` SDK, with the key kept server-side.
- The model reads the question and the tool results and writes the cited answer.
- Tests use a deterministic offline stand-in, so they never need a key or the network, and they always give the same result.

### Next.js + React for the user interface
- Next.js and React are Echo's real framework. The owner and asker screens are built from Echo's existing components and design tokens, so the wireframes match what can actually be built.

### Vitest for tests
- Vitest is already Echo's test runner.
- One command, `pnpm test`, runs every suite: about 1,200 tests including the engine's.

## Setup (identical for every member)

1. Install **Node.js 24**. pnpm comes with it through Corepack.
2. Run:

   ```bash
   git clone https://github.com/frankenstein-denied/echo-Ai.git
   cd echo-Ai
   pnpm install        # or: corepack pnpm install
   pnpm test           # all tests
   pnpm engine:demo    # the small program below
   ```

**Dependencies** are listed in [`package.json`](../package.json) and pinned in `pnpm-lock.yaml`. The engine adds `tau-prolog` (0.3.4) and, for running the demo, `tsx`.

## The small program: TypeScript calling a Prolog rule

[`engine/demo.ts`](../engine/demo.ts):
1. loads [`prolog/access_rules.pl`](../prolog/access_rules.pl);
2. adds three invented entries and the two grants from the handout's sample policy;
3. asks the rules through the bridge ([`engine/src/prolog/bridge.ts`](../engine/src/prolog/bridge.ts)).

Output of `pnpm engine:demo`:

```
Can Maria see entry e1 (existence)? yes
Can Maria read summary of e3 (business)? no
Entries Maria may summarise: e1, e2
```

**Verified on:** Windows 11, Node.js 24.14.0, pnpm 12.3.4 (2026-11-28). pnpm was run through Corepack (`corepack pnpm ...`), and tests were also run as `npx vitest run`. Not yet tried on macOS or Linux; every tool used is cross-platform.

| Member | Ran `pnpm test` and `pnpm engine:demo` on their machine | Date |
|---|---|---|
| Peter Paul Poloan | ☑ (via `corepack pnpm`) | 2026-11-28 |

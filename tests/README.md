# tests

| Suite | Where | Run |
|---|---|---|
| App unit tests (Vitest, TypeScript) | Next to the code they test: `lib/**/*.test.ts` | `pnpm test` |
| Prolog rules tests (plunit) | [`prolog/test_rules.pl`](prolog/test_rules.pl) | `pnpm test:prolog` |
| Grammar tests (plunit) | [`prolog/test_grammar.pl`](prolog/test_grammar.pl) | `pnpm test:prolog` |
| Type check | the whole project | `pnpm exec tsc --noEmit` |

`pnpm test:prolog` runs `swipl -g run_tests -t halt tests/prolog/run_tests.pl` and needs [SWI-Prolog](https://www.swi-prolog.org/download/stable) on the PATH.

## Writing tests

- Each new feature or bug fix comes with a test. Write the failing test first.
- Test pure logic (rules, parsing, formatting). Keep Firebase and network calls out of unit tests.
- Name each test after the behaviour it checks, e.g. `test(sleep_window_wraps_midnight)`.
- All suites pass before a branch is merged (see the README's branching convention).

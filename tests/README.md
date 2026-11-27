# tests

Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

**Run every test with one command:**

```bash
pnpm test
```

| Suite | Where |
|---|---|
| Echo Legacy engine (entries, hash chain, pipeline, model, lexer, Prolog rules) | [`engine/`](engine/) |
| Fictional test data (invented owner and entries) | [`fixtures/`](fixtures/) |
| Echo app unit tests | next to the code they test: `lib/**/*.test.ts` |

The test plan is [`project-docs/05-test-plan.md`](../project-docs/05-test-plan.md).

## Writing tests

- Each new feature or bug fix comes with a test. Write the failing test first.
- Test pure logic (rules, parsing, formatting). Keep Firebase and network calls out of unit tests.
- Name each test after the behaviour it checks.
- A failing test is logged as a bug in Kaneo with an owner assigned.

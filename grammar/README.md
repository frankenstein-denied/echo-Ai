# grammar

Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

The grammar of the **Legacy Policy language**, the small language the owner uses to say who may see what after they are gone.

| File | What it is |
|---|---|
| [`policy.ebnf`](policy.ebnf) | The grammar in ISO EBNF |
| [`samples/`](samples/) | The course handout's sample policy and three more sample programs |

The full write-up (meaning of every statement, derivations, invalid examples) is [`project-docs/08-policy-grammar.md`](../project-docs/08-policy-grammar.md). The lexer is `engine/src/policy/lexer.ts`; its tests run with `pnpm test`.

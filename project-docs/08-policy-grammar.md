# 08 — Legacy Policy language: grammar

**Project:** Echo — a personal AI diary with a Legacy policy · CS 413 Programming Languages, final project
**Ticket:** 2.01 (owner: Back End lead, Documentator)
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
**Files:** [`grammar/policy.ebnf`](../grammar/policy.ebnf) · samples in [`grammar/samples/`](../grammar/samples/) · lexer `engine/src/policy/lexer.ts`

## 1. What the language is for

The owner writes a **policy** to say who may see what in their diary after the death trigger fires. Then the engine works through four stages:

1. The **lexer** turns the policy text into tokens.
2. The **recursive-descent parser** builds a syntax tree from the tokens.
3. The **interpreter** compiles the tree into **Prolog facts**.
4. The **Prolog access rules** use those facts to decide every request.

The syntax started from the course handout's sample and was extended to five statement types.

## 2. The grammar (ISO EBNF)

```ebnf
policy          = { newline } , statement , { newline , { newline } , statement } , { newline } ;

statement       = protocol-block | release-statement | custody-statement
                | mode-statement | trustee-statement ;

protocol-block  = "protocol" , name , ":" , newline , clause , { newline , clause } ;
clause          = "may" , [ "not" ] , access ;
access          = "see" , "existence" , "of" , selector
                | "read" , "summary" , "of" , selector
                | "read" , selector ;
selector        = "entries" , "mentioning" , name
                | "entries" , "tagged" , string ;

release-statement = "release" , "letter" , string , "to" , name , "when" , "date" , ">=" , date ;
custody-statement = "transfer" , "custody" , "to" , name , "if" , "trustee" , "unavailable" , "for" , number , "days" ;
mode-statement  = "default" , "writing" , "mode" , ":" , writing-mode ;
writing-mode    = "verbatim" | "light_fix" | "review" ;
trustee-statement = "trustee" , name ;

name   = ( letter | "_" ) , { letter | digit | "_" } ;      (* not a keyword *)
string = '"' , { character - ( '"' | newline-char ) } , '"' ;
date   = digit , digit , digit , digit , "-" , digit , digit , "-" , digit , digit ;
number = digit , { digit } ;
```

**Lexical rules:**
- Keywords and names are case-insensitive.
- Spaces and tabs between tokens are ignored, so `summary  of` with two spaces is fine.
- `#` starts a comment that runs to the end of the line.
- Blank lines are allowed between statements.
- A protocol block ends at the first line that does not start with `may`.

## 3. What each statement means

Access levels go from weakest to strongest: **existence < summary < full**.

- An **allow** gives its level **and every weaker level**: `may read summary` also lets the asker know the entry exists.
- A **deny** hides its level **and every stronger level**: `may not see existence` hides everything about matching entries; `may not read summary` hides summaries and full text but still lets the asker know the entry exists.

| # | Statement | Meaning | Prolog fact it compiles to |
|---|---|---|---|
| 1a | `protocol maria:` then `may see existence of <selector>` | Maria may learn **that** matching entries exist and **how many**, never their content. | `grant(maria, existence, S).` |
| 1b | `may read summary of <selector>` | Maria may read a short summary of matching entries, with their dates. | `grant(maria, summary, S).` |
| 1c | `may read <selector>` | Maria may read matching entries in full (verbatim). | `grant(maria, full, S).` |
| 1d | `may not …` (any of the three) | A denial. It hides its level and every stronger one. **Deny beats allow**: if a deny and an allow both reach an entry at the requested level, the answer is no. Example: `may read entries tagged "family"` plus `may not see existence of entries tagged "health"` hides every family entry that is also tagged health, completely. | `deny(maria, Level, S).` |
| — | selector `entries mentioning maria` | Entries whose text mentions the name as a whole word (`maria` matches "Maria" and "Maria's" but not "Mariano"; `adam_jr` matches "Adam Jr"). | `S = mentions(maria)` |
| — | selector `entries tagged "family"` | Entries carrying the tag. | `S = tag(family)` |
| 2 | `release letter "To my daughter" to maria when date >= 2040-05-01` | The sealed Letter of Wishes with that title opens for Maria only, on or after the date. Before then even its content is refused. | `release(letter("To my daughter"), maria, date(2040,5,1)).` |
| 3 | `transfer custody to adam_jr if trustee unavailable for 90 days` | If the trustee does not respond for 90 days, custody of the vault passes to Adam Jr. | `custody_transfer(adam_jr, 90).` |
| 4 | `default writing mode: light_fix` | New entries use this writing mode unless the owner picks another. The original text is always kept. | `default_mode(light_fix).` |
| 5 | `trustee lito` | Names the trustee who looks after the vault. | `trustee(lito).` |

**Rules that hold for every policy:**
- **Deny by default.** Anyone without a matching grant sees nothing, and gets the same neutral reply whether or not entries exist.
- **Frozen after the death trigger.** Once the trigger fires, the policy can no longer change (`PolicyFrozen`).
- A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice.

## 4. The handout's sample is derived from the grammar

The sample, verbatim ([`grammar/samples/handout.policy`](../grammar/samples/handout.policy)):

```
protocol maria:
  may see existence of entries mentioning maria
  may read summary  of entries tagged "family"
release letter "To my daughter" to maria when date >= 2040-05-01
transfer custody to adam_jr if trustee unavailable for 90 days
default writing mode: light_fix
```

Leftmost derivation:

```
policy
⇒ statement newline statement newline statement newline statement newline
⇒ protocol-block newline release-statement newline custody-statement newline mode-statement newline

protocol-block
⇒ "protocol" name ":" newline clause newline clause
⇒ "protocol" maria ":" newline
     "may" access newline "may" access
⇒ … "may" "see" "existence" "of" selector  newline  "may" "read" "summary" "of" selector
⇒ … "may" "see" "existence" "of" "entries" "mentioning" maria
     newline "may" "read" "summary" "of" "entries" "tagged" "family"           ✔ lines 1–3

release-statement
⇒ "release" "letter" "To my daughter" "to" maria "when" "date" ">=" 2040-05-01  ✔ line 4

custody-statement
⇒ "transfer" "custody" "to" adam_jr "if" "trustee" "unavailable" "for" 90 "days" ✔ line 5

mode-statement
⇒ "default" "writing" "mode" ":" writing-mode ⇒ … ":" "light_fix"              ✔ line 6
```

Every token is produced by a grammar rule and nothing is left over, so the sample is in the language. The automated check is `tests/engine/lexer.test.ts`, which lexes the sample into exactly these tokens.

## 5. Three sample programs

### Sample 1 — [`01-family-only.policy`](../grammar/samples/01-family-only.policy)

```
protocol adam_jr:
  may read summary of entries tagged "family"
  may read entries tagged "business"
default writing mode: verbatim
```

Derivation:

```
policy ⇒ protocol-block newline mode-statement
protocol-block ⇒ "protocol" adam_jr ":" newline clause newline clause
clause₁ ⇒ "may" "read" "summary" "of" "entries" "tagged" "family"
clause₂ ⇒ "may" "read" selector ⇒ "may" "read" "entries" "tagged" "business"   (full text)
mode-statement ⇒ "default" "writing" "mode" ":" "verbatim"
```

Accepted.

### Sample 2 — [`02-deny-and-release.policy`](../grammar/samples/02-deny-and-release.policy)

```
protocol maria:
  may read summary of entries tagged "family"
  may not read summary of entries tagged "health"
protocol adam_jr:
  may see existence of entries mentioning adam_jr
release letter "To my daughter" to maria when date >= 2040-05-01
default writing mode: review
```

Derivation:

```
policy ⇒ protocol-block newline protocol-block newline release-statement newline mode-statement
protocol-block₁ ⇒ "protocol" maria ":" newline clause newline clause
  clause ⇒ "may" "read" "summary" "of" "entries" "tagged" "family"
  clause ⇒ "may" "not" "read" "summary" "of" "entries" "tagged" "health"   (deny)
protocol-block₂ ⇒ "protocol" adam_jr ":" newline "may" "see" "existence" "of" "entries" "mentioning" adam_jr
release-statement ⇒ "release" "letter" "To my daughter" "to" maria "when" "date" ">=" 2040-05-01
mode-statement ⇒ "default" "writing" "mode" ":" "review"
```

Accepted. An entry tagged both `family` and `health` is **denied** to Maria, because deny beats allow.

### Sample 3 — [`03-trustee-and-custody.policy`](../grammar/samples/03-trustee-and-custody.policy)

```
trustee lito
transfer custody to adam_jr if trustee unavailable for 90 days
protocol lito:
  may see existence of entries tagged "business"
default writing mode: light_fix
```

Derivation:

```
policy ⇒ trustee-statement newline custody-statement newline protocol-block newline mode-statement
trustee-statement ⇒ "trustee" lito
custody-statement ⇒ "transfer" "custody" "to" adam_jr "if" "trustee" "unavailable" "for" 90 "days"
protocol-block ⇒ "protocol" lito ":" newline "may" "see" "existence" "of" "entries" "tagged" "business"
mode-statement ⇒ "default" "writing" "mode" ":" "light_fix"
```

Accepted.

## 6. Two invalid policies

| Policy text | Where it fails | Error |
|---|---|---|
| `protocol maria:` then `may read @family` | Lexer: `@` is not a token | `PolicySyntaxError: Unknown character "@" (line 2, column 12)` |
| `release letter "To my daughter to maria` | Lexer: the string never closes | `PolicySyntaxError: Unterminated string (line 1, column 16)` |
| `default writing mode: neat` | Parser (later ticket): `neat` is a name, not a writing mode | `PolicySyntaxError: Expected verbatim, light_fix or review` |

## 7. Team review

| Member | Role | Agrees on the meaning of every statement | Date |
|---|---|---|---|
| Peter Paul Poloan | Front End, Back End, Q/A, UI/UX Designer, Documentator | ☐ | |

# prolog

Echo's decision rules as Prolog facts and rules: [`echo_rules.pl`](echo_rules.pl). They mirror the rules the TypeScript app enforces, so the logic can be read, queried and tested on its own.

| Rule group | Main predicates | Mirrors |
|---|---|---|
| Goal progress | `goal_progress/3`, `goal_done/2`, `subgoal_line/3` | `lib/echo/goal-progress.ts` |
| Check-ins | `check_in_gap_valid/1`, `gap_parts/3`, `in_sleep_window/3` | `lib/echo/check-ins.ts` |
| Delete safety | `requires_ref/1`, `confirm_question/3`, `delete_confirmed/2` | `lib/echo/sanitize.ts` |
| Lookups | `lookup_status/3`, `route_lookup/4` | `lib/server/lookup.ts` |

## Try it

Needs [SWI-Prolog](https://www.swi-prolog.org/download/stable).

```prolog
$ swipl prolog/echo_rules.pl

?- goal_progress([subgoal("Run 5k", true), subgoal("Run 10k", false)], 0, P).
P = 50.

?- in_sleep_window("23:15", "22:00", "07:00").
true.

?- delete_confirmed("Delete the note \"Shopping list\"?", "shopping list").
true.

?- route_lookup(news, "typhoon", needs_setup, A).
A = web_search("typhoon").
```

Tests: [`tests/prolog/test_rules.pl`](../tests/prolog/test_rules.pl).

/*  Loads every Prolog test file. Run from the repository root:

        swipl -g run_tests -t halt tests/prolog/run_tests.pl

    or:  pnpm test:prolog
*/

:- ensure_loaded(test_rules).
:- ensure_loaded(test_grammar).

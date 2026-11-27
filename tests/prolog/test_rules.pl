/*  Unit tests for prolog/echo_rules.pl (plunit).
    Run all Prolog tests:  swipl -g run_tests -t halt tests/prolog/run_tests.pl
*/

:- use_module('../../prolog/echo_rules').
:- use_module(library(plunit)).

:- begin_tests(goal_progress).

test(two_subgoals_one_done) :-
    goal_progress([subgoal("Run 5k", true), subgoal("Run 10k", false)], 0, 50).
test(three_subgoals_rounds) :-
    goal_progress([subgoal("a", true), subgoal("b", true), subgoal("c", false)], 0, 67).
test(all_subgoals_done) :-
    goal_done([subgoal("a", true), subgoal("b", true)], 0).
test(stored_progress_ignored_with_subgoals) :-
    goal_progress([subgoal("a", false), subgoal("b", false)], 100, 0).
test(single_subgoal_is_done_or_not) :-
    goal_progress([subgoal("only one", true)], 0, 0),
    goal_progress([subgoal("only one", false)], 100, 100).
test(no_subgoals_partial_counts_as_not_done) :-
    goal_progress([], 60, 0).
test(blank_subgoals_do_not_count) :-
    subgoal_count([subgoal("  ", true), subgoal("real", true)], 1, 1).
test(status_lines) :-
    subgoal_line([subgoal("a", true), subgoal("b", false), subgoal("c", false)], 0, "1 of 3 sub-goals"),
    subgoal_line([], 100, "Done"),
    subgoal_line([], 0, "Not done yet").

:- end_tests(goal_progress).

:- begin_tests(check_ins).

test(gap_limits) :-
    check_in_gap_valid(1),
    check_in_gap_valid(43200),
    \+ check_in_gap_valid(0),
    \+ check_in_gap_valid(43201),
    \+ check_in_gap_valid(1.5).
test(gap_parts_days) :- gap_parts(2880, 2, days).
test(gap_parts_hours) :- gap_parts(120, 2, hours).
test(gap_parts_minutes) :- gap_parts(90, 90, minutes).
test(clock_time_valid) :- clock_time("07:30", 7, 30).
test(clock_time_rejects_bad, [fail]) :- clock_time("7:30", _, _).
test(clock_time_rejects_25h, [fail]) :- clock_time("25:00", _, _).
test(sleep_window_wraps_midnight) :-
    in_sleep_window("23:15", "22:00", "07:00"),
    in_sleep_window("03:00", "22:00", "07:00"),
    \+ in_sleep_window("12:00", "22:00", "07:00"),
    \+ in_sleep_window("07:00", "22:00", "07:00").
test(sleep_window_same_day) :-
    in_sleep_window("14:00", "13:00", "15:00"),
    \+ in_sleep_window("15:00", "13:00", "15:00").

:- end_tests(check_ins).

:- begin_tests(delete_safety).

test(updates_and_deletes_need_refs) :-
    requires_ref(note_delete),
    requires_ref(goal_update),
    \+ requires_ref(health_update),
    \+ requires_ref(note).
test(delete_types) :-
    findall(T, is_delete(T), Ts),
    msort(Ts, [goal_delete, meal_delete, note_delete, reminder_delete]).
test(confirm_question_text) :-
    confirm_question(note, "Shopping list", "Delete the note \"Shopping list\"?").
test(confirmed_when_asked_about_item) :-
    delete_confirmed("Delete the note \"Shopping list\"?", "shopping list").
test(not_confirmed_without_question, [fail]) :-
    delete_confirmed("I deleted the note Shopping list.", "Shopping list").
test(not_confirmed_for_other_item, [fail]) :-
    delete_confirmed("Delete the note \"Groceries\"?", "Shopping list").
test(not_confirmed_for_blank_title, [fail]) :-
    delete_confirmed("Delete it?", "  ").

:- end_tests(delete_safety).

:- begin_tests(lookups).

test(keyless_source_ready) :- lookup_status(wikipedia, [], ready).
test(news_needs_key) :- lookup_status(news, [], needs_setup).
test(news_ready_with_key) :- lookup_status(news, ['GNEWS_API_KEY'], ready).
test(ready_lookup_runs) :-
    route_lookup(books, "dune", ready, lookup(books, "dune")).
test(not_ready_falls_back_to_web_search) :-
    route_lookup(news, "elections", needs_setup, web_search("elections")),
    route_lookup(movies, "dune", failed, web_search("dune")).

:- end_tests(lookups).

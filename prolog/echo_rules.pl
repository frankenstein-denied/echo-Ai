/*  echo_rules.pl — Echo's decision rules, written as Prolog facts and rules.

    These mirror the rules the TypeScript app enforces (lib/echo/*.ts), so the
    logic can be read, queried and tested on its own:

      * goal progress from sub-goals          (lib/echo/goal-progress.ts)
      * check-in gaps and sleep hours         (lib/echo/check-ins.ts)
      * delete safety: confirm before delete  (lib/echo/sanitize.ts)
      * which actions need an item reference  (lib/echo/types.ts)
      * lookup connectors and their fallback  (lib/server/lookup.ts)

    Load:   swipl prolog/echo_rules.pl
    Try:    ?- goal_progress([subgoal("Run 5k", true), subgoal("Run 10k", false)], 0, P).
            P = 50.
*/

:- module(echo_rules,
          [ min_subgoals/1,
            subgoal_count/3,
            goal_progress/3,
            goal_done/2,
            subgoal_line/3,
            min_gap_minutes/1,
            max_gap_minutes/1,
            check_in_gap_valid/1,
            gap_parts/3,
            clock_time/3,
            in_sleep_window/3,
            action_type/1,
            requires_ref/1,
            is_delete/1,
            confirm_question/3,
            delete_confirmed/2,
            lookup_source/1,
            lookup_needs_key/2,
            lookup_status/3,
            route_lookup/4
          ]).

/* ------------------------------------------------------------------ */
/*  1. Goal progress                                                   */
/* ------------------------------------------------------------------ */

%  With at least min_subgoals sub-goals, progress is done / total (rounded).
%  With fewer, the goal is simply done (100) or not done (0).

min_subgoals(2).

%  A sub-goal counts only when its text is not blank.
counted_subgoal(subgoal(Text, _)) :-
    normalize_space(string(T), Text),
    T \== "".

done_subgoal(subgoal(_, true)).

%  subgoal_count(+Subgoals, -Done, -Total)
subgoal_count(Subgoals, Done, Total) :-
    include(counted_subgoal, Subgoals, Counted),
    length(Counted, Total),
    include(done_subgoal, Counted, DoneList),
    length(DoneList, Done).

%  goal_progress(+Subgoals, +StoredProgress, -Percent)
goal_progress(Subgoals, Stored, Percent) :-
    subgoal_count(Subgoals, Done, Total),
    min_subgoals(Min),
    (   Total >= Min
    ->  Percent is round(Done * 100 / Total)
    ;   number(Stored), Stored >= 100
    ->  Percent = 100
    ;   Percent = 0
    ).

%  goal_done(+Subgoals, +StoredProgress)
goal_done(Subgoals, Stored) :-
    goal_progress(Subgoals, Stored, P),
    P >= 100.

%  subgoal_line(+Subgoals, +StoredProgress, -Line): the goal card's status text.
subgoal_line(Subgoals, Stored, Line) :-
    subgoal_count(Subgoals, Done, Total),
    min_subgoals(Min),
    (   Total >= Min
    ->  format(string(Line), "~w of ~w sub-goals", [Done, Total])
    ;   goal_done(Subgoals, Stored)
    ->  Line = "Done"
    ;   Line = "Not done yet"
    ).

/* ------------------------------------------------------------------ */
/*  2. Check-ins                                                       */
/* ------------------------------------------------------------------ */

%  Same limits as firestore.rules and the Android app.
min_gap_minutes(1).          % testing value; raise before the public launch
max_gap_minutes(43200).      % 30 days

check_in_gap_valid(Minutes) :-
    integer(Minutes),
    min_gap_minutes(Min),
    max_gap_minutes(Max),
    Minutes >= Min,
    Minutes =< Max.

unit_minutes(days,    1440).
unit_minutes(hours,     60).
unit_minutes(minutes,    1).

%  gap_parts(+Minutes, -Value, -Unit): the largest unit that keeps a whole number.
gap_parts(Minutes, Value, Unit) :-
    unit_minutes(Unit, Size),            % tried largest first
    Minutes mod Size =:= 0,
    !,
    Value is Minutes // Size.

%  clock_time(+HHMM, -Hour, -Minute): "07:30" style 24-hour times only.
clock_time(Text, Hour, Minute) :-
    atom_string(Atom, Text),
    atomic_list_concat([HA, MA], ':', Atom),
    atom_length(HA, 2),
    atom_length(MA, 2),
    atom_number(HA, Hour),
    atom_number(MA, Minute),
    integer(Hour), integer(Minute),
    between(0, 23, Hour),
    between(0, 59, Minute).

to_minutes(Text, M) :-
    clock_time(Text, H, Min),
    M is H * 60 + Min.

%  in_sleep_window(+Now, +SleepStart, +SleepEnd): no check-ins while asleep.
%  The window may wrap past midnight (22:00 -> 07:00).
in_sleep_window(Now, Start, End) :-
    to_minutes(Now, N),
    to_minutes(Start, S),
    to_minutes(End, E),
    (   S =< E
    ->  N >= S, N < E
    ;   ( N >= S ; N < E )
    ).

/* ------------------------------------------------------------------ */
/*  3. Actions and delete safety                                       */
/* ------------------------------------------------------------------ */

action_type(note).
action_type(goal).
action_type(health).
action_type(reminder).
action_type(connector).
action_type(general).
action_type(reminder_update).
action_type(reminder_delete).
action_type(note_update).
action_type(note_delete).
action_type(goal_update).
action_type(goal_delete).
action_type(health_update).
action_type(meal_log).
action_type(meal_update).
action_type(meal_delete).
action_type(web_search).
action_type(ask_model).
action_type(lookup).
action_type(music_control).
action_type(play_music).

%  Updates and deletes point at an existing item by its short ref (r1, g2, ...).
requires_ref(Type) :-
    action_type(Type),
    (   sub_atom(Type, _, _, 0, '_update')
    ;   sub_atom(Type, _, _, 0, '_delete')
    ),
    Type \== health_update.            % health is keyed by date, not by ref

is_delete(Type) :-
    action_type(Type),
    sub_atom(Type, _, _, 0, '_delete').

%  confirm_question(+Kind, +Title, -Question)
confirm_question(Kind, Title, Question) :-
    format(string(Question), "Delete the ~w \"~w\"?", [Kind, Title]).

%  delete_confirmed(+LastAssistantMessage, +Title)
%  A delete goes through only when Echo's previous message was a question
%  that names the item. Otherwise Echo asks confirm_question/3 first.
delete_confirmed(LastAssistant, Title) :-
    sub_string(LastAssistant, _, _, _, "?"),
    norm(Title, T),
    T \== "",
    norm(LastAssistant, L),
    sub_string(L, _, _, _, T).

%  Lower case, letters and digits only, single spaces.
norm(In, Out) :-
    string_lower(In, Lower),
    string_codes(Lower, Codes),
    maplist(keep_alnum, Codes, Kept),
    string_codes(Spaced, Kept),
    normalize_space(string(Out), Spaced).

keep_alnum(C, C) :- code_type(C, alnum), C \== 0'_, !.
keep_alnum(_, 0' ).

/* ------------------------------------------------------------------ */
/*  4. Lookup connectors                                               */
/* ------------------------------------------------------------------ */

lookup_source(wikipedia).
lookup_source(news).
lookup_source(currency).
lookup_source(holidays).
lookup_source(books).
lookup_source(movies).
lookup_source(food).

%  Sources that need a server key; the rest are keyless.
lookup_needs_key(news,   'GNEWS_API_KEY').
lookup_needs_key(movies, 'TMDB_API_KEY').

%  lookup_status(+Source, +KeysPresent, -Status): ready or needs_setup.
lookup_status(Source, Keys, Status) :-
    lookup_source(Source),
    (   lookup_needs_key(Source, Key), \+ memberchk(Key, Keys)
    ->  Status = needs_setup
    ;   Status = ready
    ).

%  route_lookup(+Source, +Query, +Status, -Action)
%  A ready lookup runs; off, needs_setup or failed falls back to a web search.
route_lookup(Source, Query, ready, lookup(Source, Query)) :-
    lookup_source(Source), !.
route_lookup(_, Query, _, web_search(Query)).

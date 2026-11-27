/*  echo_commands.pl — a DCG grammar for Echo's everyday commands.

    Turns a typed or spoken sentence into the action Echo would save.
    The formal grammar is in grammar/echo-commands.ebnf; this file is the
    same grammar as runnable Prolog Definite Clause Grammar rules.

    Load:   swipl grammar/echo_commands.pl
    Try:    ?- parse_command("Remind me to call mom at 7:30 pm", A).
            A = reminder('call mom', at(time(19, 30))).

    Anything the grammar does not cover is left to Echo's AI router
    (parse_command/2 fails, and the app would send it to Gemini).
*/

:- module(echo_commands, [parse_command/2, tokens/2, command//1]).

%  parse_command(+Text, -Action): first full parse wins.
parse_command(Text, Action) :-
    tokens(Text, Words),
    phrase(command(Action), Words),
    !.

%  tokens(+Text, -Words): lower case atoms, edge punctuation removed.
tokens(Text, Words) :-
    string_lower(Text, Lower),
    split_string(Lower, " \t\n", " \t\n.,!?;\"", Parts0),
    exclude(==(""), Parts0, Parts),
    maplist([S, A]>>atom_string(A, S), Parts, Words).

/* ------------------------------------------------------------------ */
/*  Sentence                                                           */
/* ------------------------------------------------------------------ */

command(A) --> opener, core(A), closer.

opener --> [].
opener --> [please].
opener --> [echo].
opener --> [hey, echo].
opener --> [hey, echo, please].

closer --> [].
closer --> [please].
closer --> [thanks].
closer --> [thank, you].

/* ------------------------------------------------------------------ */
/*  Commands                                                           */
/* ------------------------------------------------------------------ */

% Reminders
core(reminder(Task, When)) --> [remind, me, to], text(Task), when(When).
core(reminder(Task, When)) --> [set, a, reminder, to], text(Task), when(When).

% Goals
core(goal(T)) --> [my, goal, is, to], text(T).
core(goal(T)) --> [add, a, goal, to], text(T).
core(goal(T)) --> [add, goal], text(T).
core(goal(T)) --> [set, a, goal, to], text(T).
core(goal_done(T)) --> [i, finished, my, goal], text(T).

% Notes
core(note(T)) --> [note, that], text(T).
core(note(T)) --> [take, a, note], optional_that, text(T).
core(note(T)) --> [save, a, note], optional_that, text(T).

% Meals (with a meal named, then without)
core(meal_log(F, M)) --> ate, text(F), [for], meal(M).
core(meal_log(F, unknown)) --> ate, text(F).

% Health
core(health(water, N)) --> [i, drank], count(N), glasses, [of, water].
core(health(sleep_hours, N)) --> [i, slept], count(N), hours.
core(health(steps, N)) --> [i, walked], count(N), [steps].

% Search and lookups
core(web_search(Q)) --> [search, the, web, for], text(Q).
core(web_search(Q)) --> [search, for], text(Q).
core(web_search(Q)) --> [look, up], text(Q).
core(lookup(news, Q)) --> [news, about], text(Q).
core(lookup(news, Q)) --> [whats, the, news, on], text(Q).
core(lookup(wikipedia, Q)) --> [who, is], text(Q).
core(lookup(wikipedia, Q)) --> [who, was], text(Q).

% Music (controls first so "play" does not swallow them)
core(music_control(next)) --> [next, song].
core(music_control(next)) --> [skip, this, song].
core(music_control(next)) --> [skip].
core(music_control(previous)) --> [previous, song].
core(music_control(previous)) --> [play, the, last, song].
core(music_control(pause)) --> [pause], optional_music.
core(music_control(resume)) --> [resume], optional_music.
core(music_control(stop)) --> [stop], optional_music.
core(music_control(shuffle)) --> [shuffle], optional_music.
core(play_music(Q)) --> [play], text(Q).

% Deletes (Echo still asks to confirm; see prolog/echo_rules.pl)
core(delete(K, T)) --> [delete], determiner, kind(K), optional_called, text(T).
core(delete(K, T)) --> [remove], determiner, kind(K), optional_called, text(T).

% Mark done
core(mark_done(T)) --> [mark], text(T), [as, done].

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

% text(-Atom): one or more words, shortest first so the rest can still match.
text(A) --> words(Ws), { atomic_list_concat(Ws, ' ', A) }.

words([W]) --> word(W).
words([W|Ws]) --> word(W), words(Ws).

word(W) --> [W].

optional_that --> [].
optional_that --> [that].

optional_called --> [].
optional_called --> [called].
optional_called --> [named].

optional_music --> [].
optional_music --> [the, music].
optional_music --> [music].
optional_music --> [the, song].

determiner --> [my].
determiner --> [the].
determiner --> [].

kind(note) --> [note].
kind(goal) --> [goal].
kind(reminder) --> [reminder].
kind(meal) --> [meal].

ate --> [i, ate].
ate --> [i, had].
ate --> [i, just, ate].

meal(breakfast) --> [breakfast].
meal(lunch) --> [lunch].
meal(dinner) --> [dinner].
meal(snack) --> [a, snack].
meal(snack) --> [snack].

glasses --> [glasses].
glasses --> [glass].
glasses --> [cups].

hours --> [hours].
hours --> [hour].

% count(-N): a whole number written as digits, or a small number word.
count(N) --> [W], { atom_number(W, N), integer(N), N >= 0 }.
count(N) --> [W], { number_word(W, N) }.

number_word(one, 1).   number_word(two, 2).    number_word(three, 3).
number_word(four, 4).  number_word(five, 5).   number_word(six, 6).
number_word(seven, 7). number_word(eight, 8).  number_word(nine, 9).
number_word(ten, 10).  number_word(eleven, 11). number_word(twelve, 12).

/* ------------------------------------------------------------------ */
/*  Time                                                               */
/* ------------------------------------------------------------------ */

when(at(time(H, M))) --> [at], clock(H, M).
when(day(D)) --> day(D).
when(day_at(D, time(H, M))) --> day(D), [at], clock(H, M).
when(in(N, U)) --> [in], count(N), unit(U).

day(today) --> [today].
day(tomorrow) --> [tomorrow].
day(tonight) --> [tonight].

unit(minutes) --> [minutes].
unit(minutes) --> [minute].
unit(hours) --> [hours].
unit(hours) --> [hour].
unit(days) --> [days].
unit(days) --> [day].

% clock(-Hour24, -Minute): "7", "7:30", "19:00", "7pm", "7:30 pm", "noon".
clock(12, 0) --> [noon].
clock(0, 0) --> [midnight].
clock(H, M) --> [T], { glued_meridiem(T, Base, Mer), hour_min(Base, H0, M), to24(H0, Mer, H) }.
clock(H, M) --> [T], { hour_min(T, H0, M) }, meridiem(Mer), { to24(H0, Mer, H) }.

glued_meridiem(T, Base, am) :- atom_concat(Base, am, T), Base \== ''.
glued_meridiem(T, Base, pm) :- atom_concat(Base, pm, T), Base \== ''.

hour_min(T, H, M) :-
    atomic_list_concat([HA, MA], ':', T), !,
    atom_length(MA, 2),
    atom_number(HA, H), atom_number(MA, M),
    integer(H), integer(M),
    between(0, 23, H), between(0, 59, M).
hour_min(T, H, 0) :-
    atom_number(T, H), integer(H),
    between(0, 23, H).

meridiem(am) --> [am].
meridiem(pm) --> [pm].
meridiem(none) --> [].

to24(H, none, H).
to24(H, am, H24) :- between(1, 12, H), ( H =:= 12 -> H24 = 0 ; H24 = H ).
to24(H, pm, H24) :- between(1, 12, H), ( H =:= 12 -> H24 = 12 ; H24 is H + 12 ).

/*  Unit tests for grammar/echo_commands.pl (plunit).
    Run all Prolog tests:  swipl -g run_tests -t halt tests/prolog/run_tests.pl
*/

:- use_module('../../grammar/echo_commands').
:- use_module(library(plunit)).

:- begin_tests(tokens).

test(lower_case_and_punctuation) :-
    tokens("Hey Echo, play Lo-Fi beats!", [hey, echo, play, 'lo-fi', beats]).

:- end_tests(tokens).

:- begin_tests(reminders).

test(clock_with_pm) :-
    parse_command("Remind me to call mom at 7:30 pm", reminder('call mom', at(time(19, 30)))).
test(glued_pm) :-
    parse_command("remind me to take my meds at 9pm", reminder('take my meds', at(time(21, 0)))).
test(twelve_am_is_midnight) :-
    parse_command("remind me to sleep at 12 am", reminder(sleep, at(time(0, 0)))).
test(twenty_four_hour) :-
    parse_command("remind me to stretch at 19:00", reminder(stretch, at(time(19, 0)))).
test(tomorrow_at) :-
    parse_command("Please remind me to pay rent tomorrow at 8", reminder('pay rent', day_at(tomorrow, time(8, 0)))).
test(in_minutes) :-
    parse_command("remind me to check the oven in 20 minutes", reminder('check the oven', in(20, minutes))).
test(task_containing_at) :-
    parse_command("remind me to meet at the park at noon", reminder('meet at the park', at(time(12, 0)))).
test(bad_minutes_not_a_clock, [fail]) :-
    parse_command("remind me to run at 7:75", _).

:- end_tests(reminders).

:- begin_tests(other_commands).

test(goal) :- parse_command("My goal is to run a marathon", goal('run a marathon')).
test(note) :- parse_command("take a note that the wifi password changed", note('the wifi password changed')).
test(meal_with_type) :- parse_command("I had eggs and toast for breakfast", meal_log('eggs and toast', breakfast)).
test(meal_without_type) :- parse_command("I ate a banana", meal_log('a banana', unknown)).
test(water_words) :- parse_command("I drank three glasses of water", health(water, 3)).
test(sleep_digits) :- parse_command("I slept 7 hours", health(sleep_hours, 7)).
test(web_search) :- parse_command("search the web for cheap flights to cebu", web_search('cheap flights to cebu')).
test(news_lookup) :- parse_command("news about typhoon", lookup(news, typhoon)).
test(wikipedia_lookup) :- parse_command("who is jose rizal", lookup(wikipedia, 'jose rizal')).
test(music_next) :- parse_command("next song", music_control(next)).
test(music_pause) :- parse_command("pause the music", music_control(pause)).
test(play_query) :- parse_command("play my gym playlist", play_music('my gym playlist')).
test(play_last_song_is_previous) :- parse_command("play the last song", music_control(previous)).
test(delete_note) :- parse_command("delete my note called shopping list", delete(note, 'shopping list')).
test(mark_done) :- parse_command("mark buy milk as done", mark_done('buy milk')).
test(closer_ignored) :- parse_command("skip thanks", music_control(next)).

:- end_tests(other_commands).

:- begin_tests(unknown).

test(free_chat_goes_to_ai_router, [fail]) :-
    parse_command("I feel a bit tired today", _).

:- end_tests(unknown).

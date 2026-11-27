# grammar

The grammar of Echo's everyday commands: reminders, goals, notes, meals, health, search, music and deletes.

| File | What it is |
|---|---|
| [`echo-commands.ebnf`](echo-commands.ebnf) | The formal grammar in ISO EBNF |
| [`echo_commands.pl`](echo_commands.pl) | The same grammar as a runnable Prolog DCG that turns a sentence into an Echo action |

When a sentence does not match the grammar, `parse_command/2` fails, and the app hands the sentence to the AI router (Gemini) instead.

## Try it

Needs [SWI-Prolog](https://www.swi-prolog.org/download/stable).

```prolog
$ swipl grammar/echo_commands.pl

?- parse_command("Remind me to call mom at 7:30 pm", A).
A = reminder('call mom', at(time(19, 30))).

?- parse_command("I had eggs and toast for breakfast", A).
A = meal_log('eggs and toast', breakfast).

?- parse_command("play my gym playlist", A).
A = play_music('my gym playlist').
```

| Sentence | Action |
|---|---|
| remind me to *task* at 7pm / tomorrow at 8 / in 20 minutes | `reminder(Task, When)` |
| my goal is to *goal* | `goal(Title)` |
| take a note that *text* | `note(Text)` |
| I had *food* for lunch | `meal_log(Food, lunch)` |
| I drank three glasses of water | `health(water, 3)` |
| search the web for *query* | `web_search(Query)` |
| news about *topic* / who is *name* | `lookup(news, …)` / `lookup(wikipedia, …)` |
| next song / pause the music / play *query* | `music_control(…)` / `play_music(Query)` |
| delete my note called *title* | `delete(note, Title)` (Echo still asks to confirm) |
| mark *item* as done | `mark_done(Item)` |

Tests: [`tests/prolog/test_grammar.pl`](../tests/prolog/test_grammar.pl).

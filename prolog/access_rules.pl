/*  Echo Legacy engine — access rules (starter, ticket 1.04).
    Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

    Decides what each registered asker may see. The policy interpreter (a later
    ticket) compiles the owner's Legacy Policy into the grant/3 and deny/3 facts;
    the vault supplies entry/3 facts. Later tickets add release dates, the death
    trigger and the frozen policy.

      entry(Id, Tags, Mentions)      an entry, its tags and the people it mentions
      grant(Asker, Level, Selector)  Level is existence, summary or full
      deny(Asker, Level, Selector)   a denial; deny beats allow
      Selector is tag(Tag) or mentions(Name)

    Deny by default: can_see/3 is true only when a grant matches and no deny does.
    Anything that cannot be proven is false (Prolog's closed-world assumption).
*/

:- use_module(library(lists)).

:- dynamic(entry/3).
:- dynamic(grant/3).
:- dynamic(deny/3).

% matches(+Entry, +Selector): the selector picks out the entry.
matches(E, tag(T))      :- entry(E, Tags, _), member(T, Tags).
matches(E, mentions(N)) :- entry(E, _, Names), member(N, Names).

% level_covers(+Granted, +Asked): existence < summary < full.
level_covers(full, full).
level_covers(full, summary).
level_covers(full, existence).
level_covers(summary, summary).
level_covers(summary, existence).
level_covers(existence, existence).

allowed(A, L, E) :- grant(A, GL, S), level_covers(GL, L), matches(E, S).
denied(A, L, E)  :- deny(A, GL, S),  level_covers(GL, L), matches(E, S).

% can_see(?Asker, ?Level, ?Entry): deny by default, deny beats allow.
can_see(A, L, E) :- entry(E, _, _), allowed(A, L, E), \+ denied(A, L, E).

/*  Echo Legacy engine — access rules (tickets 1.04, 2.06).
    Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

    Decides what each registered person may see. The engine supplies the facts
    (engine/src/prolog/facts.ts); later the policy interpreter will compile the
    owner's Legacy Policy into the grant/3 and deny/3 facts.

    ---- Fact structure ----
      person(P)                          P is a registered person
      protocol(P)                        P has a protocol from the owner
      entry(E, date(Y,M,D), Kind)        an entry; Kind is diary or letter
      tag(E, T)                          entry E is tagged T
      mentions(E, P)                     entry E mentions person P
      letter(E, Title, Recipient, date(Y,M,D))   a Letter of Wishes
      grant(P, Level, Selector)          an allow
      deny(P, Level, Selector)           a denial
    Level is existence, summary or full (weakest to strongest).
    Selector is tag(T), mentions(Name) or letter(Title).

    ---- Rules ----
    Deny by default: can_see/3 is true only for a registered person with a
    protocol, an allow that reaches the level, and no deny that reaches it.
    An allow reaches its level and the weaker ones; a deny reaches its level
    and the stronger ones, so a weaker deny also blocks a stronger allow.
    Anything that cannot be proven is false (closed-world assumption).

    Not yet here (later tickets): letter release dates, the death trigger,
    the frozen policy. Until then a letter is never shown in full.
*/

:- use_module(library(lists)).

:- dynamic(person/1).
:- dynamic(protocol/1).
:- dynamic(entry/3).
:- dynamic(tag/2).
:- dynamic(mentions/2).
:- dynamic(letter/4).
:- dynamic(grant/3).
:- dynamic(deny/3).

% The three access levels, weakest first.
level(existence).
level(summary).
level(full).

% level_covers(+Stronger, +Weaker): Stronger is the same level as Weaker or above it.
level_covers(full, full).
level_covers(full, summary).
level_covers(full, existence).
level_covers(summary, summary).
level_covers(summary, existence).
level_covers(existence, existence).

% matches(?Entry, +Selector): the selector picks out the entry.
matches(E, tag(T))         :- tag(E, T).
matches(E, mentions(P))    :- mentions(E, P).
matches(E, letter(Title))  :- letter(E, Title, _, _).

% An allow reaches its own level and every weaker one.
allowed(P, L, E) :- grant(P, GL, S), level_covers(GL, L), matches(E, S).

% A deny reaches its own level and every stronger one.
denied(P, L, E)  :- deny(P, DL, S), level_covers(L, DL), matches(E, S).

% Until the release rules exist, no letter is shown in full.
withheld(full, E) :- letter(E, _, _, _).

% can_see(?Person, ?Level, ?Entry): deny by default, deny beats allow.
can_see(P, L, E) :-
    person(P),
    protocol(P),
    level(L),
    entry(E, _, _),
    allowed(P, L, E),
    \+ denied(P, L, E),
    \+ withheld(L, E).

% visible(+Person, +Level, -Entries): every entry Person may see at Level, once each.
visible(P, L, Es) :- findall(E, can_see(P, L, E), All), sort(All, Es).

% visible_count(+Person, +Level, -N): how many entries Person may see at Level.
visible_count(P, L, N) :- visible(P, L, Es), length(Es, N).

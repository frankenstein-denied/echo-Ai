# 04 — Wireframes

**Project:** Echo — a personal AI diary with a Legacy policy · CS 413 Programming Languages, final project
**Ticket:** 1.06 (owner: UI/UX Designer lead, Front End)
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

These are mobile wireframes (390 × 844) of Echo's owner and asker screens. They use Echo's real design tokens (`app/globals.css`) and follow the layout of its existing components:
- sign-in card: `components/echo/login.tsx`;
- bottom tab bar: `components/echo/mobile-tabbar.tsx`;
- Legacy chat and unlock screens: `components/echo/legacy/`.

All names and entries are fictional.

## Screens

| File | Screen | Ticket item |
|---|---|---|
| [`01-sign-in.svg`](01-sign-in.svg) | Sign in (owner and askers) | sign-in |
| [`02-write-entry.svg`](02-write-entry.svg) | Write an entry, pick a writing mode (Verbatim / Light fix / Review), preview the fixes | write entry |
| [`03-entry-list.svg`](03-entry-list.svg) | Entry list with dates, tags, the sealed letter and "Chain verified" | entry list |
| [`04-policy-editor.svg`](04-policy-editor.svg) | Legacy policy editor with a syntax error at line 3, column 7, and the disclaimer | policy editor |
| [`05-ask-question.svg`](05-ask-question.svg) | Asker's question screen, with suggested questions and the "not Ramon" line | ask question |
| [`06-cited-answer.svg`](06-cited-answer.svg) | Answer citing each entry by date, and a released letter shown word for word, with the disclaimer | cited answer |
| [`07-access-denied.svg`](07-access-denied.svg) | Access denied: shown when a person opens an item directly (e.g. an old link) that is not shared with them. Names nobody, gives no reason, same whether or not the item exists. A person with no protocol who **asks** gets the neutral reply (09), as the handout requires. | access denied |
| [`08-release-not-reached.svg`](08-release-not-reached.svg) | Letter sealed until 1 May 2040, with the disclaimer | release date not reached |
| [`09-neutral-reply.svg`](09-neutral-reply.svg) | Neutral reply: "I don't have anything I can share about that." | neutral reply |
| [`user-flow.svg`](user-flow.svg) | How the owner and the asker move through the system | user flow |

PNG previews of every screen are in [`previews/`](previews/).

**Where the not-a-legal-will disclaimer appears:**
- the policy editor (04);
- the released letter (06);
- the sealed letter (08).

The amber "Not a legal will" box always uses the same wording:

> A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice.

## Open them in Figma

1. In Figma, open or create a design file.
2. Drag the `.svg` files onto the canvas, or use **File → Import…** (in recent Figma versions: **Main menu → File → Place image…** for one file at a time).
3. Each screen arrives as a frame of named groups (`header`, `content`, `tab-bar`, `writing-mode-picker`, `legal-disclaimer`, …). All text stays **editable text**, because the files use only shapes and `<text>`, with no embedded images or outlined text.

Fonts: the files ask for **Inter**, the font Echo uses. If Figma reports Inter missing, choose Inter from Google Fonts (it is free) or any sans-serif.

## Buildability check (Front End and Back End)

| Screen | Uses existing Echo parts | Needs from the engine | FE confirms | BE confirms |
|---|---|---|---|---|
| 01 Sign in | Login card (as is) | Registration of askers | ☐ | ☐ |
| 02 Write entry | Card, chips, segmented control, buttons | `WritingMode`, `processEntryText`, `Vault.append` | ☐ | ☐ |
| 03 Entry list | Cards, chips | `Vault.verify`, entry list | ☐ | ☐ |
| 04 Policy editor | Card, alert | Lexer, parser, interpreter (`PolicySyntaxError` line/column), `PolicyFrozen` | ☐ | ☐ |
| 05–06, 09 Ask / answer / neutral | Legacy chat bubbles, composer | Q&A script + tools + Prolog rules | ☐ | ☐ |
| 07 Access denied | Unlock-screen layout | `AccessDenied` | ☐ | ☐ |
| 08 Release not reached | Card, alert | `LetterOfWishes.isReadableOn`, release rule | ☐ | ☐ |

Member: Peter Paul Poloan (Front End and Back End). Tick each box after checking.

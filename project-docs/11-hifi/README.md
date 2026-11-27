# 11 — High-fidelity screens

**Project:** Echo — a personal AI diary with a Legacy policy · CS 413 Programming Languages, final project
**Ticket:** 2.09 (owner: UI/UX Designer lead, Front End)
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

These are the approved wireframes ([`04-wireframes/`](../04-wireframes/)) turned into final screens. Compared with the wireframes they have:
- Echo's real icons (lucide);
- final wording from the [error message catalog](../10-error-messages.md);
- no annotation boxes;
- three extra screens: the owner's home, the asker's home, and an error state.

Style rules: [`09-style-guide.md`](../09-style-guide.md). PNG previews: [`previews/`](previews/). Generator: `scripts/project-docs/gen-hifi.mjs`. All data is fictional.

## Owner screens

| File | Screen |
|---|---|
| [`01-sign-in.svg`](01-sign-in.svg) | Sign in (shared with askers) |
| [`10-owner-home.svg`](10-owner-home.svg) | Your legacy: chain status, shortcuts to Write, Entries, Legacy policy, People |
| [`02-write-entry.svg`](02-write-entry.svg) | Write entry with writing mode and fix preview |
| [`12-write-entry-error.svg`](12-write-entry-error.svg) | Write entry when the vault fails its check (`TamperDetected`, owner message) |
| [`03-entry-list.svg`](03-entry-list.svg) | Entries with the sealed letter and "Chain verified" |
| [`04-policy-editor.svg`](04-policy-editor.svg) | Legacy policy with a syntax error and the disclaimer |

## Asker screens

| File | Screen |
|---|---|
| [`01-sign-in.svg`](01-sign-in.svg) | Sign in |
| [`11-asker-home.svg`](11-asker-home.svg) | My legacies: released and locked (no countdown) |
| [`05-ask-question.svg`](05-ask-question.svg) | Ask a question |
| [`06-cited-answer.svg`](06-cited-answer.svg) | Cited answer, released letter word for word, disclaimer |
| [`07-access-denied.svg`](07-access-denied.svg) | Access denied (no names, no details) |
| [`08-release-not-reached.svg`](08-release-not-reached.svg) | Letter sealed until 1 May 2040, disclaimer |
| [`09-neutral-reply.svg`](09-neutral-reply.svg) | Neutral reply, including to a trick question |

[`user-flow.svg`](user-flow.svg) is the same flow as in the wireframes.

## Open in Figma

Drag the `.svg` files onto a Figma canvas (or File → Import). Text stays editable, and every group is named (`header`, `tab-bar`, `legal-disclaimer`, `error-banner`, …). Use the **Inter** font.

## Shared with Front End

| Member | Role | Received the designs | Date |
|---|---|---|---|
| Peter Paul Poloan | Front End | ☐ | |

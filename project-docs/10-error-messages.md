# 10 — Error message catalog

**Project:** Echo — a personal AI diary with a Legacy policy · CS 413 Programming Languages, final project
**Ticket:** 2.09 (owner: UI/UX Designer lead, Front End)
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
**Code:** [`engine/src/messages.ts`](../engine/src/messages.ts) · **tests:** [`tests/engine/messages.test.ts`](../tests/engine/messages.test.ts)

Every error the engine can raise has **one** approved message, written in two versions:

- **Owner:** the person whose diary it is. They may see details about their own entries and policy.
- **Asker:** a registered person asking after the death trigger. **An asker must never learn that a protected entry exists**, so most errors show them the neutral reply.

Screens call `messageFor(error, audience)` and show its title and body. They never show an error's own text to an asker. A test checks that this document and the code use exactly the same wording.

## The neutral reply

> I don't have anything I can share about that.

An asker gets this whenever there is nothing they may be told: no matching entry, no protocol, an entry they may not read, or any failure. It reads the same whether or not entries exist.

## Messages

| Error type | When it happens | Owner sees (title · body) | Asker sees (title · body) | Tone |
|---|---|---|---|---|
| `AccessDenied` | Opening an item that isn't shared with you (e.g. an old link) | **This isn’t available** · Your account can’t open this item. | **This isn’t available** · Echo can only show what was shared with your account. | danger (red) |
| `AmbiguousName` | A name matches more than one person | **More than one person has that name** · Choose the person you mean from the list. | **Nothing to share** · I don't have anything I can share about that. | warning (amber) |
| `TamperDetected` | The hash chain shows a saved entry was changed, removed or reordered | **Your saved entries were changed outside Echo** · Echo found a change it did not make, starting at entry {index}. Nothing is shared with anyone until this is checked. Contact your trustee. | **Nothing to share** · I don't have anything I can share about that. | danger (red) |
| `PolicySyntaxError` | The legacy policy has a mistake | **Line {line}, column {column}: {problem}** (e.g. "Line 3, column 7: Unknown character "@"") · Fix the highlighted line, then check the policy again. | **Nothing to share** · I don't have anything I can share about that. | danger (red) |
| `PolicyFrozen` | Trying to change the policy after the legacy was released | **Your legacy policy is locked** · The policy locked when your legacy was released, so it can no longer change. | **Nothing to share** · I don't have anything I can share about that. | info (blue) |
| `UnknownEntryType` | Saving an entry type the vault can't store yet | **This kind of entry can’t be saved yet** · Save it as a diary entry or a Letter of Wishes instead. | **Nothing to share** · I don't have anything I can share about that. | warning (amber) |
| Any other error | Anything unexpected (network, bug) | **Something went wrong** · Nothing was changed. Please try again in a moment. | **Nothing to share** · I don't have anything I can share about that. | warning (amber) |

`{index}`, `{line}`, `{column}` and `{problem}` are filled in from the error. Only the owner ever sees them.

## Messages for states that are not errors

| State | Message | Where |
|---|---|---|
| Letter's release date not reached | **This letter opens on {date}.** Ramon sealed it for you. On that day Echo will show it to you word for word. | Screen 08 (only the letter's own recipient sees it) |
| Chain verified | **Chain verified · {n} entries · nothing altered** | Entry list (owner) |
| Entry saved | **Saved · chain verified** | Write entry (owner) |
| Not a legal will | A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice. | Policy editor, released letter, sealed letter |

## Rules for writing new messages

1. **Askers never learn about protected entries.** Don't write "exists", "protected", "hidden", "you're not allowed to see", entry names, dates or counts in an asker message.
2. **Same message for "missing" and "forbidden".** An asker can't tell the two apart.
3. **Say what happens next.** Each owner message ends with what to do.
4. **Calm and short.** No error codes, no stack traces, no blame.
5. **Never show raw error text** (e.g. `ECONNRESET`) to anyone.

# 09 — Style guide

**Project:** Echo — a personal AI diary with a Legacy policy · CS 413 Programming Languages, final project
**Ticket:** 2.09 (owner: UI/UX Designer lead, Front End)
**Team:** Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

Echo's Legacy screens use **Echo's existing design system**. The values below come from the app itself:

| What | Source |
|---|---|
| Colours | `app/globals.css` (Tailwind 4 theme tokens) |
| Components | `components/ui/` and `components/echo/` |

High-fidelity screens: [`11-hifi/`](11-hifi/). Messages: [`10-error-messages.md`](10-error-messages.md).

## 1. Colour

Echo is a **dark** interface. Never put readable text in `subtle`: it fails contrast and is for decoration and disabled states only.

| Token | Hex | Use |
|---|---|---|
| `background` | `#0b0f14` | Page background |
| `surface` | `#12171e` | Cards, tab bar, composer |
| `surface-2` | `#181f28` | Inputs, chips, chat bubbles from Echo, segmented controls |
| `border` | `#232b36` | Card and divider lines |
| `border-strong` | `#313b48` | Secondary buttons, the selected segment |
| `foreground` | `#e6eaf0` | Main text |
| `muted-foreground` | `#9aa4b2` | Secondary text, labels, inactive tabs |
| `subtle` / `input-border` | `#6b7684` | Placeholders and input borders only |
| `primary` | `#2dd4bf` | Main buttons, active tab, links, Echo's orb |
| `primary-foreground` | `#04201c` | Text on primary buttons |
| `primary-soft` | `#0f2e2b` | Your own chat bubbles, selected chips, "Released" banner |
| `success` / `success-soft` | `#22c55e` / `#0e2a1b` | "Chain verified", saved |
| `warning` / `warning-soft` | `#f59e0b` / `#2e2208` | Letters of Wishes, the not-a-legal-will box, sealed letters |
| `danger` / `danger-soft` | `#ef4444` / `#2e1112` | Errors: access denied, tamper, policy syntax |
| `info` / `info-soft` | `#60a5fa` / `#0f1f33` | Date citations, information |
| `node-person` | `#f472b6` | People (asker accents, "People" card) |

**Meaning of colour in the Legacy screens:**

| Colour | Means |
|---|---|
| Amber | Anything about a **Letter of Wishes** |
| Red | Something went wrong, or "not for you" |
| Green | The vault is intact |
| Teal | Echo itself and your own actions |
| Blue | Citations by date |

## 2. Type

| Style | Size / weight | Use |
|---|---|---|
| Page title | 17 px · 700 | Header title ("Write entry") |
| Page section label | 11 px · 500 · muted | Above the title ("Diary", "Legacy") |
| Display | 20–22 px · 700 | Big statements ("This isn’t available", "Good evening, Ramon") |
| Body | 14–15 px · 400 | Entry text, chat bubbles, list rows |
| Label | 12.5–13 px · 500 · muted | Field labels, small headings |
| Caption | 11–12 px · muted | Help text, counters, "No entries cited" |
| Code | 11.5 px monospace (`ui-monospace, Menlo, Consolas`) | Policy editor |

**Font:** **Inter**, falling back to `ui-sans-serif, system-ui, sans-serif`. Line height is about 1.45 for body text.

## 3. Spacing, shape and layout

**Layout**
- Mobile frame: 390 × 844.
- Page side padding: **20 px**.
- Gap between cards: **8–14 px**.

**Fixed areas**
- **Header:** 56 px tall, with Echo's orb, the section label and the page title, and a 1 px bottom border.
- **Tab bar:** 72 px tall with four tabs (**Today, Notes, Reminders, More**). Icon 22 px; label 11 px. Active = primary, inactive = muted. Legacy pages live under **More**.

**Corner radii**

| Radius | Used for |
|---|---|
| 12 px | Cards and banners |
| 10 px | Buttons and inputs |
| 14 px | Chips |
| 16 px | Chat bubbles |
| Full circle | Composer and send button |

**Buttons and lines**
- Buttons are 44 px tall (30 px for small inline buttons).
- Borders are 1 px. Shadows aren't used; depth comes from surface colours.

## 4. Icons

**Lucide** (`lucide-react`), the set Echo already uses: 2 px stroke, round caps.

| Icon | Meaning |
|---|---|
| `book-open` | Today / Entries |
| `file-text` | Notes |
| `bell` | Reminders |
| `ellipsis` | More |
| `lock` | Locked, sealed, access denied |
| `shield-check` | Chain verified |
| `pen-line` | Write |
| `scroll-text` | Legacy policy |
| `users` | People |
| `message-circle` | Ask |
| `send` | Send question |
| `sparkles` | "Echo, answering from Ramon's diary · not Ramon" |
| `circle-alert` | Error banner |

## 5. Components

| Component | Look | Seen on |
|---|---|---|
| **Primary button** | primary fill, primary-foreground text, 15 px semibold, 44 px, radius 10 | Sign in, Save entry, Save policy |
| **Secondary button** | surface-2 fill, border-strong outline, foreground text | Cancel, Check, Back |
| **Input / text area** | surface-2 fill, input-border outline, placeholder in subtle | Email, entry text, composer |
| **Chip** | surface-2, border, 12.5 px; selected = primary-soft fill + primary outline + primary text | Tags, filters, date citations (info text) |
| **Segmented control** | surface-2 track, selected segment primary-soft with primary outline | Sign in / Create account; Verbatim / Light fix / Review |
| **Card** | surface fill, border, radius 12, 16 px inner padding | Entry rows, shortcuts, "Until then" |
| **Status banner** | *-soft fill with a coloured 1 px outline, icon on the left, bold first line | Chain verified, Released, error banners |
| **Letter card** | warning outline; title in warning; text in italics when shown verbatim | Sealed and released letters |
| **Not-a-legal-will box** | warning-soft fill, warning outline, "Not a legal will" heading, the disclaimer word for word | Policy editor, released letter, sealed letter |
| **Chat bubbles** | Yours: primary-soft, right. Echo's: surface-2, left. Radius 16 | Ask, cited answer, neutral reply |
| **Citation chips** | Chips with info-coloured dates; caption "N entries cited · summaries only" | Cited answer |
| **Code editor** | surface-2, monospace, line numbers in subtle, error line tinted danger-soft and the bad character underlined in danger | Policy editor |

## 6. Words

- Speak plainly and kindly. Echo speaks **about** the owner, never **as** him: "Echo, answering from Ramon’s diary · not Ramon".
- Error and denial wording comes **only** from [`10-error-messages.md`](10-error-messages.md).
- Dates in citations are `[YYYY-MM-DD]`; dates in sentences are "1 May 2040".
- The disclaimer is always word for word: *A Letter of Wishes is a personal message, not a legal will. It has no legal effect under Philippine law and is not legal advice.*

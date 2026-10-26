# Echo: search order, connectors, web search, Diary pages in the 2nd Brain

Date: 2026-10-26 · Status: draft for approval

## Why

The user wants Echo to answer more than diary bookkeeping: look things up (food, weather, music, facts) the way
a person would — first from what Echo already knows about the user and the app, then from a connected service
built for that question, and only then from the open web. When a needed service isn't connected, Echo should say
so and tell the user how to connect it, instead of guessing. Separately, the 2nd Brain should show *which
conversation* each memory came from so the user can read that conversation again, and deleting a conversation
should clearly warn that its memories go with it.

## Goals

1. **Search order (every typed message and every call turn):**
   1. *Echo's knowledge:* the user's own data already in the request context (profile, recent messages, known
      memories, open reminders/goals/notes/today's meals) plus an **app guide** describing Echo's features
      (Diary pages, Notes, Goals, Health and calories, Reminders, 2nd Brain, Connectors, Settings, voice calls).
   2. *Connectors:* a connected service that fits the question. This round only **Nutrition (USDA)** works and
      it is **connected by default**.
   3. *Web search:* only when 1 and 2 can't answer and the question needs current or outside facts — through the
      **Web search (Tavily)** connector, which the user must connect first.
2. **Teaching:** when the best source is a connector that isn't connected, Echo says so and how to fix it, e.g.
   "Spotify isn't connected yet — it's coming soon in Connectors." / "I'd need to search the web for that. Open
   Connectors and connect Web search (free Tavily key) — then ask me again." Same for app features ("You can
   turn calorie tracking on in Settings").
3. **Web search is search only:** one Tavily `search` call per question (basic depth, up to 5 results). No
   extract/crawl/map endpoints, no reading files or uploads, no image generation, no browsing or follow-up page
   fetches. Answers cite their sources.
4. **Connectors page shows every connection**, with real states: Connected, Not connected (with a Connect button
   that works), Coming soon.
5. **Diary pages in the 2nd Brain:** the "Diary" category becomes **"Diary pages"**: one node per conversation,
   linked to every memory extracted from it. Tapping a page node shows the conversation (read-only) with an
   "Open in Diary" button.
6. **Delete confirmation:** deleting a diary page asks first and states that the 2nd Brain nodes that came only
   from that conversation will be deleted too (with the count); nodes also mentioned in other conversations stay.

## Non-goals (this round)

- Working Spotify, Weather, Google Calendar, Gmail, GitHub, Notion connectors (they stay "Coming soon"; Echo
  teaches instead). Weather/Spotify/Calendar build on the same catalog later.
- Linking memories created *before* this change to pages (they have no record of their page; they keep showing
  in their own categories, unlinked to any page).
- Deleting notes, reminders, goals, health logs or meals when a diary page is deleted (they stay, as today).

## Anti-goals

- Echo searching the web for things it already knows from the user's data or the app ("what are my reminders?",
  "how do I turn off calories?").
- Echo pretending a connector did something it didn't, or silently answering from model memory when the user
  asked for live info and search isn't connected.
- Tavily tokens readable in plain text from the browser or Firestore, or ever logged.
- Search results treated as instructions (prompt injection from web pages).

## Constraints

- Free Gemini key: Google Search grounding is refused (quota 0, verified 2026-10-26 on gemini-3.5-flash-lite,
  3.1-flash-lite, 3.5-flash, 3.8-flash); plain calls work. Hence Tavily.
- Vercel free (serverless, ≤30 s per request); no firebase-admin on the server (auth via jose), so the server
  cannot read Firestore itself — the browser sends what the server needs.
- Firestore rules validate every document shape; any new field needs a rules change and a rules deploy.

## Decisions (the user's)

- Web search provider: **Tavily**, as a connector the user must **sign in to first**: "Log in with Tavily"
  (Tavily's own login page), so searches use **the user's own Tavily account** (free plan: 1,000 searches/month).
  Users never paste a key; the app owner needs no Tavily key.
- Nutrition is a connector, connected by default.
- Only Nutrition works this round; others show as not available and Echo teaches.
- Deleting a page deletes only nodes that came **solely** from that page; shared nodes stay and lose the link.
- "Diary pages" **replaces** the old "Diary" category; old diary-type memories show under it.

## How it works

### Connector catalog (`lib/echo/connectors.ts`, shared by browser and server)

| id | Name | Kind | This round |
|---|---|---|---|
| `nutrition` | Nutrition (USDA) | built-in | **works**, connected by default |
| `web-search` | Web search (Tavily) | sign-in | **works** after logging in to Tavily |
| `weather` | Weather | built-in | coming soon |
| `spotify` | Spotify | sign-in | coming soon |
| `google-calendar`, `gmail`, `github`, `notion` | … | sign-in | coming soon |

- Status comes from the user's `connectors/{id}` doc; a missing doc means the catalog default (Nutrition:
  connected; everything else: not connected). Existing users need no migration.
- Nutrition can be disconnected; then meals use Gemini's own estimate (no USDA lookup). Calorie tracking on/off
  stays in Settings and is separate.

### Connecting Web search: "Log in with Tavily"

Tavily's normal REST API only accepts API keys, but its remote MCP server (`https://mcp.tavily.com/mcp`) supports
standard OAuth 2.1 login (verified 2026-10-26 from its public metadata: authorize `https://mcp.tavily.com/authorize`,
token `https://mcp.tavily.com/token`, dynamic registration `https://mcp.tavily.com/register`, revoke
`https://mcp.tavily.com/revoke`, PKCE S256, public clients allowed (`token_endpoint_auth_methods: none`), scopes
`openid offline_access`, refresh tokens). Echo is an OAuth client of that server and calls only its search tool.

1. **One-time app registration** (setup script, run by the developer): register Echo with Tavily's registration
   endpoint as a public client with redirect URIs `https://echo-ai-blue.vercel.app/api/connectors/web-search/callback`
   and `http://localhost:3000/api/connectors/web-search/callback`; the returned `client_id` goes in env
   `TAVILY_CLIENT_ID`.
2. **Connect:** Connectors → Web search → **Log in with Tavily**. The browser calls
   `POST /api/connectors/web-search/start` (ID token) and gets an authorize URL. The server creates the PKCE verifier
   and puts `{uid, verifier, expiresAt (10 min)}` sealed into `state`, so no server storage is needed.
3. The user logs in to (or signs up for) Tavily and approves Echo. Tavily redirects to the callback route, which
   opens `state`, exchanges the code for access + refresh tokens, seals them for that uid, and redirects to
   `/?view=Connectors#web-search=<sealed>`. The browser (signed in as the same uid) saves `{connected: true,
   sealed}` to `connectors/web-search` and clears the URL fragment.
4. **Searching:** requests that may search carry `sealed`; the server opens it, refreshes the access token when
   expired (returning the new sealed value so the browser saves it), and calls the MCP tool `tavily-search`
   (basic depth, 5 results) with `Authorization: Bearer <access token>`.
5. **Disconnect** revokes the refresh token at Tavily and deletes `sealed`. A refused refresh (user revoked Echo
   at Tavily) disconnects Web search automatically and Echo asks the user to log in again.

**What `CONNECTOR_SECRET` is for:** a server-only password (32 random bytes) used to encrypt (AES-256-GCM, uid as
additional authenticated data) the user's Tavily tokens and the login `state`. Firestore and the browser only
ever hold the encrypted form, so a leaked database copy can't be used to search on someone's Tavily account, and
one user's sealed tokens don't work for another account. Spotify and Google logins will reuse it later.

**Proven in the spike (Task 0, 2026-10-26):**
- Registration: `POST https://mcp.tavily.com/register` returned 201 for a public client with both redirect URIs
  (client id in env `TAVILY_CLIENT_ID`). Tavily's login runs on `auth.tavily.com` and redirects back to our URI.
- Do **not** send a `resource` parameter on authorize (with it, Tavily's login page errored and returned
  `access_denied`); without it login works.
- Token exchange (`grant_type=authorization_code`, PKCE verifier, form-encoded) returns `access_token` (~400
  chars), `refresh_token` (~430 chars), `expires_in: 86400` (24 h).
- MCP over Streamable HTTP (`initialize` → `notifications/initialized` → `tools/call`, `mcp-session-id` header,
  responses as SSE `data:` lines) works with `Authorization: Bearer <access token>`. Server `tavily-mcp` 4.1.0.
- Search tool: **`tavily_search`** with `{ query, max_results, search_depth: 'basic', topic: 'general' }`; the result
  is one text content item holding JSON `{ query, answer, results: [{ url, title, content, score }] }`. Other tools
  (`tavily_extract`, `tavily_crawl`, `tavily_map`, `tavily_research`) are never called.
- Billing: the logged-in user's Tavily usage went up by the spike's 3 searches — searches use **their** account.
- **Refresh is broken on Tavily's side today:** `grant_type=refresh_token` returned HTTP 500 with or without
  `scope`/`resource`. Echo still implements refresh (it will start working when Tavily fixes it); when refresh
  fails, Web search disconnects and Echo asks the user to log in again — so today users re-login about once a day.

### Search order inside Echo

**Typed chat (`/api/echo`).** The request context gains `connectors: { id, status }[]`. The prompt gains an APP
GUIDE block and a CONNECTORS block plus the rules above. The classifier schema gains one action:

- `web_search { query }` — only when the answer is not in the user's data or the app guide, no connected
  connector covers it, and it needs current or outside facts. Never with other actions except memories.

The server then:

- `web_search` + Web search connected → Tavily search (basic, 5 results, ~1-2 s) → a second Gemini call writes
  the reply from the results (results inside a delimited UNTRUSTED WEB RESULTS block) → the reply carries
  `sources: { title, url }[]` (≤ 5), shown as small links under Echo's bubble and saved with the message.
- `web_search` + not connected → the reply teaches how to connect (fixed sentence + the model's short answer
  if it has one, clearly marked as "from what I know, not a live search").
- Requests for coming-soon connectors keep the existing `connector` action; the reply teaches.
- Meals: unchanged, except the USDA lookup is skipped when Nutrition is disconnected.

**Calls (Gemini Live).** A new `web_search { query }` tool. The browser runs it through `POST /api/search`
(`{ query, sealed }`, ID token) and returns the top results to the model; not connected → the tool result tells
the model to teach. The persona gets the same order/teaching rules and the app guide.

**Limits.** Per user: at most 20 searches per hour in-memory per server instance (soft guard; Tavily's own quota
is the real limit). Query ≤ 300 characters. Search answers never create notes/goals automatically.

### Diary pages in the 2nd Brain

- Memories gain `pages: string[]` (diary page ids where the memory was mentioned, newest last, ≤ 50). Every save
  (`upsertMemories`) adds the current page id, for typed chat and calls.
- The 2nd Brain view also reads the diary page list and adds one node per page that has at least one memory
  (`type: 'diary'`, id `page-<pageId>`, label = page title), linked to each memory whose `pages` includes it.
  Page nodes are derived for display only; nothing new is stored for them.
- The category formerly labelled "Diary" is labelled **"Diary pages"**; old diary-type memories appear in it. The
  classifier stops creating new `diary`-type memories (the page node replaces them).
- Tapping a page node: the side panel shows the page title, date, its linked memories, and the last 50 messages
  read-only, with **Open in Diary** (opens that page in the Diary view).

### Deleting a diary page

- The confirmation dialog (exists today) changes its text to: "This conversation and its messages will be
  deleted, along with **N 2nd Brain nodes** that came only from it. Nodes also mentioned in other conversations
  stay. Notes, reminders, goals, health logs and meals stay." N = memories whose `pages` is exactly `[pageId]`,
  counted when the dialog opens (one `array-contains` query).
- On confirm: delete the page and its messages (as today), delete those exclusive memories, remove `pageId` from
  the shared ones, and remove links to the deleted memories from their neighbours.
- My call: the other manual delete buttons (goal, note, reminder, meal) get the same styled confirmation dialog
  instead of `window.confirm`/none, without the 2nd Brain sentence (they don't touch it).

## Left to the builder

Exact copy of teaching sentences, dialog layout, source-link styling, the rate-limit numbers, how sealed keys
are versioned, and test layout — following the existing code's patterns.

## Setup the user does

- New env vars in `.env.local` and Vercel: `CONNECTOR_SECRET` (32 random bytes, base64, generated for you) and
  `TAVILY_CLIENT_ID` (from the one-time registration script).
- Users who connect Web search need a Tavily account (free sign-up on Tavily's login page).
- Firestore rules deploy (`firebase deploy --only firestore:rules`).

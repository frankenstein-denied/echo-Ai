# Web search cold start — plan

Spec: none (bug fix from user report, 2026-11-03). Rulings are provisional.

## Problem

The first web search after a quiet period fails; the second works. Each search makes three requests to Tavily's MCP server (initialize, notifications/initialized, tools/call), sometimes after a token refresh, all inside one 8000 ms budget (`lib/server/tavily.ts` DEFAULT_TIMEOUT_MS, `app/api/search/route.ts` TIMEOUT_MS, `lib/server/web-answer.ts` TAVILY_TIMEOUT_MS). A slow (sleeping) Tavily hits the abort, and `tavilySearch` turns every non-Tavily error, including the abort, into `TavilyError('failed')`. Echo then says SEARCH_FAILED_REPLY ("I couldn't search the web just now…"), which hides the real reason.

User request: say the real reason, e.g. "Opening Tavily, first searches in a while may take a little longer", instead of a generic glitch.

## Global Constraints

- Never log the token, the query or the results (existing rule in these files).
- `/api/search` keeps `maxDuration = 20`; total server work must fit in it.
- Exact new reply text (add to `lib/echo/search-replies.ts`):
  `export const SEARCH_WAKING_REPLY = "Tavily is still waking up. First searches in a while take a little longer, so ask me again in a moment."`
- New error code string for the waking case: `'waking'`.
- Tests: vitest (`npx vitest run <files>`); all existing tests must keep passing.

## Task 1: Classify timeouts, retry once, report "waking"

Files: `lib/server/tavily.ts`, `app/api/search/route.ts`, `lib/server/web-answer.ts`, `lib/echo/search-replies.ts`, `lib/echo/client.ts`, tests in `lib/server/tavily.test.ts`, `lib/server/search-route.test.ts`, `lib/server/web-answer.test.ts`, `lib/echo/search-client.test.ts`.

1. `TavilyError.kind` gains `'timeout'`. In `tavilySearch`, when the request was aborted by its own timer (the AbortController fired), throw `TavilyError('timeout')` instead of `'failed'`. Other errors keep their current kinds.
2. `/api/search` route: if `tavilySearch` throws kind `'timeout'`, retry the search ONCE (Tavily is now awake) with the same fresh access token, provided at least 3000 ms of a 17000 ms overall budget (measured from the start of the request handler) remain; the retry's timeoutMs = min(8000, remaining budget). If the retry succeeds, return results as usual. If it also times out, or there is no budget left, respond `{ error: 'waking', ...keep }` with status 504. The rate-limit slot is taken only once per request (no extra slot for the retry). Log `[search] failed: timeout` (kind only) for timeouts.
3. `web-answer.ts` (typed chat): same rule — on a `'timeout'` kind, retry once if `remaining() - ANSWER_RESERVE_MS >= 3000`, with timeoutMs = min(TAVILY_TIMEOUT_MS, remaining() - ANSWER_RESERVE_MS). If the retry also times out or there is no budget, reply SEARCH_WAKING_REPLY (trace text: `'Tavily is waking up'`), keeping `resealed` as the other error paths do.
4. `search-replies.ts`: add SEARCH_WAKING_REPLY (exact text above); re-export it from `web-answer.ts` alongside the others.
5. `client.ts`: `SEARCH_TELL` gains `waking: SEARCH_WAKING_REPLY`; `searchWebViaApi`'s fetch timeout rises from 15000 to 19000 ms so the client doesn't give up before the server's retry finishes.
6. Tests (write first, see them fail):
   - tavily: an aborted/hung fetch with a small timeoutMs rejects with `TavilyError` kind `'timeout'`; a 500 still gives `'failed'`.
   - route: first search times out, second succeeds → 200 with results and the search function was called twice; both time out → `{ error: 'waking' }` with status 504; non-timeout failure → no retry, `'failed'`.
   - web-answer: timeout then success → normal answer; timeout twice → SEARCH_WAKING_REPLY.
   - search client: server `{ error: 'waking' }` → output `{ error: 'waking', tell_user: SEARCH_WAKING_REPLY }`.

## Task 2: Echo says it is opening Tavily

File: `lib/server/live.ts` (LIVE_PERSONA), test `lib/server/live.test.ts`.

1. In SEARCH ORDER step 3 replace `Say a short "let me check" before searching.` with:
   `Before searching, say a short "let me check"; for the first search in a call say instead something like "Opening Tavily, the first search in a while can take a little longer."`
2. In the same step, after the not_connected sentence, add: `If it returns error waking, say its tell_user text in your own words.`
3. Test: LIVE_PERSONA contains `Opening Tavily` and `error waking`.

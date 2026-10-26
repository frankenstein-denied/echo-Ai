// One-time: register Echo as a public OAuth client with Tavily's remote MCP server ("Log in with Tavily").
// Run: npx tsx scripts/tavily-register.mts  → put the printed client_id in TAVILY_CLIENT_ID (.env.local + Vercel).
const REDIRECT_URIS = [
  'https://echo-ai-blue.vercel.app/api/connectors/web-search/callback',
  'http://localhost:3000/api/connectors/web-search/callback',
]

const r = await fetch('https://mcp.tavily.com/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'Echo',
    redirect_uris: REDIRECT_URIS,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'openid offline_access',
  }),
})
const body = (await r.json()) as { client_id?: string }
if (!r.ok || !body.client_id) {
  console.error('Registration failed:', r.status, body)
  process.exit(1)
}
console.log(`TAVILY_CLIENT_ID=${body.client_id}`)

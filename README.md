# Agentic Profile Network · v1

A personal profile you own, shared with a QR code, with an agent that talks to other people's agents. For people, not brands.

- **Under 30 seconds to make one.** Photo, name, what you do, where you work, causes. No app, no password, no email.
- **The loop:** show your QR → they scan → **Make mine** → they have a profile already connected to yours, with their own QR.
- **Your agent screens contact.** Nobody gets your phone or email. Requests go to your agent, which checks them against your rules. Each request comes with a donation to one of your causes. If you accept, the sender gets a channel you can close at any time.
- **Peer-vouched employment.** "Verified by 12 people, 9 at HubSpot."
- **MCP built in.** Every profile is an MCP server you can add to Claude as a custom connector.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:8787, data in .data/store.json
npm test           # end-to-end test of the whole v1 flow
```

To try it on your phone, expose the dev server over HTTPS (e.g. `cloudflared tunnel --url http://localhost:8787`).

## Deploy (Cloudflare Workers free tier)

```bash
npx wrangler login
npx wrangler kv namespace create PROFILES   # paste the id into wrangler.toml
npm run deploy
```

Storage is one KV namespace. The app is a single Worker that serves server-rendered pages, so there's no build step.

## Connect to Claude

Every profile shows its agent URLs.

| Connector | URL | What it can do |
|---|---|---|
| Someone's public agent | `https://<host>/p/<handle>/mcp` | Read their profile and connections, find shared connections, **preview** whether they'd take a request |
| Your private agent | `https://<host>/a/<your-key>/mcp` (on **My agent**) | Everything above, plus acting **as you**: vouch, send contact requests, read and answer your inbox, connect |

In Claude: **Settings → Connectors → Add custom connector**, then paste the URL. Then try:

> Ask Jason's profile whether he'd take an intro to someone in fintech.

Claude calls `request_contact` on Jason's public agent as a dry run. It gets back a decision with the reasons (who he accepts from, topics he welcomes or blocks, and the donation and cause required).

### Tools

| Tool | Public | Private | Notes |
|---|---|---|---|
| `get_profile` | ✓ | ✓ | Public profile. Never phone or email |
| `list_connections` | ✓ | ✓ | |
| `find_shared_connections` | ✓ | ✓ | |
| `request_contact` | dry run | ✓ | Checked against the recipient's contact rules |
| `vouch_employment` | ✗ (explains why) | ✓ | Connected profiles only |
| `list_contact_requests` | | ✓ | Inbox, sent requests, pending connections |
| `respond_to_contact_request` | | ✓ | Accepting opens a revocable channel |
| `connect` | | ✓ | Request or accept a connection |

Transport: MCP Streamable HTTP, stateless, JSON responses (protocol `2025-11-25`, `2025-06-18`, `2025-03-26` and `2024-11-05`).

## How it works

**Profile data.** `GET /p/<handle>.json` is the structured public record behind each page: name, role, bio, photo, claimed employer and verification, causes, contact rules, connections and agent URL.

**Identity without signup.** Making a profile issues a random owner key, stored in an HttpOnly cookie. **My agent** shows a sign-in link (`/k/<key>`) to save in a password manager. Only a hash of the key is stored. The web-app manifest opens home-screen installs through that link, because iOS home-screen apps don't share Safari's cookies.

**QR handshake.** The QR on your screen encodes `/p/<you>?t=<token>`. The token is an HMAC that rotates every 10 minutes and stays valid for about 30. A scan with a fresh token connects both people instantly, because it proves they met in person. A plain shared link sends a connection request for you to approve instead.

**Vouches.** Only connected people can vouch, once per employer. Vouches count only for the employer you currently claim, so changing jobs starts fresh. Vouches from people who claim the same employer weigh three times as much. Three or more of those earns the "strong" badge.

**Contact rules.** These are enforced the same way by the web form and by agents:
- who can ask: anyone / connections of connections (default) / connections / nobody
- minimum donation (default $5), which must go to one of your listed causes
- welcome topics, blocked topics, and an optional "only welcome topics"
- an optional requirement that the sender's employer is vouched for

Requests that fail your rules are kept and marked *filtered by agent*, so you can still review them.

## v1 limits (deliberate)

- **Donations are pledges.** They're recorded, but no money moves, since payments are out of scope.
- KV is eventually consistent and writes are read-modify-write. That's fine at this scale. Move to D1 or Durable Objects before real traffic.
- There's no rate limiting or abuse reporting yet.
- There are no company profiles, payroll verification or on-chain anything (see the brief).

## Layout

```
src/app.js     router (standard Request → Response)
src/model.js   profiles, handshake, vouches, contact rules, channels
src/mcp.js     MCP server
src/views.js   HTML + CSS
src/qr.js      QR → SVG
src/worker.js  Cloudflare entry       server/dev.js  Node entry
test/          end-to-end flow test
```

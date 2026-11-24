// Minimal MCP server (Streamable HTTP transport, JSON responses, stateless).
//
// Two kinds of endpoint:
//   /p/{handle}/mcp  public: speaks for that profile to anyone's agent. Read
//                    tools + a dry-run of contact rules. Can't act as anyone.
//   /a/{key}/mcp     private "my agent": acts as the key's owner. Can vouch,
//                    send contact requests and work the owner's inbox.

import {
  AppError, connect, evaluateRequest, getRequests, mustGetProfile, publicProfile, requestContact,
  respondConnection, respondRequest, sharedConnectionHandles, summaries, vouch,
} from './model.js';

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const handleProp = (desc) => ({ type: 'string', description: desc });

function toolDefs(ctx) {
  const self = ctx.owner ? ctx.owner.name : ctx.bound.name;
  const defaultHandle = ctx.owner ? `Defaults to ${self} (you).` : `Defaults to ${self}.`;
  const tools = [
    {
      name: 'get_profile',
      title: 'Get profile',
      description: `Get a person's public profile: name, role, bio, claimed employer with peer-vouch verification, causes they support, contact rules and connection count. Never includes phone or email. ${defaultHandle}`,
      inputSchema: { type: 'object', properties: { handle: handleProp('Profile handle, e.g. "jason"') } },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'list_connections',
      title: 'List connections',
      description: `List a person's public connections (name, role, employer). ${defaultHandle}`,
      inputSchema: { type: 'object', properties: { handle: handleProp('Profile handle') } },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'find_shared_connections',
      title: 'Find shared connections',
      description: `Find people connected to both ${self} and another profile. Useful for warm intros.`,
      inputSchema: {
        type: 'object',
        properties: { other_handle: handleProp('The other profile to compare with'), handle: handleProp(`First profile. ${defaultHandle}`) },
        required: ['other_handle'],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'request_contact',
      title: 'Request contact',
      description: ctx.owner
        ? `Send a contact request from ${self} to another person's agent. Their agent checks it against their contact rules (who may ask, welcome/blocked topics, minimum donation to one of their causes). If delivered and they accept, both sides get a revocable message channel; raw phone/email is never shared. Use dry_run=true to check the rules without sending. Donations are pledges in v1 (no payment is taken).`
        : `Check whether ${self} would take a contact request, against their contact rules (who may ask, welcome/blocked topics, minimum donation to one of their causes). This public endpoint only previews (dry run); to actually send, the requester uses their own profile's agent connector. Pass from_handle to preview as a specific person.`,
      inputSchema: {
        type: 'object',
        properties: {
          ...(ctx.owner ? { handle: handleProp('Who to contact (required)') } : { from_handle: handleProp('Optional: preview as this profile') }),
          topic: { type: 'string', description: 'What the request is about, e.g. "intro to a fintech founder"' },
          message: { type: 'string', description: 'Short message for the person' },
          cause: { type: 'string', description: 'Which of their causes the donation goes to' },
          pledge_usd: { type: 'number', description: 'Donation pledged, in US dollars' },
          ...(ctx.owner ? { dry_run: { type: 'boolean', description: 'Only check the rules, do not send' } } : {}),
        },
        required: ctx.owner ? ['handle', 'topic'] : ['topic'],
      },
    },
    {
      name: 'vouch_employment',
      title: 'Vouch for employment',
      description: ctx.owner
        ? `Record that ${self} vouches that a connected person works at the employer they claim. Only works between connected profiles. Vouches from people claiming the same employer count for more.`
        : `Vouching must come from a connected person's own agent (their private connector), so it isn't available on this public endpoint. Calling it explains how.`,
      inputSchema: { type: 'object', properties: { handle: handleProp('Who to vouch for') }, required: ['handle'] },
    },
  ];
  if (ctx.owner) {
    tools.push(
      {
        name: 'list_contact_requests',
        title: 'List my contact requests',
        description: `List contact requests sent to ${self} (inbox) and by ${self} (sent), plus pending connection requests. Filtered requests are ones the agent declined against ${self}'s rules.`,
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'respond_to_contact_request',
        title: 'Accept or decline a contact request',
        description: `Accept or decline a contact request in ${self}'s inbox. Accepting opens a revocable message channel. Only do this when ${self} has clearly told you to.`,
        inputSchema: { type: 'object', properties: { id: { type: 'string' }, accept: { type: 'boolean' } }, required: ['id', 'accept'] },
      },
      {
        name: 'connect',
        title: 'Connect',
        description: `Ask to connect ${self} with another profile (they must accept), or accept a pending connection request from them.`,
        inputSchema: { type: 'object', properties: { handle: handleProp('Profile to connect with') }, required: ['handle'] },
      },
    );
  }
  return tools;
}

async function callTool(ctx, name, args = {}) {
  const { store, baseUrl, owner } = ctx;
  const me = owner || ctx.bound;
  const target = async (h) => (h ? mustGetProfile(store, h) : me);

  switch (name) {
    case 'get_profile': {
      const p = await target(args.handle);
      const out = publicProfile(p, baseUrl);
      if (owner && p.handle !== owner.handle) {
        out.shared_connections = await summaries(store, sharedConnectionHandles(owner, p));
        out.you_are_connected = p.connections.some((c) => c.handle === owner.handle);
      }
      return out;
    }
    case 'list_connections': {
      const p = await target(args.handle);
      return { handle: p.handle, count: p.connections.length, connections: await summaries(store, p.connections.map((c) => c.handle)) };
    }
    case 'find_shared_connections': {
      const a = await target(args.handle);
      const b = await mustGetProfile(store, args.other_handle);
      const shared = await summaries(store, sharedConnectionHandles(a, b));
      return { between: [a.handle, b.handle], directly_connected: a.connections.some((c) => c.handle === b.handle), count: shared.length, shared };
    }
    case 'request_contact': {
      const input = { topic: args.topic, message: args.message, cause: args.cause, pledge: args.pledge_usd };
      if (!owner) {
        const sender = args.from_handle ? await mustGetProfile(store, args.from_handle) : null;
        const ev = evaluateRequest(ctx.bound, sender, input);
        return {
          dry_run: true,
          to: ctx.bound.handle,
          would_be: ev.decision === 'deliver' ? 'delivered to their inbox for a decision' : 'declined by their agent',
          ...ev,
          how_to_send: `Send it from your own profile's agent connector (the private /a/.../mcp URL on your profile's Agent page) with request_contact handle="${ctx.bound.handle}".`,
        };
      }
      if (!args.handle) throw new AppError('handle is required: who do you want to contact?');
      const recipient = await mustGetProfile(store, args.handle);
      if (args.dry_run) return { dry_run: true, to: recipient.handle, ...evaluateRequest(recipient, owner, input) };
      const { request, evaluation } = await requestContact(store, owner, recipient.handle, input);
      return {
        sent: request.status === 'pending',
        status: request.status === 'pending' ? 'delivered: waiting for their decision' : 'filtered: their agent declined it',
        request_id: request.id,
        ...evaluation,
      };
    }
    case 'vouch_employment': {
      if (!owner) {
        throw new AppError(`Vouches must come from a connected person's own agent. Use your private connector (/a/.../mcp from your profile's Agent page), or the Vouch button on ${baseUrl}/p/${args.handle || ctx.bound.handle}.`, 403);
      }
      const res = await vouch(store, owner, args.handle);
      return { vouched_for: res.profile.handle, employer: res.profile.employer, already_vouched: res.already, verification: res.verification };
    }
    case 'list_contact_requests': {
      const fresh = await mustGetProfile(store, owner.handle);
      return {
        inbox: await getRequests(store, fresh.private.inbox),
        sent: await getRequests(store, fresh.private.outbox),
        pending_connections: fresh.private.pending_connections,
        channels: fresh.private.channels.map((id) => `${baseUrl}/c/${id}`),
      };
    }
    case 'respond_to_contact_request': {
      const fresh = await mustGetProfile(store, owner.handle);
      const req = await respondRequest(store, fresh, args.id, Boolean(args.accept));
      return { id: req.id, status: req.status, channel: req.channel ? `${baseUrl}/c/${req.channel}` : null };
    }
    case 'connect': {
      const fresh = await mustGetProfile(store, owner.handle);
      const other = await mustGetProfile(store, args.handle);
      if (fresh.private.pending_connections.some((p) => p.handle === other.handle)) {
        await respondConnection(store, fresh, other.handle, true);
        return { status: 'connected', with: other.handle };
      }
      const res = await connect(store, fresh, other.handle, null);
      return { status: res.status, with: other.handle };
    }
    default:
      throw new RpcError(-32602, `Unknown tool: ${name}`);
  }
}

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function instructions(ctx) {
  if (ctx.owner) {
    return `You are acting as ${ctx.owner.name} (@${ctx.owner.handle}) on the Agentic Profile Network. Requests and vouches you send are signed as them. Phone numbers and emails are never shared; contact happens through revocable channels. Only accept or decline requests when ${ctx.owner.name} tells you to.`;
  }
  return `This is the public agent for ${ctx.bound.name} (@${ctx.bound.handle}) on the Agentic Profile Network. It answers questions about their public profile, connections and contact rules. It never reveals phone or email. Use request_contact to check whether ${ctx.bound.name} would take a particular request.`;
}

async function handleMessage(ctx, msg) {
  const isNotification = msg.id === undefined || msg.id === null;
  try {
    if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') throw new RpcError(-32600, 'Invalid request');
    let result;
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion;
        const name = ctx.owner ? `${ctx.owner.name} (my agent)` : `${ctx.bound.name}'s profile`;
        result = {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'agentic-profile', title: name, version: '0.1.0' },
          instructions: instructions(ctx),
        };
        break;
      }
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: toolDefs(ctx) };
        break;
      case 'tools/call': {
        const name = msg.params?.name;
        try {
          const data = await callTool(ctx, name, msg.params?.arguments || {});
          result = { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
        } catch (err) {
          if (err instanceof RpcError) throw err;
          if (!(err instanceof AppError)) console.error(err);
          result = { content: [{ type: 'text', text: err instanceof AppError ? err.message : 'Internal error' }], isError: true };
        }
        break;
      }
      default:
        if (isNotification) return null; // notifications/initialized etc.
        throw new RpcError(-32601, `Method not found: ${msg.method}`);
    }
    return isNotification ? null : { jsonrpc: '2.0', id: msg.id, result };
  } catch (err) {
    if (isNotification) return null;
    const code = err instanceof RpcError ? err.code : -32603;
    return { jsonrpc: '2.0', id: msg.id ?? null, error: { code, message: err instanceof RpcError ? err.message : 'Internal error' } };
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, mcp-protocol-version, mcp-session-id, authorization',
};

export async function handleMcp(request, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response('This MCP endpoint takes JSON-RPC over POST (Streamable HTTP, no SSE stream).', { status: 405, headers: { allow: 'POST', ...CORS } });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m) => handleMessage(ctx, m)))).filter(Boolean);
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? replies : replies[0], { headers: CORS });
}

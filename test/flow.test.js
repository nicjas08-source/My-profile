// End-to-end: the v1 success test, driven through the real router.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { qrToken, topicMatches } from '../src/model.js';

const BASE = 'https://profiles.test';
const store = new MemoryStore();

function client() {
  let cookie = '';
  async function req(path, { method = 'GET', form, json, headers = {} } = {}) {
    const init = { method, headers: { ...headers, ...(cookie ? { cookie } : {}) } };
    if (form) init.body = new URLSearchParams(form);
    if (json) {
      init.body = JSON.stringify(json);
      init.headers['content-type'] = 'application/json';
    }
    const res = await handle(new Request(BASE + path, init), { store });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return res;
  }
  return { req, key: () => decodeURIComponent(cookie.split('=')[1] || '') };
}

async function mcp(path, method, params, id = 1) {
  const res = await handle(
    new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }),
    { store },
  );
  return res.status === 202 ? null : res.json();
}
const call = async (path, name, args) => {
  const r = await mcp(path, 'tools/call', { name, arguments: args });
  return { ...r.result, data: r.result.structuredContent };
};

const nick = client();
const jason = client();
const sam = client();
let nickHandle, jasonHandle, samHandle;

test('make a profile in one step', async () => {
  const res = await nick.req('/api/profiles', { method: 'POST', form: { name: 'Nick Jas', role: 'Founder', employer: 'HubSpot', causes: 'Climate, Girls in STEM' } });
  assert.equal(res.status, 303);
  nickHandle = res.headers.get('location').match(/\/p\/([^?]+)/)[1];
  assert.equal(nickHandle, 'nick-jas');
  assert.ok(nick.key().length > 20);
  const page = await (await nick.req(`/p/${nickHandle}?m=welcome`)).text();
  assert.match(page, /Show my QR/);
  assert.match(page, /Girls in STEM/);
});

test('scan QR -> Make mine -> connected instantly', async () => {
  // The token is only inside the QR image on Nick's screen; compute the same one.
  const t = await qrToken(await store.get(`p:${nickHandle}`));

  // Jason scans: anonymous visitor sees "Make mine" carrying the token.
  const page = await (await jason.req(`/p/${nickHandle}?t=${t}`)).text();
  assert.match(page, /Make mine/);
  assert.match(page, new RegExp(`/new\\?via=${nickHandle}&amp;t=${t}`));

  const res = await jason.req('/api/profiles', { method: 'POST', form: { name: 'Jason Lee', role: 'Partner', employer: 'Hubspot', causes: 'Ocean conservation', via: nickHandle, t } });
  jasonHandle = res.headers.get('location').match(/\/p\/([^?]+)/)[1];
  const welcome = await (await jason.req(res.headers.get('location'))).text();
  assert.match(welcome, /connected with Nick Jas/);

  const nickJson = await (await nick.req(`/p/${nickHandle}.json`)).json();
  assert.deepEqual(nickJson.connections.handles, [jasonHandle]);
  assert.equal(JSON.stringify(nickJson).includes('private'), false);
  assert.equal(JSON.stringify(nickJson).includes('key_hash'), false);
});

test('a link without a fresh token only requests a connection', async () => {
  const res = await sam.req('/api/profiles', { method: 'POST', form: { name: 'Sam Park', employer: 'Stripe', via: jasonHandle, t: 'bogus' } });
  samHandle = res.headers.get('location').match(/\/p\/([^?]+)/)[1];
  assert.match(res.headers.get('location'), /welcome-req/);
  let j = await (await jason.req(`/p/${jasonHandle}.json`)).json();
  assert.equal(j.connections.count, 1);
  await jason.req('/api/connections/respond', { method: 'POST', form: { handle: samHandle, accept: '1' } });
  j = await (await jason.req(`/p/${jasonHandle}.json`)).json();
  assert.equal(j.connections.count, 2);
});

test('peer vouches: only connected people, same-employer weighs more', async () => {
  // Sam isn't connected to Nick: refused.
  const refused = await sam.req('/api/vouch', { method: 'POST', form: { handle: nickHandle } });
  assert.equal(refused.status, 403);
  await jason.req('/api/vouch', { method: 'POST', form: { handle: nickHandle } });
  await jason.req('/api/vouch', { method: 'POST', form: { handle: nickHandle } }); // idempotent
  const v = (await (await nick.req(`/p/${nickHandle}.json`)).json()).employer.verification;
  assert.equal(v.total, 1);
  assert.equal(v.same_employer, 1); // "Hubspot" vs "HubSpot" still counts
  assert.equal(v.label, 'Verified by 1 person, 1 at HubSpot');
});

test('MCP: handshake and tool list', async () => {
  const init = await mcp(`/p/${jasonHandle}/mcp`, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(await mcp(`/p/${jasonHandle}/mcp`, 'notifications/initialized', undefined, null), null);
  const list = await mcp(`/p/${jasonHandle}/mcp`, 'tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  for (const n of ['get_profile', 'list_connections', 'find_shared_connections', 'vouch_employment', 'request_contact']) assert.ok(names.includes(n), n);
  const priv = await mcp(`/a/${nick.key()}/mcp`, 'tools/list', {});
  assert.ok(priv.result.tools.some((t) => t.name === 'respond_to_contact_request'));
  const bad = await handle(new Request(`${BASE}/a/${'x'.repeat(30)}/mcp`, { method: 'POST', body: '{}' }), { store });
  assert.equal(bad.status, 401);
});

test("MCP: ask Jason's profile whether he'd take a fintech intro", async () => {
  // Jason sets rules: open to fintech, $10 to his cause.
  await jason.req('/api/me', { method: 'POST', form: { name: 'Jason Lee', role: 'Partner', employer: 'Hubspot', bio: '', causes: 'Ocean conservation', accept_from: 'connections_of_connections', min_donation: '10', welcome_topics: 'fintech, climate', blocked_topics: 'crypto', note: '' } });
  const pub = `/p/${jasonHandle}/mcp`;
  const profile = await call(pub, 'get_profile', {});
  assert.equal(profile.data.contact_rules.min_donation_usd, 10);
  assert.equal(JSON.stringify(profile.data).includes('@'), false); // no email anywhere

  const yes = await call(pub, 'request_contact', { topic: 'intro to someone in fintech', cause: 'Ocean conservation', pledge_usd: 10, from_handle: nickHandle });
  assert.equal(yes.data.decision, 'deliver');
  assert.equal(yes.data.dry_run, true);
  assert.ok(yes.data.notes[0].includes('fintech'));

  const no = await call(pub, 'request_contact', { topic: 'crypto token launch', cause: 'Ocean conservation', pledge_usd: 10 });
  assert.equal(no.data.decision, 'decline');

  const shared = await call(`/a/${nick.key()}/mcp`, 'find_shared_connections', { other_handle: samHandle });
  assert.deepEqual(shared.data.shared.map((s) => s.handle), [jasonHandle]);

  const vouchPublic = await call(pub, 'vouch_employment', { handle: jasonHandle });
  assert.equal(vouchPublic.isError, true);
});

test('MCP: agents send, filter and accept contact requests; channel is revocable', async () => {
  // Sam (connection of a connection) asks Nick via Sam's own agent; underpays first.
  const samAgent = `/a/${sam.key()}/mcp`;
  const cheap = await call(samAgent, 'request_contact', { handle: nickHandle, topic: 'hiring', pledge_usd: 1, cause: 'Climate' });
  assert.equal(cheap.data.sent, false);
  assert.match(cheap.data.status, /filtered/);

  const ok = await call(samAgent, 'request_contact', { handle: nickHandle, topic: 'hiring', message: 'Coffee?', pledge_usd: 5, cause: 'Climate' });
  assert.equal(ok.data.sent, true);

  const nickAgent = `/a/${nick.key()}/mcp`;
  const inbox = await call(nickAgent, 'list_contact_requests', {});
  assert.equal(inbox.data.inbox.filter((r) => r.status === 'pending').length, 1);
  assert.equal(inbox.data.inbox.filter((r) => r.status === 'filtered').length, 1);
  const page = await (await nick.req('/me/inbox')).text();
  assert.match(page, /Inbox<b>1<\/b>/);

  const acc = await call(nickAgent, 'respond_to_contact_request', { id: ok.data.request_id, accept: true });
  assert.equal(acc.data.status, 'accepted');
  const chPath = new URL(acc.data.channel).pathname;
  const chPage = await (await sam.req(chPath)).text();
  assert.match(chPage, /Coffee\?/);
  assert.equal(chPage.includes('@'), false);
  await sam.req('/api/channels/post', { method: 'POST', form: { id: chPath.split('/')[2], text: 'Tues 10am?' } });
  await nick.req('/api/channels/close', { method: 'POST', form: { id: chPath.split('/')[2] } });
  const closed = await sam.req('/api/channels/post', { method: 'POST', form: { id: chPath.split('/')[2], text: 'hello?' } });
  assert.equal(closed.status, 410);
  // Jason (not a member) can't read it.
  assert.equal((await jason.req(chPath)).status, 404);
});

test('stranger is filtered by default rules', async () => {
  const stranger = client();
  await stranger.req('/api/profiles', { method: 'POST', form: { name: 'Random Person' } });
  const res = await call(`/a/${stranger.key()}/mcp`, 'request_contact', { handle: nickHandle, topic: 'sales', pledge_usd: 100, cause: 'Climate' });
  assert.equal(res.data.sent, false);
  assert.ok(res.data.reasons.some((r) => r.includes('connections of my connections')));
});

test('topic matching', () => {
  assert.ok(topicMatches('Intro to someone in fintech', 'fintech'));
  assert.ok(topicMatches('hiring senior designers', 'hiring designers'));
  assert.ok(!topicMatches('climate policy', 'fintech'));
});

test('QR page renders an SVG and the photo round-trips', async () => {
  const svg = await (await nick.req('/me/qr')).text();
  assert.match(svg, /<svg[^>]+viewBox/);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await nick.req('/api/me', { method: 'POST', form: { name: 'Nick Jas', photo: png, accept_from: 'connections_of_connections' } });
  const img = await nick.req(`/p/${nickHandle}/photo?v=2`);
  assert.equal(img.headers.get('content-type'), 'image/png');
});

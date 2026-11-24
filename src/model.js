// Domain logic: profiles, QR handshake, connections, vouches, contact rules,
// contact requests and revocable channels. Storage keys:
//   p:{handle}   profile record (public fields + `private`)
//   k:{sha256}   owner key hash -> handle
//   img:{handle} photo data URL
//   r:{id}       contact request
//   c:{id}       channel

import { clean, cleanMultiline, hmac, list, randomId, randomToken, sameText, sha256hex, slugify, timingSafeEqual } from './util.js';

export const ACCEPT_FROM = {
  anyone: 'Anyone',
  connections_of_connections: 'Connections of my connections',
  connections: 'My connections only',
  nobody: 'Nobody right now',
};
const ACCEPT_RANK = { nobody: 0, connections: 1, connections_of_connections: 2, anyone: 3 };
const REL_RANK = { self: 0, connection: 1, connection_of_connection: 2, stranger: 3 };

export const DEFAULT_RULES = {
  accept_from: 'connections_of_connections',
  min_donation: 5,
  welcome_topics: [],
  blocked_topics: [],
  only_welcome_topics: false,
  require_vouched: false,
  note: '',
};

const QR_WINDOW_MS = 10 * 60 * 1000; // token rotates every 10 minutes
const QR_WINDOWS_VALID = 3; // ...and stays valid for ~30 minutes
const MAX_LIST = 500;

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------- profiles ----------

export async function getProfile(store, handle) {
  if (!handle || !/^[a-z0-9-]{1,40}$/.test(handle)) return null;
  return store.get(`p:${handle}`);
}

export async function mustGetProfile(store, handle) {
  const p = await getProfile(store, String(handle || '').toLowerCase().replace(/^@/, ''));
  if (!p) throw new AppError(`No profile called "${handle}"`, 404);
  return p;
}

export async function profileByKey(store, key) {
  if (!key || key.length < 20) return null;
  const handle = await store.get(`k:${await sha256hex(key)}`);
  return handle ? getProfile(store, handle) : null;
}

async function save(store, profile) {
  profile.updated_at = new Date().toISOString();
  await store.put(`p:${profile.handle}`, profile);
}

function normaliseCauses(value) {
  return list(value, 8, 60);
}

export function normaliseRules(input = {}, base = DEFAULT_RULES) {
  const r = { ...base };
  if (input.accept_from !== undefined && ACCEPT_FROM[input.accept_from]) r.accept_from = input.accept_from;
  if (input.min_donation !== undefined && input.min_donation !== '') {
    const n = Math.round(Number(input.min_donation));
    if (Number.isFinite(n)) r.min_donation = Math.max(0, Math.min(10000, n));
  }
  if (input.welcome_topics !== undefined) r.welcome_topics = list(input.welcome_topics, 12, 40);
  if (input.blocked_topics !== undefined) r.blocked_topics = list(input.blocked_topics, 12, 40);
  if (input.only_welcome_topics !== undefined) r.only_welcome_topics = truthy(input.only_welcome_topics);
  if (input.require_vouched !== undefined) r.require_vouched = truthy(input.require_vouched);
  if (input.note !== undefined) r.note = cleanMultiline(input.note, 280);
  return r;
}

function truthy(v) {
  return v === true || v === 'true' || v === 'on' || v === '1' || v === 1;
}

function validatePhoto(photo) {
  if (!photo) return null;
  if (typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) {
    throw new AppError('Photo must be a JPEG, PNG or WebP image');
  }
  if (photo.length > 1_500_000) throw new AppError('Photo is too large (max ~1MB after resizing)');
  return photo;
}

async function freeHandle(store, name) {
  const base = slugify(name);
  if (!(await store.get(`p:${base}`)) && !RESERVED.has(base)) return base;
  for (let i = 0; i < 20; i++) {
    const h = `${base}-${randomId(3)}`;
    if (!(await store.get(`p:${h}`))) return h;
  }
  throw new AppError('Could not find a free handle, try again', 500);
}
const RESERVED = new Set(['me', 'new', 'api', 'admin', 'mcp', 'a', 'p', 'c', 'k', 'static']);

export async function createProfile(store, input, { via, token } = {}) {
  const name = clean(input.name, 60);
  if (!name) throw new AppError('Name is required');
  const photo = validatePhoto(input.photo);
  const handle = await freeHandle(store, name);
  const ownerKey = randomToken(24);
  const now = new Date().toISOString();
  const profile = {
    handle,
    name,
    role: clean(input.role, 80),
    employer: clean(input.employer, 60),
    bio: cleanMultiline(input.bio, 280),
    causes: normaliseCauses(input.causes),
    has_photo: Boolean(photo),
    photo_v: 1,
    contact_rules: normaliseRules(input.contact_rules || {}),
    connections: [],
    vouches: [],
    created_at: now,
    updated_at: now,
    private: {
      key_hash: await sha256hex(ownerKey),
      qr_secret: randomToken(24),
      pending_connections: [],
      inbox: [],
      outbox: [],
      channels: [],
    },
  };
  await store.put(`k:${profile.private.key_hash}`, handle);
  if (photo) await store.put(`img:${handle}`, photo);
  await save(store, profile);

  let connection = null;
  if (via) {
    try {
      connection = await connect(store, profile, via, token);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
    }
  }
  return { profile: await getProfile(store, handle), ownerKey, connection };
}

export async function updateProfile(store, profile, input) {
  if (input.name !== undefined) {
    const name = clean(input.name, 60);
    if (!name) throw new AppError('Name is required');
    profile.name = name;
  }
  if (input.role !== undefined) profile.role = clean(input.role, 80);
  if (input.bio !== undefined) profile.bio = cleanMultiline(input.bio, 280);
  if (input.causes !== undefined) profile.causes = normaliseCauses(input.causes);
  if (input.employer !== undefined) profile.employer = clean(input.employer, 60);
  if (input.contact_rules) profile.contact_rules = normaliseRules(input.contact_rules, profile.contact_rules);
  if (input.photo) {
    await store.put(`img:${profile.handle}`, validatePhoto(input.photo));
    profile.has_photo = true;
    profile.photo_v = (profile.photo_v || 0) + 1;
  }
  await save(store, profile);
  return profile;
}

// ---------- verification (peer vouches) ----------

/** Vouches only count for the employer currently claimed. Same-employer vouches weigh 3x. */
export function verification(profile) {
  const employer = profile.employer;
  if (!employer) return { employer: '', total: 0, same_employer: 0, score: 0, level: 'none', label: '' };
  const valid = profile.vouches.filter((v) => sameText(v.employer, employer));
  const same = valid.filter((v) => sameText(v.from_employer, employer)).length;
  const total = valid.length;
  const score = same * 3 + (total - same);
  const level = same >= 3 || score >= 9 ? 'strong' : total > 0 ? 'vouched' : 'unverified';
  let label = 'Not yet vouched for';
  if (total > 0) {
    label = `Verified by ${total} ${total === 1 ? 'person' : 'people'}`;
    if (same > 0) label += `, ${same} at ${employer}`;
  }
  return { employer, total, same_employer: same, score, level, label };
}

export async function vouch(store, from, toHandle) {
  const to = await mustGetProfile(store, toHandle);
  if (to.handle === from.handle) throw new AppError("You can't vouch for yourself");
  if (!to.employer) throw new AppError(`${to.name} hasn't claimed an employer yet`);
  if (!isConnected(from, to.handle)) throw new AppError(`Connect with ${to.name} before vouching`, 403);
  const existing = to.vouches.find((v) => v.from === from.handle && sameText(v.employer, to.employer));
  if (!existing) {
    to.vouches.push({ from: from.handle, employer: to.employer, from_employer: from.employer || '', at: new Date().toISOString() });
    await save(store, to);
  }
  return { already: Boolean(existing), verification: verification(to), profile: to };
}

// ---------- QR handshake + connections ----------

export async function qrToken(profile, now = Date.now()) {
  const window = Math.floor(now / QR_WINDOW_MS);
  return (await hmac(profile.private.qr_secret, `${profile.handle}:${window}`)).slice(0, 16);
}

export async function verifyQrToken(profile, token, now = Date.now()) {
  if (!token) return false;
  const window = Math.floor(now / QR_WINDOW_MS);
  for (let i = 0; i < QR_WINDOWS_VALID; i++) {
    const t = (await hmac(profile.private.qr_secret, `${profile.handle}:${window - i}`)).slice(0, 16);
    if (timingSafeEqual(t, token)) return true;
  }
  return false;
}

export function inboxCount(p) {
  return p ? p.private.pending_connections.length + (p.private.inbox_pending || 0) : 0;
}

export function isConnected(profile, handle) {
  return profile.connections.some((c) => c.handle === handle);
}

function link(a, b, via) {
  const at = new Date().toISOString();
  if (!isConnected(a, b.handle)) a.connections.push({ handle: b.handle, at, via });
  if (!isConnected(b, a.handle)) b.connections.push({ handle: a.handle, at, via });
  a.private.pending_connections = a.private.pending_connections.filter((p) => p.handle !== b.handle);
  b.private.pending_connections = b.private.pending_connections.filter((p) => p.handle !== a.handle);
}

/**
 * `from` wants to connect with `toHandle`. A valid QR token (only shown on
 * the owner's own screen) proves an in-person scan, so it connects instantly.
 * Without one it becomes a pending request the other person accepts.
 */
export async function connect(store, from, toHandle, token) {
  const to = await mustGetProfile(store, toHandle);
  if (to.handle === from.handle) throw new AppError("That's you");
  from = (await getProfile(store, from.handle)) || from;
  if (isConnected(from, to.handle)) return { status: 'already', with: to };
  // They already asked us: accepting their request.
  const theyAsked = from.private.pending_connections.some((p) => p.handle === to.handle);
  if (theyAsked || (await verifyQrToken(to, token))) {
    link(from, to, theyAsked ? 'request' : 'qr');
    await save(store, from);
    await save(store, to);
    return { status: 'connected', with: to };
  }
  if (!to.private.pending_connections.some((p) => p.handle === from.handle)) {
    to.private.pending_connections.push({ handle: from.handle, at: new Date().toISOString() });
    to.private.pending_connections = to.private.pending_connections.slice(-MAX_LIST);
    await save(store, to);
  }
  return { status: 'requested', with: to };
}

export async function respondConnection(store, owner, otherHandle, accept) {
  const pending = owner.private.pending_connections.find((p) => p.handle === otherHandle);
  if (!pending) throw new AppError('No pending connection from that person', 404);
  if (accept) {
    const other = await mustGetProfile(store, otherHandle);
    link(owner, other, 'request');
    await save(store, other);
  } else {
    owner.private.pending_connections = owner.private.pending_connections.filter((p) => p.handle !== otherHandle);
  }
  await save(store, owner);
}

export async function summaries(store, handles, limit = 50) {
  const out = [];
  for (const h of handles.slice(0, limit)) {
    const p = await getProfile(store, h);
    if (p) out.push(summary(p));
  }
  return out;
}

export function summary(p) {
  return { handle: p.handle, name: p.name, role: p.role, employer: p.employer, has_photo: p.has_photo, photo_v: p.photo_v };
}

export function sharedConnectionHandles(a, b) {
  const mine = new Set(a.connections.map((c) => c.handle));
  return b.connections.map((c) => c.handle).filter((h) => mine.has(h) && h !== a.handle && h !== b.handle);
}

export function relationship(sender, recipient) {
  if (!sender) return 'stranger';
  if (sender.handle === recipient.handle) return 'self';
  if (isConnected(recipient, sender.handle)) return 'connection';
  if (sharedConnectionHandles(sender, recipient).length > 0) return 'connection_of_connection';
  return 'stranger';
}

// ---------- public view (the profile's structured data file) ----------

export function publicProfile(p, baseUrl = '') {
  return {
    handle: p.handle,
    url: `${baseUrl}/p/${p.handle}`,
    name: p.name,
    role: p.role,
    bio: p.bio,
    photo: p.has_photo ? `${baseUrl}/p/${p.handle}/photo?v=${p.photo_v}` : null,
    employer: p.employer ? { name: p.employer, claimed: true, verification: verification(p) } : null,
    causes: p.causes,
    contact_rules: describeRules(p),
    connections: { count: p.connections.length, handles: p.connections.map((c) => c.handle) },
    agent: { mcp_url: `${baseUrl}/p/${p.handle}/mcp` },
    contact_details: 'Never shared. Send a contact request to this person\'s agent instead.',
    created_at: p.created_at,
  };
}

export function describeRules(p) {
  const r = p.contact_rules;
  return {
    accept_from: r.accept_from,
    accept_from_label: ACCEPT_FROM[r.accept_from],
    min_donation_usd: r.min_donation,
    donate_to_one_of: p.causes,
    welcome_topics: r.welcome_topics,
    blocked_topics: r.blocked_topics,
    only_welcome_topics: r.only_welcome_topics,
    require_vouched_employer: r.require_vouched,
    note: r.note,
    outcome_if_accepted: 'A revocable message channel. Phone number and email are never shared.',
  };
}

// ---------- contact rules + requests ----------

function words(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
}

export function topicMatches(topic, phrase) {
  const t = String(topic || '').toLowerCase();
  const p = String(phrase || '').toLowerCase().trim();
  if (!t || !p) return false;
  if (t.includes(p)) return true;
  const tw = new Set(words(t));
  const pw = words(p);
  return pw.length > 0 && pw.every((w) => tw.has(w) || [...tw].some((x) => x.startsWith(w) || w.startsWith(x) && x.length >= 4));
}

/**
 * The agent's filter. Deterministic so both people can see why a request was
 * delivered or declined. `sender` may be null when only previewing.
 */
export function evaluateRequest(recipient, sender, { topic = '', cause = '', pledge = 0 } = {}) {
  const r = recipient.contact_rules;
  const rel = relationship(sender, recipient);
  const reasons = [];
  const notes = [];

  if (rel === 'self') reasons.push("You can't send a contact request to yourself.");
  if (rel !== 'self' && REL_RANK[rel] > ACCEPT_RANK[r.accept_from]) {
    reasons.push(
      r.accept_from === 'nobody'
        ? `${recipient.name} isn't taking contact requests right now.`
        : `${recipient.name} only accepts requests from: ${ACCEPT_FROM[r.accept_from].toLowerCase()}. You are: ${rel.replace(/_/g, ' ')}.`,
    );
  }
  if (r.require_vouched && sender && verification(sender).total === 0) {
    reasons.push(`${recipient.name} only accepts requests from people whose employer has been vouched for.`);
  }

  const blocked = r.blocked_topics.find((b) => topicMatches(topic, b));
  if (blocked) reasons.push(`The topic matches something ${recipient.name} has blocked ("${blocked}").`);
  const welcome = r.welcome_topics.find((w) => topicMatches(topic, w));
  if (welcome) notes.push(`Topic matches "${welcome}", which ${recipient.name} welcomes.`);
  else if (r.only_welcome_topics && r.welcome_topics.length) {
    reasons.push(`${recipient.name} only takes requests about: ${r.welcome_topics.join(', ')}.`);
  }
  if (!String(topic).trim()) reasons.push('Say what the request is about (topic).');

  const amount = Number(pledge) || 0;
  if (r.min_donation > 0) {
    if (amount < r.min_donation) reasons.push(`Requires a donation of at least $${r.min_donation} to one of ${recipient.name}'s causes.`);
    if (recipient.causes.length && !recipient.causes.some((c) => sameText(c, cause))) {
      reasons.push(`The donation must go to one of: ${recipient.causes.join(', ')}.`);
    }
  }

  return {
    decision: reasons.length ? 'decline' : 'deliver',
    relationship: rel,
    reasons,
    notes,
    requirements: describeRules(recipient),
  };
}

export async function requestContact(store, sender, toHandle, { topic, message, cause, pledge }) {
  const recipient = await mustGetProfile(store, toHandle);
  sender = await mustGetProfile(store, sender.handle);
  const input = { topic: clean(topic, 120), message: cleanMultiline(message, 1000), cause: clean(cause, 60), pledge: Math.max(0, Math.round(Number(pledge) || 0)) };
  const evaluation = evaluateRequest(recipient, sender, input);
  if (evaluation.relationship === 'self') throw new AppError(evaluation.reasons[0]);

  const req = {
    id: randomId(12),
    from: sender.handle,
    to: recipient.handle,
    ...input,
    // v1: donations are pledges; payments are out of scope.
    pledge_status: 'pledged',
    status: evaluation.decision === 'deliver' ? 'pending' : 'filtered',
    reasons: evaluation.reasons,
    notes: evaluation.notes,
    relationship: evaluation.relationship,
    created_at: new Date().toISOString(),
    channel: null,
  };
  await store.put(`r:${req.id}`, req);
  recipient.private.inbox = [req.id, ...recipient.private.inbox].slice(0, MAX_LIST);
  if (req.status === 'pending') recipient.private.inbox_pending = (recipient.private.inbox_pending || 0) + 1;
  sender.private.outbox = [req.id, ...sender.private.outbox].slice(0, MAX_LIST);
  await save(store, recipient);
  await save(store, sender);
  return { request: req, evaluation };
}

export async function getRequests(store, ids) {
  const out = [];
  for (const id of ids.slice(0, 100)) {
    const r = await store.get(`r:${id}`);
    if (r) out.push(r);
  }
  return out;
}

export async function respondRequest(store, owner, id, accept) {
  const req = await store.get(`r:${id}`);
  if (!req || req.to !== owner.handle) throw new AppError('Request not found', 404);
  if (req.status === 'accepted' || req.status === 'declined') return req;
  req.decided_at = new Date().toISOString();
  if (req.status === 'pending') owner.private.inbox_pending = Math.max(0, (owner.private.inbox_pending || 0) - 1);
  if (accept) {
    const sender = await mustGetProfile(store, req.from);
    const channel = {
      id: randomId(14),
      request: req.id,
      members: [req.from, req.to],
      owner: req.to, // the recipient can always revoke
      open: true,
      created_at: req.decided_at,
      messages: req.message ? [{ from: req.from, text: req.message, at: req.created_at }] : [],
    };
    await store.put(`c:${channel.id}`, channel);
    req.status = 'accepted';
    req.channel = channel.id;
    owner.private.channels = [channel.id, ...owner.private.channels];
    sender.private.channels = [channel.id, ...sender.private.channels];
    await save(store, sender);
    await save(store, owner);
  } else {
    req.status = 'declined';
    await save(store, owner);
  }
  await store.put(`r:${req.id}`, req);
  return req;
}

export async function getChannel(store, viewer, id) {
  const ch = await store.get(`c:${id}`);
  if (!ch || !viewer || !ch.members.includes(viewer.handle)) throw new AppError('Channel not found', 404);
  return ch;
}

export async function postToChannel(store, viewer, id, text) {
  const ch = await getChannel(store, viewer, id);
  if (!ch.open) throw new AppError('This channel has been closed', 410);
  const t = cleanMultiline(text, 2000);
  if (!t) throw new AppError('Message is empty');
  ch.messages.push({ from: viewer.handle, text: t, at: new Date().toISOString() });
  ch.messages = ch.messages.slice(-MAX_LIST);
  await store.put(`c:${id}`, ch);
  return ch;
}

export async function closeChannel(store, viewer, id) {
  const ch = await getChannel(store, viewer, id);
  ch.open = false;
  ch.closed_by = viewer.handle;
  ch.closed_at = new Date().toISOString();
  await store.put(`c:${id}`, ch);
  return ch;
}

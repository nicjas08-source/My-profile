// Request router. Runtime-agnostic: takes a standard Request, returns a Response.

import { handleMcp } from './mcp.js';
import {
  AppError, closeChannel, connect, createProfile, evaluateRequest, getChannel, getProfile, getRequests, inboxCount,
  mustGetProfile, profileByKey, publicProfile, qrToken, relationship, requestContact, respondConnection,
  respondRequest, sharedConnectionHandles, summaries, updateProfile, verification, vouch, postToChannel,
} from './model.js';
import { qrSvg } from './qr.js';
import { esc, parseCookies, sameText } from './util.js';
import * as V from './views.js';

const COOKIE = 'apn';

const FLASH = {
  welcome: "You're live. Show your QR to the next person.",
  connected: 'Connected.',
  requested: 'Connection requested. They need to accept.',
  vouched: 'Vouch recorded. Thanks.',
  saved: 'Saved.',
  sent: 'Sent to their agent. You\'ll see their answer in your inbox.',
};

const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const redirect = (to, headers = {}) => new Response(null, { status: 303, headers: { location: to, ...headers } });

function cookieFor(key, secure) {
  return `${COOKIE}=${encodeURIComponent(key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=63072000${secure ? '; Secure' : ''}`;
}

async function form(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) return request.json();
  const fd = await request.formData();
  const out = {};
  for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}

export async function handle(request, env) {
  const { store } = env;
  const url = new URL(request.url);
  const baseUrl = (env.BASE_URL || url.origin).replace(/\/$/, '');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  const secure = url.protocol === 'https:';
  const key = parseCookies(request.headers.get('cookie'))[COOKIE] || '';
  let viewer = null;

  try {
    viewer = await profileByKey(store, key);
    const count = inboxCount(viewer);
    let m;

    // ----- static -----
    if (path === '/icon.svg') return new Response(V.ICON_SVG, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
    if (path === '/manifest.webmanifest') {
      return Response.json(
        {
          name: 'Profile',
          short_name: 'Profile',
          // Home-screen apps on iOS don't share Safari's cookies, so the owner's
          // icon opens through their key link and signs itself in.
          start_url: viewer ? `/k/${key}` : '/',
          display: 'standalone',
          background_color: '#09090b',
          theme_color: '#09090b',
          icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
        },
        { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'private, no-store' } },
      );
    }

    // ----- MCP -----
    if ((m = path.match(/^\/p\/([a-z0-9-]+)\/mcp$/))) {
      const bound = await getProfile(store, m[1]);
      if (!bound) return Response.json({ error: 'No such profile' }, { status: 404 });
      return handleMcp(request, { store, baseUrl, bound, owner: null });
    }
    if ((m = path.match(/^\/a\/([A-Za-z0-9_-]{20,})\/mcp$/))) {
      const owner = await profileByKey(store, m[1]);
      if (!owner) return Response.json({ error: 'Unknown agent key' }, { status: 401 });
      return handleMcp(request, { store, baseUrl, bound: owner, owner });
    }

    // ----- pages -----
    if (path === '/' && method === 'GET') return viewer ? redirect(`/p/${viewer.handle}`) : html(V.landingPage());

    if ((m = path.match(/^\/k\/([A-Za-z0-9_-]{20,})$/))) {
      const owner = await profileByKey(store, m[1]);
      if (!owner) return html(V.errorPage('That key link is not valid.', 404), 404);
      return redirect(`/p/${owner.handle}`, { 'set-cookie': cookieFor(m[1], secure) });
    }

    if (path === '/new' && method === 'GET') {
      const via = url.searchParams.get('via') ? await getProfile(store, url.searchParams.get('via')) : null;
      const t = url.searchParams.get('t') || '';
      if (viewer) return redirect(via ? `/p/${via.handle}${t ? `?t=${encodeURIComponent(t)}` : ''}` : `/p/${viewer.handle}`);
      return html(V.newPage({ via, token: t }));
    }

    if ((m = path.match(/^\/p\/([a-z0-9-]+)\.json$/))) {
      const p = await mustGetProfile(store, m[1]);
      return Response.json(publicProfile(p, baseUrl), { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    }

    if ((m = path.match(/^\/p\/([a-z0-9-]+)\/photo$/))) {
      const data = await store.get(`img:${m[1]}`);
      if (!data) return new Response('Not found', { status: 404 });
      const [, type, b64] = data.match(/^data:(image\/[a-z]+);base64,(.*)$/);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' } });
    }

    if ((m = path.match(/^\/p\/([a-z0-9-]+)\/request$/))) {
      const to = await mustGetProfile(store, m[1]);
      if (viewer && viewer.handle === to.handle) return redirect(`/p/${to.handle}`);
      return html(V.requestPage({ to, viewer, inboxCount: count }));
    }

    if ((m = path.match(/^\/p\/([a-z0-9-]+)$/))) {
      const p = await getProfile(store, m[1]);
      if (!p) return html(V.errorPage('No profile here (yet).', 404, viewer), 404);
      const t = url.searchParams.get('t') || '';
      const flashKey = url.searchParams.get('m');
      let flash = FLASH[flashKey] ? esc(FLASH[flashKey]) : '';
      if (flashKey === 'welcome' && p.connections.length && viewer?.handle === p.handle) {
        const firstConn = await getProfile(store, p.connections[0].handle);
        if (firstConn) flash = `You're live and connected with ${esc(firstConn.name)}. Now show your QR to the next person.`;
      } else if (flashKey === 'welcome-req') {
        flash = "You're live. Your connection request is waiting for approval (the QR code had expired).";
      }
      if (flashKey?.startsWith('welcome') && viewer?.handle === p.handle) {
        flash += '<a class="btn" href="/me/qr" style="margin-top:12px;background:var(--accent-ink);color:var(--accent);border:0">Show my QR</a>';
      }
      let rel = null;
      let hasVouched = false;
      if (viewer && viewer.handle !== p.handle) {
        rel = relationship(viewer, p);
        if (rel !== 'connection' && p.private.pending_connections.some((x) => x.handle === viewer.handle)) rel = 'requested';
        hasVouched = p.vouches.some((x) => x.from === viewer.handle && sameText(x.employer, p.employer));
      }
      return html(
        V.profilePage({
          p,
          v: verification(p),
          viewer,
          connections: await summaries(store, p.connections.map((c) => c.handle).reverse(), 24),
          shared: viewer && viewer.handle !== p.handle ? await summaries(store, sharedConnectionHandles(viewer, p), 12) : [],
          token: t,
          flash,
          relation: rel,
          hasVouched,
          inboxCount: count,
          baseUrl,
        }),
      );
    }

    if ((m = path.match(/^\/c\/([a-z0-9]+)$/))) {
      if (!viewer) return redirect('/');
      const ch = await getChannel(store, viewer, m[1]);
      const names = Object.fromEntries((await summaries(store, ch.members)).map((s) => [s.handle, s.name]));
      return html(V.channelPage({ ch, viewer, names, inboxCount: count }));
    }

    if (path.startsWith('/me/') && method === 'GET') {
      if (!viewer) return redirect('/');
      if (path === '/me/qr') {
        const t = await qrToken(viewer);
        const link = `${baseUrl}/p/${viewer.handle}?t=${t}`;
        return html(V.qrPage({ p: viewer, svg: qrSvg(link), url: link, inboxCount: count }));
      }
      if (path === '/me/edit') return html(V.editPage({ p: viewer, inboxCount: count }));
      if (path === '/me/agent') return html(V.agentPage({ p: viewer, baseUrl, ownerKey: key, inboxCount: count }));
      if (path === '/me/inbox') {
        const inbox = await getRequests(store, viewer.private.inbox);
        const sent = await getRequests(store, viewer.private.outbox);
        const pending = await summaries(store, viewer.private.pending_connections.map((x) => x.handle));
        const handles = [...new Set([...inbox.map((r) => r.from), ...sent.map((r) => r.to)])];
        const names = Object.fromEntries((await summaries(store, handles, 200)).map((s) => [s.handle, s.name]));
        return html(V.inboxPage({ p: viewer, inbox, sent, pending, names, inboxCount: count }));
      }
    }

    // ----- form actions -----
    if (method === 'POST' && path.startsWith('/api/')) {
      const f = await form(request);

      if (path === '/api/profiles') {
        if (viewer) return redirect(`/p/${viewer.handle}`);
        try {
          const { profile, ownerKey, connection } = await createProfile(store, f, { via: f.via, token: f.t });
          const flash = connection?.status === 'requested' ? 'welcome-req' : 'welcome';
          return redirect(`/p/${profile.handle}?m=${flash}`, { 'set-cookie': cookieFor(ownerKey, secure) });
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          const via = f.via ? await getProfile(store, f.via) : null;
          return html(V.newPage({ via, token: f.t, error: err.message, values: f }), err.status);
        }
      }

      if (!viewer) return redirect('/');

      if (path === '/api/logout') return redirect('/', { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });

      if (path === '/api/me') {
        try {
          await updateProfile(store, viewer, {
            ...f,
            contact_rules: {
              accept_from: f.accept_from,
              min_donation: f.min_donation,
              welcome_topics: f.welcome_topics,
              blocked_topics: f.blocked_topics,
              only_welcome_topics: Boolean(f.only_welcome_topics),
              require_vouched: Boolean(f.require_vouched),
              note: f.note,
            },
          });
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          return html(V.editPage({ p: viewer, error: err.message, inboxCount: count }), err.status);
        }
        return redirect(`/p/${viewer.handle}?m=saved`);
      }

      if (path === '/api/connect') {
        const res = await connect(store, viewer, f.handle, f.t);
        return redirect(`/p/${res.with.handle}?m=${res.status === 'requested' ? 'requested' : 'connected'}`);
      }

      if (path === '/api/connections/respond') {
        await respondConnection(store, viewer, f.handle, f.accept === '1');
        return redirect('/me/inbox');
      }

      if (path === '/api/vouch') {
        const res = await vouch(store, viewer, f.handle);
        return redirect(`/p/${res.profile.handle}?m=vouched`);
      }

      if (path === '/api/requests') {
        const to = await mustGetProfile(store, f.to);
        const input = { topic: f.topic, message: f.message, cause: f.cause, pledge: f.pledge };
        const preview = evaluateRequest(to, viewer, input);
        if (preview.decision === 'decline') return html(V.requestPage({ to, viewer, preview, values: f, inboxCount: count }));
        await requestContact(store, viewer, to.handle, input);
        return redirect(`/p/${to.handle}?m=sent`);
      }

      if (path === '/api/requests/respond') {
        const req = await respondRequest(store, viewer, f.id, f.accept === '1');
        return redirect(req.channel ? `/c/${req.channel}` : '/me/inbox');
      }

      if (path === '/api/channels/post') {
        await postToChannel(store, viewer, f.id, f.text);
        return redirect(`/c/${f.id}`);
      }

      if (path === '/api/channels/close') {
        await closeChannel(store, viewer, f.id);
        return redirect(`/c/${f.id}`);
      }
    }

    return html(V.errorPage('Nothing here.', 404, viewer), 404);
  } catch (err) {
    if (err instanceof AppError) return html(V.errorPage(err.message, err.status, viewer), err.status);
    console.error(err);
    return html(V.errorPage('Something broke on our side. Try again.', 500, viewer), 500);
  }
}

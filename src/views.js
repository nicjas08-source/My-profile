// Server-rendered HTML. Mobile first, dark, one big photo, causes up front.

import { ACCEPT_FROM } from './model.js';
import { esc } from './util.js';

const CSS = `
:root{--bg:#09090b;--surface:#141417;--surface2:#1c1c21;--line:#2a2a31;--text:#f4f4f5;--muted:#9d9da7;--dim:#6b6b75;--accent:#c8ff3d;--accent-ink:#0b0f00;--danger:#ff6b6b;--ok:#5ce1a6;--r:18px;color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;min-height:100dvh}
a{color:inherit}
.wrap{max-width:520px;margin:0 auto;padding:0 16px 48px}
.top{display:flex;align-items:center;justify-content:space-between;max-width:520px;margin:0 auto;padding:14px 16px}
.logo{font-weight:800;letter-spacing:-.02em;text-decoration:none;display:flex;gap:8px;align-items:center}
.logo i{width:18px;height:18px;border-radius:50%;border:2.5px solid var(--accent);display:inline-block;position:relative}
.logo i:after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--accent)}
.top nav{display:flex;gap:6px}
.pill{font-size:14px;text-decoration:none;color:var(--muted);padding:6px 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);position:relative}
.pill b{background:var(--accent);color:var(--accent-ink);border-radius:999px;font-size:11px;padding:1px 6px;margin-left:4px}
.hero{position:relative;margin:0 -16px;aspect-ratio:4/5;max-height:78dvh;overflow:hidden;background:linear-gradient(160deg,#26262c,#101013)}
.hero img{width:100%;height:100%;object-fit:cover;display:block}
.hero .initials{position:absolute;inset:0;display:grid;place-items:center;font-size:120px;font-weight:800;color:#2c2c33;letter-spacing:-.04em}
.hero .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(9,9,11,0) 45%,rgba(9,9,11,.75) 75%,var(--bg) 100%)}
.hero .id{position:absolute;left:16px;right:16px;bottom:14px}
h1{font-size:clamp(38px,11vw,56px);line-height:.95;letter-spacing:-.04em;font-weight:800}
h2{font-size:22px;letter-spacing:-.02em;margin-bottom:12px}
h3{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--dim);font-weight:600;margin-bottom:10px}
.role{color:var(--muted);margin-top:8px;font-size:17px}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;margin-top:10px;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--muted)}
.badge.vouched{color:var(--text)}
.badge.strong{color:var(--accent-ink);background:var(--accent);border-color:var(--accent);font-weight:600}
.badge svg{width:14px;height:14px}
.causes{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 6px}
.cause{padding:8px 14px;border-radius:999px;border:1.5px solid var(--accent);color:var(--accent);font-weight:600;font-size:15px}
.section{margin-top:28px}
.bio{font-size:17px;color:#d6d6dc;white-space:pre-line}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:17px 20px;border-radius:var(--r);border:0;font:inherit;font-weight:700;font-size:17px;text-decoration:none;cursor:pointer;background:var(--surface2);color:var(--text);border:1px solid var(--line)}
.btn.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-size:19px;padding:20px}
.btn.ghost{background:transparent}
.btn.small{width:auto;padding:10px 16px;font-size:15px;border-radius:12px}
.btn.danger{color:var(--danger)}
.stack{display:grid;gap:10px;margin-top:22px}
.row{display:flex;gap:10px}
.row>*{flex:1}
.hint{color:var(--dim);font-size:14px;text-align:center;margin-top:8px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px}
.card+.card{margin-top:10px}
.rules{display:grid;gap:10px;font-size:15px}
.rules div{display:flex;gap:10px}
.rules span:first-child{color:var(--dim);min-width:84px}
.people{display:flex;flex-wrap:wrap;gap:12px}
.person{display:flex;flex-direction:column;align-items:center;width:64px;text-decoration:none;font-size:12px;color:var(--muted);text-align:center;line-height:1.2}
.av{width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--surface2);display:grid;place-items:center;font-weight:700;color:var(--muted);margin-bottom:6px;border:1px solid var(--line);font-size:18px}
.banner{background:var(--accent);color:var(--accent-ink);border-radius:var(--r);padding:16px 18px;margin:16px 0;font-weight:600}
.banner.soft{background:var(--surface);color:var(--text);border:1px solid var(--line);font-weight:400}
.error{background:#2a1214;border:1px solid #5c2328;color:#ffb3b3;border-radius:14px;padding:12px 14px;margin:12px 0}
form.f{display:grid;gap:14px}
label{display:grid;gap:6px;font-size:14px;color:var(--muted)}
input,textarea,select{width:100%;font:inherit;font-size:17px;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 14px;outline:none}
input:focus,textarea:focus,select:focus{border-color:var(--accent)}
textarea{min-height:90px;resize:vertical}
.check{display:flex;gap:10px;align-items:center;color:var(--text);font-size:15px}
.check input{width:22px;height:22px;accent-color:var(--accent)}
.photo-pick{display:grid;place-items:center;aspect-ratio:1;width:150px;margin:6px auto 4px;border-radius:50%;background:var(--surface);border:2px dashed var(--line);overflow:hidden;cursor:pointer;color:var(--dim);font-size:14px;text-align:center;position:relative}
.photo-pick img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.photo-pick input{display:none}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{padding:8px 13px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--muted);font-size:14px;cursor:pointer;user-select:none}
.chip.on{border-color:var(--accent);color:var(--accent);background:rgba(200,255,61,.08)}
.qr{background:#fff;border-radius:28px;padding:6px;margin:10px auto 0;width:min(86vw,380px)}
.qr svg{display:block;width:100%;height:auto}
.center{text-align:center}
.list{display:grid;gap:10px}
.item{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 16px}
.item .meta{color:var(--dim);font-size:13px}
.item p{margin-top:6px}
.tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--surface2);color:var(--muted);margin-right:6px}
.tag.ok{color:var(--ok)}.tag.no{color:var(--danger)}.tag.wait{color:var(--accent)}
.msg{padding:10px 14px;border-radius:16px;max-width:85%;background:var(--surface2);white-space:pre-wrap;word-wrap:break-word}
.msg.me{margin-left:auto;background:var(--accent);color:var(--accent-ink)}
.thread{display:grid;gap:8px;margin:16px 0}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;word-break:break-all}
.copy{display:flex;gap:8px;align-items:center;background:var(--surface2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:8px}
.copy code{flex:1}
.copy button{background:none;border:0;color:var(--accent);font:inherit;font-weight:600;cursor:pointer}
.landing h1{font-size:clamp(46px,14vw,72px);margin-top:12vh}
.landing p.lead{font-size:20px;color:var(--muted);margin:18px 0 32px}
.steps{display:grid;gap:14px;margin-top:40px;color:var(--muted)}
.steps div{display:flex;gap:14px;align-items:baseline}
.steps b{color:var(--accent);font-size:13px}
`;

const SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

export function layout({ title, body, viewer = null, inboxCount = 0, description = '', image = '' }) {
  const nav = viewer
    ? `<nav><a class="pill" href="/me/inbox">Inbox${inboxCount ? `<b>${inboxCount}</b>` : ''}</a><a class="pill" href="/p/${esc(viewer.handle)}">Me</a></nav>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="theme-color" content="#09090b">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Profile">
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon.svg">
${description ? `<meta name="description" content="${esc(description)}"><meta property="og:description" content="${esc(description)}">` : ''}
<meta property="og:title" content="${esc(title)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<style>${CSS}</style></head><body>
<header class="top"><a class="logo" href="/"><i></i>profile</a>${nav}</header>
<main class="wrap">${body}</main>
<script>document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard.writeText(b.dataset.copy);b.textContent='Copied'})</script>
</body></html>`;
}

export function avatar(p) {
  const initials = esc((p.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  return p.has_photo ? `<img class="av" src="/p/${esc(p.handle)}/photo?v=${p.photo_v}" alt="" loading="lazy">` : `<span class="av">${initials}</span>`;
}

function people(list) {
  if (!list.length) return '';
  return `<div class="people">${list.map((p) => `<a class="person" href="/p/${esc(p.handle)}">${avatar(p)}${esc(p.name.split(' ')[0])}</a>`).join('')}</div>`;
}

function verificationBadge(v) {
  if (!v.employer) return '';
  if (v.total === 0) return `<span class="badge">Claims ${esc(v.employer)} · not yet vouched</span>`;
  return `<span class="badge ${v.level}">${SHIELD}${esc(v.label)}</span>`;
}

function rulesCard(p) {
  const r = p.contact_rules;
  const first = esc(p.name.split(' ')[0]);
  const rows = [
    ['From', esc(ACCEPT_FROM[r.accept_from])],
    r.min_donation > 0 ? ['Cost', `A $${r.min_donation} donation${p.causes.length ? ` to ${p.causes.map(esc).join(' or ')}` : ' to charity'}`] : ['Cost', 'Free'],
    r.welcome_topics.length ? ['Open to', esc(r.welcome_topics.join(', ')) + (r.only_welcome_topics ? ' <span class="tag">only</span>' : '')] : null,
    r.blocked_topics.length ? ['Not for', esc(r.blocked_topics.join(', '))] : null,
    r.require_vouched ? ['Needs', 'A vouched-for employer'] : null,
    r.note ? ['Note', esc(r.note)] : null,
    ['Shares', 'A revocable channel. Never phone or email.'],
  ].filter(Boolean);
  return `<div class="section"><h3>How to reach ${first}</h3><div class="card rules">${rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('')}</div></div>`;
}

function hero(p, v) {
  const initials = esc((p.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  const img = p.has_photo ? `<img src="/p/${esc(p.handle)}/photo?v=${p.photo_v}" alt="${esc(p.name)}">` : `<div class="initials">${initials}</div>`;
  const role = [p.role, p.employer ? `at ${p.employer}` : ''].filter(Boolean).join(' ');
  return `<div class="hero">${img}<div class="shade"></div><div class="id"><h1>${esc(p.name)}</h1>${role ? `<div class="role">${esc(role)}</div>` : ''}${verificationBadge(v)}</div></div>`;
}

export function profilePage({ p, v, viewer, connections, shared, token, flash, relation, hasVouched, inboxCount, baseUrl }) {
  const first = esc(p.name.split(' ')[0]);
  const isOwner = viewer && viewer.handle === p.handle;
  let actions = '';
  if (isOwner) {
    actions = `<div class="stack"><a class="btn primary" href="/me/qr">Show my QR</a>
      <div class="row"><a class="btn" href="/me/edit">Edit</a><a class="btn" href="/me/agent">My agent</a></div></div>`;
  } else if (!viewer) {
    const q = new URLSearchParams({ via: p.handle, ...(token ? { t: token } : {}) });
    actions = `<div class="stack"><a class="btn primary" href="/new?${esc(q.toString())}">Make mine</a>
      <p class="hint">30 seconds. No app, no password. You'll be connected with ${first}.</p></div>`;
  } else {
    const parts = [];
    if (relation === 'connection') {
      parts.push(`<div class="banner soft center">You're connected with ${first}</div>`);
      if (p.employer && !hasVouched) {
        parts.push(`<form method="post" action="/api/vouch"><input type="hidden" name="handle" value="${esc(p.handle)}"><button class="btn">${SHIELD} Vouch that ${first} works at ${esc(p.employer)}</button></form>`);
      }
    } else if (relation === 'requested') {
      parts.push(`<div class="banner soft center">Connection requested. Waiting for ${first}.</div>`);
    } else {
      parts.push(`<form method="post" action="/api/connect"><input type="hidden" name="handle" value="${esc(p.handle)}">${token ? `<input type="hidden" name="t" value="${esc(token)}">` : ''}<button class="btn primary">Connect</button></form>`);
    }
    parts.push(`<a class="btn ghost" href="/p/${esc(p.handle)}/request">Request contact</a>`);
    actions = `<div class="stack">${parts.join('')}</div>`;
  }

  const body = `
  ${flash ? `<div class="banner">${flash}</div>` : ''}
  ${hero(p, v)}
  ${p.causes.length ? `<div class="causes">${p.causes.map((c) => `<span class="cause">${esc(c)}</span>`).join('')}</div>` : ''}
  ${actions}
  ${p.bio ? `<div class="section"><p class="bio">${esc(p.bio)}</p></div>` : ''}
  ${shared && shared.length ? `<div class="section"><h3>You both know</h3>${people(shared)}</div>` : ''}
  <div class="section"><h3>Connections · ${p.connections.length}</h3>${connections.length ? people(connections) : `<p class="hint" style="text-align:left">No connections yet.</p>`}</div>
  ${rulesCard(p)}
  <div class="section"><h3>Agent</h3><div class="card"><p style="color:var(--muted);font-size:15px">${first}'s agent answers questions and screens requests. Add it to Claude as a custom connector:</p>
  <div class="copy"><code>${esc(baseUrl)}/p/${esc(p.handle)}/mcp</code><button data-copy="${esc(baseUrl)}/p/${esc(p.handle)}/mcp">Copy</button></div>
  <p class="hint" style="text-align:left;margin-top:10px">Data: <a href="/p/${esc(p.handle)}.json">/p/${esc(p.handle)}.json</a></p></div></div>`;

  const role = [p.role, p.employer].filter(Boolean).join(' at ');
  return layout({
    title: p.name,
    body,
    viewer,
    inboxCount,
    description: [role, p.causes.length ? `Supports ${p.causes.join(', ')}` : ''].filter(Boolean).join(' · '),
    image: p.has_photo ? `${baseUrl}/p/${p.handle}/photo?v=${p.photo_v}` : '',
  });
}

export function landingPage() {
  return layout({
    title: 'Your profile, your agent',
    description: 'A profile you own, shared by QR, with an agent that talks to other people\'s agents.',
    body: `<div class="landing"><h1>Your profile.<br>Your agent.</h1>
    <p class="lead">One page you own. Share it with a QR code. Your agent screens who gets to reach you, and every ask supports a cause you care about.</p>
    <a class="btn primary" href="/new">Make mine</a><p class="hint">30 seconds. No app. No password.</p>
    <div class="steps"><div><b>01</b>Show your QR to someone.</div><div><b>02</b>They scan it and tap Make mine.</div><div><b>03</b>You're connected, and your agents can talk.</div></div></div>`,
  });
}

const CAUSE_SUGGESTIONS = ['Climate', 'Mental health', 'Education', 'Ocean conservation', 'Animal welfare', 'Food banks', 'Refugees', 'Cancer research', 'Homelessness', 'Girls in STEM'];

const PHOTO_JS = `
<script>
(function(){
  const pick=document.querySelector('.photo-pick'); if(!pick) return;
  const file=pick.querySelector('input[type=file]'); const out=document.querySelector('input[name=photo]');
  file.onchange=async()=>{const f=file.files[0]; if(!f) return;
    const img=new Image(); img.src=URL.createObjectURL(f); await img.decode();
    const max=900, s=Math.min(1,max/Math.max(img.width,img.height));
    const c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    out.value=c.toDataURL('image/jpeg',0.82);
    pick.querySelector('img')?.remove(); const prev=new Image(); prev.src=out.value; pick.appendChild(prev); pick.querySelector('span').style.opacity=0;
  };
  const causes=document.querySelector('input[name=causes]');
  document.querySelectorAll('.chip').forEach(ch=>ch.onclick=()=>{
    let list=causes.value.split(',').map(s=>s.trim()).filter(Boolean); const v=ch.dataset.v;
    const i=list.findIndex(x=>x.toLowerCase()===v.toLowerCase());
    if(i>=0){list.splice(i,1);ch.classList.remove('on')}else{list.push(v);ch.classList.add('on')}
    causes.value=list.join(', ');
  });
  document.querySelector('form.f')?.addEventListener('submit',e=>{const b=e.target.querySelector('button[type=submit]'); if(b){b.disabled=true;b.textContent='One sec…'}});
})();
</script>`;

function causeChips(current) {
  const on = new Set(current.map((c) => c.toLowerCase()));
  return `<div class="chips">${CAUSE_SUGGESTIONS.map((c) => `<span class="chip${on.has(c.toLowerCase()) ? ' on' : ''}" data-v="${esc(c)}">${esc(c)}</span>`).join('')}</div>`;
}

export function newPage({ via, token, error, values = {} }) {
  const first = via ? esc(via.name.split(' ')[0]) : '';
  return layout({
    title: 'Make your profile',
    body: `
    ${via ? `<div class="banner soft">${avatar(via).replace('class="av"', 'class="av" style="width:36px;height:36px;display:inline-grid;vertical-align:middle;margin:0 8px 0 0;font-size:13px"')}You'll be connected with <b>${esc(via.name)}</b></div>` : ''}
    <h2 style="font-size:30px;margin-top:10px">Make yours</h2>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <form class="f" method="post" action="/api/profiles">
      <label class="photo-pick"><span>Add a photo</span><input type="file" accept="image/*"></label>
      <input type="hidden" name="photo">
      ${via ? `<input type="hidden" name="via" value="${esc(via.handle)}">` : ''}${token ? `<input type="hidden" name="t" value="${esc(token)}">` : ''}
      <label>Name<input name="name" required autocomplete="name" placeholder="Your name" value="${esc(values.name)}"></label>
      <label>What you do<input name="role" placeholder="e.g. Product designer" value="${esc(values.role)}"></label>
      <label>Where you work<input name="employer" autocomplete="organization" placeholder="e.g. HubSpot" value="${esc(values.employer)}"></label>
      <label>Causes you support<input name="causes" placeholder="Pick below or type your own" value="${esc(values.causes)}"></label>
      ${causeChips(String(values.causes || '').split(','))}
      <button class="btn primary" type="submit" style="margin-top:8px">${via ? `Make mine and connect with ${first}` : 'Make mine'}</button>
      <p class="hint">No phone or email needed. You can add a bio and contact rules after.</p>
    </form>${PHOTO_JS}`,
  });
}

export function editPage({ p, error, inboxCount }) {
  const r = p.contact_rules;
  const opt = (k) => `<option value="${k}"${r.accept_from === k ? ' selected' : ''}>${esc(ACCEPT_FROM[k])}</option>`;
  return layout({
    title: 'Edit profile',
    viewer: p,
    inboxCount,
    body: `<h2 style="font-size:30px">Edit</h2>${error ? `<div class="error">${esc(error)}</div>` : ''}
    <form class="f" method="post" action="/api/me">
      <label class="photo-pick">${p.has_photo ? `<img src="/p/${esc(p.handle)}/photo?v=${p.photo_v}" alt="">` : ''}<span>Change photo</span><input type="file" accept="image/*"></label>
      <input type="hidden" name="photo">
      <label>Name<input name="name" required value="${esc(p.name)}"></label>
      <label>What you do<input name="role" value="${esc(p.role)}"></label>
      <label>Where you work<input name="employer" value="${esc(p.employer)}"></label>
      <p class="hint" style="text-align:left;margin-top:-8px">Changing employer resets your vouches for the new one.</p>
      <label>Short bio<textarea name="bio" maxlength="280">${esc(p.bio)}</textarea></label>
      <label>Causes you support<input name="causes" value="${esc(p.causes.join(', '))}"></label>
      ${causeChips(p.causes)}
      <h3 style="margin-top:18px">Contact rules · your agent enforces these</h3>
      <label>Who can request contact<select name="accept_from">${Object.keys(ACCEPT_FROM).map(opt).join('')}</select></label>
      <label>Minimum donation to one of your causes (USD)<input name="min_donation" type="number" min="0" step="1" inputmode="numeric" value="${r.min_donation}"></label>
      <label>Happy to talk about (comma separated)<input name="welcome_topics" placeholder="e.g. fintech, climate, hiring designers" value="${esc(r.welcome_topics.join(', '))}"></label>
      <label class="check"><input type="checkbox" name="only_welcome_topics"${r.only_welcome_topics ? ' checked' : ''}> Only those topics</label>
      <label>Not interested in<input name="blocked_topics" placeholder="e.g. sales pitches, crypto" value="${esc(r.blocked_topics.join(', '))}"></label>
      <label class="check"><input type="checkbox" name="require_vouched"${r.require_vouched ? ' checked' : ''}> Sender's employer must be vouched for</label>
      <label>Note to people asking<input name="note" maxlength="280" value="${esc(r.note)}"></label>
      <button class="btn primary" type="submit">Save</button>
    </form>${PHOTO_JS}`,
  });
}

export function qrPage({ p, svg, url, inboxCount }) {
  return layout({
    title: 'My QR',
    viewer: p,
    inboxCount,
    body: `<div class="center" style="margin-top:4vh">
      <div class="qr">${svg}</div>
      <h1 style="margin-top:26px;font-size:40px">${esc(p.name)}</h1>
      ${p.causes.length ? `<div class="causes" style="justify-content:center">${p.causes.map((c) => `<span class="cause">${esc(c)}</span>`).join('')}</div>` : ''}
      <p class="hint" style="margin-top:18px">Scanning this connects you instantly. The code refreshes every few minutes so it only works in person.</p>
      <div class="copy" style="margin-top:22px"><code>${esc(url.split('?')[0])}</code><button data-copy="${esc(url.split('?')[0])}">Copy link</button></div>
      <p class="hint">A shared link asks you to approve the connection instead.</p>
    </div><script>setTimeout(()=>location.reload(),5*60*1000)</script>`,
  });
}

function statusTag(s) {
  const map = { pending: ['wait', 'Waiting'], accepted: ['ok', 'Accepted'], declined: ['no', 'Declined'], filtered: ['no', 'Filtered by agent'] };
  const [cls, text] = map[s] || ['', s];
  return `<span class="tag ${cls}">${text}</span>`;
}

function requestItem(r, names, mode) {
  const who = mode === 'in' ? r.from : r.to;
  const name = esc(names[who] || who);
  return `<div class="item"><div class="meta">${statusTag(r.status)}${mode === 'in' ? 'From' : 'To'} <a href="/p/${esc(who)}">${name}</a> · ${esc(r.relationship.replace(/_/g, ' '))}</div>
  <p><b>${esc(r.topic)}</b></p>${r.message ? `<p style="color:var(--muted)">${esc(r.message)}</p>` : ''}
  <p class="meta">${r.pledge ? `Pledged $${r.pledge} to ${esc(r.cause || 'a cause')}` : 'No donation'}</p>
  ${r.status === 'filtered' ? `<p class="meta">${r.reasons.map(esc).join(' ')}</p>` : ''}
  ${mode === 'in' && r.status === 'pending' ? `<form method="post" action="/api/requests/respond" class="row" style="margin-top:10px"><input type="hidden" name="id" value="${esc(r.id)}"><button class="btn small" name="accept" value="0">Decline</button><button class="btn small primary" name="accept" value="1" style="font-size:15px;padding:10px 16px">Accept</button></form>` : ''}
  ${r.channel ? `<p style="margin-top:8px"><a class="btn small" href="/c/${esc(r.channel)}">Open channel</a></p>` : ''}</div>`;
}

export function inboxPage({ p, inbox, sent, pending, names, inboxCount }) {
  const delivered = inbox.filter((r) => r.status !== 'filtered');
  const filtered = inbox.filter((r) => r.status === 'filtered');
  return layout({
    title: 'Inbox',
    viewer: p,
    inboxCount,
    body: `<h2 style="font-size:30px">Inbox</h2>
    ${pending.length ? `<div class="section"><h3>Want to connect</h3><div class="list">${pending.map((s) => `<div class="item" style="display:flex;align-items:center;gap:12px"><a href="/p/${esc(s.handle)}">${avatar(s)}</a><div style="flex:1"><b>${esc(s.name)}</b><div class="meta">${esc([s.role, s.employer].filter(Boolean).join(' at '))}</div></div>
      <form method="post" action="/api/connections/respond" style="display:flex;gap:6px"><input type="hidden" name="handle" value="${esc(s.handle)}"><button class="btn small" name="accept" value="0">✕</button><button class="btn small primary" name="accept" value="1" style="font-size:15px;padding:10px 14px">Accept</button></form></div>`).join('')}</div></div>` : ''}
    <div class="section"><h3>Contact requests</h3>${delivered.length ? `<div class="list">${delivered.map((r) => requestItem(r, names, 'in')).join('')}</div>` : '<p class="hint" style="text-align:left">Nothing yet. Requests that pass your rules land here.</p>'}</div>
    ${filtered.length ? `<div class="section"><details><summary class="hint" style="text-align:left;cursor:pointer">Your agent filtered ${filtered.length} request${filtered.length === 1 ? '' : 's'}</summary><div class="list" style="margin-top:10px">${filtered.map((r) => requestItem(r, names, 'in')).join('')}</div></details></div>` : ''}
    ${sent.length ? `<div class="section"><h3>Sent</h3><div class="list">${sent.map((r) => requestItem(r, names, 'out')).join('')}</div></div>` : ''}`,
  });
}

export function requestPage({ to, viewer, error, preview, values = {}, inboxCount }) {
  const first = esc(to.name.split(' ')[0]);
  const r = to.contact_rules;
  const causeField = to.causes.length
    ? `<select name="cause">${to.causes.map((c) => `<option${values.cause === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`
    : '<input name="cause" placeholder="A charity">';
  const body = !viewer
    ? `<h2 style="font-size:30px">Reach ${first}</h2><p style="color:var(--muted)">Requests are signed by your own profile, so you need one first. It takes 30 seconds.</p>
       <div class="stack"><a class="btn primary" href="/new">Make mine</a></div>${rulesCard(to)}`
    : `<h2 style="font-size:30px">Reach ${first}</h2>
    <p style="color:var(--muted)">Your request goes to ${first}'s agent, which checks it against their rules. If ${first} accepts, you both get a private channel. Nobody sees phone numbers or emails.</p>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    ${preview && preview.decision === 'decline' ? `<div class="error"><b>${first}'s agent would decline this:</b><br>${preview.reasons.map(esc).join('<br>')}</div>` : ''}
    <form class="f" method="post" action="/api/requests" style="margin-top:16px">
      <input type="hidden" name="to" value="${esc(to.handle)}">
      <label>What's it about?<input name="topic" required maxlength="120" placeholder="e.g. Intro to a fintech founder" value="${esc(values.topic)}"></label>
      <label>Message<textarea name="message" maxlength="1000" placeholder="Keep it short">${esc(values.message)}</textarea></label>
      ${r.min_donation > 0 ? `<div class="row"><label>Donate (USD)<input name="pledge" type="number" min="${r.min_donation}" step="1" inputmode="numeric" value="${esc(values.pledge ?? r.min_donation)}"></label><label>To${causeField}</label></div>
      <p class="hint" style="text-align:left;margin-top:-6px">v1: donations are recorded as pledges. No payment is taken yet.</p>` : ''}
      <button class="btn primary" type="submit">Send to ${first}'s agent</button>
    </form>${rulesCard(to)}`;
  return layout({ title: `Reach ${to.name}`, viewer, inboxCount, body });
}

export function channelPage({ ch, viewer, names, inboxCount }) {
  const other = ch.members.find((h) => h !== viewer.handle);
  return layout({
    title: `Channel with ${names[other] || other}`,
    viewer,
    inboxCount,
    body: `<h2 style="font-size:26px">With <a href="/p/${esc(other)}">${esc(names[other] || other)}</a></h2>
    <p class="hint" style="text-align:left">A private channel. ${ch.open ? 'Either of you can close it at any time.' : `Closed by ${esc(names[ch.closed_by] || ch.closed_by)}.`}</p>
    <div class="thread">${ch.messages.map((m) => `<div class="msg${m.from === viewer.handle ? ' me' : ''}">${esc(m.text)}</div>`).join('') || '<p class="hint">No messages yet.</p>'}</div>
    ${ch.open ? `<form class="f" method="post" action="/api/channels/post"><input type="hidden" name="id" value="${esc(ch.id)}"><textarea name="text" required maxlength="2000" placeholder="Message"></textarea><button class="btn primary">Send</button></form>
    <form method="post" action="/api/channels/close" style="margin-top:28px" onsubmit="return confirm('Close this channel? Neither of you can message here after.')"><input type="hidden" name="id" value="${esc(ch.id)}"><button class="btn ghost danger">Close channel</button></form>` : ''}`,
  });
}

export function agentPage({ p, baseUrl, ownerKey, inboxCount }) {
  const pub = `${baseUrl}/p/${p.handle}/mcp`;
  const priv = `${baseUrl}/a/${ownerKey}/mcp`;
  const recovery = `${baseUrl}/k/${ownerKey}`;
  return layout({
    title: 'My agent',
    viewer: p,
    inboxCount,
    body: `<h2 style="font-size:30px">My agent</h2>
    <div class="card"><h3>Public agent</h3><p style="color:var(--muted);font-size:15px">Anyone's agent can ask yours about your public profile and check your contact rules.</p>
    <div class="copy"><code>${esc(pub)}</code><button data-copy="${esc(pub)}">Copy</button></div></div>
    <div class="card"><h3>Private: acts as you</h3><p style="color:var(--muted);font-size:15px">Add this to Claude (Settings → Connectors → Add custom connector). Claude can then vouch, send contact requests and work your inbox as you. Keep it secret.</p>
    <div class="copy"><code>${esc(priv)}</code><button data-copy="${esc(priv)}">Copy</button></div></div>
    <div class="card"><h3>Your key</h3><p style="color:var(--muted);font-size:15px">There's no password. This link signs you in on any device. Save it somewhere safe, like your password manager.</p>
    <div class="copy"><code>${esc(recovery)}</code><button data-copy="${esc(recovery)}">Copy</button></div></div>
    <div class="card"><h3>Try it</h3><p style="color:var(--muted);font-size:15px">Add your private agent and a friend's public one to Claude, then ask something like:<br><i>"Ask Jason's profile whether he'd take an intro to someone in fintech."</i></p></div>
    <form method="post" action="/api/logout" style="margin-top:28px"><button class="btn ghost">Sign out on this device</button></form>`,
  });
}

export function errorPage(message, status = 400, viewer = null) {
  return layout({ title: status === 404 ? 'Not found' : 'Something went wrong', viewer, body: `<h2 style="font-size:30px;margin-top:10vh">${status === 404 ? 'Not found' : 'Hmm.'}</h2><p style="color:var(--muted);margin:10px 0 24px">${esc(message)}</p><a class="btn" href="/">Home</a>` });
}

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#09090b"/><circle cx="256" cy="256" r="128" fill="none" stroke="#c8ff3d" stroke-width="40"/><circle cx="256" cy="256" r="64" fill="#c8ff3d"/></svg>`;

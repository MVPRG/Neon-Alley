// Neon Alley: the shop, the mat and the pen.
(function () {
'use strict';
const P = window.PEN, JOBS_BASE = window.JOBS;
const $ = (s) => document.querySelector(s);
const clamp = P.clamp, dist = P.dist;
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');
const W = 1000, H = 700;

const store = {
  get(k, d) { try { const v = localStorage.getItem('neon:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('neon:' + k, JSON.stringify(v)); } catch (e) { /* private window */ } },
};

// ---------------------------------------------------------------- jobs (built in + workshop)
function customJobs() {
  return (store.get('custom', []) || []).map((c, i) => ({
    id: 'ws_' + c.id, shop: 'Workshop', n: 100 + i, name: c.name, customer: 'You made this one',
    brief: c.name + ', straight from Illustrator.', teaches: 'Your own shape.',
    tip: 'Your own job. Par is what you set when you added it.',
    par: c.par, closed: c.closed !== false, hints: 'fade', target: c.target, custom: true,
  }));
}
let JOBS = JOBS_BASE.concat(customJobs());
const progress = () => store.get('progress', {}) || {};
function saveProgress(job, res, svg) {
  const all = progress();
  const prev = all[job.id];
  if (!prev || res.stars > prev.stars || (res.stars === prev.stars && res.anchors < prev.anchors)) {
    all[job.id] = { stars: res.stars, anchors: res.anchors, p95: +res.fit.p95.toFixed(2), svg, at: Date.now() };
    store.set('progress', all);
  }
}
const unlocked = (idx) => {
  if (idx <= 0) return true;
  const prev = JOBS[idx - 1];
  if (prev && prev.custom) return true;
  return (progress()[prev.id] || {}).stars > 0;
};

// ---------------------------------------------------------------- state
const S = {
  jobIndex: 0, job: null, target: null, mutated: false,
  path: P.newPath(), tool: 'pen', convert: false,
  sel: null, hover: null, cursor: null, drag: null,
  undo: [], redo: [],
  sticky: { alt: false, shift: false }, keys: new Set(),
  phase: 'menu', cutT: 0, cutDev: null, cutPoly: null, res: null,
  ghost: 0, snapFlash: 0, shake: 0, lastFault: null, coachTimer: 0,
  pointerDown: false, pointerPt: null,
};
const altOn = () => S.keys.has('alt') || S.sticky.alt;
const shiftOn = () => S.keys.has('shift') || S.sticky.shift;
const directOn = () => S.tool === 'direct' || S.keys.has('meta') || S.keys.has('control');

// ---------------------------------------------------------------- canvas and view
const canvas = $('#mat');
const ctx = canvas.getContext('2d');
let view = { s: 1, ox: 0, oy: 0, dpr: 1 };
const phone = () => window.innerWidth <= 700;
function layout() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const el = (sel) => document.querySelector(sel);
  const hOf = (sel) => { const n = el(sel); return n && !n.hidden ? n.getBoundingClientRect().height : 0; };
  let padL, padT, padB;
  if (phone()) {
    padL = 10;
    padT = Math.max(hOf('#ticket'), hOf('#bar')) + 10;
    padB = hOf('#touchbar') + 14;
    el('#coach').style.top = padT + 'px';
  } else {
    padL = w > 900 ? 310 : w > 620 ? 250 : 14;
    padT = 64;
    el('#coach').style.top = '';
    el('#coach').classList.remove('hide');
    padB = (isTouch ? hOf('#touchbar') : 0) + hOf('#coach') + 26;
  }
  const padR = phone() ? 10 : 14;
  const s = Math.min((w - padL - padR) / W, (h - padT - padB) / H);
  view = { s, ox: padL + (w - padL - padR - W * s) / 2, oy: padT + (h - padT - padB - H * s) / 2, dpr, padL, padR, padT, padB };
}
const toWorld = (cx, cy) => ({ x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s });
const px = (n) => n / view.s; // n screen pixels in mat units
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 120));
layout();
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => layout());
  ro.observe(document.querySelector('#ticket'));
  ro.observe(document.querySelector('#coach'));
  const tb = document.querySelector('#touchbar');
  if (tb) ro.observe(tb);
}

// ---------------------------------------------------------------- sound
const sound = {
  ctx: null, muted: store.get('muted', false),
  init() { if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; } try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } },
  blip(f0, f1, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'triangle'; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.07, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  chord(freqs, dur, vol) { freqs.forEach((f, i) => setTimeout(() => this.blip(f, f, dur, 'sine', vol || 0.06), i * 70)); },
  noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const n = Math.floor(this.ctx.sampleRate * dur), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.15;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination); src.start();
  },
};

// ---------------------------------------------------------------- undo
function snapshot() { return P.clonePath(S.path); }
function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 60) S.undo.shift(); S.redo.length = 0; }
function undo() {
  if (!S.undo.length) return;
  S.redo.push(snapshot());
  S.path = S.undo.pop();
  S.sel = null; sound.blip(300, 220, 0.06, 'square', 0.05); updateTicket();
}
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); S.path = S.redo.pop(); updateTicket(); }

// ---------------------------------------------------------------- job flow
function loadJob(i, keepPath) {
  S.jobIndex = clamp(i, 0, JOBS.length - 1);
  S.job = JOBS[S.jobIndex];
  S.target = S.job.target;
  S.mutated = false;
  if (!keepPath) { S.path = P.newPath(); S.undo = []; S.redo = []; }
  S.sel = null; S.res = null; S.phase = 'draw'; S.tool = 'pen'; S.convert = false; S.ghost = 0;
  S.lastFault = null;
  $('#result').hidden = true;
  $('#menu').hidden = true;
  setTool('pen');
  updateTicket();
  coach('Pen', S.job.tip);
}
function jobSpec() {
  const mut = S.mutated && S.job.mutate;
  return { target: S.target, par: mut ? (S.job.mutate.par || S.job.par) : S.job.par, closed: S.job.closed };
}

function updateTicket() {
  const j = S.job;
  if (!j) return;
  $('#tkN').textContent = j.custom ? 'Workshop' : 'Job ' + j.n;
  $('#tkName').textContent = j.name;
  $('#tkCust').textContent = j.customer;
  $('#tkBrief').textContent = S.mutated && j.mutate ? j.mutate.brief : j.brief;
  const par = jobSpec().par;
  $('#tkPar').textContent = par;
  const compact = phone() && !$('#ticket').classList.contains('open');
  $('#tkPts').textContent = compact ? S.path.anchors.length + '/' + par : S.path.anchors.length;
  $('#tkPtsWrap').classList.toggle('over', S.path.anchors.length > par);
  const best = progress()[j.id];
  $('#tkStars').textContent = best ? '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : '—';
  $('#tkTip').textContent = j.tip;
  const cantCut = S.path.anchors.length < 2 || S.phase === 'cut';
  $('#btnCut').disabled = cantCut;
  $('#mCut').disabled = cantCut;
  $('#tkFoot').textContent = j.closed && !S.path.closed && S.path.anchors.length > 2 ? 'Not closed yet' : '';
}
let coachTimer = 0;
function coach(label, text, warn) {
  const el = $('#coach');
  $('#coachLabel').textContent = label;
  $('#coachText').textContent = text;
  el.classList.toggle('warn', !!warn);
  el.classList.remove('hide');
  clearTimeout(coachTimer);
  // on a phone it would crowd the controls, so it shows briefly and gets out of the way
  if (phone()) coachTimer = setTimeout(() => el.classList.add('hide'), warn ? 6500 : 4800);
}

// ---------------------------------------------------------------- hit testing
function hitTest(pt, handles) {
  const r = px(isTouch ? 18 : 11), rh = px(isTouch ? 20 : 12);
  const a = S.path.anchors;
  if (handles) {
    for (let i = 0; i < a.length; i++) {
      if (S.sel !== null && S.sel !== i && a.length > 1 && !isTouch && false) continue;
      if (a[i].out && dist(P.outPoint(a[i]), pt) <= rh) return { type: 'out', i };
      if (a[i].in && dist(P.inPoint(a[i]), pt) <= rh) return { type: 'in', i };
    }
  }
  for (let i = 0; i < a.length; i++) if (dist(a[i], pt) <= r) return { type: 'anchor', i };
  const near = a.length > 1 ? P.nearestOnPath(S.path, pt) : null;
  if (near && near.d <= px(10)) return { type: 'path', seg: near.seg, t: near.t, point: near.point };
  return { type: null };
}
function snapPoint(pt) {
  if (!S.job || S.phase !== 'draw') return pt;
  const mode = S.job.hints;
  const r = mode === 'full' ? 13 : mode === 'fade' ? 8 : 0;
  if (!r) return pt;
  const feat = P.targetFeatures(S.target);
  let best = null;
  for (const f of feat.corners.concat(feat.extremes)) { const d = dist(f, pt); if (d <= r && (!best || d < best.d)) best = { d, f }; }
  if (best) { if (S.snapFlash <= 0) sound.blip(1400, 1800, 0.05, 'sine', 0.05); S.snapFlash = 0.35; return { x: best.f.x, y: best.f.y }; }
  return pt;
}
function constrain45(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
}
function autoSmooth(i) {
  const a = S.path.anchors, n = a.length, cur = a[i];
  const prev = a[(i - 1 + n) % n], next = a[(i + 1) % n];
  const dx = next.x - prev.x, dy = next.y - prev.y, l = Math.hypot(dx, dy) || 1;
  const k = Math.min(dist(cur, prev), dist(cur, next)) / 3;
  cur.out = { x: (dx / l) * k, y: (dy / l) * k };
  cur.in = { x: -cur.out.x, y: -cur.out.y };
}

// ---------------------------------------------------------------- pointer
function eventPoint(e) {
  const r = canvas.getBoundingClientRect();
  return toWorld(e.clientX - r.left, e.clientY - r.top);
}
canvas.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'draw') return;
  sound.init();
  canvas.setPointerCapture(e.pointerId);
  S.pointerDown = true;
  const pt = eventPoint(e);
  S.pointerPt = pt; S.cursor = pt;
  const p = S.path, a = p.anchors;

  if (directOn() || S.convert) {
    const hit = hitTest(pt, true);
    if (S.convert && hit.type === 'anchor') {
      pushUndo();
      const an = a[hit.i];
      if (P.isCorner(an)) { autoSmooth(hit.i); sound.blip(700, 1100, 0.08, 'sine', 0.06); }
      else { an.in = null; an.out = null; sound.blip(500, 300, 0.08, 'square', 0.06); }
      S.sel = hit.i; S.drag = { mode: 'convert', i: hit.i };
      updateTicket(); return;
    }
    if (hit.type === 'in' || hit.type === 'out') {
      pushUndo();
      S.sel = hit.i;
      S.drag = { mode: 'handle', i: hit.i, side: hit.type, broke: altOn() };
      return;
    }
    if (hit.type === 'anchor') {
      if (altOn()) { pushUndo(); a[hit.i].in = null; a[hit.i].out = null; sound.blip(420, 260, 0.08, 'square', 0.06); S.sel = hit.i; updateTicket(); return; }
      pushUndo(); S.sel = hit.i; S.drag = { mode: 'anchor', i: hit.i };
      return;
    }
    S.sel = null;
    return;
  }

  // pen tool
  if (p.closed) { coach('Closed', 'This path is closed. Press A, or hold ' + (MAC ? 'Cmd' : 'Ctrl') + ', to move points.', true); return; }
  const hit = hitTest(pt, false);
  if (hit.type === 'anchor' && hit.i === 0 && a.length >= 2) {
    pushUndo();
    p.closed = true;
    S.drag = { mode: 'close', i: 0 };
    sound.blip(900, 1300, 0.09, 'triangle', 0.07);
    updateTicket();
    return;
  }
  if (hit.type === 'anchor' && hit.i === a.length - 1 && altOn()) {
    pushUndo();
    S.drag = { mode: 'breakOut', i: hit.i };
    return;
  }
  pushUndo();
  let q = snapPoint(pt);
  if (shiftOn() && a.length) q = constrain45(a[a.length - 1], q);
  p.anchors.push(P.anchor(q.x, q.y));
  S.drag = { mode: 'new', i: p.anchors.length - 1, moved: false };
  sound.blip(560, 560, 0.04, 'square', 0.05);
  updateTicket();
});
canvas.addEventListener('pointermove', (e) => {
  const pt = eventPoint(e);
  S.cursor = pt;
  if (S.pointerDown) S.pointerPt = pt;
  if (!S.drag) { S.hover = hitTest(pt, directOn() || S.convert); return; }
  const a = S.path.anchors, d = S.drag, an = a[d.i];
  if (!an) return;
  if (d.mode === 'new' || d.mode === 'breakOut' || d.mode === 'convert') {
    let q = pt;
    if (shiftOn()) q = constrain45(an, q);
    const h = { x: q.x - an.x, y: q.y - an.y };
    if (Math.hypot(h.x, h.y) < px(4) && d.mode === 'new') return;
    d.moved = true;
    an.out = h;
    const firstOfPath = d.mode === 'new' && d.i === 0;
    if (!(d.mode === 'breakOut' || firstOfPath || (d.mode === 'new' && altOn()))) an.in = { x: -h.x, y: -h.y };
  } else if (d.mode === 'close') {
    let q = pt;
    if (shiftOn()) q = constrain45(an, q);
    const h = { x: q.x - an.x, y: q.y - an.y };
    if (Math.hypot(h.x, h.y) < px(4)) return;
    d.moved = true;
    an.in = h;
    if (!altOn()) an.out = { x: -h.x, y: -h.y };
  } else if (d.mode === 'handle') {
    let q = pt;
    if (shiftOn()) q = constrain45(an, q);
    const h = { x: q.x - an.x, y: q.y - an.y };
    const other = d.side === 'out' ? 'in' : 'out';
    const wasSmooth = an.in && an.out && !P.isCorner(an, 12);
    an[d.side] = h;
    if (wasSmooth && !d.broke && an[other]) {
      const len = Math.hypot(an[other].x, an[other].y), l = Math.hypot(h.x, h.y) || 1;
      an[other] = { x: (-h.x / l) * len, y: (-h.y / l) * len };
    }
  } else if (d.mode === 'anchor') {
    const q = snapPoint(pt);
    an.x = q.x; an.y = q.y;
  }
  updateTicket();
});
function endPointer() {
  if (S.drag && S.drag.mode === 'breakOut' && !S.drag.moved) {
    // alt-click retracts the outgoing handle, so the next segment leaves straight
    const an = S.path.anchors[S.drag.i];
    if (an) { an.out = null; sound.blip(420, 260, 0.07, 'square', 0.05); }
  }
  if (S.drag && S.drag.mode === 'close' && !S.drag.moved) {
    // clicking the first point to close leaves it a corner, the way Illustrator does
    const a0 = S.path.anchors[0];
    if (a0) a0.in = null;
  }
  S.drag = null; S.pointerDown = false; S.pointerPt = null;
  if (S.sticky.alt || S.sticky.shift) { S.sticky.alt = false; S.sticky.shift = false; syncSticky(); }
  updateTicket();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!S.pointerDown) S.cursor = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- keyboard
function deleteAnchor(i) {
  if (i == null || !S.path.anchors[i]) return;
  pushUndo();
  S.path.anchors.splice(i, 1);
  if (S.path.anchors.length < 2) S.path.closed = false;
  S.sel = null;
  sound.blip(400, 240, 0.08, 'square', 0.06);
  updateTicket();
}
function addAnchorOnPath(pt) {
  const near = P.nearestOnPath(S.path, pt);
  if (!near || near.d > px(14)) return;
  pushUndo();
  const sp = P.splitSegment(near.seg, near.t);
  const a = S.path.anchors, i = near.seg.i, n = a.length;
  const A = a[i], B = a[(i + 1) % n];
  A.out = { x: sp.left.c1.x - A.x, y: sp.left.c1.y - A.y };
  B.in = { x: sp.right.c2.x - B.x, y: sp.right.c2.y - B.y };
  a.splice(i + 1, 0, P.anchor(sp.mid.x, sp.mid.y, { x: sp.left.c2.x - sp.mid.x, y: sp.left.c2.y - sp.mid.y }, { x: sp.right.c1.x - sp.mid.x, y: sp.right.c1.y - sp.mid.y }));
  sound.blip(800, 1000, 0.06, 'sine', 0.05);
  updateTicket();
}
window.addEventListener('keydown', (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k === 'alt' || k === 'shift' || k === 'meta' || k === 'control') { S.keys.add(k); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (!$('#menu').hidden || !$('#help').hidden || !$('#workshop').hidden || !$('#cardView').hidden) {
    if (k === 'escape') { $('#help').hidden = true; $('#workshop').hidden = true; $('#cardView').hidden = true; if ($('#menu').hidden) return; }
    return;
  }
  if (k === 'p') setTool('pen');
  else if (k === 'a') setTool('direct');
  else if (k === 'c' && e.shiftKey) { S.convert = !S.convert; coach(S.convert ? 'Convert' : 'Pen', S.convert ? 'Click a point to switch it between corner and smooth.' : S.job.tip); }
  else if (k === 'escape') { if (S.convert) { S.convert = false; coach('Pen', S.job.tip); } else if (!S.path.closed && S.path.anchors.length) coach('Pen', 'Path finished. Send it to the plotter, or press A to adjust it.'); }
  else if (k === 'enter') submit();
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteAnchor(S.sel != null ? S.sel : (S.hover && S.hover.type === 'anchor' ? S.hover.i : null)); }
  else if (k === '-' || k === '_') { const h = hitTest(S.cursor || { x: -1e6, y: 0 }, false); if (h.type === 'anchor') deleteAnchor(h.i); }
  else if (k === '+' || k === '=') { if (S.cursor) addAnchorOnPath(S.cursor); }
});
window.addEventListener('keyup', (e) => { S.keys.delete(e.key.toLowerCase()); });
window.addEventListener('blur', () => S.keys.clear());

function setTool(t) {
  S.tool = t; S.convert = false;
  $('#tPen').setAttribute('aria-pressed', String(t === 'pen'));
  $('#tDirect').setAttribute('aria-pressed', String(t === 'direct'));
  $('#mTool').textContent = t === 'pen' ? 'Edit' : 'Pen';
  const small = document.createElement('small'); small.textContent = t === 'pen' ? 'A' : 'P';
  $('#mTool').appendChild(small);
  if (S.job) coach(t === 'pen' ? 'Pen' : 'Edit', t === 'pen' ? S.job.tip : 'Drag a point to move it. Drag a handle to reshape the curve. Alt-drag a handle to break it.');
}
$('#tPen').addEventListener('click', () => setTool('pen'));
$('#tDirect').addEventListener('click', () => setTool('direct'));
$('#btnUndo').addEventListener('click', undo);
$('#btnClear').addEventListener('click', () => { pushUndo(); S.path = P.newPath(); S.sel = null; updateTicket(); });
$('#btnCut').addEventListener('click', submit);
let loupeOn = store.get('loupe', true) !== false;
function syncLoupeBtn() {
  const b = $('#loupeToggle');
  if (!b) return;
  b.hidden = !isTouch;
  b.textContent = 'Magnifier: ' + (loupeOn ? 'on' : 'off');
  b.setAttribute('aria-pressed', String(loupeOn));
}
$('#btnHelp').addEventListener('click', () => { $('#help').hidden = false; syncLoupeBtn(); });
$('#loupeToggle').addEventListener('click', () => { loupeOn = !loupeOn; store.set('loupe', loupeOn); syncLoupeBtn(); });
$('#helpClose').addEventListener('click', () => { $('#help').hidden = true; });
$('#btnJobs').addEventListener('click', openMenu);
$('#mCut').addEventListener('click', submit);
$('#tkToggle').addEventListener('click', () => {
  const t = $('#ticket');
  const open = t.classList.toggle('open');
  $('#tkToggle').setAttribute('aria-expanded', String(open));
  updateTicket();
  layout();
});

// touch controls
function syncSticky() {
  $('#mAlt').setAttribute('aria-pressed', String(S.sticky.alt));
  $('#mShift').setAttribute('aria-pressed', String(S.sticky.shift));
}
if (isTouch) {
  document.body.classList.add('touch');
  $('#touchbar').hidden = false;
  $('#mAlt').addEventListener('click', () => { S.sticky.alt = !S.sticky.alt; syncSticky(); });
  $('#mShift').addEventListener('click', () => { S.sticky.shift = !S.sticky.shift; syncSticky(); });
  $('#mUndo').addEventListener('click', undo);
  $('#mTool').addEventListener('click', () => setTool(S.tool === 'pen' ? 'direct' : 'pen'));
  $('#mDelete').addEventListener('click', () => deleteAnchor(S.sel));
}

// ---------------------------------------------------------------- submit, cut, result
function submit() {
  if (S.phase !== 'draw' || !S.job) return;
  if (S.path.anchors.length < 2) { coach('Empty', 'Place a few points first.', true); return; }
  const res = P.score(S.path, jobSpec());
  S.res = res;
  S.cutPoly = P.flatten(S.path);
  const tIdx = P.buildIndex(P.flatten(S.target));
  S.cutDev = S.cutPoly.map((q) => P.nearestDist(tIdx, q));
  S.phase = 'cut'; S.cutT = 0;
  $('#btnCut').disabled = true;
  sound.noise(0.25, 0.08, 500);
  coach('Cutting', 'Nub is running your path.');
}
function finishCut() {
  const res = S.res, job = S.job;
  S.phase = 'result';
  const mutating = res.ok && job.mutate && !S.mutated;
  const svg = P.pathToSvg(S.path, 1);
  if (!mutating) saveProgress(job, res, svg);
  $('#resVerdict').textContent = mutating ? 'Customer changed their mind' : res.ok ? 'Sign lit' : 'Rejected';
  const starsEl = $('#resStars');
  starsEl.innerHTML = '';
  for (let i = 1; i <= 3; i++) { const d = document.createElement('div'); d.className = 'star' + (i <= res.stars ? ' on' : ''); d.textContent = '★'; starsEl.appendChild(d); }
  $('#resLine').textContent = mutating ? job.mutate.line : P.critique(res, jobSpec());
  const par = jobSpec().par;
  const rows = [
    { label: 'Fit', value: res.fit.p95 <= P.TOL.clean ? 'clean' : res.fit.p95.toFixed(1) + ' off', ok: res.fit.pass, tag: res.fit.clean ? 'clean' : res.fit.pass ? 'passes' : 'too far' },
    { label: 'Points used', value: res.anchors + ' of ' + par, ok: res.anchors <= par, tag: res.anchors <= par ? 'at par' : res.anchors - par + ' over' },
    { label: 'Tangents', value: res.faults.some((f) => f.code === 'kink') ? 'kinked' : 'smooth', ok: !res.faults.some((f) => f.code === 'kink'), tag: res.faults.some((f) => f.code === 'kink') ? 'fix' : 'good' },
    { label: 'Corners', value: res.hits.cornersTotal ? res.hits.corners + ' of ' + res.hits.cornersTotal : 'none needed', ok: res.hits.corners === res.hits.cornersTotal, tag: res.hits.corners === res.hits.cornersTotal ? 'sharp' : 'missed' },
  ];
  $('#resRows').innerHTML = rows.map((r) => `<div class="row ${r.ok ? 'ok' : 'bad'}"><span>${r.label}</span><b>${r.value}</b><i>${r.tag}</i></div>`).join('');
  $('#resNext').textContent = mutating ? 'Take the change' : res.ok ? (S.jobIndex < JOBS.length - 1 ? 'Next job' : 'Back to the shop') : 'Try again';
  $('#resRetry').hidden = mutating;
  $('#resGhost').hidden = mutating;
  $('#result').hidden = false;
  S.lastFault = res.faults[0] || null;
  if (res.ok && !mutating) sound.chord([523, 659, 784, 1046], 0.5, 0.05);
  else if (!res.ok) sound.blip(300, 120, 0.4, 'sawtooth', 0.08);
  else sound.blip(700, 900, 0.2, 'sine', 0.06);
  updateTicket();
}
$('#resRetry').addEventListener('click', () => { $('#result').hidden = true; S.phase = 'draw'; pushUndo(); S.path = P.newPath(); S.sel = null; setTool('pen'); const f = S.lastFault; coach('Again', f && P.critique({ faults: [f] }, jobSpec()) || S.job.tip, true); updateTicket(); });
$('#resGhost').addEventListener('click', () => { $('#result').hidden = true; S.phase = 'ghost'; S.ghost = 0; });
$('#resNext').addEventListener('click', () => {
  const res = S.res, job = S.job;
  $('#result').hidden = true;
  if (res.ok && job.mutate && !S.mutated) {
    S.mutated = true; S.target = job.mutate.target; S.phase = 'draw'; setTool('direct');
    coach('Edit', 'Move the points you already have. Press A for the white arrow, drag the points and their handles.');
    updateTicket();
    return;
  }
  if (!res.ok) { S.phase = 'draw'; updateTicket(); return; }
  if (S.jobIndex < JOBS.length - 1 && unlocked(S.jobIndex + 1)) loadJob(S.jobIndex + 1);
  else openMenu();
});

// ---------------------------------------------------------------- menu, card, workshop
function jobThumb(cv, job) {
  const g = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h);
  const fit = P.fitPathTo(job.target, { x: 0, y: 0, w, h }, 8);
  g.strokeStyle = '#35d6cc'; g.lineWidth = 2; g.lineJoin = 'round';
  g.beginPath();
  const poly = P.flatten(fit);
  poly.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  if (fit.closed) g.closePath();
  g.stroke();
}
function openMenu() {
  JOBS = JOBS_BASE.concat(customJobs());
  const prog = progress();
  const list = $('#jobList');
  list.innerHTML = '';
  const shops = window.SHOPS.map((s) => s.name).concat(['Workshop']);
  shops.forEach((shopName) => {
    const inShop = JOBS.map((job, i) => ({ job, i })).filter((x) => x.job.shop === shopName);
    if (!inShop.length) return;
    const shop = window.SHOPS.find((s) => s.name === shopName);
    const head = document.createElement('div');
    head.className = 'shophead';
    const shopStars = inShop.reduce((s, x) => s + ((prog[x.job.id] || {}).stars || 0), 0);
    head.innerHTML = `<h3>${shopName}</h3><span>${shop ? shop.blurb : 'Shapes you added yourself'}</span><b>${shopStars}/${inShop.length * 3} ★</b>`;
    list.appendChild(head);
    inShop.forEach(({ job, i }) => {
      const b = document.createElement('button');
      b.className = 'jobrow';
      b.disabled = !unlocked(i);
      const p = prog[job.id];
      b.innerHTML = `<canvas width="108" height="80"></canvas><div><b>${job.custom ? '' : job.n + '. '}${job.name}</b><span>${b.disabled ? 'Finish the job before this one' : job.teaches}</span></div><span class="jobstars">${p ? '★'.repeat(p.stars) + '☆'.repeat(3 - p.stars) : '☆☆☆'}</span>`;
      b.addEventListener('click', () => { loadJob(i); });
      list.appendChild(b);
      jobThumb(b.querySelector('canvas'), job);
    });
  });
  const done = JOBS_BASE.filter((j) => (prog[j.id] || {}).stars > 0).length;
  const stars = JOBS_BASE.reduce((s, j) => s + ((prog[j.id] || {}).stars || 0), 0);
  $('#menuNote').textContent = `${done} of ${JOBS_BASE.length} jobs done, ${stars} of ${JOBS_BASE.length * 3} stars. Progress is saved in this browser.`;
  $('#menu').hidden = false;
  S.phase = 'menu';
}
$('#menuPlay').addEventListener('click', () => {
  const prog = progress();
  let i = JOBS.findIndex((j) => !prog[j.id]);
  if (i < 0) i = 0;
  while (i > 0 && !unlocked(i)) i--;
  loadJob(i);
});
$('#menuCard').addEventListener('click', () => { drawCard(); $('#cardView').hidden = false; });
$('#cardClose').addEventListener('click', () => { $('#cardView').hidden = true; });
$('#menuWorkshop').addEventListener('click', () => { $('#workshop').hidden = false; $('#wsInput').focus(); });
$('#wsClose').addEventListener('click', () => { $('#workshop').hidden = true; });
$('#wsAdd').addEventListener('click', () => {
  const raw = $('#wsInput').value.trim();
  const msg = $('#wsMsg');
  msg.className = 'msg';
  const dMatch = raw.match(/\sd="([^"]+)"/) || raw.match(/\sd='([^']+)'/);
  const d = dMatch ? dMatch[1] : raw;
  const out = P.svgToPath(d);
  if (out.error) { msg.className = 'msg bad'; msg.textContent = out.error; return; }
  const fitted = P.fitPathTo(out.path, { x: 0, y: 0, w: W, h: H }, 90);
  const name = ($('#wsName').value || 'Custom shape').slice(0, 24);
  const par = clamp(parseInt($('#wsPar').value, 10) || out.path.anchors.length, 2, 40);
  const custom = store.get('custom', []) || [];
  custom.push({ id: Date.now().toString(36), name, par, closed: fitted.closed, target: fitted });
  store.set('custom', custom);
  msg.textContent = `Added "${name}" with ${out.path.anchors.length} points in the original. Par set to ${par}.`;
  $('#wsInput').value = ''; $('#wsName').value = '';
  openMenu();
});

function drawCard() {
  const cv = $('#cardCanvas'), g = cv.getContext('2d');
  const prog = progress();
  const all = JOBS_BASE;
  cv.width = 1000; cv.height = 760;
  g.fillStyle = '#0d1215'; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = '#1d2a31'; g.lineWidth = 2; g.strokeRect(12, 12, cv.width - 24, cv.height - 24);
  g.fillStyle = '#ffae1f'; g.font = '700 32px "Archivo Black", sans-serif';
  g.fillText('NEON ALLEY', 34, 58);
  g.fillStyle = '#8ba3ab'; g.font = '15px "Barlow", sans-serif';
  g.fillText('Pen tool job card · ' + new Date().toLocaleDateString(), 34, 82);
  const colW = 470, x0 = 34, y0 = 118, rowH = 74, perCol = Math.ceil(all.length / 2);
  all.forEach((job, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    const x = x0 + col * colW, y = y0 + row * rowH;
    const p = prog[job.id];
    g.fillStyle = '#121a1f'; g.fillRect(x, y, colW - 24, rowH - 10);
    g.fillStyle = '#e9f3f5'; g.font = '600 16px "Barlow", sans-serif';
    g.fillText(job.n + '. ' + job.name, x + 78, y + 27);
    g.fillStyle = '#8ba3ab'; g.font = '12px "IBM Plex Mono", monospace';
    g.fillText(p ? `${p.anchors} points (par ${job.par}) · within ${p.p95}` : 'not cut yet', x + 78, y + 48);
    g.fillStyle = '#ffae1f'; g.font = '17px "Barlow", sans-serif';
    g.fillText(p ? '★'.repeat(p.stars) + '☆'.repeat(3 - p.stars) : '☆☆☆', x + colW - 92, y + 40);
    if (p && p.svg) {
      const parsed = P.svgToPath(p.svg);
      if (!parsed.error) {
        const fit = P.fitPathTo(parsed.path, { x: x + 8, y: y + 6, w: 62, h: rowH - 22 }, 6);
        g.strokeStyle = '#35d6cc'; g.lineWidth = 1.5; g.beginPath();
        P.flatten(fit).forEach((q, k) => (k ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        if (fit.closed) g.closePath();
        g.stroke();
      }
    }
  });
  const stars = all.reduce((s, j) => s + ((prog[j.id] || {}).stars || 0), 0);
  const done = all.filter((j) => (prog[j.id] || {}).stars > 0).length;
  g.fillStyle = '#35d6cc'; g.font = '600 20px "Barlow", sans-serif';
  g.fillText(`${done} of ${all.length} jobs cut · ${stars} of ${all.length * 3} stars`, 34, cv.height - 30);
}
$('#cardSave').addEventListener('click', async () => {
  const cv = $('#cardCanvas'), note = $('#cardNote');
  note.textContent = 'Saving…';
  try {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    if (window.claude && window.claude.use) {
      const dl = await window.claude.use('downloads');
      if (dl && dl.save) { await dl.save({ filename: 'neon-alley-job-card.png', data: blob }); note.textContent = 'Saved.'; return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'neon-alley-job-card.png';
    document.body.appendChild(a); a.click(); a.remove();
    note.textContent = 'Saved to your downloads. If nothing appeared, take a screenshot of the card instead.';
  } catch (e) {
    note.textContent = 'This page cannot save files here. Take a screenshot of the card instead.';
  }
});

// ---------------------------------------------------------------- drawing
function setPath(g, path, close) {
  const segs = P.segments(path);
  if (!path.anchors.length) return;
  g.beginPath();
  g.moveTo(path.anchors[0].x, path.anchors[0].y);
  for (const s of segs) g.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p1.x, s.p1.y);
  if (path.closed && close !== false) g.closePath();
}
function drawMat(g) {
  const w = window.innerWidth, h = window.innerHeight;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0f161a'); grad.addColorStop(1, '#0a0e11');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.save();
  g.translate(view.ox, view.oy); g.scale(view.s, view.s);
  g.fillStyle = '#111a1e';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(70,190,205,.07)'; g.lineWidth = px(1);
  for (let x = 0; x <= W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(70,190,205,.16)'; g.lineWidth = px(1.5);
  for (let x = 0; x <= W; x += 250) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 250) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(70,190,205,.22)'; g.lineWidth = px(2); g.strokeRect(0, 0, W, H);
  g.restore();
}
function drawTarget(g, lit) {
  if (!S.target) return;
  g.save();
  g.translate(view.ox, view.oy); g.scale(view.s, view.s);
  setPath(g, S.target);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(150,205,220,.16)'; g.lineWidth = 18; g.stroke();
  g.strokeStyle = 'rgba(190,235,245,.22)'; g.lineWidth = 9; g.stroke();
  g.strokeStyle = 'rgba(225,248,252,.42)'; g.lineWidth = px(1.6); g.setLineDash([px(7), px(6)]); g.stroke(); g.setLineDash([]);
  // where the points belong
  if (S.job && S.job.hints !== 'off' && S.phase === 'draw') {
    const feat = P.targetFeatures(S.target);
    const show = S.job.hints === 'full' || S.lastFault;
    if (show) {
      for (const c of feat.corners) {
        g.strokeStyle = 'rgba(255,174,31,.55)'; g.lineWidth = px(1.6);
        g.beginPath(); g.moveTo(c.x - px(7), c.y); g.lineTo(c.x, c.y - px(7)); g.lineTo(c.x + px(7), c.y); g.lineTo(c.x, c.y + px(7)); g.closePath(); g.stroke();
      }
      for (const e of feat.extremes) {
        g.strokeStyle = 'rgba(53,214,204,.5)'; g.lineWidth = px(1.6);
        g.beginPath(); g.moveTo(e.x - px(7), e.y); g.lineTo(e.x + px(7), e.y); g.moveTo(e.x, e.y - px(7)); g.lineTo(e.x, e.y + px(7)); g.stroke();
      }
    }
  }
  g.restore();
}
function strokeLit(g, poly, dev, upTo, glow) {
  // draw the path in pieces coloured by how close it is to the tube
  let i = 1;
  while (i < upTo) {
    const col = dev[i] <= 2 ? '#35d6cc' : dev[i] <= 6 ? '#ffae1f' : '#ff4d79';
    g.beginPath(); g.moveTo(poly[i - 1].x, poly[i - 1].y);
    let j = i;
    while (j < upTo && (dev[j] <= 2 ? '#35d6cc' : dev[j] <= 6 ? '#ffae1f' : '#ff4d79') === col) { g.lineTo(poly[j].x, poly[j].y); j++; }
    g.strokeStyle = col;
    if (glow) { g.shadowColor = col; g.shadowBlur = 18; }
    g.lineWidth = glow ? 7 : 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.stroke();
    g.shadowBlur = 0;
    i = j + 1;
  }
}
function drawUserPath(g) {
  const path = S.path;
  if (!path.anchors.length) return;
  g.save();
  g.translate(view.ox, view.oy); g.scale(view.s, view.s);
  const editing = directOn() || S.convert;

  if (path.anchors.length > 1) {
    setPath(g, path);
    g.strokeStyle = S.phase === 'ghost' ? 'rgba(255,174,31,.35)' : '#ffae1f';
    g.lineWidth = px(2.4); g.lineJoin = 'round'; g.lineCap = 'round';
    g.shadowColor = 'rgba(255,174,31,.5)'; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0;
  }
  // rubber band
  if (!path.closed && S.cursor && S.phase === 'draw' && !editing && !S.drag && path.anchors.length) {
    const a = path.anchors[path.anchors.length - 1];
    let q = S.cursor;
    if (shiftOn()) q = constrain45(a, q);
    const seg = { p0: { x: a.x, y: a.y }, c1: P.outPoint(a), c2: { x: q.x, y: q.y }, p1: { x: q.x, y: q.y } };
    g.beginPath(); g.moveTo(seg.p0.x, seg.p0.y);
    g.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p1.x, seg.p1.y);
    g.strokeStyle = 'rgba(255,174,31,.45)'; g.lineWidth = px(1.6); g.setLineDash([px(5), px(5)]); g.stroke(); g.setLineDash([]);
  }
  // handles
  const showHandles = (i) => editing || S.drag != null || i === path.anchors.length - 1 || i === S.sel;
  path.anchors.forEach((a, i) => {
    if (!showHandles(i)) return;
    for (const side of ['in', 'out']) {
      if (!a[side]) continue;
      const hp = side === 'in' ? P.inPoint(a) : P.outPoint(a);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(hp.x, hp.y);
      g.strokeStyle = 'rgba(53,214,204,.75)'; g.lineWidth = px(1.2); g.stroke();
      g.beginPath(); g.arc(hp.x, hp.y, px(4.5), 0, 7);
      const hovered = S.hover && S.hover.type === side && S.hover.i === i;
      g.fillStyle = hovered ? '#ffffff' : '#35d6cc'; g.fill();
    }
  });
  // anchors
  path.anchors.forEach((a, i) => {
    const r = px(4.6);
    const corner = P.isCorner(a);
    const hovered = S.hover && S.hover.type === 'anchor' && S.hover.i === i;
    g.beginPath();
    if (corner) g.rect(a.x - r, a.y - r, r * 2, r * 2);
    else g.arc(a.x, a.y, r, 0, 7);
    g.fillStyle = i === S.sel ? '#ffffff' : hovered ? '#ffd98a' : '#0d1215';
    g.strokeStyle = i === 0 && !path.closed ? '#35d6cc' : '#ffae1f';
    g.lineWidth = px(2);
    g.fill(); g.stroke();
  });
  // closing hint
  if (!path.closed && path.anchors.length >= 2 && S.cursor && !editing) {
    const first = path.anchors[0];
    if (dist(first, S.cursor) <= px(isTouch ? 18 : 12)) {
      g.beginPath(); g.arc(first.x, first.y, px(11), 0, 7);
      g.strokeStyle = '#35d6cc'; g.lineWidth = px(1.6); g.stroke();
    }
  }
  g.restore();
}
function drawCut(g, dt) {
  S.cutT += dt / (reduceMotion ? 0.9 : 2.2);
  const poly = S.cutPoly, dev = S.cutDev;
  const upTo = Math.floor(clamp(S.cutT, 0, 1) * (poly.length - 1)) + 1;
  g.save();
  g.translate(view.ox, view.oy); g.scale(view.s, view.s);
  strokeLit(g, poly, dev, upTo, true);
  const head = poly[Math.min(upTo, poly.length - 1)];
  if (head && S.cutT < 1) {
    g.fillStyle = '#e9f3f5';
    g.beginPath(); g.arc(head.x, head.y, px(6), 0, 7); g.fill();
    g.strokeStyle = 'rgba(233,243,245,.5)'; g.lineWidth = px(1.5);
    g.beginPath(); g.arc(head.x, head.y, px(13), 0, 7); g.stroke();
    if (Math.random() < 0.3) sound.noise(0.05, 0.03, 1200 + Math.random() * 600);
  }
  g.restore();
  if (S.cutT >= 1) finishCut();
}
function drawGhost(g, dt) {
  S.ghost += dt / 2.4;
  g.save();
  g.translate(view.ox, view.oy); g.scale(view.s, view.s);
  const t = clamp(S.ghost, 0, 1);
  setPath(g, S.target);
  g.strokeStyle = `rgba(53,214,204,${0.35 + 0.5 * Math.min(1, t * 2)})`;
  g.lineWidth = px(3); g.setLineDash([px(8), px(6)]); g.lineDashOffset = -S.ghost * 40; g.stroke(); g.setLineDash([]);
  const feat = P.targetFeatures(S.target);
  for (const f of feat.corners.concat(feat.extremes)) {
    g.beginPath(); g.arc(f.x, f.y, px(6), 0, 7);
    g.fillStyle = 'rgba(53,214,204,.9)'; g.fill();
  }
  g.restore();
  if (S.ghost > 1.6) { S.ghost = 0; S.phase = 'result'; $('#result').hidden = false; }
}
function loupeSpot(fx, fy) {
  // park it in the corner furthest from the finger, so it never covers the curve
  const w = window.innerWidth, h = window.innerHeight, r = LOUPE_R, m = 12;
  const xs = [clamp(view.padL + r + m, r + m, w - r - m), clamp(w - view.padR - r - m, r + m, w - r - m)];
  const ys = [clamp(view.padT + r + m, r + m, h - r - m), clamp(h - view.padB - r - m, r + m, h - r - m)];
  let best = null;
  for (const x of xs) for (const y of ys) {
    const d = Math.hypot(x - fx, y - fy);
    if (!best || d > best.d) best = { x, y, d };
  }
  return best;
}
const LOUPE_R = 62;
function drawLoupe(g) {
  if (!isTouch || !loupeOn || !S.pointerDown || !S.pointerPt) return;
  const r = LOUPE_R;
  const fx = view.ox + S.pointerPt.x * view.s, fy = view.oy + S.pointerPt.y * view.s;
  const spot = loupeSpot(fx, fy);
  const cx = spot.x, cy = spot.y;
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, 7); g.clip();
  g.fillStyle = '#0d1215'; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.translate(cx, cy); g.scale(2, 2); g.translate(-cx, -cy);
  g.translate(cx - fx, cy - fy);
  drawTarget(g, false);
  drawUserPath(g);
  g.restore();
  g.beginPath(); g.arc(cx, cy, r, 0, 7);
  g.strokeStyle = 'rgba(233,243,245,.5)'; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.moveTo(cx - 8, cy); g.lineTo(cx + 8, cy); g.moveTo(cx, cy - 8); g.lineTo(cx, cy + 8);
  g.strokeStyle = 'rgba(255,174,31,.8)'; g.lineWidth = 1; g.stroke();
  const ang = Math.atan2(fy - cy, fx - cx);
  g.beginPath();
  g.moveTo(cx + Math.cos(ang) * (r + 4), cy + Math.sin(ang) * (r + 4));
  g.lineTo(fx - Math.cos(ang) * 16, fy - Math.sin(ang) * 16);
  g.strokeStyle = 'rgba(233,243,245,.18)'; g.lineWidth = 1; g.setLineDash([4, 5]); g.stroke(); g.setLineDash([]);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.snapFlash > 0) S.snapFlash -= dt;
  const g = ctx;
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawMat(g);
  if (S.phase === 'menu' && !S.job) {
    // idle: show the first job's shape behind the menu
    S.target = JOBS[0].target;
    drawTarget(g);
    return;
  }
  drawTarget(g);
  if (S.phase === 'cut') { drawCut(g, dt); return; }
  if (S.phase === 'ghost') { drawUserPath(g); drawGhost(g, dt); return; }
  if (S.phase === 'result' && S.res) {
    g.save(); g.translate(view.ox, view.oy); g.scale(view.s, view.s);
    strokeLit(g, S.cutPoly, S.cutDev, S.cutPoly.length, true);
    g.restore();
    return;
  }
  drawUserPath(g);
  drawLoupe(g);
}

// ---------------------------------------------------------------- boot
if (/[?&]debug=1/.test(location.search)) {
  window.__neon = { S, P, JOBS: () => JOBS, view: () => view, toScreen: (p) => ({ x: view.ox + p.x * view.s, y: view.oy + p.y * view.s }), loadJob, submit };
}
setTool('pen');
S.job = null;
openMenu();
$('#menuSub').textContent = isTouch
  ? 'Pen tool designer. Tap to place a corner, tap and drag to curve. The two buttons at the bottom stand in for the Alt and Shift keys you would use in Illustrator.'
  : 'Pen tool designer. Bulb Row is open: five jobs, from straight corners to your first curves. Every key here is the key Illustrator uses.';
requestAnimationFrame(frame);
})();

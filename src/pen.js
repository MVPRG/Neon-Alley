// Neon Alley: pen tool engine. Path model, bezier math and scoring.
// No DOM in this file, so it can be tested outside a browser.
(function (G) {
'use strict';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- path model
// anchor: { x, y, in: {x,y}|null, out: {x,y}|null }   handles are offsets from the anchor
function anchor(x, y, ih, oh) { return { x, y, in: ih || null, out: oh || null }; }
function newPath() { return { closed: false, anchors: [] }; }
function clonePath(p) {
  return { closed: p.closed, anchors: p.anchors.map((a) => ({ x: a.x, y: a.y, in: a.in ? { x: a.in.x, y: a.in.y } : null, out: a.out ? { x: a.out.x, y: a.out.y } : null })) };
}
const inPoint = (a) => (a.in ? { x: a.x + a.in.x, y: a.y + a.in.y } : { x: a.x, y: a.y });
const outPoint = (a) => (a.out ? { x: a.x + a.out.x, y: a.y + a.out.y } : { x: a.x, y: a.y });

function segments(p) {
  const out = [], n = p.anchors.length;
  if (n < 2) return out;
  const last = p.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = p.anchors[i], b = p.anchors[(i + 1) % n];
    out.push({ i, a, b, p0: { x: a.x, y: a.y }, c1: outPoint(a), c2: inPoint(b), p1: { x: b.x, y: b.y } });
  }
  return out;
}
function cubicAt(s, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * s.p0.x + b * s.c1.x + c * s.c2.x + d * s.p1.x, y: a * s.p0.y + b * s.c1.y + c * s.c2.y + d * s.p1.y };
}
function cubicTangent(s, t) {
  const u = 1 - t;
  const x = 3 * u * u * (s.c1.x - s.p0.x) + 6 * u * t * (s.c2.x - s.c1.x) + 3 * t * t * (s.p1.x - s.c2.x);
  const y = 3 * u * u * (s.c1.y - s.p0.y) + 6 * u * t * (s.c2.y - s.c1.y) + 3 * t * t * (s.p1.y - s.c2.y);
  return { x, y };
}
function segSteps(s) {
  const rough = dist(s.p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p1);
  return clamp(Math.ceil(rough / 4), 6, 90);
}
// polyline of the whole path, with which segment each point came from
function flatten(p) {
  const pts = [], segs = segments(p);
  if (!segs.length) return p.anchors.length === 1 ? [{ x: p.anchors[0].x, y: p.anchors[0].y, seg: 0, t: 0 }] : pts;
  for (const s of segs) {
    const steps = segSteps(s);
    for (let k = 0; k < steps; k++) { const t = k / steps, q = cubicAt(s, t); q.seg = s.i; q.t = t; pts.push(q); }
  }
  const lastSeg = segs[segs.length - 1];
  const end = cubicAt(lastSeg, 1); end.seg = lastSeg.i; end.t = 1; pts.push(end);
  return pts;
}
function pathLength(poly) {
  let L = 0;
  for (let i = 1; i < poly.length; i++) L += dist(poly[i - 1], poly[i]);
  return L;
}
// even spacing along the polyline, for fair comparison between two shapes
function resample(poly, spacing) {
  if (poly.length < 2) return poly.slice();
  const out = [poly[0]];
  let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    let segLen = dist(poly[i - 1], poly[i]);
    if (segLen < 1e-9) continue;
    let pos = spacing - carry;
    while (pos <= segLen) {
      const u = pos / segLen;
      out.push({ x: poly[i - 1].x + (poly[i].x - poly[i - 1].x) * u, y: poly[i - 1].y + (poly[i].y - poly[i - 1].y) * u, seg: poly[i].seg, t: poly[i].t });
      pos += spacing;
    }
    carry = segLen - (pos - spacing);
  }
  return out;
}
function distToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2 : 0;
  t = clamp(t, 0, 1);
  const dx = a.x + vx * t - p.x, dy = a.y + vy * t - p.y;
  return Math.hypot(dx, dy);
}
// grid index so the scoring pass stays fast on long paths
function buildIndex(poly, cell) {
  cell = cell || 40;
  const map = new Map();
  const key = (cx, cy) => cx + ',' + cy;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i];
    const x0 = Math.floor(Math.min(a.x, b.x) / cell), x1 = Math.floor(Math.max(a.x, b.x) / cell);
    const y0 = Math.floor(Math.min(a.y, b.y) / cell), y1 = Math.floor(Math.max(a.y, b.y) / cell);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = key(cx, cy);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
  }
  return { poly, cell, map };
}
function nearestDist(idx, p) {
  const { poly, cell, map } = idx;
  const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
  let best = Infinity;
  for (let ring = 0; ring < 40; ring++) {
    for (let x = cx - ring; x <= cx + ring; x++) for (let y = cy - ring; y <= cy + ring; y++) {
      if (ring > 0 && Math.abs(x - cx) !== ring && Math.abs(y - cy) !== ring) continue;
      const list = map.get(x + ',' + y);
      if (!list) continue;
      for (const i of list) { const d = distToSegment(p, poly[i - 1], poly[i]); if (d < best) best = d; }
    }
    // a segment in an unscanned ring is at least ring*cell away, so this is safe
    if (best <= ring * cell) break;
  }
  if (best === Infinity) for (let i = 1; i < poly.length; i++) best = Math.min(best, distToSegment(p, poly[i - 1], poly[i]));
  return best;
}

// ---------------------------------------------------------------- anchor geometry
const handleAngle = (h) => Math.atan2(h.y, h.x);
function anchorKink(a) {
  // how far the two handles are from lying in a straight line, in degrees
  if (!a.in || !a.out) return null;
  const ain = handleAngle(a.in), aout = handleAngle(a.out);
  let d = Math.abs(ain - aout) % TAU;
  if (d > Math.PI) d = TAU - d;
  return Math.abs(180 - (d * 180) / Math.PI);
}
function isCorner(a, tolDeg) {
  const k = anchorKink(a);
  if (k === null) return true;           // a missing handle is a corner
  return k > (tolDeg == null ? 20 : tolDeg);
}
function splitSegment(s, t) {
  // de Casteljau: the two control points each side of a new anchor
  const lerpP = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const p01 = lerpP(s.p0, s.c1, t), p12 = lerpP(s.c1, s.c2, t), p23 = lerpP(s.c2, s.p1, t);
  const p012 = lerpP(p01, p12, t), p123 = lerpP(p12, p23, t);
  const mid = lerpP(p012, p123, t);
  return { left: { c1: p01, c2: p012 }, mid, right: { c1: p123, c2: p23 } };
}
function nearestOnPath(p, pt) {
  let best = null;
  for (const s of segments(p)) {
    const steps = segSteps(s);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, q = cubicAt(s, t), d = dist(q, pt);
      if (!best || d < best.d) best = { d, seg: s, t, point: q };
    }
  }
  return best;
}
function bbox(p) {
  const poly = flatten(p);
  if (!poly.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of poly) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------- scoring
const TOL = { clean: 2, pass: 6, spike: 14, corner: 14, extreme: 14, kinkDeg: 20 };

function targetFeatures(target) {
  const corners = [], extremes = [];
  const n = target.anchors.length;
  target.anchors.forEach((a, i) => {
    if (!target.closed && (i === 0 || i === n - 1)) return; // loose ends of an open path
    (isCorner(a, TOL.kinkDeg) ? corners : extremes).push({ i, x: a.x, y: a.y });
  });
  return { corners, extremes };
}

function score(user, job) {
  const target = job.target;
  const res = {
    ok: false, stars: 0, anchors: user.anchors.length, par: job.par,
    fit: { p95: Infinity, max: Infinity, clean: false, pass: false },
    faults: [], hits: { extremes: 0, extremesTotal: 0, corners: 0, cornersTotal: 0 },
    deviations: [],
  };
  if (user.anchors.length < 2) { res.faults.push({ code: 'empty', weight: 100 }); return res; }
  if (job.closed && !user.closed) res.faults.push({ code: 'open', weight: 90 });

  const uPoly = flatten(user), tPoly = flatten(target);
  if (uPoly.length < 2 || tPoly.length < 2) { res.faults.push({ code: 'empty', weight: 100 }); return res; }
  const uSamp = resample(uPoly, 3), tSamp = resample(tPoly, 3);
  const uIdx = buildIndex(uPoly), tIdx = buildIndex(tPoly);

  const dev = [];
  for (const q of uSamp) { const d = nearestDist(tIdx, q); dev.push(d); res.deviations.push({ x: q.x, y: q.y, d }); }
  for (const q of tSamp) dev.push(nearestDist(uIdx, q));
  dev.sort((a, b) => a - b);
  res.fit.p95 = dev[Math.floor(dev.length * 0.95)] || 0;
  res.fit.max = dev[dev.length - 1] || 0;
  res.fit.mean = dev.reduce((s, d) => s + d, 0) / dev.length;
  res.fit.clean = res.fit.p95 <= TOL.clean && res.fit.max <= TOL.pass;
  res.fit.pass = res.fit.p95 <= TOL.pass && res.fit.max <= TOL.spike;
  if (!res.fit.pass) res.faults.push({ code: 'shape', weight: 80, value: Math.round(res.fit.p95) });

  const feat = targetFeatures(target);
  res.hits.cornersTotal = feat.corners.length;
  res.hits.extremesTotal = feat.extremes.length;

  // every sharp corner in the design needs a sharp anchor near it
  for (const c of feat.corners) {
    let near = null;
    for (const a of user.anchors) { const d = dist(a, c); if (d <= TOL.corner && (!near || d < near.d)) near = { a, d }; }
    if (!near) res.faults.push({ code: 'missing_corner', weight: 60, at: c });
    else if (!isCorner(near.a, TOL.kinkDeg)) res.faults.push({ code: 'rounded_corner', weight: 58, at: c });
    else res.hits.corners++;
  }
  // a kink where the design is round
  user.anchors.forEach((a, ui) => {
    if (!user.closed && (ui === 0 || ui === user.anchors.length - 1)) return;
    const k = anchorKink(a);
    if (k === null || k <= TOL.kinkDeg) return;
    const nearCorner = feat.corners.some((c) => dist(a, c) <= TOL.corner);
    if (!nearCorner) res.faults.push({ code: 'kink', weight: 50, at: { x: a.x, y: a.y } });
  });
  // anchors sitting where the curve turns
  for (const e of feat.extremes) if (user.anchors.some((a) => dist(a, e) <= TOL.extreme)) res.hits.extremes++;
  if (res.hits.extremesTotal && res.hits.extremes / res.hits.extremesTotal < 0.5 && res.fit.pass) {
    res.faults.push({ code: 'off_extremes', weight: 30 });
  }
  // point count
  if (user.anchors.length > job.par) {
    res.faults.push({ code: 'over_par', weight: user.anchors.length > job.par + 1 ? 40 : 20, value: user.anchors.length - job.par });
  }
  // handle length against the span it has to cover
  let longH = 0, shortH = 0;
  for (const s of segments(user)) {
    const chord = dist(s.p0, s.p1);
    if (chord < 1) continue;
    const l1 = dist(s.p0, s.c1) / chord, l2 = dist(s.p1, s.c2) / chord;
    for (const r of [l1, l2]) {
      if (r > 0.82) longH++;
      else if (r > 0 && r < 0.09) shortH++;
    }
  }
  if (longH) res.faults.push({ code: 'long_handle', weight: 25, value: longH });
  if (shortH) res.faults.push({ code: 'short_handle', weight: 22, value: shortH });

  const has = (c) => res.faults.some((f) => f.code === c);
  const closedOk = !job.closed || user.closed;
  if (res.fit.pass && closedOk) {
    res.ok = true;
    res.stars = 1;
    if (user.anchors.length <= job.par + 1) res.stars = 2;
    if (user.anchors.length <= job.par && res.fit.clean && !has('kink') && !has('rounded_corner') && !has('missing_corner') && !has('long_handle')) res.stars = 3;
  }
  res.faults.sort((a, b) => b.weight - a.weight);
  return res;
}

// one blunt sentence about the worst thing, in Hilda's voice
const LINES = {
  empty: () => 'There is nothing on the mat. Click to place a point, drag to curve it.',
  open: () => 'That path is open. I cut solid shapes, not scribbles. Close it on your first point.',
  shape: (f) => `That is not the shape. You are off by about ${f.value} in places. Follow the tube.`,
  missing_corner: () => 'You missed a corner. Sharp turns need their own point.',
  rounded_corner: () => 'You rounded off a corner that has to be sharp. Alt-drag that handle in, or retract it.',
  kink: () => 'There is a kink where the sign is round. Those two handles have to line up.',
  over_par: (f, job) => `Too many points. ${job.par + f.value} where ${job.par} would do. Every extra one costs me money.`,
  long_handle: () => 'Your handles are too long, so the curve bulges past the point. About a third of the gap is plenty.',
  short_handle: () => 'Handles that short flatten the curve. Pull them out to about a third of the gap.',
  off_extremes: () => 'Put your points where the curve turns: top, bottom, left, right. Not partway around.',
};
const PRAISE = [
  'Clean. That is how it is done.',
  'Not one wasted point. Good.',
  'The tube lit first time. Nice work.',
  'I have cut worse from people who charge more.',
];
function critique(res, job) {
  if (!res.faults.length) return PRAISE[Math.floor(Math.random() * PRAISE.length)];
  const f = res.faults[0];
  const fn = LINES[f.code];
  return fn ? fn(f, job) : 'Something is off with that path.';
}

// ---------------------------------------------------------------- svg in and out
function svgToPath(d) {
  const nums = [];
  const toks = String(d).match(/[MmLlHhVvCcSsQqTtZzAa]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  let i = 0, cur = { x: 0, y: 0 }, start = { x: 0, y: 0 }, cmd = '', prevC2 = null;
  const path = newPath();
  const num = () => parseFloat(toks[i++]);
  const push = (x, y) => { path.anchors.push(anchor(x, y)); };
  const lastA = () => path.anchors[path.anchors.length - 1];
  const setOut = (px, py) => { const a = lastA(); a.out = { x: px - a.x, y: py - a.y }; };
  const setIn = (px, py) => { const a = lastA(); a.in = { x: px - a.x, y: py - a.y }; };
  while (i < toks.length) {
    const tk = toks[i];
    if (/[a-z]/i.test(tk)) { cmd = tk; i++; } else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      const x = num() + (rel ? cur.x : 0), y = num() + (rel ? cur.y : 0);
      push(x, y); cur = { x, y }; start = { x, y }; cmd = rel ? 'l' : 'L'; prevC2 = null;
    } else if (C === 'L') {
      const x = num() + (rel ? cur.x : 0), y = num() + (rel ? cur.y : 0);
      push(x, y); cur = { x, y }; prevC2 = null;
    } else if (C === 'H') { const x = num() + (rel ? cur.x : 0); push(x, cur.y); cur = { x, y: cur.y }; prevC2 = null; }
    else if (C === 'V') { const y = num() + (rel ? cur.y : 0); push(cur.x, y); cur = { x: cur.x, y }; prevC2 = null; }
    else if (C === 'C' || C === 'S') {
      let c1;
      if (C === 'C') c1 = { x: num() + (rel ? cur.x : 0), y: num() + (rel ? cur.y : 0) };
      else c1 = prevC2 ? { x: 2 * cur.x - prevC2.x, y: 2 * cur.y - prevC2.y } : { x: cur.x, y: cur.y };
      const c2 = { x: num() + (rel ? cur.x : 0), y: num() + (rel ? cur.y : 0) };
      const p = { x: num() + (rel ? cur.x : 0), y: num() + (rel ? cur.y : 0) };
      setOut(c1.x, c1.y);
      push(p.x, p.y);
      setIn(c2.x, c2.y);
      cur = p; prevC2 = c2;
    } else if (C === 'Z') {
      path.closed = true;
      // a Z back onto the first point leaves a duplicate anchor behind
      const a = lastA(), f = path.anchors[0];
      if (a && f && path.anchors.length > 1 && dist(a, f) < 0.6) {
        if (a.in) f.in = { x: a.in.x + a.x - f.x, y: a.in.y + a.y - f.y };
        path.anchors.pop();
      }
      cur = { x: start.x, y: start.y }; prevC2 = null; i++;
      continue;
    } else if (C === 'Q' || C === 'T' || C === 'A') {
      return { error: C === 'A' ? 'Arc commands (A) are not supported. In Illustrator, the pen tool never makes them.' : 'Quadratic curves (Q, T) are not supported. Export from Illustrator and they will be cubic.' };
    } else { i++; continue; }
  }
  if (path.anchors.length < 2) return { error: 'That path has fewer than two points.' };
  return { path };
}
function pathToSvg(p, digits) {
  const r = (v) => (+v.toFixed(digits == null ? 1 : digits));
  if (!p.anchors.length) return '';
  let d = `M ${r(p.anchors[0].x)} ${r(p.anchors[0].y)}`;
  for (const s of segments(p)) d += ` C ${r(s.c1.x)} ${r(s.c1.y)} ${r(s.c2.x)} ${r(s.c2.y)} ${r(s.p1.x)} ${r(s.p1.y)}`;
  if (p.closed) d += ' Z';
  return d;
}
function fitPathTo(p, box, pad) {
  const b = bbox(p);
  if (!b || !b.w || !b.h) return p;
  pad = pad == null ? 60 : pad;
  const s = Math.min((box.w - pad * 2) / b.w, (box.h - pad * 2) / b.h);
  const ox = box.x + (box.w - b.w * s) / 2 - b.minX * s, oy = box.y + (box.h - b.h * s) / 2 - b.minY * s;
  const out = clonePath(p);
  for (const a of out.anchors) {
    a.x = a.x * s + ox; a.y = a.y * s + oy;
    if (a.in) { a.in.x *= s; a.in.y *= s; }
    if (a.out) { a.out.x *= s; a.out.y *= s; }
  }
  return out;
}

G.PEN = {
  anchor, newPath, clonePath, segments, cubicAt, cubicTangent, flatten, resample, pathLength,
  inPoint, outPoint, anchorKink, isCorner, splitSegment, nearestOnPath, bbox, buildIndex, nearestDist,
  distToSegment, score, critique, targetFeatures, svgToPath, pathToSvg, fitPathTo, dist, clamp, TOL,
};
})(typeof window !== 'undefined' ? window : globalThis);

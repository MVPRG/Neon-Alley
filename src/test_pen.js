require('./src/pen.js'); require('./src/jobs.js');
const P = globalThis.PEN, JOBS = globalThis.JOBS;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL:', msg); } };

for (const job of JOBS) {
  // the target itself must be a perfect job
  const r = P.score(P.clonePath(job.target), job);
  ok(r.stars === 3, `${job.id}: target should be 3 stars, got ${r.stars} faults=${JSON.stringify(r.faults)}`);
  ok(r.fit.p95 < 0.01, `${job.id}: target fit p95 ${r.fit.p95}`);
  const feat = P.targetFeatures(job.target);
  console.log(job.id.padEnd(9), 'par', job.par, 'corners', feat.corners.length, 'extremes', feat.extremes.length,
    '| stars', r.stars, 'p95', r.fit.p95.toFixed(2), '| crit:', P.critique(r, job));

  // same shape, extra points on every segment: should still fit but lose stars
  const segs = P.segments(job.target);
  const n0 = job.target.anchors.length;
  const extra = { closed: job.target.closed, anchors: job.target.anchors.map(a => P.anchor(a.x, a.y, a.in && {x:a.in.x,y:a.in.y}, a.out && {x:a.out.x,y:a.out.y})) };
  const mids = [];
  segs.forEach((s2, si) => {
    const sp = P.splitSegment(s2, 0.5);
    const A = extra.anchors[si], B = extra.anchors[(si + 1) % n0];
    A.out = { x: sp.left.c1.x - A.x, y: sp.left.c1.y - A.y };
    B.in = { x: sp.right.c2.x - B.x, y: sp.right.c2.y - B.y };
    mids.push({ after: si, a: P.anchor(sp.mid.x, sp.mid.y, { x: sp.left.c2.x - sp.mid.x, y: sp.left.c2.y - sp.mid.y }, { x: sp.right.c1.x - sp.mid.x, y: sp.right.c1.y - sp.mid.y }) });
  });
  for (let m = mids.length - 1; m >= 0; m--) extra.anchors.splice(mids[m].after + 1, 0, mids[m].a);
  const rd = P.score(extra, job);
  ok(rd.fit.pass, `${job.id}: doubled path should still fit (p95 ${rd.fit.p95.toFixed(2)} max ${rd.fit.max.toFixed(2)})`);
  ok(rd.stars <= 2, `${job.id}: doubled path should lose a star, got ${rd.stars}`);
  ok(rd.faults.some(f => f.code === 'over_par'), `${job.id}: doubled path should be over par`);

  // jittered: should fail the shape check
  const jit = P.clonePath(job.target);
  jit.anchors.forEach((a, i) => { a.x += (i % 2 ? 14 : -14); a.y += (i % 3 ? 12 : -12); });
  const rj = P.score(jit, job);
  ok(!rj.fit.clean, `${job.id}: jittered path should not be clean`);

  // svg round trip
  const d = P.pathToSvg(job.target, 3);
  const back = P.svgToPath(d);
  ok(!back.error, `${job.id}: svg parse error ${back.error}`);
  if (!back.error) {
    const rr = P.score(back.path, job);
    ok(rr.stars === 3, `${job.id}: svg round trip lost stars (${rr.stars}) ${JSON.stringify(rr.faults)}`);
    ok(back.path.anchors.length === job.target.anchors.length, `${job.id}: svg round trip anchor count ${back.path.anchors.length} vs ${job.target.anchors.length}`);
  }
}

// an open path on a closed job
const openJob = JOBS[0];
const openPath = P.clonePath(openJob.target); openPath.closed = false;
const ro = P.score(openPath, openJob);
ok(ro.faults.some(f => f.code === 'open'), 'open path should be flagged');
ok(ro.stars === 0, 'open path gets no stars');

// a circle drawn with a kink at the top
const kinked = P.clonePath(JOBS[2].target);
kinked.anchors[0].out = { x: 60, y: 40 };
const rk = P.score(kinked, JOBS[2]);
ok(rk.faults.some(f => f.code === 'kink'), 'kink should be detected');
ok(rk.stars <= 2, 'kinked circle should not be 3 stars');

// a crescent drawn with rounded tips
const rounded = P.clonePath(JOBS[3].target);
rounded.anchors[0].in = { x: -40, y: -32 };
const rr2 = P.score(rounded, JOBS[3]);
ok(rr2.faults.some(f => f.code === 'rounded_corner' || f.code === 'shape'), 'rounded tip should be caught');

// speed
const t0 = Date.now();
for (let i = 0; i < 50; i++) P.score(P.clonePath(JOBS[4].target), JOBS[4]);
console.log('scoring time per submit:', ((Date.now() - t0) / 50).toFixed(1), 'ms');
console.log(fails ? `\n${fails} FAILURES` : '\nall checks passed');
process.exit(fails ? 1 : 0);

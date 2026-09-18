// Neon Alley: shape data. The mat is 1000 x 700 units.
(function (G) {
'use strict';
const P = G.PEN;
const K = 0.5522847498; // circle-to-bezier constant

const corner = (x, y) => P.anchor(x, y);
const smooth = (x, y, hx, hy) => P.anchor(x, y, { x: -hx, y: -hy }, { x: hx, y: hy });
const cusp = (x, y, ix, iy, ox, oy) => P.anchor(x, y, { x: ix, y: iy }, { x: ox, y: oy });
const polygon = (pts, closed) => ({ closed: closed !== false, anchors: pts.map(([x, y]) => corner(x, y)) });

function ellipse(cx, cy, rx, ry) {
  return {
    closed: true,
    anchors: [
      smooth(cx, cy - ry, rx * K, 0),
      smooth(cx + rx, cy, 0, ry * K),
      smooth(cx, cy + ry, -rx * K, 0),
      smooth(cx - rx, cy, 0, -ry * K),
    ],
  };
}

// anchors along an ellipse at the given angles, with handles that make true arcs
const rad = (d) => (d * Math.PI) / 180;
function arcAnchors(cx, cy, rx, ry, degrees) {
  const pt = (a) => ({ x: cx + rx * Math.cos(rad(a)), y: cy + ry * Math.sin(rad(a)) });
  const tan = (a) => ({ x: -rx * Math.sin(rad(a)), y: ry * Math.cos(rad(a)) });
  const kOf = (spanDeg) => (4 / 3) * Math.tan(rad(spanDeg) / 4);
  const out = [];
  for (let i = 0; i < degrees.length; i++) {
    const a = degrees[i], p = pt(a), t = tan(a);
    const prev = i > 0 ? degrees[i - 1] : null, next = i < degrees.length - 1 ? degrees[i + 1] : null;
    const hIn = prev == null ? null : { x: -t.x * kOf(a - prev), y: -t.y * kOf(a - prev) };
    const hOut = next == null ? null : { x: t.x * kOf(next - a), y: t.y * kOf(next - a) };
    out.push(P.anchor(p.x, p.y, hIn, hOut));
  }
  return out;
}
// a letter-style ring: outer arc out, flat terminal, inner arc back
function ringLetter(cx, cy, rx, ry, irx, iry, startDeg, endDeg, steps) {
  const span = endDeg - startDeg;
  const degs = [startDeg];
  for (let i = 1; i < steps; i++) {
    const d = startDeg + (span * i) / steps;
    degs.push(Math.round(d / 90) * 90 > startDeg && Math.round(d / 90) * 90 < endDeg ? Math.round(d / 90) * 90 : d);
  }
  degs.push(endDeg);
  const outer = arcAnchors(cx, cy, rx, ry, degs);
  const inner = arcAnchors(cx, cy, irx, iry, degs.slice().reverse());
  outer[0].in = null; outer[outer.length - 1].out = null;
  inner[0].in = null; inner[inner.length - 1].out = null;
  return { closed: true, anchors: outer.concat(inner) };
}

const JOBS = [
  // ---------------------------------------------------------------- Bulb Row
  {
    id: 'arrow', shop: 'Bulb Row', n: 1, name: 'Arrow sign', customer: 'Dee, at the tyre shop',
    brief: 'Points at my door. All straight lines, no curves.',
    teaches: 'Click once per corner. No dragging.',
    tip: 'Click, do not drag. Every click drops a corner point. Finish on the point you started from.',
    par: 7, closed: true, hints: 'full',
    target: polygon([[340, 265], [560, 265], [560, 185], [730, 350], [560, 515], [560, 435], [340, 435]]),
  },
  {
    id: 'pennant', shop: 'Bulb Row', n: 2, name: 'Pennant', customer: 'The school, for sports day',
    brief: 'A flag shape. Four corners, and it has to close up.',
    teaches: 'Closing a path on the first point.',
    tip: 'Your last click lands on the first point. The cursor shows a small circle when you are over it.',
    par: 4, closed: true, hints: 'full',
    target: polygon([[360, 200], [690, 275], [690, 425], [360, 500]]),
  },
  {
    id: 'moon', shop: 'Bulb Row', n: 3, name: 'Full moon', customer: 'The all-night diner',
    brief: 'A perfect round moon. Four points, no more.',
    teaches: 'Click and drag makes a curve. Points at top, bottom, left and right.',
    tip: 'Click and drag: the direction you drag is the direction the curve leaves the point. Four points, one at each side of the circle.',
    par: 4, closed: true, hints: 'full',
    target: ellipse(500, 350, 185, 185),
  },
  {
    id: 'crescent', shop: 'Bulb Row', n: 4, name: 'Crescent', customer: 'The same diner, for the window',
    brief: 'Same moon, eaten into. Two sharp tips, two round sides.',
    teaches: 'Sharp points and curved points in one path.',
    tip: 'The two tips are corners: click them, do not drag. The two sides are curves: drag them.',
    par: 4, closed: true, hints: 'fade',
    target: {
      closed: true,
      anchors: [
        cusp(575, 195, -40, 38, -78, -62),
        smooth(330, 350, 0, 128),
        cusp(575, 505, -78, 62, -40, -38),
        smooth(452, 350, 0, -60),
      ],
    },
  },
  {
    id: 'arch', shop: 'Bulb Row', n: 5, name: 'Arch sign', customer: 'Nadia, the bakery',
    brief: 'Straight sides, round top. And I may change my mind about the height.',
    teaches: 'Straight into curved, then editing a path you already drew.',
    tip: 'Corners at the two bottom points. The three around the arch are drags. Press A to move points afterwards.',
    par: 5, closed: true, hints: 'fade',
    target: {
      closed: true,
      anchors: [corner(350, 520), corner(650, 520), smooth(650, 330, 0, -83), smooth(500, 180, -83, 0), smooth(350, 330, 0, 83)],
    },
    mutate: {
      brief: 'Taller. Push the arch up and pull the sides in a little.',
      line: 'Changed my mind. Taller and narrower. Do not start again, just move the points.',
      par: 5,
      target: {
        closed: true,
        anchors: [corner(390, 520), corner(610, 520), smooth(610, 300, 0, -66), smooth(500, 180, -61, 0), smooth(390, 300, 0, 66)],
      },
    },
  },

  // ---------------------------------------------------------------- Decal Depot
  {
    id: 'teardrop', shop: 'Decal Depot', n: 6, name: 'Teardrop', customer: 'Marco, the plumber',
    brief: 'A drop of water. Sharp at the top, fat at the bottom. Three points.',
    teaches: 'Alt-drag to break a handle, so a curve can end in a point.',
    tip: 'Drag the two side points as normal curves. At the tip, hold Alt (Break on a tablet) and drag the handle so the two sides meet in a point.',
    par: 3, closed: true, hints: 'fade',
    target: {
      closed: true,
      anchors: [
        cusp(500, 150, 62, 150, -62, 150),
        smooth(330, 400, 0, 150),
        smooth(670, 400, 0, -150),
      ],
    },
  },
  {
    id: 'wave', shop: 'Decal Depot', n: 7, name: 'Ocean wave', customer: 'The surf shop',
    brief: 'One long wave across the window. Leave it open, no closing it up.',
    teaches: 'A chain of smooth curves, and an open path.',
    tip: 'Four drags, left to right, all horizontal. Do not close this one: press Esc when the last point is down.',
    par: 4, closed: false, hints: 'fade',
    target: {
      closed: false,
      anchors: [smooth(170, 420, 110, 0), smooth(390, 250, 110, 0), smooth(610, 470, 110, 0), smooth(830, 300, 110, 0)],
    },
  },
  {
    id: 'awning', shop: 'Decal Depot', n: 8, name: 'Awning', customer: 'The barber, two doors down',
    brief: 'Over my window. The sides slope at forty-five degrees, exactly.',
    teaches: 'Shift constrains to 45 degrees.',
    tip: 'Hold Shift (Straight on a tablet) while you place the sloped corners. The bottom is two scallops meeting in a point.',
    par: 5, closed: true, hints: 'fade',
    target: {
      closed: true,
      anchors: [
        corner(330, 210),
        corner(670, 210),
        cusp(790, 330, 0, 0, -60, 85),
        cusp(500, 345, 90, 85, -90, 85),
        cusp(210, 330, 60, 85, 0, 0),
      ],
    },
  },
  {
    id: 'leaf', shop: 'Decal Depot', n: 9, name: 'Leaf', customer: 'The garden centre',
    brief: 'A leaf on the diagonal. Pointed at both ends.',
    teaches: 'Two broken handles in one shape.',
    tip: 'Both tips are points where two curves meet. Drag, then Alt-drag the handle at each tip to break it.',
    par: 4, closed: true, hints: 'fade',
    target: {
      closed: true,
      anchors: [
        cusp(270, 545, -85, 60, 85, -60),
        smooth(460, 245, 150, -60),
        cusp(750, 195, 85, -60, -85, 60),
        smooth(560, 495, -150, 60),
      ],
    },
  },
  {
    id: 'shield', shop: 'Decal Depot', n: 10, name: 'Shield badge', customer: 'The football club',
    brief: 'A badge. Flat across the top, point at the bottom. We may want it arched later.',
    teaches: 'A point that has to change afterwards.',
    tip: 'Corners at the top two and at the bottom point. The two sides are drags with vertical handles.',
    par: 5, closed: true, hints: 'fade',
    target: {
      closed: true,
      anchors: [corner(330, 180), corner(670, 180), smooth(690, 360, 0, 60), cusp(500, 560, 95, 60, -95, -60), smooth(310, 360, 0, -60)],
    },
    mutate: {
      brief: 'Arch the top edge. Add a point in the middle of it and pull it up.',
      line: 'The committee wants the top arched. Add one point to that edge and lift it. Do not redraw it.',
      par: 6,
      target: {
        closed: true,
        anchors: [
          corner(330, 190), smooth(500, 120, 90, 0), corner(670, 190),
          smooth(690, 360, 0, 60), cusp(500, 560, 95, 60, -95, -60), smooth(310, 360, 0, -60),
        ],
      },
    },
  },

  // ---------------------------------------------------------------- Letterpress Lane
  {
    id: 'letterC', shop: 'Letterpress Lane', n: 11, name: 'Letter C', customer: 'The cinema, for the marquee',
    brief: 'A capital C, two inches of tube. Cut it clean.',
    teaches: 'The turning-point rule on a letterform.',
    tip: 'Points go where the curve turns: top, bottom, left. The two ends are flat cuts, so they are corners.',
    par: 10, closed: true, hints: 'fade',
    target: ringLetter(500, 350, 215, 245, 135, 160, 55, 305, 4),
  },
  {
    id: 'letterS', shop: 'Letterpress Lane', n: 12, name: 'Letter S', customer: 'The cinema again',
    brief: 'An S to match. One stroke, no closing it.',
    teaches: 'Keeping the tangent through a reversal.',
    tip: 'Four points. Where the S changes direction, the two handles must stay in a straight line or the letter kinks.',
    par: 4, closed: false, hints: 'fade',
    target: {
      closed: false,
      anchors: [
        cusp(660, 235, 0, 0, -105, -30),
        smooth(400, 250, 0, 105),
        smooth(600, 450, 0, 105),
        cusp(340, 465, -105, 30, 0, 0),
      ],
    },
  },
  {
    id: 'letterJ', shop: 'Letterpress Lane', n: 13, name: 'Letter J', customer: 'Jonas, the jeweller',
    brief: 'Just the J from my sign. Straight down, then the hook.',
    teaches: 'A straight line running into a curve without a kink.',
    tip: 'The point where the straight meets the hook needs its handle pointing straight up, along the line. Otherwise the tube bends where it should not.',
    par: 4, closed: false, hints: 'fade',
    target: {
      closed: false,
      anchors: [
        cusp(640, 170, 0, 0, 0, 40),
        smooth(640, 400, 0, 70),
        smooth(480, 530, -88, 0),
        cusp(330, 420, 0, 60, 0, 0),
      ],
    },
  },
  {
    id: 'flourish', shop: 'Letterpress Lane', n: 14, name: 'Ampersand flourish', customer: 'The wedding shop',
    brief: 'The swash off our ampersand. It has to flow, no flat spots.',
    teaches: 'A long path where every point has to sit at a turn.',
    tip: 'No markers on this one. Look for where the curve stops climbing and starts falling: that is where a point belongs, with its handles level.',
    par: 5, closed: false, hints: 'off',
    target: {
      closed: false,
      anchors: [
        cusp(180, 480, 0, 0, 75, -85),
        smooth(350, 320, 85, -50),
        smooth(560, 250, 100, 0),
        smooth(730, 400, 70, 0),
        cusp(880, 290, -55, 55, 0, 0),
      ],
    },
  },
  {
    id: 'bolt', shop: 'Letterpress Lane', n: 15, name: 'The Alley bolt', customer: 'Hilda, for the shop front',
    brief: 'Our own sign. Every corner sharp, and I am watching.',
    teaches: 'Precision corners with no markers and no snapping.',
    tip: 'Seven corners, no drags at all. Nothing snaps here, so place each one carefully. Zoom in with your eyes, not the mouse.',
    par: 7, closed: true, hints: 'off',
    target: {
      closed: true,
      anchors: [
        corner(560, 120),
        corner(330, 390),
        corner(470, 390),
        corner(380, 580),
        corner(700, 300),
        corner(545, 300),
        corner(645, 120),
      ],
    },
  },
];

const SHOPS = [
  { id: 'bulb', name: 'Bulb Row', blurb: 'Corners, closing a shape, and your first curves.' },
  { id: 'decal', name: 'Decal Depot', blurb: 'Broken handles, open paths, and editing what you drew.' },
  { id: 'letter', name: 'Letterpress Lane', blurb: 'Letterforms and logos, with the markers switched off.' },
];

G.JOBS = JOBS;
G.SHOPS = SHOPS;
G.SHAPES = { ellipse, polygon, corner, smooth, cusp, arcAnchors, ringLetter, K };
})(typeof window !== 'undefined' ? window : globalThis);

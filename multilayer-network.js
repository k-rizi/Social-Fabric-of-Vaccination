#!/usr/bin/env node

/**
 * Deterministic multilayer contact-network figure.
 *
 * Run with:
 *   node multilayer-network.js [optional-output.svg]
 *
 * The diagram is pure SVG: no filters, raster effects, fonts, or dependencies.
 *
 * Planes keep their original angles and placement. Everything drawn on a plane
 * is laid onto it in the same oblique perspective:
 *   - each clique's layout is sheared with the plane, so its rows and columns
 *     run parallel to the plane's edges
 *   - nodes are flat discs lying on the plane (circles seen in perspective)
 *   - family households are flat hexagons lying on the plane
 * Layer names sit under each plane, which frees the left margin.
 */

const fs = require("node:fs");
const path = require("node:path");

// Drawing coordinates are unchanged; the visible window starts at VIEW_X,
// which crops the empty strip that used to hold the labels.
const VIEW_X = 132;
const WIDTH = 1392;
const HEIGHT = 1004;

const PLANE = {
  backLeftX: 450,
  width: 1060,
  depthX: -300,
  depthY: 190,
  backY: [58, 295, 520, 762],
  // True width : depth of each plane. Sets how discs and hexagons are
  // foreshortened so they look like they lie on the plane.
  aspect: 3,
};

const COLORS = {
  background: "#FFFFFF",
  planeFill: "#F5F7FA",
  planeStroke: "#7D8795",
  edge: "#303845",
  projection: "#9CA6B5",
  red: "#EB5B55",
  blue: "#4D6FE8",
  purple: "#9272B2",
  nodeStroke: "#273142",
  title: "#111318",
  label: "#66707D",
};

const STYLE = {
  // 0 = the original drawing angles: level ellipses, cliques laid out upright.
  // 1 = fully laid onto the slanted plane: tilted discs, cliques sheared with the plane.
  // Values in between blend the two.
  perspective: 0.3,
  nodeRadius: 0.037, // disc radius in plane depth units, used as perspective approaches 1
  familyRadius: 0.06, // hexagon circumradius in plane depth units, used as perspective approaches 1
  focalRing: false, // flat ring on the plane around the two focal individuals
  colouredProjections: false, // true: household -> family lines blend member colour to household colour
};

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .toUpperCase();
}

function blend(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);

  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

const darken = (hex, t) => blend(hex, "#141922", t);

// Perceptual (OKLab) mixing: midpoints stay clear purples instead of muddy greys.
const toLinear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const toGamma = (c) =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hexToOklab(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return rgbToHex({
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  });
}

function blendOklab(hexA, hexB, t) {
  const a = hexToOklab(hexA);
  const b = hexToOklab(hexB);
  return oklabToHex(a.map((v, k) => v + (b[k] - v) * t));
}

// fractionBlue = 0   -> fully red
// fractionBlue = 0.5 -> equal red/blue mixture
// fractionBlue = 1   -> fully blue
const familyFractionColor = (fractionBlue) =>
  blendOklab(COLORS.red, COLORS.blue, fractionBlue);

function point(layer, screenX, v) {
  // Derive u as well so every node has an exact location in plane coordinates.
  const u =
    (screenX - PLANE.backLeftX - PLANE.depthX * v) /
    PLANE.width;

  return {
    layer,
    u,
    v,
    x:
      PLANE.backLeftX +
      PLANE.width * u +
      PLANE.depthX * v,
    y:
      PLANE.backY[layer] +
      PLANE.depthY * v,
  };
}

function node(id, layer, x, v, color) {
  return {
    id,
    color,
    ...point(layer, x, v),
  };
}

function completeGraph(nodes) {
  const edges = [];

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      edges.push([nodes[i], nodes[j]]);
    }
  }

  return edges;
}

function line(a, b, className, extra = "") {
  return (
    `<line class="${className}" ` +
    `x1="${a.x.toFixed(2)}" ` +
    `y1="${a.y.toFixed(2)}" ` +
    `x2="${b.x.toFixed(2)}" ` +
    `y2="${b.y.toFixed(2)}"${extra} />`
  );
}

const pts = (list) =>
  list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

function planePolygon(layer) {
  const y = PLANE.backY[layer];
  const points = [
    [PLANE.backLeftX, y],
    [PLANE.backLeftX + PLANE.width, y],
    [PLANE.backLeftX + PLANE.width + PLANE.depthX, y + PLANE.depthY],
    [PLANE.backLeftX + PLANE.depthX, y + PLANE.depthY],
  ];
  return `<polygon class="plane" points="${pts(points)}" />`;
}


// ============================================================
// PERSPECTIVE ON THE PLANE
// ============================================================
//
// A shape lying on a plane is drawn through the plane's own mapping:
// one true unit along the plane's width is width / aspect px to the right,
// one true unit of depth is (depthX, depthY) px. A circle therefore becomes
// a tilted ellipse and a hexagon a slanted hexagon, both matching the plane.

const ON_PLANE = [
  [PLANE.width / PLANE.aspect, PLANE.depthX],
  [0, PLANE.depthY],
];

function planeOffset(dWidth, dDepth) {
  return [
    ON_PLANE[0][0] * dWidth + ON_PLANE[0][1] * dDepth,
    ON_PLANE[1][0] * dWidth + ON_PLANE[1][1] * dDepth,
  ];
}

// Ellipse (rx, ry, rotation) of a circle of radius r lying on the plane.
function discOnPlane(r) {
  const [[a, b], [c, d]] = ON_PLANE;
  const s00 = a * a + b * b;
  const s01 = a * c + b * d;
  const s11 = c * c + d * d;
  const spread = Math.sqrt((s00 - s11) * (s00 - s11) + 4 * s01 * s01);
  return {
    rx: r * Math.sqrt((s00 + s11 + spread) / 2),
    ry: r * Math.sqrt((s00 + s11 - spread) / 2),
    angle: (0.5 * Math.atan2(2 * s01, s00 - s11) * 180) / Math.PI,
  };
}

function ellipseOnPlane(n, r, attrs) {
  const e = discOnPlane(r);
  const cx = n.x.toFixed(2);
  const cy = n.y.toFixed(2);
  return (
    `<ellipse cx="${cx}" cy="${cy}" rx="${e.rx.toFixed(2)}" ry="${e.ry.toFixed(2)}" ` +
    `transform="rotate(${e.angle.toFixed(2)} ${cx} ${cy})" ${attrs} />`
  );
}

// Regular hexagon lying on the plane, corners pointing left and right along the front edge.
function hexagonOnPlane(n, r) {
  const corners = [];
  for (let k = 0; k < 6; k += 1) {
    const t = (Math.PI / 3) * k;
    const [dx, dy] = planeOffset(r * Math.cos(t), r * Math.sin(t));
    corners.push([n.x + dx, n.y + dy]);
  }
  return corners;
}

const isIdentity = (n) => n.id.includes("identity");
const identityColor = (n) => (n.id.includes("red") ? COLORS.red : COLORS.blue);

function focalRing(n, r) {
  if (!STYLE.focalRing || !isIdentity(n)) return "";
  const c = identityColor(n);
  return ellipseOnPlane(
    n,
    r,
    `class="focal-ring" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-opacity="0.7" stroke-width="1.2"`
  );
}

const mix = (a, b, t) => a + (b - a) * t;

function ellipseNode(n) {
  // Blend the original level ellipse (rx 15, ry 7) with the disc seen on the plane.
  const p = STYLE.perspective;
  const disc = discOnPlane(STYLE.nodeRadius);
  const rx = mix(15, disc.rx, p);
  const ry = mix(7, disc.ry, p);
  const angle = mix(0, disc.angle, p);
  const cx = n.x.toFixed(2);
  const cy = n.y.toFixed(2);
  const rotate = Math.abs(angle) > 0.01 ? ` transform="rotate(${angle.toFixed(2)} ${cx} ${cy})"` : "";
  return [
    `<g class="upper-node${isIdentity(n) ? " focal" : ""}" data-id="${esc(n.id)}">`,
    focalRing(n, STYLE.nodeRadius * 1.75),
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}"${rotate} ` +
      `fill="${n.color}" stroke="${darken(n.color, 0.38)}" stroke-width="${isIdentity(n) ? 1.3 : 1}" />`,
    "</g>",
  ].join("");
}

function familyNode(n) {
  // Original hexagon (pointed left and right), blended toward the hexagon seen on the plane.
  const w = 19;
  const h = 9;
  const bevel = 7;
  const level = [
    [n.x - w, n.y],
    [n.x - w + bevel, n.y - h],
    [n.x + w - bevel, n.y - h],
    [n.x + w, n.y],
    [n.x + w - bevel, n.y + h],
    [n.x - w + bevel, n.y + h],
  ];
  const onPlane = hexagonOnPlane(n, STYLE.familyRadius);
  const order = [3, 4, 5, 0, 1, 2]; // matching corners: left, upper left, upper right, right, ...
  const corners = level.map(([x, y], k) => {
    const [px, py] = onPlane[order[k]];
    return [mix(x, px, STYLE.perspective), mix(y, py, STYLE.perspective)];
  });
  return [
    `<g class="family-node${isIdentity(n) ? " focal" : ""}" data-id="${esc(n.id)}">`,
    focalRing(n, STYLE.familyRadius * 1.55),
    `<polygon points="${pts(corners)}" fill="${n.color}" ` +
      `stroke="${darken(n.color, 0.38)}" stroke-width="${isIdentity(n) ? 1.3 : 1}" stroke-linejoin="round" />`,
    "</g>",
  ].join("");
}

// ============================================================
// WORKPLACE
// ============================================================

const workplace = [
  node("work-red-identity", 0, 380, 0.52, COLORS.red),
  node("work-blue-identity", 0, 1215, 0.50, COLORS.blue),

  node("w02", 0, 620, 0.14, COLORS.red),
  node("w03", 0, 710, 0.14, COLORS.blue),
  node("w04", 0, 800, 0.14, COLORS.red),
  node("w05", 0, 890, 0.14, COLORS.blue),
  node("w06", 0, 980, 0.14, COLORS.red),
  node("w07", 0, 1070, 0.14, COLORS.blue),

  node("w08", 0, 550, 0.34, COLORS.blue),
  node("w09", 0, 660, 0.34, COLORS.red),
  node("w10", 0, 770, 0.34, COLORS.blue),
  node("w11", 0, 880, 0.34, COLORS.red),
  node("w12", 0, 990, 0.34, COLORS.blue),
  node("w13", 0, 1100, 0.34, COLORS.red),

  node("w14", 0, 520, 0.56, COLORS.blue),
  node("w15", 0, 640, 0.56, COLORS.red),
  node("w16", 0, 760, 0.56, COLORS.blue),
  node("w17", 0, 880, 0.56, COLORS.red),
  node("w18", 0, 1000, 0.56, COLORS.blue),
  node("w19", 0, 1120, 0.56, COLORS.red),

  node("w20", 0, 560, 0.79, COLORS.blue),
  node("w21", 0, 700, 0.79, COLORS.red),
  node("w22", 0, 840, 0.79, COLORS.blue),
  node("w23", 0, 980, 0.79, COLORS.red),
];


// ============================================================
// EDUCATION
// ============================================================

// Left clique
const educationLeft = [
  node("education-red-identity", 1, 380, 0.36, COLORS.red),

  node("el1", 1, 470, 0.18, COLORS.red),
  node("el2", 1, 560, 0.25, COLORS.blue),
  node("el3", 1, 590, 0.48, COLORS.red),
  node("el4", 1, 520, 0.68, COLORS.blue),
  node("el5", 1, 420, 0.73, COLORS.red),
  node("el6", 1, 330, 0.57, COLORS.blue),
  node("el7", 1, 440, 0.50, COLORS.blue),
];

// Centre clique
const educationCenter = [
  node("ec0", 1, 810, 0.18, COLORS.red),
  node("ec1", 1, 910, 0.25, COLORS.red),
  node("ec2", 1, 940, 0.48, COLORS.blue),
  node("ec3", 1, 890, 0.68, COLORS.red),
  node("ec4", 1, 800, 0.73, COLORS.blue),
  node("ec5", 1, 700, 0.57, COLORS.blue),
  node("ec6", 1, 720, 0.34, COLORS.blue),
  node("ec7", 1, 820, 0.50, COLORS.red),
];

// Right clique
const educationRight = [
  node(
    "education-blue-identity",
    1,
    1215,
    0.40,
    COLORS.blue
  ),

  node("er1", 1, 1270, 0.20, COLORS.blue),
  node("er2", 1, 1350, 0.30, COLORS.red),
  node("er3", 1, 1310, 0.56, COLORS.red),
  node("er4", 1, 1230, 0.72, COLORS.blue),
  node("er5", 1, 1130, 0.70, COLORS.red),
  node("er6", 1, 1050, 0.52, COLORS.blue),
  node("er7", 1, 1100, 0.30, COLORS.red),
];


// ============================================================
// HOUSEHOLD
// ============================================================

// Left household
const householdLeft = [
  node(
    "household-red-identity",
    2,
    380,
    0.36,
    COLORS.red
  ),

  node("hl1", 2, 500, 0.28, COLORS.red),
];

// Centre household
const householdCenter = [
  node("hc0", 2, 720, 0.45, COLORS.blue),
  node("hc1", 2, 790, 0.18, COLORS.red),
  node("hc2", 2, 880, 0.22, COLORS.blue),
  node("hc3", 2, 820, 0.48, COLORS.red),
];

// Right household
const householdRight = [
  node("hr0", 2, 1100, 0.48, COLORS.red),
  node("hr1", 2, 1145, 0.18, COLORS.red),

  node(
    "household-blue-identity",
    2,
    1215,
    0.40,
    COLORS.blue
  ),
];


// ============================================================
// FAMILY
// ============================================================
//
// IMPORTANT:
// Family node fill is determined by the fraction of blue/vaccinated
// members in that household.
//
// fracBlue = (# blue individuals) / household size
//
// The geometry is unchanged from the original JS.
// ============================================================

const family = [
  {
    fracBlue: 0.00,
    ...node(
      "family-red-identity",
      3,
      380,
      0.52,
      familyFractionColor(0.00)
    ),
  },

  {
    fracBlue: 0.20,
    ...node(
      "f1",
      3,
      520,
      0.76,
      familyFractionColor(0.20)
    ),
  },

  {
    fracBlue: 0.35,
    ...node(
      "f2",
      3,
      550,
      0.27,
      familyFractionColor(0.35)
    ),
  },

  {
    fracBlue: 0.50,
    ...node(
      "family-center-map",
      3,
      798,
      0.18,
      familyFractionColor(0.50)
    ),
  },

  {
    fracBlue: 0.45,
    ...node(
      "f4",
      3,
      835,
      0.68,
      familyFractionColor(0.45)
    ),
  },

  {
    fracBlue: 0.60,
    ...node(
      "f5",
      3,
      945,
      0.55,
      familyFractionColor(0.60)
    ),
  },

  {
    fracBlue: 0.72,
    ...node(
      "f6",
      3,
      1010,
      0.22,
      familyFractionColor(0.72)
    ),
  },

  {
    fracBlue: 0.58,
    ...node(
      "f7",
      3,
      1080,
      0.60,
      familyFractionColor(0.58)
    ),
  },

  {
    fracBlue: 0.28,
    ...node(
      "f8",
      3,
      1140,
      0.82,
      familyFractionColor(0.28)
    ),
  },

  // This household contains:
  // 1 blue + 2 red -> fracBlue = 1/3
  {
    fracBlue: 1 / 3,
    ...node(
      "family-blue-identity",
      3,
      1215,
      0.47,
      familyFractionColor(1 / 3)
    ),
  },

  {
    fracBlue: 0.82,
    ...node(
      "f10",
      3,
      1305,
      0.24,
      familyFractionColor(0.82)
    ),
  },
];


// ============================================================
// LOOKUP
// ============================================================

const byId = new Map(
  [
    ...workplace,
    ...educationLeft,
    ...educationCenter,
    ...educationRight,
    ...householdLeft,
    ...householdCenter,
    ...householdRight,
    ...family,
  ].map((n) => [n.id, n])
);


// ============================================================
// EDGES
// ============================================================

// Near-complete workplace:
// omit only a small deterministic set of long crossing edges.
const workplaceEdges = completeGraph(workplace)
  .filter((_, index) => index % 13 !== 0);

const educationEdges = [
  ...completeGraph(educationLeft),
  ...completeGraph(educationCenter),
  ...completeGraph(educationRight),
];

const householdEdges = [
  ...completeGraph(householdLeft),
  ...completeGraph(householdCenter),
  ...completeGraph(householdRight),
];

const familyEdgeIds = [
  ["family-red-identity", "f1"],
  ["family-red-identity", "f2"],

  ["f2", "family-center-map"],
  ["family-center-map", "f4"],

  ["f4", "f5"],

  ["f5", "f6"],
  ["f5", "f7"],

  ["f6", "f7"],

  ["f7", "family-blue-identity"],

  ["f8", "family-blue-identity"],

  ["family-blue-identity", "f10"],
];

const familyEdges = familyEdgeIds.map(
  ([a, b]) => [byId.get(a), byId.get(b)]
);


// ============================================================
// CROSS-LAYER IDENTITIES
// ============================================================

const redIdentity = [
  byId.get("work-red-identity"),
  byId.get("education-red-identity"),
  byId.get("household-red-identity"),
  byId.get("family-red-identity"),
];

const blueIdentity = [
  byId.get("work-blue-identity"),
  byId.get("education-blue-identity"),
  byId.get("household-blue-identity"),
  byId.get("family-blue-identity"),
];


// ============================================================
// HOUSEHOLD -> FAMILY PROJECTIONS
// ============================================================

const projections = [
  ...householdLeft.map((n) => [
    n,
    byId.get("family-red-identity"),
  ]),

  ...householdCenter.map((n) => [
    n,
    byId.get("family-center-map"),
  ]),

  ...householdRight.map((n) => [
    n,
    byId.get("family-blue-identity"),
  ]),
];


// ============================================================
// LAYERS
// ============================================================

const layers = [
  {
    label: "Workplace",
    nodes: workplace,
    edges: workplaceEdges,
    edgeClass: "edge workplace-edge",
  },

  {
    label: "Education",
    nodes: [
      ...educationLeft,
      ...educationCenter,
      ...educationRight,
    ],
    edges: educationEdges,
    edgeClass: "edge education-edge",
  },

  {
    label: "Household",
    nodes: [
      ...householdLeft,
      ...householdCenter,
      ...householdRight,
    ],
    edges: householdEdges,
    edgeClass: "edge household-edge",
  },

  {
    label: "Family",
    nodes: family,
    edges: familyEdges,
    edgeClass: "edge family-edge",
  },
];




// ============================================================
// LAY EACH CLIQUE ONTO ITS PLANE
// ============================================================
//
// The positions above were sketched as a flat drawing (screen x, depth v).
// With STYLE.perspective > 0 each clique is sheared toward its plane's slant:
// the sketch's vertical axis leans toward the plane's depth direction.
// Each clique keeps its centre; the focal individuals stay on their vertical lines.

function moveTo(n, screenX, v) {
  Object.assign(n, point(n.layer, screenX, v));
}

function layOnPlane(clique) {
  const meanV = clique.reduce((sum, n) => sum + n.v, 0) / clique.length;
  const free = clique.filter((n) => !isIdentity(n));
  for (const n of free) {
    moveTo(n, n.x + STYLE.perspective * PLANE.depthX * (n.v - meanV), n.v);
  }

  // Keep every disc clear of the plane's side edges.
  const margin = 0.04;
  const minU = Math.min(...free.map((n) => n.u));
  const maxU = Math.max(...free.map((n) => n.u));
  const shift = Math.max(0, margin - minU) - Math.max(0, maxU - (1 - margin));
  if (shift !== 0) {
    for (const n of free) moveTo(n, n.x + shift * PLANE.width, n.v);
  }
}

[
  workplace,
  educationLeft,
  educationCenter,
  educationRight,
  householdLeft,
  householdCenter,
  householdRight,
].forEach(layOnPlane);


// ============================================================
// SVG
// ============================================================

const svg = [];

svg.push(
  `<?xml version="1.0" encoding="UTF-8"?>`
);

svg.push(
  `<svg ` +
    `xmlns="http://www.w3.org/2000/svg" ` +
    `width="${WIDTH}" ` +
    `height="${HEIGHT}" ` +
    `viewBox="${VIEW_X} 0 ${WIDTH} ${HEIGHT}" ` +
    `role="img" ` +
    `aria-labelledby="title desc">`
);

svg.push(
  `<title id="title">A. Contact Network</title>`
);

svg.push(
  `<desc id="desc">` +
    `Four-layer contact network showing one near-complete workplace component, ` +
    `three education cliques, smaller household cliques, and a sparse family network. ` +
    `Red and blue identity lines connect corresponding nodes across all layers. ` +
    `In the family layer, node color encodes the household share of vaccinated members.` +
  `</desc>`
);

// Household -> family lines: member colour fading into the household colour.
const defs = [`<defs>`];
const projectionStroke = projections.map(([a, b], k) => {
  if (!STYLE.colouredProjections) return COLORS.projection;
  const id = `projection-${k}`;
  defs.push(
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
      `x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}">` +
      `<stop offset="0" stop-color="${a.color}" />` +
      `<stop offset="1" stop-color="${b.color}" />` +
    `</linearGradient>`
  );
  return `url(#${id})`;
});
defs.push(`</defs>`);
svg.push(defs.join(""));

svg.push(`
<style>

  .plane {
    fill: ${COLORS.planeFill};
    fill-opacity: 0.86;
    stroke: ${COLORS.planeStroke};
    stroke-width: 1.15;
    stroke-linejoin: round;
  }

  .edge {
    fill: none;
    stroke: ${COLORS.edge};
    stroke-linecap: round;
  }

  .workplace-edge {
    stroke-width: 0.85;
    stroke-opacity: 0.20;
  }

  .education-edge {
    stroke-width: 1.00;
    stroke-opacity: 0.46;
  }

  .household-edge {
    stroke-width: 1.35;
    stroke-opacity: 0.72;
  }

  .family-edge {
    stroke-width: 1.5;
    stroke-opacity: 0.8;
  }

  .projection {
    fill: none;
    stroke-width: 1.15;
    stroke-opacity: ${STYLE.colouredProjections ? 0.62 : 0.65};
    stroke-linecap: round;
  }

  .identity-red,
  .identity-blue {
    fill: none;
    stroke-width: 1.5;
    stroke-opacity: 0.75;
    stroke-linecap: round;
  }

  .identity-red { stroke: ${COLORS.red}; }
  .identity-blue { stroke: ${COLORS.blue}; }

  .figure-title {
    fill: ${COLORS.title};
    font:
      700 25px
      -apple-system,
      BlinkMacSystemFont,
      "Helvetica Neue",
      "Segoe UI",
      Helvetica,
      Arial,
      sans-serif;
  }

  .layer-label {
    fill: ${COLORS.label};
    font:
      500 26px
      -apple-system,
      BlinkMacSystemFont,
      "Helvetica Neue",
      "Segoe UI",
      Helvetica,
      Arial,
      sans-serif;
    letter-spacing: 0.2px;
  }

</style>
`);

svg.push(
  `<rect ` +
    `x="${VIEW_X}" ` +
    `width="${WIDTH}" ` +
    `height="${HEIGHT}" ` +
    `fill="${COLORS.background}" />`
);

svg.push(
  `<text class="figure-title" x="${VIEW_X + 4}" y="33">` +
    `A. Contact Network` +
  `</text>`
);


// ============================================================
// LAYERS, PAINTED BACK TO FRONT
// ============================================================
//
// Family is drawn first and Workplace last. Lines between layer k
// and k+1 are drawn after layer k+1 but before plane k, so the part
// of each line that runs under plane k is softened by that plane.

function crossLayer(k) {
  const out = [`<g aria-label="Cross-layer mappings ${k}-${k + 1}">`];

  if (k === 2) {
    projections.forEach(([a, b], index) => {
      out.push(line(a, b, "projection", ` stroke="${projectionStroke[index]}"`));
    });
  }

  out.push(line(redIdentity[k], redIdentity[k + 1], "identity-red"));
  out.push(line(blueIdentity[k], blueIdentity[k + 1], "identity-blue"));

  out.push(`</g>`);
  return out.join("\n");
}

for (let index = layers.length - 1; index >= 0; index -= 1) {
  const layer = layers[index];

  if (index < layers.length - 1) svg.push(crossLayer(index));

  svg.push(planePolygon(index));

  svg.push(`<g aria-label="${esc(layer.label)} layer edges">`);
  for (const [a, b] of layer.edges) {
    svg.push(line(a, b, layer.edgeClass));
  }
  svg.push(`</g>`);

  // Back nodes first so nearer nodes overlap them.
  svg.push(`<g aria-label="${esc(layer.label)} layer nodes">`);
  for (const n of [...layer.nodes].sort((p, q) => p.y - q.y)) {
    svg.push(index === 3 ? familyNode(n) : ellipseNode(n));
  }
  svg.push(`</g>`);
}


// ============================================================
// LABELS (under the front-left corner of each plane)
// ============================================================

for (let i = 0; i < layers.length; i += 1) {
  const frontLeftX = PLANE.backLeftX + PLANE.depthX;
  const frontY = PLANE.backY[i] + PLANE.depthY;
  svg.push(
    `<text ` +
      `class="layer-label" ` +
      `x="${frontLeftX + 12}" ` +
      `y="${frontY + 28}">` +
      `${esc(layers[i].label)}` +
    `</text>`
  );
}

svg.push(`</svg>`);


// ============================================================
// WRITE FILE
// ============================================================

const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
      __dirname,
      "multilayer-contact-network-js.svg"
    );

fs.writeFileSync(
  outputPath,
  `${svg.join("\n")}\n`,
  "utf8"
);

console.log(outputPath);

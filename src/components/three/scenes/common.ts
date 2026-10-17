import * as THREE from "three";

export const C = {
  surface: "#140c0e",
  card: "#1d1215",
  line: "#2a1a1d",
  deep: "#6b1427",
  accent: "#d9455f",
  fg: "#ede6e3",
  muted: "#9a8f8c",
};

export type Built = {
  root: THREE.Object3D;
  /** Pose the scene at time t (seconds). Pure function of t, so any moment can be a still frame. */
  update: (t: number) => void;
};

export type SceneDef = {
  build: () => Built;
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
  /** the moment shown as a static frame under prefers-reduced-motion */
  still: number;
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};
/** 0 → 1 as x goes from a to b, eased */
export const ramp = (x: number, a: number, b: number) => smooth((x - a) / (b - a));
export const fract = (x: number) => x - Math.floor(x);

/** deterministic pseudo-random numbers, so every load looks the same */
export function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Outline of a rounded rectangle centred on the origin in the XY plane. */
export function roundedRectPoints(w: number, h: number, r: number, steps = 6) {
  const pts: THREE.Vector3[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = start + (i / steps) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
  }
  return pts;
}

export function roundedRectShape(w: number, h: number, r: number) {
  const shape = new THREE.Shape();
  const pts = roundedRectPoints(w, h, r);
  shape.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) shape.lineTo(p.x, p.y);
  shape.closePath();
  return shape;
}

export function lineMaterial(color: string, opacity = 1) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

export function loop(points: THREE.Vector3[], color: string, opacity = 1) {
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial(color, opacity));
}

export function line(points: THREE.Vector3[], color: string, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial(color, opacity));
}

export function flat(color: string, opacity = 1, additive = false) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1 || additive,
    opacity,
    depthWrite: !additive && opacity === 1,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** A flat card: filled rounded rectangle with a hairline border. */
export function card(w: number, h: number, r: number, fill = C.card, border = C.line) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(w, h, r)), flat(fill));
  const edge = loop(roundedRectPoints(w, h, r), border);
  edge.position.z = 0.002;
  group.add(body, edge);
  return { group, body, edge };
}

/** Thin bars that stand in for lines of text. */
export function textBars(widths: number[], gap: number, height: number, color: string, opacity: number) {
  const group = new THREE.Group();
  const material = flat(color, opacity);
  widths.forEach((w, i) => {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, height), material);
    bar.position.set(w / 2, -i * gap, 0.003);
    group.add(bar);
  });
  return { group, material };
}

let dot: THREE.Texture | null = null;
/** Soft round sprite so points render as dots, not squares. */
export function dotTexture() {
  if (dot) return dot;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dot = new THREE.CanvasTexture(canvas);
  return dot;
}

/** Points whose brightness is driven per point through vertex colors (additive, so dark = invisible). */
export function points(positions: Float32Array, size: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(positions.length), 3));
  const material = new THREE.PointsMaterial({
    size,
    map: dotTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return new THREE.Points(geometry, material);
}

/** Small mono label drawn to a canvas texture. */
export function label(text: string, color = C.muted, height = 0.11) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const px = 64;
  const font = `500 ${px}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 8;
  canvas.height = Math.ceil(px * 1.25);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 4, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry((height * canvas.width) / canvas.height, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  return mesh;
}

export const color = (hex: string) => new THREE.Color(hex);

import * as THREE from "three";
import { C, card, color, flat, fract, line, loop, points, random, ramp, textBars, type SceneDef } from "./common";

const CYCLE = 5.5;

/** 2D face landmarks (roughly the usual 68-point layout plus a sparse fill), in a 1 x 1.3 box. */
function faceLandmarks() {
  const groups: { pts: [number, number][]; closed: boolean }[] = [];
  const ellipse = (cx: number, cy: number, a: number, b: number, n: number, from = 0, to = Math.PI * 2) =>
    Array.from({ length: n }, (_, i) => {
      const t = from + ((to - from) * i) / (to === Math.PI * 2 ? n : n - 1);
      return [cx + Math.cos(t) * a, cy + Math.sin(t) * b] as [number, number];
    });
  groups.push({ pts: ellipse(0, 0, 0.5, 0.64, 36), closed: true }); // face outline
  for (const s of [-1, 1]) {
    groups.push({ pts: ellipse(s * 0.2, 0.22, 0.12, 0.05, 6, Math.PI * 0.15, Math.PI * 0.85), closed: false }); // brow
    groups.push({ pts: ellipse(s * 0.19, 0.1, 0.09, 0.04, 10), closed: true }); // eye
  }
  groups.push({ pts: [[0, 0.08], [0, 0.0], [0, -0.08], [0, -0.15]], closed: false }); // nose bridge
  groups.push({ pts: ellipse(0, -0.14, 0.08, 0.04, 6, Math.PI * 1.1, Math.PI * 1.9), closed: false }); // nose base
  groups.push({ pts: ellipse(0, -0.34, 0.17, 0.06, 14), closed: true }); // mouth
  groups.push({ pts: ellipse(0, -0.34, 0.1, 0.02, 8), closed: true }); // lips

  const rand = random(21);
  const fill: [number, number][] = [];
  while (fill.length < 70) {
    const x = (rand() - 0.5) * 0.9;
    const y = (rand() - 0.5) * 1.2;
    if ((x / 0.46) ** 2 + (y / 0.6) ** 2 < 1) fill.push([x, y]);
  }
  return { groups, fill };
}

const depth = (x: number, y: number) => 0.32 * Math.sqrt(Math.max(0, 1 - (x / 0.56) ** 2 - (y / 0.72) ** 2));

export const ekyc: SceneDef = {
  camera: { position: [0, 0.15, 5.2], target: [0, 0, 0], fov: 36 },
  still: 3.9,
  build() {
    const root = new THREE.Group();

    // ID card
    const id = new THREE.Group();
    const body = card(1.72, 1.08, 0.07, C.card, C.muted);
    id.add(body.group);
    const photo = card(0.42, 0.52, 0.03, "#2a1a1e", C.line);
    photo.group.position.set(-0.55, 0.06, 0.004);
    const head = loop(
      Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 0.09, 0.07 + Math.sin(a) * 0.11, 0.006);
      }),
      C.muted,
      0.7,
    );
    const shoulders = line(
      Array.from({ length: 13 }, (_, i) => {
        const a = Math.PI * (i / 12);
        return new THREE.Vector3(Math.cos(a) * 0.17, -0.25 + Math.sin(a) * 0.13, 0.006);
      }),
      C.muted,
      0.7,
    );
    photo.group.add(head, shoulders);
    id.add(photo.group);
    const text = textBars([0.78, 0.6, 0.7, 0.42, 0.66], 0.13, 0.045, C.muted, 0.45);
    text.group.position.set(-0.22, 0.3, 0);
    id.add(text.group);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.07), flat(C.deep, 0.9));
    strip.position.set(0, -0.42, 0.003);
    id.add(strip);
    id.position.set(-1.25, 0, 0);
    id.rotation.set(0, 0.32, 0.03);
    root.add(id);

    // face made of landmark points
    const face = new THREE.Group();
    const { groups, fill } = faceLandmarks();
    const all: [number, number][] = [...groups.flatMap((g) => g.pts), ...fill];
    const landmarkCount = all.length - fill.length;
    const positions = new Float32Array(all.length * 3);
    all.forEach(([x, y], i) => positions.set([x, y, depth(x, y)], i * 3));
    const dots = points(positions, 0.06);
    face.add(dots);
    for (const g of groups) {
      const pts = g.pts.map(([x, y]) => new THREE.Vector3(x, y, depth(x, y)));
      face.add(g.closed ? loop(pts, C.accent, 0.22) : line(pts, C.accent, 0.22));
    }
    face.position.set(1.3, 0.02, 0);
    face.rotation.y = -0.3;
    root.add(face);

    // scan line sweeping across both
    const scan = new THREE.Group();
    scan.add(new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.012), flat(C.accent, 0.9, true)));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.22), flat(C.accent, 0.06, true));
    glow.position.y = 0.11;
    scan.add(glow);
    scan.position.z = 0.4;
    root.add(scan);

    // match line from the card photo to the face
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    photo.group.updateWorldMatrix(true, false);
    root.updateMatrixWorld(true);
    photo.group.localToWorld(from.set(0, 0.05, 0.01));
    face.localToWorld(to.set(0, 0.0, 0.35));
    const match = line([from, to], C.accent, 0);
    const pulse = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), flat(C.fg, 0, true));
    root.add(match, pulse);
    const ring = loop(
      Array.from({ length: 40 }, (_, i) => {
        const a = (i / 40) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 0.62, Math.sin(a) * 0.78, 0);
      }),
      C.accent,
      0,
    );
    ring.position.copy(face.position);
    ring.rotation.copy(face.rotation);
    root.add(ring);

    const colors = dots.geometry.getAttribute("color") as THREE.BufferAttribute;
    const base = color(C.fg);
    const hot = color(C.accent);
    const textMaterial = text.material;
    const matchMaterial = match.material as THREE.LineBasicMaterial;
    const ringMaterial = ring.material as THREE.LineBasicMaterial;
    const pulseMaterial = pulse.material as THREE.MeshBasicMaterial;

    return {
      root,
      update(t) {
        const c = fract(t / CYCLE) * CYCLE;
        const sweep = ramp(c, 0.3, 2.6);
        const y = 0.95 - sweep * 1.9;
        scan.position.y = y;
        scan.visible = c > 0.3 && c < 2.7;

        // points light up as the scan passes them
        for (let i = 0; i < all.length; i++) {
          const py = all[i][1] + face.position.y;
          const near = scan.visible ? Math.max(0, 1 - Math.abs(py - y) / 0.18) : 0;
          const seen = scan.visible ? (py > y ? 1 : 0) : c >= 2.7 ? 1 : 0;
          const level = (i < landmarkCount ? 0.35 : 0.14) + seen * (i < landmarkCount ? 0.35 : 0.12);
          const col = base.clone().lerp(hot, near).multiplyScalar(level + near * 0.6);
          colors.setXYZ(i, col.r, col.g, col.b);
        }
        colors.needsUpdate = true;
        textMaterial.opacity = 0.3 + (scan.visible && y < 0.45 ? 0.35 : c >= 2.7 && c < CYCLE - 0.4 ? 0.35 : 0);

        // after the scan: the match line draws, a dot travels along it, the face ring confirms
        const draw = ramp(c, 2.7, 3.3);
        const fade = 1 - ramp(c, CYCLE - 0.6, CYCLE - 0.1);
        matchMaterial.opacity = 0.75 * draw * fade;
        const travel = ramp(c, 2.9, 3.8);
        pulse.position.lerpVectors(from, to, travel);
        pulseMaterial.opacity = travel > 0 && travel < 1 ? 0.9 : 0;
        ringMaterial.opacity = 0.6 * ramp(c, 3.7, 4.0) * fade;
      },
    };
  },
};

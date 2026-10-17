import * as THREE from "three";
import { C, color, fract, label, loop, points, ramp, random, roundedRectPoints, type SceneDef } from "./common";

const N = 700;
const TOP = 2.3;
const LAYERS = [
  { y: 1.25, name: "L1 RAW" },
  { y: 0.3, name: "L2 CLEANED" },
  { y: -0.65, name: "L3 BUSINESS" },
];
const CLUSTER_Y = -1.55;
const CLUSTERS = [
  { x: -0.85, z: 0.15, color: C.accent },
  { x: 0.75, z: -0.25, color: C.fg },
  { x: 0.1, z: 0.8, color: "#c27a86" },
  { x: -0.1, z: -0.85, color: "#8f2a40" },
];
const SIZE = 2.6;

export const etl: SceneDef = {
  camera: { position: [3.2, 1.45, 5.0], target: [0, -0.2, 0], fov: 40 },
  still: 14,
  build() {
    const root = new THREE.Group();

    for (const layer of LAYERS) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE, SIZE),
        new THREE.MeshBasicMaterial({ color: C.deep, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = layer.y;
      const edge = loop(roundedRectPoints(SIZE, SIZE, 0.06, 3), C.accent, 0.4);
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = layer.y;
      const tag = label(layer.name, C.fg, 0.16);
      tag.position.set(-SIZE / 2 + 0.02, layer.y + 0.1, SIZE / 2);
      tag.geometry.translate(tag.geometry.parameters.width / 2, 0, 0);
      root.add(plane, edge, tag);
    }

    const rand = random(11);
    const seed = Array.from({ length: N }, (_, i) => {
      const cluster = CLUSTERS[i % CLUSTERS.length];
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.32;
      const grid = 9;
      return {
        offset: rand(),
        speed: 0.85 + rand() * 0.3,
        // raw: anywhere, messy
        rx: (rand() - 0.5) * SIZE * 0.95,
        rz: (rand() - 0.5) * SIZE * 0.95,
        jitter: rand() * Math.PI * 2,
        // cleaned / modeled: snapped to a grid of rows and columns
        gx: ((Math.floor(rand() * grid) + 0.5) / grid - 0.5) * SIZE * 0.85,
        gz: ((Math.floor(rand() * grid) + 0.5) / grid - 0.5) * SIZE * 0.85,
        // segment: one of four clusters
        cx: cluster.x + Math.cos(a) * r,
        cz: cluster.z + Math.sin(a) * r,
        cy: (rand() - 0.5) * 0.18,
        tint: color(cluster.color),
      };
    });

    const dots = points(new Float32Array(N * 3), 0.05);
    root.add(dots);
    const pos = dots.geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = dots.geometry.getAttribute("color") as THREE.BufferAttribute;
    const raw = color(C.muted);
    const clean = color(C.fg);

    return {
      root,
      update(t) {
        for (let i = 0; i < N; i++) {
          const s = seed[i];
          const u = fract(t * 0.06 * s.speed + s.offset);
          // fall through the layers, then slow down and settle into a cluster
          const fall = Math.min(u / 0.78, 1);
          let y = TOP + (LAYERS[2].y - 0.3 - TOP) * fall;
          if (u > 0.78) y = THREE.MathUtils.lerp(LAYERS[2].y - 0.3, CLUSTER_Y + s.cy, ramp(u, 0.78, 0.9));

          const past1 = ramp(-y, -LAYERS[0].y - 0.05, -LAYERS[0].y + 0.2);
          const past2 = ramp(-y, -LAYERS[1].y - 0.05, -LAYERS[1].y + 0.2);
          const past3 = ramp(-y, -LAYERS[2].y, -LAYERS[2].y + 0.6);
          const shake = 0.12 * (1 - past1) + 0.03 * (1 - past2) * past1;
          let x = s.rx + Math.sin(t * 2.1 + s.jitter) * shake;
          let z = s.rz + Math.cos(t * 1.7 + s.jitter) * shake;
          const order = past1 * 0.5 + past2 * 0.5;
          x = THREE.MathUtils.lerp(x, s.gx, order);
          z = THREE.MathUtils.lerp(z, s.gz, order);
          x = THREE.MathUtils.lerp(x, s.cx, past3);
          z = THREE.MathUtils.lerp(z, s.cz, past3);
          pos.setXYZ(i, x, y, z);

          const fadeIn = ramp(u, 0, 0.04);
          const fadeOut = 1 - ramp(u, 0.95, 1);
          const c = raw.clone().multiplyScalar(0.45).lerp(clean.clone().multiplyScalar(0.6), past2).lerp(s.tint, past3);
          const v = fadeIn * fadeOut;
          col.setXYZ(i, c.r * v, c.g * v, c.b * v);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        root.rotation.y = -0.15 + Math.sin(t * 0.15) * 0.08;
      },
    };
  },
};

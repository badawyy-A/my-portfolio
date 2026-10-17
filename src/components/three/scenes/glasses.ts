import * as THREE from "three";
import { C, color, fract, loop, points, random, ramp, roundedRectPoints, roundedRectShape, type SceneDef } from "./common";

const CONE_LENGTH = 2.9;
const CONE_ANGLE = 0.25; // half angle, radians

function tube(points: THREE.Vector3[], radius: number, material: THREE.Material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  return new THREE.Mesh(new THREE.TubeGeometry(curve, closed ? 96 : 32, radius, 8, closed), material);
}

/** One camera's depth cone, opening along +z from the lens, with surface patches where depth points land. */
function depthCone(seed: number) {
  const group = new THREE.Group();
  const radius = Math.tan(CONE_ANGLE) * CONE_LENGTH;

  const geometry = new THREE.ConeGeometry(radius, CONE_LENGTH, 40, 1, true);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, CONE_LENGTH / 2);
  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: C.accent,
      transparent: true,
      opacity: 0.028,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(surface);

  const rim = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, CONE_LENGTH);
  });
  group.add(loop(rim, C.accent, 0.25));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const edge = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, CONE_LENGTH),
    ]);
    group.add(new THREE.Line(edge, new THREE.LineBasicMaterial({ color: C.accent, transparent: true, opacity: 0.12 })));
  }

  // depth points on a few small surfaces inside the cone (things the camera sees)
  const rand = random(seed);
  const patches = [
    { d: 1.6, x: 0.12, y: -0.15, r: 0.22 },
    { d: 2.2, x: -0.28, y: 0.2, r: 0.26 },
    { d: 2.7, x: 0.32, y: 0.3, r: 0.28 },
  ];
  const perPatch = 46;
  const count = patches.length * perPatch;
  const positions = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  patches.forEach((patch, p) => {
    for (let i = 0; i < perPatch; i++) {
      const k = p * perPatch + i;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * patch.r;
      positions[k * 3] = patch.x + Math.cos(a) * r;
      positions[k * 3 + 1] = patch.y + Math.sin(a) * r * 0.8;
      positions[k * 3 + 2] = patch.d + (rand() - 0.5) * 0.08;
      phase[k] = p * 0.22 + (r / patch.r) * 0.12 + rand() * 0.06;
    }
  });
  const dots = points(positions, 0.05);
  group.add(dots);

  const colors = dots.geometry.getAttribute("color") as THREE.BufferAttribute;
  const tint = color(C.accent);
  const bright = color(C.fg);
  const update = (t: number) => {
    const cycle = fract(t / 5);
    for (let k = 0; k < count; k++) {
      // each point appears, holds, then fades before the next sweep
      const v = ramp(cycle, phase[k], phase[k] + 0.08) * (1 - ramp(cycle, 0.82, 0.97));
      const c = tint.clone().lerp(bright, ramp(cycle, phase[k], phase[k] + 0.04) * 0.5);
      colors.setXYZ(k, c.r * v, c.g * v, c.b * v);
    }
    colors.needsUpdate = true;
  };
  return { group, update };
}

export const glasses: SceneDef = {
  camera: { position: [0.1, 0.8, 4.8], target: [0.05, 0, 0], fov: 38 },
  still: 3.4,
  build() {
    const root = new THREE.Group();
    root.add(new THREE.AmbientLight("#ffffff", 0.5));
    const key = new THREE.DirectionalLight("#fff1ea", 2.2);
    key.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight(C.accent, 3);
    rim.position.set(3, 1, -3);
    root.add(key, rim);

    const frame = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: "#8a7479", roughness: 0.38, metalness: 0.45 });
    const rimPoints = roundedRectPoints(0.92, 0.6, 0.22, 8);
    for (const side of [-1, 1]) {
      const rimMesh = tube(rimPoints, 0.03, metal, true);
      rimMesh.position.x = side * 0.56;
      const lens = new THREE.Mesh(
        new THREE.ShapeGeometry(roundedRectShape(0.92, 0.6, 0.22)),
        new THREE.MeshBasicMaterial({ color: C.deep, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
      );
      lens.position.x = side * 0.56;
      // temple arm going back from the outer edge
      const temple = tube(
        [
          new THREE.Vector3(side * 1.02, 0.14, 0),
          new THREE.Vector3(side * 1.08, 0.14, -0.45),
          new THREE.Vector3(side * 1.08, 0.12, -1.35),
          new THREE.Vector3(side * 1.02, -0.12, -1.65),
        ],
        0.026,
        metal,
      );
      // small camera at the outer top corner
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 24), metal);
      body.rotation.x = Math.PI / 2;
      body.position.set(side * 0.92, 0.2, 0.06);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: C.accent }));
      glass.position.set(side * 0.92, 0.2, 0.115);
      frame.add(rimMesh, lens, temple, body, glass);
    }
    const bridge = tube(
      [new THREE.Vector3(-0.1, 0.14, 0), new THREE.Vector3(0, 0.2, 0.02), new THREE.Vector3(0.1, 0.14, 0)],
      0.026,
      metal,
    );
    frame.add(bridge);

    const cones = [-1, 1].map((side, i) => {
      const cone = depthCone(7 + i * 13);
      cone.group.position.set(side * 0.92, 0.2, 0.12);
      // the two cameras converge slightly, like a stereo pair
      cone.group.rotation.y = -side * 0.06;
      frame.add(cone.group);
      return cone;
    });

    // glasses look to the right, three-quarter view, cones reaching across the frame
    frame.rotation.set(0.12, 1.05, 0);
    frame.position.set(-1.05, 0.1, 0);
    root.add(frame);

    return {
      root,
      update(t) {
        frame.position.y = 0.1 + Math.sin(t * 0.8) * 0.03;
        for (const cone of cones) cone.update(t);
      },
    };
  },
};

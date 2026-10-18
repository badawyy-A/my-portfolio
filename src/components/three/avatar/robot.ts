import * as THREE from "three";

/**
 * Jarvis, the little robot that climbs onto Badawi's shoulder ("Cartoon Robot" by alexandermadrews,
 * CC-BY-4.0). The model comes without a skeleton, so one is built here: joints placed from the model's
 * front and side views, every vertex bound to its part with soft blends at the joints.
 * Model space (see scripts/robot/prepare.mjs): Y up, faces +Z, centred, MODEL_HEIGHT tall.
 */
const MODEL_HEIGHT = 1.897;

const JOINTS = {
  hips: { parent: null, at: [0, -0.56, 0] },
  chest: { parent: "hips", at: [0, -0.3, 0] },
  head: { parent: "chest", at: [0, -0.04, 0] },
  armR: { parent: "chest", at: [-0.33, -0.12, 0] },
  foreR: { parent: "armR", at: [-0.46, -0.37, 0.02] },
  armL: { parent: "chest", at: [0.33, -0.12, 0] },
  foreL: { parent: "armL", at: [0.46, -0.37, 0.02] },
  legR: { parent: "hips", at: [-0.17, -0.6, 0] },
  legL: { parent: "hips", at: [0.17, -0.6, 0] },
} as const;

export type Joint = keyof typeof JOINTS;
const NAMES = Object.keys(JOINTS) as Joint[];

/** Rotations per joint relative to the rest pose (radians, XYZ), plus a bounce of the hips. */
export type Pose = Partial<Record<Joint, [number, number, number]>> & { bob?: number };

const ss = THREE.MathUtils.smoothstep;

/** How much each joint moves a point of the model. */
function influences(x: number, y: number, z: number): Partial<Record<Joint, number>> {
  const ax = Math.abs(x);
  const side = x < 0 ? "R" : "L";
  // the helmet: everything above the collar, except right above the shoulder pads, whose tops reach
  // a little higher than the collar
  const overPad = ax > 0.27 && ax < 0.47 && z > -0.13 && z < 0.27;
  const headLine = overPad ? 0 : -0.03;
  if (y > headLine) return { head: 1 };

  const w: Partial<Record<Joint, number>> = {};
  // arms hang outside the torso, which narrows toward the hips where the hands are; the hands end
  // above the feet, whose outer edges reach as far out
  const edge = y > -0.27 ? 0.29 : y > -0.45 ? 0.335 : 0.395;
  const arm = ss(ax, edge - 0.025, edge + 0.015) * ss(y, -0.78, -0.73);
  if (arm > 0) {
    // how far down the upper arm: 0 at the shoulder, 1 at the elbow
    const along = ((ax - 0.33) * 0.13 - (y + 0.12) * 0.25) / (0.13 ** 2 + 0.25 ** 2);
    const fore = ss(along, 0.8, 1.05);
    w[`arm${side}`] = arm * (1 - fore);
    w[`fore${side}`] = arm * fore;
  }
  const body = 1 - arm;
  if (body > 0) {
    const neck = ss(y, -0.1, headLine);
    const leg = ss(-y, 0.5, 0.6) * ss(ax, 0.05, 0.1);
    const chest = ss(y, -0.48, -0.36);
    const rest = body * (1 - neck);
    w.head = body * neck;
    w[`leg${side}`] = rest * leg;
    w.chest = rest * (1 - leg) * chest;
    w.hips = rest * (1 - leg) * (1 - chest);
  }
  return w;
}

export type Robot = {
  /** feet at the origin, facing +Z, `height` tall */
  root: THREE.Group;
  bones: Record<Joint, THREE.Bone>;
  /** the glowing eyes; brighten while he talks */
  material: THREE.MeshStandardMaterial;
  height: number;
};

/** Turns the loaded robot into a skinned, posable character `height` tall. */
export function buildRobot(scene: THREE.Object3D, height: number): Robot {
  let source: THREE.Mesh | undefined;
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) source ??= obj;
  });
  if (!source) throw new Error("robot model has no mesh");
  const geometry = source.geometry.clone();
  const material = (source.material as THREE.MeshStandardMaterial).clone();
  // matte plastic under the hero lights
  material.metalnessMap = null;
  material.metalness = 0;
  material.roughness = 0.55;
  material.emissiveIntensity = 1.2;

  const bones = {} as Record<Joint, THREE.Bone>;
  for (const name of NAMES) {
    const { parent, at } = JOINTS[name];
    const bone = new THREE.Bone();
    bone.name = name;
    const offset = parent ? JOINTS[parent].at : [0, 0, 0];
    bone.position.set(at[0] - offset[0], at[1] - offset[1], at[2] - offset[2]);
    bones[name] = bone;
    if (parent) bones[parent].add(bone);
  }

  // up to four joints per vertex, strongest first
  const position = geometry.getAttribute("position");
  const count = position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const w = influences(position.getX(i), position.getY(i), position.getZ(i));
    const top = (Object.entries(w) as [Joint, number][])
      .filter(([, v]) => v > 0.001)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = top.reduce((sum, [, v]) => sum + v, 0) || 1;
    top.forEach(([joint, v], k) => {
      skinIndex[i * 4 + k] = NAMES.indexOf(joint);
      skinWeight[i * 4 + k] = v / total;
    });
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));

  // the scan is one fused shell: a few triangles bridge parts that touch at rest (hands to thighs) and
  // would stretch into spikes once they move apart. Keep only triangles within a part or across a joint.
  const linked = (a: Joint, b: Joint) => a === b || JOINTS[a].parent === b || JOINTS[b].parent === a;
  const part = (v: number) => NAMES[skinIndex[v * 4]];
  const index = geometry.getIndex()!;
  const kept: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (linked(part(a), part(b)) && linked(part(b), part(c)) && linked(part(a), part(c))) kept.push(a, b, c);
  }
  geometry.setIndex(kept);

  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.add(bones.hips);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(NAMES.map((n) => bones[n])));

  const scale = height / MODEL_HEIGHT;
  mesh.scale.setScalar(scale);
  mesh.position.y = (MODEL_HEIGHT / 2) * scale;
  const root = new THREE.Group();
  root.add(mesh);
  return { root, bones, material, height };
}

const hipsRest = new THREE.Vector3(...JOINTS.hips.at);

/** Applies a pose (joints not named go back to rest). */
export function applyPose(robot: Robot, pose: Pose) {
  for (const name of NAMES) {
    const r = pose[name];
    robot.bones[name].rotation.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0);
  }
  robot.bones.hips.position.copy(hipsRest).y += pose.bob ?? 0;
}

/** Blends two poses joint by joint (a at 0, b at 1). */
export function mixPoses(a: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const out: Pose = { bob: (a.bob ?? 0) * (1 - k) + (b.bob ?? 0) * k };
  for (const name of NAMES) {
    const ra = a[name] ?? [0, 0, 0];
    const rb = b[name] ?? [0, 0, 0];
    out[name] = [ra[0] + (rb[0] - ra[0]) * k, ra[1] + (rb[1] - ra[1]) * k, ra[2] + (rb[2] - ra[2]) * k];
  }
  return out;
}

const TAU = Math.PI * 2;

/** The moves, each a function of time in seconds. "R" is his right arm (his right is -X). */
export const moves = {
  /** standing: breathing, arms loose, looking around a little */
  stand: (t: number): Pose => ({
    chest: [Math.sin(t * 1.7) * 0.025, 0, 0],
    head: [Math.sin(t * 0.37) * 0.07, Math.sin(t * 0.5) * 0.22, Math.sin(t * 0.29) * 0.05],
    armR: [Math.sin(t * 1.7 + 0.5) * 0.04, 0, -0.08],
    armL: [Math.sin(t * 1.7 + 0.5) * 0.04, 0, 0.08],
  }),

  /** a quick, bouncy little walk toward the camera */
  walk: (t: number): Pose => {
    const s = Math.sin(t * TAU * 2.6);
    return {
      legR: [0.6 * s, 0, 0],
      legL: [-0.6 * s, 0, 0],
      armR: [-0.55 * s, 0, -0.18],
      armL: [0.55 * s, 0, 0.18],
      chest: [0.06, 0.1 * s, 0],
      head: [-0.04, -0.06 * s, 0.04 * s],
      bob: Math.abs(s) * 0.06,
    };
  },

  /** climbing, facing what he climbs: hands pull alternately, feet push */
  climb: (t: number): Pose => {
    const s = Math.sin(t * TAU * 2.5);
    return {
      armR: [-1.45 + 0.4 * s, 0, -0.12],
      armL: [-1.45 - 0.4 * s, 0, 0.12],
      foreR: [-0.35 - 0.25 * s, 0, 0],
      foreL: [-0.35 + 0.25 * s, 0, 0],
      legR: [-0.35 - 0.4 * s, 0, 0],
      legL: [-0.35 + 0.4 * s, 0, 0],
      chest: [0.08, 0, 0],
      head: [-0.22, 0, 0],
    };
  },

  /** the hop up onto the shoulder: knees tucked, arms swung back */
  hop: (): Pose => ({
    legR: [-0.7, 0, 0],
    legL: [-0.7, 0, 0],
    armR: [0.5, 0, -0.35],
    armL: [0.5, 0, 0.35],
    chest: [0.12, 0, 0],
    head: [-0.1, 0, 0],
  }),

  /** waving to the audience with his outer (right) arm, head tilted */
  wave: (t: number): Pose => ({
    armR: [-0.35, 0, -1.45],
    foreR: [0, 0, -0.95 + 0.38 * Math.sin(t * TAU * 2.2)],
    armL: [0, 0, 0.1],
    chest: [0, 0.08, 0],
    head: [0.04, 0.12, 0.12],
  }),
};

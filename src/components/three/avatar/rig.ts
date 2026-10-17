import * as THREE from "three";

export const X = new THREE.Vector3(1, 0, 0);
export const Y = new THREE.Vector3(0, 1, 0);
export const Z = new THREE.Vector3(0, 0, 1);

const parentQuat = new THREE.Quaternion();
const turn = new THREE.Quaternion();

/** Rotate a bone about a world-space axis, on top of its current pose. */
export function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(parentQuat);
  turn.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(parentQuat.clone().invert().multiply(turn).multiply(parentQuat));
  bone.updateMatrixWorld(true);
}

/** An arm bone with its three recorded rotations: resting at the side, arms crossed, on the keyboard. */
export type ArmBone = {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  crossed: THREE.Quaternion;
  typing: THREE.Quaternion;
  side: number;
  kind: "arm" | "forearm" | "hand" | "finger";
};

/** A leg bone standing and seated. */
export type LegBone = { bone: THREE.Object3D; stand: THREE.Quaternion; seated: THREE.Quaternion };

/** Where the chair, desk and laptop go, in the avatar's own space (floor at y = 0, facing +z). */
export type Layout = { seatTop: number; deskTop: number; laptopZ: number; deskFront: number };

export type Rig = {
  head?: THREE.Object3D;
  neck?: THREE.Object3D;
  spine?: THREE.Object3D;
  base: Map<THREE.Object3D, THREE.Quaternion>;
  blinkers: THREE.Mesh[];
  arms: ArmBone[];
  legs: LegBone[];
  /** how far the body sinks when he sits down */
  drop: number;
  layout: Layout;
  /** head height standing, for the hero framing */
  focusY: number;
};

const worldPos = (obj: THREE.Object3D) => obj.getWorldPosition(new THREE.Vector3());

/**
 * Pose the T-posed avatar once and record the poses the page blends between: arms resting, crossed
 * (hero) or on the keyboard ("What I build"), legs standing or seated. Also measures where the
 * furniture has to go. Leaves him standing with his arms at his sides.
 */
export function rig(scene: THREE.Object3D): Rig {
  if (scene.userData.rig) return scene.userData.rig;

  const bone = (name: string) => scene.getObjectByName(name);
  const side = (obj: THREE.Object3D) => (worldPos(obj).x >= 0 ? 1 : -1);
  const blinkers: THREE.Mesh[] = [];

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.frustumCulled = false;
    if (obj.morphTargetDictionary && "eyeBlinkLeft" in obj.morphTargetDictionary) blinkers.push(obj);
    const material = obj.material as THREE.MeshStandardMaterial;
    if (material.map) material.map.anisotropy = 4;
  });
  scene.updateMatrixWorld(true);

  // arms down from the T-pose: the resting pose
  for (const name of ["LeftArm", "RightArm"]) {
    const arm = bone(name);
    if (!arm) continue;
    const s = side(arm);
    rotateWorld(arm, Z, -s * 1.22);
    rotateWorld(arm, X, 0.08);
  }
  for (const name of ["LeftForeArm", "RightForeArm"]) {
    const forearm = bone(name);
    if (forearm) rotateWorld(forearm, Y, side(forearm) * 0.12);
  }

  // each arm chain: upper arm, forearm, hand, the finger joints (index to pinky, base to tip), then
  // the two outer thumb joints
  const fingers = (s: string) =>
    [
      ...["Index", "Middle", "Ring", "Pinky"].flatMap((f) => [1, 2, 3].map((n) => bone(`${s}Hand${f}${n}`))),
      bone(`${s}HandThumb2`),
      bone(`${s}HandThumb3`),
    ].filter((b): b is THREE.Object3D => !!b);
  const chains = ["Left", "Right"]
    .map((s) => [bone(`${s}Arm`), bone(`${s}ForeArm`), bone(`${s}Hand`)])
    .map((c, i) => (c.every(Boolean) ? [...(c as THREE.Object3D[]), ...fingers(i === 0 ? "Left" : "Right")] : null))
    .filter((c): c is THREE.Object3D[] => c !== null);
  const rest = chains.map((chain) => chain.map((b) => b.quaternion.clone()));
  const restore = () => {
    chains.forEach((chain, c) => chain.forEach((b, i) => b.quaternion.copy(rest[c][i])));
    scene.updateMatrixWorld(true);
  };

  // arms crossed: elbows forward and a little out, forearms level and folded across the body
  // (left over right), hands tucked against the opposite upper arm with the fingers curled
  const crossed = chains.map((chain) => {
    const [arm, forearm, hand] = chain;
    const sd = side(arm);
    rotateWorld(arm, X, sd > 0 ? -0.62 : -0.5);
    rotateWorld(arm, Z, -sd * 0.04);
    rotateWorld(forearm, X, sd > 0 ? -1.02 : -1.12);
    rotateWorld(forearm, Y, -sd * 1.6);
    rotateWorld(hand, Y, -sd * 0.15);
    // curl the four fingers toward the palm
    const joints = chain.slice(3);
    if (joints.length === 14) {
      const across = worldPos(joints[9]).sub(worldPos(joints[0])).normalize();
      for (const joint of joints.slice(0, 12)) rotateWorld(joint, across, sd * 0.85);
      // and fold the thumb in
      for (const thumb of joints.slice(12)) rotateWorld(thumb, Z, sd * 0.6);
    }
    return chain.map((b) => b.quaternion.clone());
  });
  restore();

  // sit: thighs forward, shins back down, knees a little apart, then sink until the feet are on the floor
  const legBones = ["Left", "Right"].flatMap((s) => [bone(`${s}UpLeg`), bone(`${s}Leg`)]).filter((b): b is THREE.Object3D => !!b);
  const stand = legBones.map((b) => b.quaternion.clone());
  for (const s of ["Left", "Right"]) {
    const thigh = bone(`${s}UpLeg`);
    const shin = bone(`${s}Leg`);
    if (!thigh || !shin) continue;
    rotateWorld(thigh, X, -Math.PI / 2);
    rotateWorld(thigh, Y, side(thigh) * 0.1);
    rotateWorld(shin, X, Math.PI / 2);
  }
  scene.updateMatrixWorld(true);
  const legs: LegBone[] = legBones.map((b, i) => ({ bone: b, stand: stand[i], seated: b.quaternion.clone() }));
  const ankle = bone("LeftFoot");
  const drop = ankle ? worldPos(ankle).y - 0.085 : 0.45;
  scene.position.y -= drop;
  scene.updateMatrixWorld(true);
  const hip = bone("LeftUpLeg");
  const seatTop = hip ? worldPos(hip).y - 0.09 : 0.42;

  // typing, measured while seated: upper arms forward, elbows bent, forearms angled in, palms down
  const hands: THREE.Vector3[] = [];
  const typing = chains.map((chain) => {
    const [arm, forearm, hand] = chain;
    const sd = side(arm);
    rotateWorld(arm, X, -0.42);
    rotateWorld(arm, Z, -sd * 0.06);
    rotateWorld(forearm, X, -1.2);
    rotateWorld(forearm, Y, -sd * 0.38);
    const along = worldPos(hand).sub(worldPos(forearm)).normalize();
    rotateWorld(forearm, along, sd * 0.9);
    rotateWorld(hand, along, sd * 0.5);
    rotateWorld(hand, X, 0.15);
    hands.push(worldPos(hand));
    return chain.map((b) => b.quaternion.clone());
  });
  restore();

  // the laptop sits under the typing hands
  const handY = hands.length ? hands.reduce((a, h) => a + h.y, 0) / hands.length : 0.68;
  const handZ = hands.length ? hands.reduce((a, h) => a + h.z, 0) / hands.length : 0.35;
  const laptopZ = handZ + 0.1;
  const layout: Layout = { seatTop, deskTop: handY - 0.06, laptopZ, deskFront: laptopZ - 0.2 };

  // back on his feet
  legs.forEach((leg) => leg.bone.quaternion.copy(leg.stand));
  scene.position.y += drop;
  scene.updateMatrixWorld(true);

  const arms: ArmBone[] = [];
  chains.forEach((chain, c) => {
    const sd = side(chain[0]);
    chain.forEach((b, i) => {
      const kind = i === 0 ? "arm" : i === 1 ? "forearm" : i === 2 ? "hand" : "finger";
      arms.push({ bone: b, rest: rest[c][i], crossed: crossed[c][i], typing: typing[c][i], side: sd, kind });
    });
  });

  const head = bone("Head");
  const neck = bone("Neck");
  const spine = bone("Spine2") ?? bone("Spine1");
  const base = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const b of [head, neck, spine]) if (b) base.set(b, b.quaternion.clone());
  const focusY = head ? worldPos(head).y : 1.6;

  const result: Rig = { head, neck, spine, base, blinkers, arms, legs, drop, layout, focusY };
  scene.userData.rig = result;
  return result;
}

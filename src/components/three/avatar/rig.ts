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

/** An arm bone with its resting (arms down) and typing rotations, blended on scroll. */
export type ArmBone = { bone: THREE.Object3D; rest: THREE.Quaternion; typing: THREE.Quaternion; side: number; kind: "arm" | "forearm" | "hand" };

/** Where the chair, desk and laptop go, in the avatar's own space (floor at y = 0, facing +z). */
export type Layout = { seatTop: number; deskTop: number; laptopZ: number; deskFront: number };

export type Rig = {
  head?: THREE.Object3D;
  neck?: THREE.Object3D;
  spine?: THREE.Object3D;
  base: Map<THREE.Object3D, THREE.Quaternion>;
  blinkers: THREE.Mesh[];
  arms: ArmBone[];
  layout: Layout;
  focusY: number;
};

const worldPos = (obj: THREE.Object3D) => obj.getWorldPosition(new THREE.Vector3());

/**
 * Pose the T-posed avatar once: seated, arms resting at the sides. Also records a typing pose for the
 * arms (blended in during "What I build") and measures where the furniture has to be.
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

  // arms down from the T-pose
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

  // sit: thighs forward, shins back down, knees a little apart
  for (const s of ["Left", "Right"]) {
    const thigh = bone(`${s}UpLeg`);
    const shin = bone(`${s}Leg`);
    if (!thigh || !shin) continue;
    const sd = side(thigh);
    rotateWorld(thigh, X, -Math.PI / 2);
    rotateWorld(thigh, Y, sd * 0.1);
    rotateWorld(shin, X, Math.PI / 2);
  }
  scene.updateMatrixWorld(true);

  // lower the whole avatar until the feet rest on the floor
  const ankle = bone("LeftFoot");
  const drop = ankle ? worldPos(ankle).y - 0.085 : 0.45;
  scene.position.y -= drop;
  scene.updateMatrixWorld(true);
  const hip = bone("LeftUpLeg");
  const seatTop = hip ? worldPos(hip).y - 0.09 : 0.42;

  // typing pose: upper arms forward, elbows bent, forearms angled in, palms turned down
  const arms: ArmBone[] = [];
  const hands: THREE.Vector3[] = [];
  for (const s of ["Left", "Right"]) {
    const arm = bone(`${s}Arm`);
    const forearm = bone(`${s}ForeArm`);
    const hand = bone(`${s}Hand`);
    if (!arm || !forearm || !hand) continue;
    const sd = side(arm);
    const rest = [arm, forearm, hand].map((b) => b.quaternion.clone());

    rotateWorld(arm, X, -0.42);
    rotateWorld(arm, Z, -sd * 0.06);
    rotateWorld(forearm, X, -1.2);
    rotateWorld(forearm, Y, -sd * 0.38);
    const along = worldPos(hand).sub(worldPos(forearm)).normalize();
    rotateWorld(forearm, along, sd * 0.9);
    rotateWorld(hand, along, sd * 0.5);
    rotateWorld(hand, X, 0.15);
    scene.updateMatrixWorld(true);
    hands.push(worldPos(hand));

    const typing = [arm, forearm, hand].map((b) => b.quaternion.clone());
    (["arm", "forearm", "hand"] as const).forEach((kind, i) => {
      const b = [arm, forearm, hand][i];
      arms.push({ bone: b, rest: rest[i], typing: typing[i], side: sd, kind });
      b.quaternion.copy(rest[i]);
    });
  }
  scene.updateMatrixWorld(true);

  // the laptop sits under the typing hands
  const handY = hands.length ? hands.reduce((a, h) => a + h.y, 0) / hands.length : 0.68;
  const handZ = hands.length ? hands.reduce((a, h) => a + h.z, 0) / hands.length : 0.35;
  const deskTop = handY - 0.06;
  const laptopZ = handZ + 0.1;
  const layout: Layout = { seatTop, deskTop, laptopZ, deskFront: laptopZ - 0.2 };

  const head = bone("Head");
  const neck = bone("Neck");
  const spine = bone("Spine2") ?? bone("Spine1");
  const base = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const b of [head, neck, spine]) if (b) base.set(b, b.quaternion.clone());
  const focusY = head ? worldPos(head).y : 1.2;

  const result: Rig = { head, neck, spine, base, blinkers, arms, layout, focusY };
  scene.userData.rig = result;
  return result;
}

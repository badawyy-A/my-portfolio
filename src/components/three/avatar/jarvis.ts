import * as THREE from "three";
import { mixPoses, moves, type Pose } from "./robot";

/**
 * Where Jarvis climbs and stands, measured once on the standing avatar by casting rays at it: the
 * top of his right shoulder, and a line of footholds up the outside of his right arm. Stored in the
 * collarbone's space so they move with the shoulder (head turns, sitting down at the desk).
 */
export type Marks = { shoulder: THREE.Object3D; seat: THREE.Vector3; climb: THREE.Vector3[] };

/** Jarvis's height, in metres. */
export const ROBOT_HEIGHT = 0.15;
/** half his depth, facing what he climbs: how far his feet stay from the sleeve */
const CLIMB_GAP = 0.035;
/** where on the shoulder he stands, from the neck (0) to the shoulder joint (1) */
const SEAT = 0.86;
/** his feet start the climb at this height (below the frame), and finish it this far below the shoulder top */
const CLIMB_FROM = 0.9;
const CLIMB_BELOW = 0.08;

export function measureMarks(scene: THREE.Object3D): Marks | null {
  const find = (name: string) => scene.getObjectByName(name);
  const shoulder = find("RightShoulder");
  const arm = find("RightArm");
  const elbow = find("RightForeArm");
  const hand = find("RightHand");
  const neck = find("Neck");
  if (!shoulder || !arm || !elbow || !hand || !neck) return null;

  scene.updateMatrixWorld(true);
  const at = (obj: THREE.Object3D) => obj.getWorldPosition(new THREE.Vector3());
  const [a, e, h, n] = [at(arm), at(elbow), at(hand), at(neck)];
  const meshes: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  const ray = new THREE.Raycaster();
  const first = (from: THREE.Vector3, dir: THREE.Vector3) => {
    ray.set(from, dir);
    return ray.intersectObjects(meshes, false)[0]?.point;
  };

  const sx = THREE.MathUtils.lerp(n.x, a.x, SEAT);
  const seat = first(new THREE.Vector3(sx, a.y + 0.6, a.z), new THREE.Vector3(0, -1, 0)) ?? new THREE.Vector3(sx, a.y + 0.07, a.z);

  // the arm's axis at a given height (hand -> elbow -> shoulder joint)
  const axisZ = (y: number) => {
    const [lo, hi] = y < e.y ? [h, e] : [e, a];
    return THREE.MathUtils.lerp(lo.z, hi.z, THREE.MathUtils.clamp((y - lo.y) / (hi.y - lo.y), 0, 1));
  };
  const climb: THREE.Vector3[] = [];
  let x = a.x - 0.06;
  for (let y = CLIMB_FROM; y <= seat.y - CLIMB_BELOW + 0.001; y += 0.03) {
    // feel for the sleeve at his chest height, but never above the shoulder (the ray would find the neck)
    const ry = Math.min(y + ROBOT_HEIGHT / 2, seat.y - 0.05);
    const z = axisZ(ry);
    const hit = first(new THREE.Vector3(-1.5, ry, z), new THREE.Vector3(1, 0, 0));
    if (hit) x = hit.x;
    climb.push(new THREE.Vector3(x - CLIMB_GAP, y, z));
  }

  const local = (v: THREE.Vector3) => shoulder.worldToLocal(v.clone());
  return { shoulder, seat: local(seat), climb: climb.map(local) };
}

/** When the loading screen opened (Badawi starts rising from his crouch then), in seconds. */
export let siteReadyAt = -1;
if (typeof window !== "undefined") window.addEventListener("site:ready", () => (siteReadyAt = performance.now() / 1000), { once: true });

/** The entrance, in seconds from the moment he sets off. */
const WALK = 2.6;
const HIDE = 0.35;
const CLIMB = 1.6;
const PULLS = 4;
const HOP = 0.5;
const TURN = 0.45;
const T_HIDE = WALK;
const T_CLIMB = T_HIDE + HIDE;
const T_HOP = T_CLIMB + CLIMB;
const T_TURN = T_HOP + HOP;
export const T_SEATED = T_TURN + TURN;
/** he starts waving as he finishes turning, and speaks a moment later */
export const T_WAVE = T_SEATED - 0.15;
export const T_GREET = T_SEATED + 0.35;

/**
 * His walk: from far behind Badawi, low in the frame, to out of it at the bottom next to him (avatar
 * space). Phones frame Badawi narrower and fade the bottom of the hero out, so there he walks a
 * little higher and starts further in.
 */
const ROUTES = {
  wide: { start: new THREE.Vector3(-1.15, 0.9, -3.5), exit: new THREE.Vector3(-0.4, 0.9, -0.4) },
  narrow: { start: new THREE.Vector3(-0.45, 1.06, -3.5), exit: new THREE.Vector3(-0.34, 1.06, -0.4) },
};
export type Route = keyof typeof ROUTES;
/** facing what he climbs (Badawi's arm, toward +X), then the audience, turned a little inward */
const CLIMB_YAW = Math.PI / 2;
export const FACE_YAW = 0.2;

const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = THREE.MathUtils.lerp;
const clamp01 = (k: number) => THREE.MathUtils.clamp(k, 0, 1);

export type Frame = { at: THREE.Vector3; yaw: number; pose: Pose; seated: boolean };

/**
 * Where he is and how he moves `t` seconds into the entrance. `toAvatar` turns a point in the
 * collarbone's space into the avatar's space for this frame.
 */
export function entrance(t: number, route: Route, marks: Marks, toAvatar: (local: THREE.Vector3) => THREE.Vector3): Frame {
  const seat = toAvatar(marks.seat);
  const { start, exit } = ROUTES[route];
  const walkYaw = Math.atan2(exit.x - start.x, exit.z - start.z);
  if (t >= T_SEATED) return { at: seat, yaw: FACE_YAW, pose: moves.stand(t), seated: true };

  const climbAt = (u: number) => {
    const path = marks.climb;
    const f = clamp01(u) * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    return toAvatar(path[i]).lerp(toAvatar(path[i + 1]), f - i);
  };

  if (t < T_HIDE) {
    return { at: start.clone().lerp(exit, t / WALK), yaw: walkYaw, pose: moves.walk(t), seated: false };
  }
  if (t < T_CLIMB) {
    const k = ease((t - T_HIDE) / HIDE);
    return { at: exit.clone().lerp(climbAt(0), k), yaw: lerp(walkYaw, CLIMB_YAW, k), pose: mixPoses(moves.walk(t), moves.climb(0), k), seated: false };
  }
  if (t < T_HOP) {
    // four pulls: each one lifts him quickly, then he resets his grip
    const s = ((t - T_CLIMB) / CLIMB) * PULLS;
    const u = (Math.floor(s) + ease(s % 1)) / PULLS;
    return { at: climbAt(u), yaw: CLIMB_YAW, pose: moves.climb(t - T_CLIMB), seated: false };
  }
  if (t < T_TURN) {
    const k = (t - T_HOP) / HOP;
    const at = climbAt(1).lerp(seat, ease(k));
    at.y += Math.sin(Math.PI * k) * 0.06;
    const pose = k < 0.5 ? mixPoses(moves.climb(t - T_CLIMB), moves.hop(), k * 2) : mixPoses(moves.hop(), moves.stand(t), (k - 0.5) * 2);
    return { at, yaw: CLIMB_YAW, pose, seated: false };
  }
  const k = ease((t - T_TURN) / TURN);
  return { at: seat, yaw: lerp(CLIMB_YAW, FACE_YAW, k), pose: moves.stand(t), seated: false };
}

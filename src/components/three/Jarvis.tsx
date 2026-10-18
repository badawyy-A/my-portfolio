import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { applyPose, buildRobot, moves, speaking } from "./avatar/robot";
import { FACE_YAW, ROBOT_HEIGHT, T_SEATED, entrance, siteReadyAt, type Marks } from "./avatar/jarvis";
import type { Director } from "./avatar/director";

export const ROBOT_MODEL = "/models/robot.glb";
/** after the loading screen opens he sets off this long later: on large screens while Badawi rises */
const LEAD = { desktop: 2.2, mobile: 0.6 };

type Props = {
  director: Director;
  marks: Marks;
  /** Badawi's smoothed gaze (Jarvis looks where he looks) */
  look: RefObject<{ yaw: number; pitch: number }>;
  reduce: boolean;
  mode: "desktop" | "mobile" | null;
  /** Avatar calls this at the end of its frame, after posing the shoulder Jarvis stands on */
  onFrame: RefObject<(() => void) | null>;
};

const now = () => performance.now() / 1000;
const head = new THREE.Vector3();
const feet = new THREE.Vector3();

/**
 * Jarvis on Badawi's shoulder: walks in from the distance, climbs his arm onto his right shoulder,
 * then rides there while the avatar is on screen. The director decides when he talks and when he
 * jumps off to the section headings (the robot in JarvisOverlay takes over there).
 */
export default function Jarvis({ director, marks, look, reduce, mode, onFrame }: Props) {
  const gltf = useLoader(GLTFLoader, ROBOT_MODEL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const robot = useMemo(() => buildRobot(gltf.scene, ROBOT_HEIGHT), [gltf]);
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const s = useRef({ start: Infinity, blinkAt: 3 });

  // when he sets off: once the loading screen opens (on large screens while Badawi rises from his crouch)
  useEffect(() => {
    const st = s.current;
    const begin = (delay: number) => (st.start = now() + delay);
    if (reduce) return void begin(-T_SEATED);
    const lead = mode === "desktop" ? LEAD.desktop : LEAD.mobile;
    if (document.documentElement.classList.contains("loading")) {
      const ready = () => begin(lead);
      window.addEventListener("site:ready", ready, { once: true });
      return () => window.removeEventListener("site:ready", ready);
    }
    // loaded late: still wait until Badawi is mostly up
    begin(siteReadyAt < 0 ? 0.4 : Math.max(0.4, siteReadyAt + lead - now()));
  }, [reduce, mode]);

  useLayoutEffect(() => {
    onFrame.current = update;
  });

  function update() {
    const st = s.current;
    const time = now();
    // the visitor scrolled on before he arrived: he is on the shoulder already
    if (director.skipEntrance && time - st.start < T_SEATED) st.start = time - T_SEATED;
    const t = time - st.start;
    const parent = robot.root.parent;
    robot.root.visible = t >= 0 && !!parent && director.heroShown;
    if (!parent || t < 0) return;

    marks.shoulder.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    const toAvatar = (p: THREE.Vector3) => parent.worldToLocal(marks.shoulder.localToWorld(p.clone()));
    const route = canvas.clientWidth / canvas.clientHeight < 0.9 ? "narrow" : "wide";
    const frame = entrance(t, route, marks, toAvatar);
    robot.root.position.copy(frame.at);
    robot.root.rotation.y = frame.yaw;

    let pose = reduce ? moves.stand(0) : frame.pose;
    if (frame.seated) {
      // looks where Badawi looks (the pointer, the page, the laptop) and talks with his hands
      const g = look.current;
      pose = { ...pose, head: [g.pitch * 0.9, g.yaw * 0.9 - (FACE_YAW - 0.2), pose.head?.[2] ?? 0] };
      if (!reduce) pose = speaking(pose, time, time - director.lineStart, director.lineId, director.level, director.talking);
    }
    applyPose(robot, pose);

    // eyes: brighter with his voice, and now and then a quick dim, like a blink
    if (t > st.blinkAt + 0.12) st.blinkAt = t + 3 + Math.random() * 3;
    const blink = !reduce && t > st.blinkAt ? 0.15 : 1;
    robot.material.emissiveIntensity = (1.2 + director.level * 3) * blink;

    // where he is on screen, for the director (also while hidden: it is where he jumps back to)
    const rect = canvas.getBoundingClientRect();
    const toScreen = (v: THREE.Vector3) => {
      v.project(camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
    director.hero = {
      seated: frame.seated,
      head: toScreen(robot.root.localToWorld(head.set(0, ROBOT_HEIGHT * 1.02, 0))),
      feet: toScreen(robot.root.localToWorld(feet.set(0, 0, 0))),
      at: time,
    };
  }

  return <primitive object={robot.root} />;
}

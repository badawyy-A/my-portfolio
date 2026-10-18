import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { applyPose, buildRobot, mixPoses, moves, type Pose } from "./avatar/robot";
import { prefersReducedMotion } from "./utils";

const ROBOT_MODEL = "/models/robot.glb";
const now = () => performance.now() / 1000;

/** What the robot is doing, set by the chat: speaking, thinking, watching the visitor type, how loud, when to wave. */
export type Activity = { speaking: boolean; thinking: boolean; typing: boolean; level: () => number; waveAt: number };

/** The 3D robot beside Jarvis's chat (loaded separately from the chat, so the chat is ready first). */
export default function JarvisStage({ activity }: { activity: RefObject<Activity> }) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 30, position: [0, 0.62, 2.7], rotation: [-0.03, 0, 0], near: 0.05, far: 20 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.setClearColor(0x000000, 0);
      }}
    >
      <Lights />
      <Suspense fallback={null}>
        <Robot activity={activity} />
      </Suspense>
    </Canvas>
  );
}

/** Jarvis on his own: waves hello, looks at the pointer, tilts his head while thinking, talks with his hands. */
function Robot({ activity }: { activity: RefObject<Activity> }) {
  const gltf = useLoader(GLTFLoader, ROBOT_MODEL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const robot = useMemo(() => buildRobot(gltf.scene, 1), [gltf]);
  const reduce = useMemo(prefersReducedMotion, []);
  const pointer = useRef({ x: 0, y: 0 });
  const blink = useRef(3);
  const state = useRef({ talk: 0, think: 0, watch: 0, level: 0 });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: (event.clientX / window.innerWidth) * 2 - 1, y: (event.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((_, delta) => {
    const a = activity.current;
    const t = now();
    const s = state.current;
    const k = Math.min(1, delta * 6);
    s.talk += ((a.speaking ? 1 : 0) - s.talk) * k;
    s.think += ((a.thinking ? 1 : 0) - s.think) * k;
    s.watch += ((a.typing && !a.speaking ? 1 : 0) - s.watch) * k;
    s.level += (a.level() - s.level) * 0.35;

    let pose: Pose = reduce ? moves.stand(0) : moves.stand(t);
    const p = pointer.current;
    pose = { ...pose, head: [p.y * 0.25, p.x * 0.5, pose.head?.[2] ?? 0] };
    if (!reduce) {
      pose = mixPoses(pose, moves.talk(t, s.level), s.talk * 0.85);
      // the visitor is typing: he looks down at what they write, head a little to one side
      pose = mixPoses(pose, { ...pose, head: [0.34, 0.12, 0.1], chest: [0.06, 0, 0] }, s.watch);
      // thinking: head tilted, looking up a little
      pose = mixPoses(pose, { ...pose, head: [-0.12, 0.2, 0.22], chest: [0.02, 0.08, 0] }, s.think);
      const w = t - a.waveAt;
      if (w >= 0 && w < 2.4) pose = mixPoses(pose, moves.wave(w), THREE.MathUtils.smoothstep(w, 0, 0.35) * (1 - THREE.MathUtils.smoothstep(w, 2.05, 2.4)));
    }
    applyPose(robot, pose);

    if (t > blink.current + 0.12) blink.current = t + 3 + Math.random() * 3;
    const thinkingGlow = s.think * (0.3 + 0.3 * Math.sin(t * 4));
    robot.material.emissiveIntensity = (1.2 + s.level * 3 + thinkingGlow) * (!reduce && t > blink.current ? 0.15 : 1);
  });

  return <primitive object={robot.root} />;
}

function Lights() {
  const legacy = Math.PI;
  return (
    <>
      <hemisphereLight args={["#fff1ea", "#1a0b0e", 0.75 * legacy]} />
      <directionalLight color="#fff4ee" intensity={1.25 * legacy} position={[-1.2, 2.2, 2.4]} />
      <directionalLight color="#ffe6e0" intensity={0.35 * legacy} position={[1.6, 1.0, 1.8]} />
      <directionalLight color="#d9455f" intensity={1.6 * legacy} position={[-2.0, 1.8, -2.2]} />
      <directionalLight color="#d9455f" intensity={1.2 * legacy} position={[2.2, 1.4, -2.0]} />
    </>
  );
}

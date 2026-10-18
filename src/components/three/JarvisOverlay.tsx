import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { applyPose, buildRobot, jumping, moves, speaking } from "./avatar/robot";
import { robotSize, type Director } from "./avatar/director";
import { ROBOT_MODEL } from "./Jarvis";

const now = () => performance.now() / 1000;
const clamp = THREE.MathUtils.clamp;
/** the small canvas he is drawn in, in units of his height; his feet sit FEET from its top */
const BOX = { w: 2.4, h: 2, feet: 1.7 };

/** Follows the director: a re-render whenever the line, the mute state or the sound permission changes. */
function useNarrator(director: Director) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = director.narrator.subscribe(rerender);
    return () => void off();
  }, [director]);
}

/**
 * Everything of Jarvis that lives outside the hero canvas: the robot on the section headings, his
 * speech bubble, the tap target over him, and the sound button.
 */
export default function JarvisOverlay({ director, sections }: { director: Director; sections: boolean }) {
  return createPortal(
    <>
      {sections && <SectionRobot director={director} />}
      <JarvisUI director={director} />
    </>,
    document.body,
  );
}

function JarvisUI({ director }: { director: Director }) {
  useNarrator(director);
  const bubble = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const shown = useRef("");
  const { narrator } = director;
  if (narrator.current) shown.current = narrator.current.id;
  const line = narrator.lines[shown.current];
  const on = narrator.audible;

  useEffect(() => {
    director.ui = { bubble: bubble.current, button: button.current };
  }, [director]);

  return (
    <>
      <div ref={bubble} className="jarvis-bubble" aria-hidden="true">
        <span className="jarvis-name">Jarvis</span>
        {line && (
          <span className="jarvis-line" key={shown.current}>
            {line.words.map((word, i) => (
              <span key={i} data-word>
                {word.text}{" "}
              </span>
            ))}
          </span>
        )}
      </div>
      <button ref={button} type="button" className="jarvis-hit" hidden onClick={() => director.explain()} aria-label="Ask Jarvis about this section" />
      <button
        type="button"
        className="jarvis-sound"
        aria-pressed={on}
        aria-label="Jarvis's voice"
        title={on ? "Mute Jarvis" : "Turn Jarvis's voice on"}
        onClick={() => narrator.setMuted(narrator.audible)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          {on ? (
            <>
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </>
          ) : (
            <path d="m16 9 6 6m0-6-6 6" />
          )}
        </svg>
      </button>
    </>
  );
}

/** The robot on the section headings, drawn in a small canvas that moves around the page. */
function SectionRobot({ director }: { director: Director }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(robotSize);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onResize = () => setSize(robotSize());
    window.addEventListener("resize", onResize);
    // only draw while he is out here (the canvas sleeps while he rides on Badawi's shoulder)
    let raf = 0;
    const watch = () => {
      setShown(director.robot.shown);
      raf = requestAnimationFrame(watch);
    };
    raf = requestAnimationFrame(watch);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [director]);

  return (
    <div
      ref={box}
      className="jarvis-stage"
      aria-hidden="true"
      style={{ width: size * BOX.w, height: size * BOX.h, transformOrigin: `50% ${size * BOX.feet}px`, visibility: shown ? "visible" : "hidden" }}
    >
      <Canvas
        orthographic
        frameloop={shown ? "always" : "never"}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        // looking straight ahead (a rotation stops the default aim at the origin, his feet)
        camera={{ zoom: size, position: [0, BOX.feet - BOX.h / 2, 10], rotation: [0, 0, 0], near: 0.1, far: 50 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Lights />
        <Suspense fallback={null}>
          <Robot director={director} box={box} size={size} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function Robot({ director, box, size }: { director: Director; box: React.RefObject<HTMLDivElement | null>; size: number }) {
  const gltf = useLoader(GLTFLoader, ROBOT_MODEL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const robot = useMemo(() => buildRobot(gltf.scene, 1), [gltf]);
  const camera = useThree((state) => state.camera);
  const pointer = useRef({ x: -1, y: -1 });
  const blink = useRef(3);

  useEffect(() => {
    const onMove = (event: PointerEvent) => (pointer.current = { x: event.clientX, y: event.clientY });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame(() => {
    const r = director.robot;
    const t = now();
    if (camera.zoom !== size) {
      camera.zoom = size;
      camera.updateProjectionMatrix();
    }
    if (box.current) box.current.style.transform = `translate(${r.x - (size * BOX.w) / 2}px, ${r.y - size * BOX.feet}px) scale(${r.scale})`;

    let pose;
    let yaw = r.yaw;
    let squash = 1;
    if (r.jump >= 0) {
      // turned toward where he is jumping, squashed at take-off and landing, stretched in the air
      pose = jumping(r.jump, t);
      yaw = r.dir * 0.9 * Math.sin(Math.PI * clamp(r.jump, 0, 1));
      squash = r.jump < 0.2 || r.jump > 0.85 ? 0.93 : 1.04;
    } else {
      // looks at the pointer, talks with his hands
      const p = pointer.current;
      const look: [number, number, number] =
        p.x < 0 ? [0, 0, 0] : [clamp((p.y - (r.y - size * 0.7)) / window.innerHeight, -0.35, 0.45), clamp(((p.x - r.x) / window.innerWidth) * 1.6, -0.7, 0.7) - yaw, 0];
      pose = { ...moves.stand(t), head: look };
      pose = speaking(pose, t, t - director.lineStart, director.lineId, director.level, director.talking);
    }
    applyPose(robot, pose);
    robot.root.rotation.y = yaw;
    robot.root.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    if (t > blink.current + 0.12) blink.current = t + 3 + Math.random() * 3;
    robot.material.emissiveIntensity = (1.2 + director.level * 3) * (t > blink.current ? 0.15 : 1);
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

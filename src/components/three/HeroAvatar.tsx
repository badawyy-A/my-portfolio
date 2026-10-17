import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { hasWebGL, prefersReducedMotion, useInView } from "./utils";
import { X, Y, Z, rig, rotateWorld } from "./avatar/rig";
import { buildFurniture, type Furniture } from "./avatar/furniture";
import { crouchIntro, scrollSequence, scrollSequenceMobile, type View } from "./avatar/sequence";

const MODEL = "/models/avatar.glb";
// the photo-based face has slightly lowered eyes; holding the head a touch higher makes him look at you
const HEAD_LIFT = 0.1;
type Mode = "desktop" | "mobile" | null;

const bodyQuat = new THREE.Quaternion();
const pitchAxis = new THREE.Vector3();


function Avatar({ reduce, mode, onReady }: { reduce: boolean; mode: Mode; onReady: () => void }) {
  const { scene } = useLoader(GLTFLoader, MODEL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const avatar = useRef(rig(scene));
  const furniture = useMemo<Furniture>(() => {
    scene.userData.furniture ??= buildFurniture(avatar.current.layout);
    return scene.userData.furniture;
  }, [scene]);
  const pointer = useRef({ x: 0, y: 0, last: -Infinity });
  const look = useRef({ yaw: 0, pitch: 0 });
  const blink = useRef({ next: 2.5, start: -1 });
  const ready = useRef(false);
  const body = useRef<THREE.Group>(null);
  // hero pose: standing, arms relaxed at his sides (the desktop intro starts from a crouch instead)
  const view = useRef<View>({ dz: 0, dy: 0, dlook: 0, crouch: 0, nod: 0, shrug: 0, sit: 0, typing: 0, screen: 0, scripted: 0 });
  const frame = useRef({ z: 1.7, y: 1.2, look: 1.2 });

  useLayoutEffect(() => {
    const { focusY } = avatar.current;
    const narrow = size.width / size.height < 0.9;
    frame.current = { z: narrow ? 1.95 : 1.75, y: focusY - 0.02, look: focusY - (narrow ? 0.1 : 0.04) };
  }, [size]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight * 0.35;
      pointer.current.x = THREE.MathUtils.clamp((event.clientX - cx) / (window.innerWidth / 2), -1, 1);
      pointer.current.y = THREE.MathUtils.clamp((event.clientY - cy) / (window.innerHeight / 2), -1, 1);
      pointer.current.last = performance.now();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const { head, neck, spine, lowerSpine, shoulders, base, blinkers, arms, legs, drop } = avatar.current;
    const t = state.clock.elapsedTime;
    const { z, y, look: lookAt } = frame.current;
    const v = view.current;
    camera.position.set(0, y + v.dy, z + v.dz);
    camera.lookAt(0, lookAt + v.dlook, 0);

    // where the head looks: the mouse in the hero; past it, toward the content (right on desktop,
    // down at the text on phones); at the desk, down at the laptop
    const scrolled = mode !== null && window.scrollY > 200;
    const idle = performance.now() - pointer.current.last > 4000;
    let gx = idle && !reduce ? Math.sin(t * 0.4) * 0.25 : pointer.current.x;
    let gy = idle && !reduce ? Math.sin(t * 0.27) * 0.08 : pointer.current.y;
    if (v.scripted) {
      gx = 0;
      gy = 0;
    } else if (mode === "desktop" && v.typing > 0.5) {
      gx = 0;
      gy = 1.6;
    } else if (scrolled) {
      gx = mode === "desktop" ? 0.55 : 0.25;
      gy = mode === "desktop" ? 0.1 : 0.55;
    }

    // 0.07 per frame at 60 fps, independent of the actual frame rate
    const k = 1 - Math.pow(1 - 0.07, Math.min(delta, 0.1) * 60);
    look.current.yaw += (gx * 0.7 - look.current.yaw) * k;
    look.current.pitch += (gy * 0.35 - look.current.pitch) * k;
    const { yaw, pitch } = look.current;

    // nod around the body's own sideways axis, so it stays a nod when the body has turned
    body.current?.getWorldQuaternion(bodyQuat);
    pitchAxis.copy(X).applyQuaternion(bodyQuat);
    const aim = (bone: THREE.Object3D | undefined, yawAmount: number, pitchAmount: number) => {
      if (!bone) return;
      bone.quaternion.copy(base.get(bone)!);
      bone.updateMatrixWorld(true);
      rotateWorld(bone, Y, yawAmount);
      rotateWorld(bone, pitchAxis, pitchAmount);
    };
    // the crouch curls the whole spine, a third at each joint; a small negative crouch is the stretch
    const bend = v.crouch * 0.34;
    for (const joint of lowerSpine) {
      joint.bone.quaternion.copy(joint.base);
      joint.bone.updateMatrixWorld(true);
      rotateWorld(joint.bone, pitchAxis, bend);
    }
    const breath = reduce ? 0 : Math.sin(t * 1.4) * 0.012;
    aim(spine, yaw * 0.15, breath + v.typing * 0.12 + bend);
    aim(neck, yaw * 0.35, pitch * 0.35);
    aim(head, yaw * 0.55, pitch * 0.6 + v.nod - HEAD_LIFT);

    // legs: standing or seated (sinking onto the chair)
    for (const leg of legs) leg.bone.quaternion.slerpQuaternions(leg.stand, leg.seated, v.sit);
    scene.position.y = -drop * v.sit;

    // collarbones lift a little in the stretch
    for (const shoulder of shoulders) {
      shoulder.bone.quaternion.copy(shoulder.base);
      shoulder.bone.updateMatrixWorld(true);
      rotateWorld(shoulder.bone, Z, shoulder.side * 0.1 * v.shrug);
    }

    // arms: relaxed at his sides, or on the keyboard
    for (const arm of arms) {
      arm.bone.quaternion.slerpQuaternions(arm.rest, arm.typing, v.typing);
      // while he is bent over, the arms hang down from the shoulders instead of following the torso
      if (arm.kind === "arm" && v.crouch > 0) {
        arm.bone.updateMatrixWorld(true);
        rotateWorld(arm.bone, pitchAxis, -v.crouch);
      }
    }
    if (v.typing > 0.85 && !reduce) {
      for (const arm of arms) {
        arm.bone.updateMatrixWorld(true);
        if (arm.kind === "forearm") rotateWorld(arm.bone, pitchAxis, Math.sin(t * 13 + arm.side * 1.7) * 0.025);
        if (arm.kind === "hand") rotateWorld(arm.bone, pitchAxis, Math.max(0, Math.sin(t * 19 + arm.side * 2.3)) * 0.12);
      }
    }

    // laptop screen fades on and flickers a little, lighting the face
    furniture.screen.opacity = v.screen;
    furniture.light.intensity = v.screen * (1.6 + Math.sin(t * 23) * 0.15 + Math.sin(t * 7.3) * 0.1);

    if (!reduce && blinkers.length) {
      if (blink.current.start < 0 && t > blink.current.next) blink.current.start = t;
      let amount = 0;
      if (blink.current.start >= 0) {
        const p = (t - blink.current.start) / 0.16;
        amount = p < 1 ? Math.sin(p * Math.PI) : 0;
        if (p >= 1) {
          blink.current.start = -1;
          blink.current.next = t + 2.5 + Math.random() * 3.5;
        }
      }
      for (const mesh of blinkers) {
        const dict = mesh.morphTargetDictionary!;
        mesh.morphTargetInfluences![dict.eyeBlinkLeft] = amount;
        mesh.morphTargetInfluences![dict.eyeBlinkRight] = amount;
      }
    }

    if (!ready.current) {
      ready.current = true;
      furniture.desk.visible = mode === "desktop";
      furniture.desk.position.y = -1.6;
      if (mode === "desktop" && body.current) {
        crouchIntro(body.current, v);
        scrollSequence(body.current, v, furniture, drop);
      }
      if (mode === "mobile" && body.current) scrollSequenceMobile(body.current, v);
      onReady();
    }
  });

  return (
    <group ref={body}>
      <primitive object={scene} />
      <primitive object={furniture.desk} />
    </group>
  );
}

function Lights() {
  const legacy = Math.PI; // the reference used three r128 light units
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

export default function HeroAvatar() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const [supported, setSupported] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    setSupported(hasWebGL());
    setReduce(prefersReducedMotion());
    const root = document.documentElement.classList;
    setMode(root.contains("choreo") ? "desktop" : root.contains("choreo-m") ? "mobile" : null);
  }, []);

  const onReady = () => {
    setReady(true);
    box.current?.closest("[data-hero]")?.setAttribute("data-avatar", "ready");
    window.dispatchEvent(new Event("avatar:ready"));
  };

  return (
    <div ref={box} className={`avatar-canvas${ready ? " is-ready" : ""}`}>
      {supported && (
        <Canvas
          frameloop={inView ? "always" : "never"}
          dpr={mode === "mobile" ? [1, 1.5] : [1, 1.75]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          camera={{ fov: 26, near: 0.05, far: 20, position: [0, 1.2, 1.7] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            gl.setClearColor(0x000000, 0);
          }}
        >
          <Lights />
          <Suspense fallback={null}>
            <Avatar reduce={reduce} mode={mode} onReady={onReady} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}

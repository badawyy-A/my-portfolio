import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { hasWebGL, prefersReducedMotion, useInView } from "./utils";

const MODEL = "/models/avatar.glb";
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const parentQuat = new THREE.Quaternion();
const turn = new THREE.Quaternion();

/** Rotate a bone about a world-space axis, on top of its current pose. */
function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(parentQuat);
  turn.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(parentQuat.clone().invert().multiply(turn).multiply(parentQuat));
  bone.updateMatrixWorld(true);
}

type Rig = {
  head?: THREE.Object3D;
  neck?: THREE.Object3D;
  spine?: THREE.Object3D;
  base: Map<THREE.Object3D, THREE.Quaternion>;
  blinkers: THREE.Mesh[];
  focusY: number;
};

/** Pose the T-posed avatar once: arms down, remember the bind pose of the bones we animate. */
function rig(scene: THREE.Object3D): Rig {
  if (scene.userData.rig) return scene.userData.rig;

  const bone = (name: string) => scene.getObjectByName(name);
  const blinkers: THREE.Mesh[] = [];

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.frustumCulled = false;
    if (obj.morphTargetDictionary && "eyeBlinkLeft" in obj.morphTargetDictionary) blinkers.push(obj);
    const material = obj.material as THREE.MeshStandardMaterial;
    if (material.map) material.map.anisotropy = 4;
  });
  scene.updateMatrixWorld(true);

  const side = (obj: THREE.Object3D) => (obj.getWorldPosition(new THREE.Vector3()).x >= 0 ? 1 : -1);
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

  const head = bone("Head");
  const neck = bone("Neck");
  const spine = bone("Spine2") ?? bone("Spine1");
  const base = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const b of [head, neck, spine]) if (b) base.set(b, b.quaternion.clone());
  const focusY = head ? head.getWorldPosition(new THREE.Vector3()).y : 1.55;

  const result: Rig = { head, neck, spine, base, blinkers, focusY };
  scene.userData.rig = result;
  return result;
}

function Avatar({ reduce, onReady }: { reduce: boolean; onReady: () => void }) {
  const { scene } = useLoader(GLTFLoader, MODEL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const avatar = useRef<Rig>(rig(scene));
  const pointer = useRef({ x: 0, y: 0, last: -Infinity });
  const look = useRef({ yaw: 0, pitch: 0 });
  const blink = useRef({ next: 2.5, start: -1 });
  const ready = useRef(false);

  useLayoutEffect(() => {
    const { focusY } = avatar.current;
    const narrow = size.width / size.height < 0.9;
    camera.position.set(0, focusY - 0.02, narrow ? 1.9 : 1.7);
    camera.lookAt(0, focusY - (narrow ? 0.08 : 0.06), 0);
  }, [camera, size]);

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
    const { head, neck, spine, base, blinkers } = avatar.current;
    const t = state.clock.elapsedTime;
    const idle = performance.now() - pointer.current.last > 4000;
    const gx = idle && !reduce ? Math.sin(t * 0.4) * 0.25 : pointer.current.x;
    const gy = idle && !reduce ? Math.sin(t * 0.27) * 0.08 : pointer.current.y;

    // 0.07 per frame at 60 fps, independent of the actual frame rate
    const k = 1 - Math.pow(1 - 0.07, Math.min(delta, 0.1) * 60);
    look.current.yaw += (gx * 0.7 - look.current.yaw) * k;
    look.current.pitch += (gy * 0.35 - look.current.pitch) * k;
    const { yaw, pitch } = look.current;

    const aim = (bone: THREE.Object3D | undefined, yawAmount: number, pitchAmount: number) => {
      if (!bone) return;
      bone.quaternion.copy(base.get(bone)!);
      bone.updateMatrixWorld(true);
      rotateWorld(bone, Y, yawAmount);
      rotateWorld(bone, X, pitchAmount);
    };
    aim(spine, yaw * 0.15, reduce ? 0 : Math.sin(t * 1.4) * 0.012);
    aim(neck, yaw * 0.35, pitch * 0.35);
    aim(head, yaw * 0.55, pitch * 0.6);

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
      onReady();
    }
  });

  return <primitive object={scene} />;
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

  useEffect(() => {
    setSupported(hasWebGL());
    setReduce(prefersReducedMotion());
  }, []);

  const onReady = () => {
    setReady(true);
    box.current?.closest("[data-hero]")?.setAttribute("data-avatar", "ready");
  };

  return (
    <div ref={box} className={`avatar-canvas${ready ? " is-ready" : ""}`}>
      {supported && (
        <Canvas
          frameloop={inView ? "always" : "never"}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          camera={{ fov: 26, near: 0.05, far: 20, position: [0, 1.55, 1.55] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            gl.setClearColor(0x000000, 0);
          }}
        >
          <Lights />
          <Suspense fallback={null}>
            <Avatar reduce={reduce} onReady={onReady} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}

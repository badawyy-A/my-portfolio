import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { hasWebGL, prefersReducedMotion, useInView } from "./utils";
import type { SceneDef } from "./scenes/common";
import { glasses } from "./scenes/glasses";
import { ekyc } from "./scenes/ekyc";
import { docReader } from "./scenes/document";
import { rag } from "./scenes/rag";
import { etl } from "./scenes/etl";

const SCENES: Record<string, SceneDef> = { glasses, ekyc, document: docReader, rag, etl };

// one shared pointer for every scene on the page, normalised to -1..1 across the viewport
const pointer = { x: 0, y: 0, listening: false };
function listen() {
  if (pointer.listening) return;
  pointer.listening = true;
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );
}

function Runner({ def, reduce, onReady }: { def: SceneDef; reduce: boolean; onReady: () => void }) {
  const built = useMemo(() => def.build(), [def]);
  const ready = useRef(false);
  const tilt = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useLayoutEffect(() => {
    const { position, target, fov } = def.camera;
    const cam = camera as THREE.PerspectiveCamera;
    // keep the scene inside narrower frames by stepping back a little
    const aspect = size.width / size.height;
    const back = aspect < 4 / 3 ? (4 / 3) / aspect : 1;
    cam.fov = fov;
    cam.position.set(...position).sub(new THREE.Vector3(...target)).multiplyScalar(back).add(new THREE.Vector3(...target));
    cam.lookAt(...target);
    cam.updateProjectionMatrix();
  }, [camera, size, def]);

  useFrame((state, delta) => {
    built.update(reduce ? def.still : state.clock.elapsedTime);
    if (!ready.current) {
      ready.current = true;
      onReady();
    }
    const group = tilt.current;
    if (!group || reduce) return;
    const k = 1 - Math.pow(0.94, Math.min(delta, 0.1) * 60);
    group.rotation.y += (pointer.x * 0.22 - group.rotation.y) * k;
    group.rotation.x += (pointer.y * 0.1 - group.rotation.x) * k;
  });

  return (
    <group ref={tilt}>
      <primitive object={built.root} />
    </group>
  );
}

export default function ProjectScene({ scene }: { scene: string }) {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const [supported, setSupported] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [ready, setReady] = useState(false);
  const def = SCENES[scene];

  useEffect(() => {
    setSupported(hasWebGL());
    setReduce(prefersReducedMotion());
    listen();
  }, []);

  return (
    <div ref={box} className={`scene-canvas${ready ? " is-ready" : ""}`}>
      {supported && def && (
        <Canvas
          // under reduced motion a single frame is drawn and nothing moves
          frameloop={reduce ? "demand" : inView ? "always" : "never"}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: def.camera.fov, near: 0.1, far: 50, position: def.camera.position }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <Runner def={def} reduce={reduce} onReady={() => setReady(true)} />
        </Canvas>
      )}
    </div>
  );
}

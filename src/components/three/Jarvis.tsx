import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { applyPose, buildRobot, mixPoses, moves } from "./avatar/robot";
import { FACE_YAW, ROBOT_HEIGHT, T_GREET, T_SEATED, T_WAVE, entrance, siteReadyAt, type Marks } from "./avatar/jarvis";
import { Voice, type Line } from "./avatar/voice";

const MODEL = "/models/robot.glb";
const AUDIO = "/audio/jarvis-hello";
const WAVE = 2.4;
/** how long the bubble stays after he finishes (or, without sound, how long it stays at all) */
const LINGER = 2.5;
const READ = 9;
/** on large screens he sets off this long after the loading screen opens, while Badawi rises */
const INTRO_LEAD = 2.2;
/** the fixed header's height; the bubble stays below it */
const HEADER = 76;

/** Shared between the 3D robot (in the canvas) and his speech bubble and tap target (in the page). */
export type JarvisLink = {
  bubble: RefObject<HTMLDivElement | null>;
  button: RefObject<HTMLButtonElement | null>;
  greet: RefObject<(() => void) | null>;
  line: Line | null;
};

type Props = {
  link: JarvisLink;
  marks: Marks;
  /** Badawi's smoothed gaze (Jarvis looks where he looks) */
  look: RefObject<{ yaw: number; pitch: number }>;
  reduce: boolean;
  mode: "desktop" | "mobile" | null;
  visible: boolean;
  /** Avatar calls this at the end of its frame, after posing the shoulder Jarvis stands on */
  onFrame: RefObject<(() => void) | null>;
};

const now = () => performance.now() / 1000;
const ss = THREE.MathUtils.smoothstep;
const head = new THREE.Vector3();
const feet = new THREE.Vector3();

/**
 * Jarvis, Badawi's little robot assistant: walks in from the distance, climbs his arm onto his right
 * shoulder, waves and says hello (sound only once the browser allows it, with the words in a speech
 * bubble either way). Tapping him plays the greeting again.
 */
export default function Jarvis({ link, marks, look, reduce, mode, visible, onFrame }: Props) {
  const gltf = useLoader(GLTFLoader, MODEL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const robot = useMemo(() => buildRobot(gltf.scene, ROBOT_HEIGHT), [gltf]);
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const voice = useMemo(() => new Voice(`${AUDIO}.mp3`), []);
  const { bubble, button, line } = link;
  const s = useRef({ start: Infinity, waveAt: -Infinity, tried: false, pending: false, speaking: false, until: -Infinity, said: -2, blinkAt: 3 });

  const greet = async () => {
    const ok = await voice.play();
    const st = s.current;
    if (ok) {
      Object.assign(st, { pending: false, speaking: true, until: Infinity, waveAt: Math.max(st.waveAt, now() - 0.3) });
      if (now() - st.waveAt > WAVE) st.waveAt = now();
    }
    return ok;
  };
  useLayoutEffect(() => {
    link.greet.current = greet;
    onFrame.current = update;
  });

  // when he sets off: on large screens once Badawi is mostly up from his crouch, elsewhere right away
  useEffect(() => {
    const st = s.current;
    const begin = (delay: number) => {
      st.start = now() + delay;
      st.waveAt = reduce ? -Infinity : st.start + T_WAVE;
    };
    if (reduce) return begin(-T_SEATED);
    if (mode === "desktop") {
      if (document.documentElement.classList.contains("loading")) {
        const ready = () => begin(INTRO_LEAD);
        window.addEventListener("site:ready", ready, { once: true });
        return () => window.removeEventListener("site:ready", ready);
      }
      // loaded late: still wait until Badawi is mostly up
      return begin(siteReadyAt < 0 ? 0.4 : Math.max(0.4, siteReadyAt + INTRO_LEAD - now()));
    }
    begin(0.8);
  }, [reduce, mode]);

  // without sound so far, the visitor's first click or key press (while the hero is on screen) plays it
  useEffect(() => {
    const onGesture = (event: Event) => {
      if (!s.current.pending || window.scrollY > window.innerHeight * 0.5) return;
      if (button.current?.contains(event.target as Node)) return;
      greet();
    };
    window.addEventListener("click", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("click", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
      voice.stop();
    };
  }, []);

  function update() {
    const st = s.current;
    const time = now();
    const t = time - st.start;
    const parent = robot.root.parent;
    robot.root.visible = t >= 0 && !!parent;
    if (!parent || t < 0) return hideUI();

    marks.shoulder.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    const toAvatar = (p: THREE.Vector3) => parent.worldToLocal(marks.shoulder.localToWorld(p.clone()));
    const route = canvas.clientWidth / canvas.clientHeight < 0.9 ? "narrow" : "wide";
    const frame = entrance(t, route, marks, toAvatar);
    robot.root.position.copy(frame.at);
    robot.root.rotation.y = frame.yaw;

    let pose = reduce ? moves.stand(0) : frame.pose;
    const level = voice.level();
    if (frame.seated) {
      // looks where Badawi looks (the pointer, the page, the laptop), nods along while he talks
      const g = look.current;
      pose = { ...pose, head: [g.pitch * 0.9 - level * 0.18, g.yaw * 0.9 - (FACE_YAW - 0.2), pose.head?.[2] ?? 0] };
      const w = time - st.waveAt;
      if (!reduce && w >= 0 && w < WAVE) pose = mixPoses(pose, moves.wave(w), ss(w, 0, 0.35) * (1 - ss(w, WAVE - 0.35, WAVE)));
    }
    applyPose(robot, pose);

    // eyes: brighter with his voice, and now and then a quick dim, like a blink
    if (t > st.blinkAt + 0.12) st.blinkAt = t + 3 + Math.random() * 3;
    const blink = !reduce && t > st.blinkAt ? 0.15 : 1;
    robot.material.emissiveIntensity = (1.2 + level * 3) * blink;

    if (frame.seated && !st.tried && t >= T_GREET) {
      st.tried = true;
      greet().then((ok) => {
        if (!ok) Object.assign(st, { pending: true, until: now() + READ });
      });
    }
    if (st.speaking && voice.time() < 0) Object.assign(st, { speaking: false, until: time + LINGER });

    placeUI(frame.seated, time);
  }

  function hideUI() {
    bubble.current?.classList.remove("is-on");
    if (button.current) button.current.hidden = true;
  }

  function placeUI(seated: boolean, time: number) {
    const st = s.current;
    const rect = canvas.getBoundingClientRect();
    const toScreen = (v: THREE.Vector3) => {
      v.project(camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
    const top = toScreen(robot.root.localToWorld(head.set(0, ROBOT_HEIGHT * 1.02, 0)));
    const bottom = toScreen(robot.root.localToWorld(feet.set(0, 0, 0)));
    const onScreen = visible && top.y < window.innerHeight && bottom.y > 0 && bottom.x > 0 && bottom.x < window.innerWidth;

    const hit = button.current;
    if (hit) {
      hit.hidden = !(seated && onScreen);
      const h = bottom.y - top.y;
      hit.style.transform = `translate(${top.x - h * 0.4}px, ${top.y}px)`;
      hit.style.width = `${h * 0.8}px`;
      hit.style.height = `${h}px`;
    }

    const el = bubble.current;
    if (!el || !line) return;
    const show = seated && onScreen && (st.speaking || time < st.until);
    el.classList.toggle("is-on", show);
    if (!show) return;
    // the words light up as he says them; without sound the whole line shows at once
    const said = st.speaking ? line.words.filter((w) => w.start <= voice.time()).length : st.pending ? -1 : line.words.length;
    if (said !== st.said) {
      st.said = said;
      el.classList.toggle("is-silent", said < 0);
      el.querySelectorAll("[data-word]").forEach((word, i) => word.classList.toggle("is-said", i < said));
    }
    // above his head, reaching away from Badawi's face; where that would run into the header and
    // Badawi's face (phones), below his feet instead
    const w = el.offsetWidth;
    const left = THREE.MathUtils.clamp(top.x - w + 34, 12, window.innerWidth - w - 12);
    const above = top.y - el.offsetHeight - 12;
    const below = above < HEADER;
    el.classList.toggle("is-below", below);
    el.style.transform = `translate(${left}px, ${below ? bottom.y + 12 : above}px)`;
    el.style.setProperty("--tail", `${THREE.MathUtils.clamp(top.x - left, 18, w - 18)}px`);
  }

  return <primitive object={robot.root} />;
}

/** Loads the greeting's words for the speech bubble. */
export function useLine() {
  const [line, setLine] = useState<Line | null>(null);
  useEffect(() => {
    fetch(`${AUDIO}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setLine)
      .catch(() => {});
  }, []);
  return line;
}

/** The speech bubble and the tap target over Jarvis, outside the canvas; Jarvis moves them each frame. */
export function JarvisUI({ link }: { link: JarvisLink }) {
  return createPortal(
    <>
      <div ref={link.bubble} className="jarvis-bubble" aria-hidden="true">
        <span className="jarvis-name">Jarvis</span>
        {link.line && (
          <span className="jarvis-line">
            {link.line.words.map((word, i) => (
              <span key={i} data-word>
                {word.text}{" "}
              </span>
            ))}
          </span>
        )}
      </div>
      <button
        ref={link.button}
        type="button"
        className="jarvis-hit"
        hidden
        onClick={() => link.greet.current?.()}
        aria-label="Jarvis, Badawi's assistant: play his greeting"
      />
    </>,
    document.body,
  );
}

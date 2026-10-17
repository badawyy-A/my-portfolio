import * as THREE from "three";
import { C, card, color, dotTexture, flat, line, ramp, random, textBars, type SceneDef } from "./common";

const CYCLE = 6;
const COUNT = 16;

export const rag: SceneDef = {
  camera: { position: [0, 0.3, 6.2], target: [0, 0, 0], fov: 38 },
  still: 3.4,
  build() {
    const root = new THREE.Group();
    const rand = random(5);

    // the question at the centre
    const question = new THREE.Group();
    const pill = card(0.9, 0.26, 0.13, "#2a1219", C.accent);
    const ask = textBars([0.5], 0, 0.04, C.fg, 0.85);
    ask.group.position.set(-0.25, 0, 0);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: dotTexture(), color: C.accent, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.scale.set(1.8, 1.8, 1);
    glow.position.z = -0.05;
    question.add(glow, pill.group, ask.group);
    question.position.z = 0.3;
    root.add(question);

    // article cards spread around it, on a loose shell
    const cards = Array.from({ length: COUNT }, (_, i) => {
      const a = (i / COUNT) * Math.PI * 2 + rand() * 0.3;
      const r = 1.55 + rand() * 0.6;
      const home = new THREE.Vector3(Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.62, -0.6 + rand() * 1.2);
      const c = card(0.44, 0.56, 0.03, C.card, C.line);
      const bars = textBars([0.3, 0.26, 0.3, 0.18, 0.28], 0.075, 0.022, C.muted, 0.5);
      bars.group.position.set(-0.15, 0.16, 0);
      // own material per card so it can light up alone
      const barMaterial = flat(C.muted, 0.5);
      bars.group.children.forEach((bar) => ((bar as THREE.Mesh).material = barMaterial));
      c.group.add(bars.group);
      c.group.position.copy(home);
      c.group.rotation.set((rand() - 0.5) * 0.3, (rand() - 0.5) * 0.5 - home.x * 0.08, (rand() - 0.5) * 0.2);
      root.add(c.group);
      const link = line([new THREE.Vector3(), new THREE.Vector3()], C.accent, 0);
      root.add(link);
      return { ...c, barMaterial, home, phase: rand() * Math.PI * 2, link };
    });

    const dim = color(C.line);
    const lit = color(C.accent);
    const target = new THREE.Vector3();

    return {
      root,
      update(t) {
        const round = Math.floor(t / CYCLE);
        const c = (t / CYCLE - round) * CYCLE;
        // three different cards answer each question
        const chosen = new Set([(round * 5) % COUNT, (round * 5 + 6) % COUNT, (round * 5 + 11) % COUNT]);
        const light = ramp(c, 0.4, 1.0) * (1 - ramp(c, 5.0, 5.6));
        const drift = ramp(c, 1.0, 2.6) * (1 - ramp(c, 4.2, 5.6));

        cards.forEach((item, i) => {
          const on = chosen.has(i);
          const bob = Math.sin(t * 0.7 + item.phase) * 0.05;
          target.copy(item.home).multiplyScalar(0.42).setZ(0.15);
          item.group.position.copy(item.home);
          if (on) item.group.position.lerp(target, drift);
          item.group.position.y += bob;
          const k = on ? light : 0;
          (item.edge.material as THREE.LineBasicMaterial).color.copy(dim).lerp(lit, k);
          item.barMaterial.opacity = 0.5 + k * 0.4;
          const linkMaterial = item.link.material as THREE.LineBasicMaterial;
          linkMaterial.opacity = on ? 0.55 * drift : 0;
          if (on) {
            const pos = item.link.geometry.getAttribute("position") as THREE.BufferAttribute;
            pos.setXYZ(0, item.group.position.x, item.group.position.y, item.group.position.z);
            pos.setXYZ(1, 0, 0, 0.3);
            pos.needsUpdate = true;
          }
        });
        glow.material.opacity = 0.35 + 0.25 * drift + Math.sin(t * 1.6) * 0.05;
        question.position.y = Math.sin(t * 0.9) * 0.03;
      },
    };
  },
};

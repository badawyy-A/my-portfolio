import * as THREE from "three";
import { C, card, flat, fract, line, loop, ramp, roundedRectPoints, textBars, type SceneDef } from "./common";

const CYCLE = 7;

type Block = { group: THREE.Group; box: THREE.LineLoop; height: number; delay: number };

/** Detection box drawn around a layout block. */
function box(w: number, h: number) {
  const outline = loop(roundedRectPoints(w + 0.08, h + 0.08, 0.02, 2), C.accent, 0);
  outline.position.z = 0.004;
  return outline;
}

export const docReader: SceneDef = {
  camera: { position: [0, 2.4, 4.4], target: [0, 0.35, 0], fov: 36 },
  still: 3.6,
  build() {
    const root = new THREE.Group();
    const page = new THREE.Group();
    const sheet = card(1.7, 2.2, 0.03, "#1a1013", C.muted);
    page.add(sheet.group);

    const blocks: Block[] = [];
    const add = (content: THREE.Object3D, x: number, y: number, w: number, h: number, height: number, delay: number) => {
      const group = new THREE.Group();
      content.position.x -= w / 2;
      content.position.y += h / 2;
      group.add(content);
      const outline = box(w, h);
      group.add(outline);
      group.position.set(x, y, 0);
      page.add(group);
      blocks.push({ group, box: outline, height, delay });
      return group;
    };

    // title (Arabic reads right to left, so lines hang from the right edge)
    const title = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.11), flat(C.fg, 0.85));
    title.position.set(0.45, -0.055, 0.003);
    const titleGroup = new THREE.Group();
    titleGroup.add(title);
    add(titleGroup, 0.2, 0.85, 0.9, 0.11, 0.85, 0);

    const paragraph = (widths: number[]) => {
      const bars = textBars(widths, 0.085, 0.035, C.muted, 0.7);
      // right-align each bar
      bars.group.children.forEach((bar, i) => (bar.position.x = 1.3 - widths[i] / 2));
      return bars.group;
    };
    add(paragraph([1.3, 1.22, 1.3, 0.9]), 0, 0.53, 1.3, 0.3, 0.6, 0.08);
    add(paragraph([1.3, 1.26, 1.1]), 0, 0.12, 1.3, 0.21, 0.45, 0.14);

    // table
    const table = new THREE.Group();
    const tw = 1.3;
    const th = 0.42;
    for (let r = 0; r <= 3; r++) table.add(line([new THREE.Vector3(0, -(r * th) / 3, 0.003), new THREE.Vector3(tw, -(r * th) / 3, 0.003)], C.muted, 0.6));
    for (let c = 0; c <= 3; c++) table.add(line([new THREE.Vector3((c * tw) / 3, 0, 0.003), new THREE.Vector3((c * tw) / 3, -th, 0.003)], C.muted, 0.6));
    add(table, 0, -0.33, tw, th, 0.3, 0.2);

    // signature
    const squiggle = line(
      Array.from({ length: 40 }, (_, i) => {
        const x = (i / 39) * 0.5;
        return new THREE.Vector3(x, -0.06 + Math.sin(i * 0.55) * 0.04 + Math.sin(i * 0.17) * 0.03, 0.003);
      }),
      C.fg,
      0.8,
    );
    add(squiggle, -0.38, -0.85, 0.5, 0.12, 0.5, 0.26);

    // stamp, partly over the table: it lifts off and fades away
    const stamp = new THREE.Group();
    const ringMaterial = flat(C.accent, 0.85);
    stamp.add(new THREE.Mesh(new THREE.RingGeometry(0.19, 0.215, 48), ringMaterial));
    stamp.add(new THREE.Mesh(new THREE.RingGeometry(0.13, 0.142, 48), ringMaterial));
    for (let i = 0; i < 10; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.035), ringMaterial);
      const a = (i / 10) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 0.165, Math.sin(a) * 0.165, 0);
      tick.rotation.z = a;
      stamp.add(tick);
    }
    stamp.position.set(0.21, -0.21, 0.006);
    stamp.rotation.z = 0.4;
    const stampGroup = add(stamp, 0.42, -0.62, 0.42, 0.42, 0.95, 0.04);
    const stampBlock = blocks.at(-1)!;

    page.rotation.x = -1.02;
    page.rotation.z = 0.12;
    root.add(page);

    return {
      root,
      update(t) {
        const c = fract(t / CYCLE);
        for (const block of blocks) {
          const up = ramp(c, 0.1 + block.delay, 0.36 + block.delay) * (1 - ramp(c, 0.78, 0.96));
          block.group.position.z = up * block.height;
          (block.box.material as THREE.LineBasicMaterial).opacity = 0.75 * ramp(c, 0.2 + block.delay, 0.3 + block.delay) * (1 - ramp(c, 0.72, 0.8));
        }
        // the stamp is removed: it fades while lifting and is back only once the page has settled
        const gone = ramp(c, 0.22, 0.42) * (1 - ramp(c, 0.94, 1));
        ringMaterial.opacity = 0.85 * (1 - gone);
        (stampBlock.box.material as THREE.LineBasicMaterial).opacity *= 1 - gone;
        stampGroup.rotation.z = gone * 0.25;
      },
    };
  },
};

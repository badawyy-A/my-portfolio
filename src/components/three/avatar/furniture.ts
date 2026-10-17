import * as THREE from "three";
import type { Layout } from "./rig";

/** A dark editor screen with a few rows of "code", drawn once to a canvas. */
function codeTexture() {
  const w = 512;
  const h = 336;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#140a0d";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#24131a";
  ctx.fillRect(0, 0, 70, h);
  const colors = ["#d9455f", "#ede6e3", "#9a8f8c", "#f08ea0"];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 15; row++) {
    const y = 22 + row * 20;
    let x = 90 + (row % 4 === 0 ? 0 : 24 + Math.floor(rand() * 3) * 22);
    const words = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < words && x < w - 40; i++) {
      const len = 30 + rand() * 90;
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y, len, 7);
      x += len + 12;
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#9a8f8c";
    ctx.fillRect(28, y, 22, 7);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const box = (w: number, h: number, d: number, material: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

export type Furniture = {
  chair: THREE.Group;
  desk: THREE.Group;
  screen: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
};

/** Chair, desk and laptop around the seated avatar. The desk group (chair included) rises in during "What I build". */
export function buildFurniture({ seatTop, deskTop, laptopZ, deskFront }: Layout): Furniture {
  const wood = new THREE.MeshStandardMaterial({ color: "#a89c99", roughness: 0.7, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: "#2b2326", roughness: 0.35, metalness: 0.6 });
  const keys = new THREE.MeshStandardMaterial({ color: "#161012", roughness: 0.6, metalness: 0.2 });

  // chair under and behind the hips
  const chair = new THREE.Group();
  const seat = box(0.46, 0.05, 0.44, wood);
  seat.position.set(0, seatTop - 0.025, -0.04);
  const back = box(0.44, 0.46, 0.04, wood);
  back.position.set(0, seatTop + 0.27, -0.27);
  back.rotation.x = -0.12;
  chair.add(seat, back);
  const legH = seatTop - 0.05;
  for (const [x, z] of [[-0.2, -0.24], [0.2, -0.24], [-0.2, 0.15], [0.2, 0.15]]) {
    const leg = box(0.03, legH, 0.03, wood);
    leg.position.set(x, legH / 2, z);
    chair.add(leg);
  }

  // desk with the laptop on it
  const desk = new THREE.Group();
  const depth = 0.66;
  const top = box(1.15, 0.035, depth, wood);
  top.position.set(0, deskTop - 0.0175, deskFront + depth / 2);
  desk.add(top);
  for (const x of [-0.53, 0.53]) {
    for (const z of [deskFront + 0.04, deskFront + depth - 0.04]) {
      const leg = box(0.035, deskTop - 0.035, 0.035, wood);
      leg.position.set(x, (deskTop - 0.035) / 2, z);
      desk.add(leg);
    }
  }

  const laptop = new THREE.Group();
  const base = box(0.34, 0.016, 0.235, metal);
  base.position.y = 0.008;
  const deck = box(0.3, 0.002, 0.11, keys);
  deck.position.set(0, 0.017, 0.02);
  laptop.add(base, deck);

  // lid hinged at the far edge, tilted slightly back, screen facing the avatar
  const lid = new THREE.Group();
  lid.position.set(0, 0.016, 0.1175);
  lid.rotation.x = 0.28;
  const shell = box(0.34, 0.23, 0.008, metal);
  shell.position.y = 0.115;
  const screen = new THREE.MeshBasicMaterial({ map: codeTexture(), transparent: true, opacity: 0, toneMapped: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), screen);
  panel.position.set(0, 0.118, -0.0045);
  panel.rotation.y = Math.PI;
  lid.add(shell, panel);
  laptop.add(lid);
  laptop.position.set(0, deskTop, laptopZ);
  desk.add(laptop);

  // the screen lights the face and hands
  const light = new THREE.PointLight("#ff7a8f", 0, 1.4, 2);
  light.position.set(0, deskTop + 0.16, laptopZ + 0.02);
  desk.add(light);

  // the chair arrives with the desk, so nothing shows behind the shoulders in the hero
  desk.add(chair);

  return { chair, desk, screen, light };
}

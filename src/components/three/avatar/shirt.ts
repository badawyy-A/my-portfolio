import * as THREE from "three";

// Where the chest sits on the T-shirt's texture (measured from the model's UV layout): centre of the
// front panel, upper chest. Upright text on the texture reads upright on the shirt.
const CHEST = { u: 0.253, v: 0.528, width: 0.145 };
// the front panel's texture is stretched a little horizontally relative to the cloth
const V_PER_U = 0.91;

/** Prints "badawi.dev" across the chest of the avatar's T-shirt. */
export async function brandShirt(scene: THREE.Object3D) {
  let shirt: THREE.Mesh | undefined;
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && (obj.material as THREE.Material).name === "outfit_top") shirt = obj;
  });
  if (!shirt) return;
  const material = shirt.material as THREE.MeshStandardMaterial;

  // draw with the site's own display font once it is ready
  await document.fonts?.ready;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "sans-serif";

  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#121011";
  ctx.fillRect(0, 0, size, size);

  const words = [
    { text: "badawi", color: "#ede6e3" },
    { text: ".dev", color: "#d9455f" },
  ];
  let px = 100;
  ctx.font = `800 ${px}px ${family}`;
  const measure = () => words.reduce((w, word) => w + ctx.measureText(word.text).width, 0);
  px *= (CHEST.width * size) / measure();
  ctx.font = `800 ${px}px ${family}`;

  ctx.save();
  ctx.translate(CHEST.u * size, CHEST.v * size);
  ctx.scale(1, V_PER_U);
  ctx.textBaseline = "middle";
  let x = -measure() / 2;
  for (const word of words) {
    ctx.fillStyle = word.color;
    ctx.fillText(word.text, x, 0);
    x += ctx.measureText(word.text).width;
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; // glTF texture convention
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  material.map = texture;
  material.color.set(0xffffff);
  material.needsUpdate = true;
}

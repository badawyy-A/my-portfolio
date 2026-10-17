// Avatar pipeline, run once when the avatar changes. The source export itself is not committed.
//
// Source: an Avaturn export (.glb, T-pose, Mixamo-style bone names without prefix: Hips, Spine,
// Spine1, Spine2, Neck, Head, LeftArm, LeftForeArm, LeftHand, finger bones, legs). Any avatar with
// these bone names works with the site's rig code.
//
// 1. Clean it (this script): drop the bundled idle animation, make materials non-metallic and
//    matte so skin and cloth are not shiny, render the hair double-sided:
//      node scripts/avatar/prepare.mjs suit.glb clean.glb
// 2. Compress, no simplify/join/flatten so the skeleton stays intact:
//      npx @gltf-transform/cli optimize clean.glb public/models/avatar.glb \
//        --compress meshopt --texture-compress webp --texture-size 1024 \
//        --simplify false --join false --instance false --flatten false --palette false
// 3. Re-render the still images (public/images/avatar-*.webp) from the live hero.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";

const [input, output] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

for (const animation of root.listAnimations()) animation.dispose();

for (const material of root.listMaterials()) {
  material.setMetallicFactor(0);
  const hair = material.getName().includes("hair");
  material.setRoughnessFactor(hair ? 0.85 : 0.8);
  if (hair) material.setDoubleSided(true);
}

await doc.transform(prune());
await io.write(output, doc);
console.log("wrote", output);

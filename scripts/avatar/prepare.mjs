// Avatar pipeline, run once when the avatar changes. The FBX source is not committed.
// Current avatar: final.fbx (MetaPerson), wearing the plain T-shirt of the earlier model.fbx.
//
// 1. FBX -> GLB with FBX2glTF (https://github.com/godotengine/FBX2glTF/releases), for both files:
//      FBX2glTF -i final.fbx -o final-raw --binary --skinning-weights 4
//      FBX2glTF -i model.fbx -o model-raw --binary --skinning-weights 4
//    then swap in the old T-shirt:
//      node scripts/avatar/swap-part.mjs final-raw.glb model-raw.glb outfit_top raw.glb
// 2. Clean it (this script): drop the teeth (mouth stays closed), keep only the blink
//    blend shapes, make materials non-metallic so skin is not shiny:
//      node scripts/avatar/prepare.mjs raw.glb clean.glb
// 3. Compress, no simplify/join/flatten so the skeleton and face stay intact:
//      npx @gltf-transform/cli optimize clean.glb public/models/avatar.glb \
//        --compress meshopt --texture-compress webp --texture-size 1024 \
//        --simplify false --join false --instance false --flatten false --palette false
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";

const [input, output] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(input);
const root = doc.getRoot();

const DROP = new Set(["AvatarTeethLower", "AvatarTeethUpper"]);
const KEEP_TARGETS = new Set(["eyeBlinkLeft", "eyeBlinkRight"]);

for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (mesh && DROP.has(mesh.getName())) {
    node.setMesh(null);
    node.setSkin(null);
    mesh.dispose();
  }
}

for (const mesh of root.listMeshes()) {
  const names = mesh.getExtras().targetNames ?? [];
  if (!names.length) continue;
  const keep = names.map((n, i) => (KEEP_TARGETS.has(n) ? i : -1)).filter((i) => i >= 0);
  for (const prim of mesh.listPrimitives()) {
    prim.listTargets().forEach((t, i) => {
      if (!keep.includes(i)) {
        prim.removeTarget(t);
        t.dispose();
      }
    });
  }
  mesh.setExtras({ ...mesh.getExtras(), targetNames: keep.map((i) => names[i]) });
  mesh.setWeights(keep.map(() => 0));
}

const ROUGH = { haircut: 0.85, AvatarLeftEyeball: 0.25, AvatarRightEyeball: 0.25, AvatarEyelashes: 0.9 };
for (const mat of root.listMaterials()) {
  const name = mat.getName();
  mat.setMetallicFactor(0);
  mat.setRoughnessFactor(ROUGH[name] ?? 0.78);
  if (name === "haircut") {
    mat.setDoubleSided(true);
  }
  if (name === "AvatarEyelashes") {
    mat.setBaseColorFactor([0.05, 0.035, 0.03, 1]);
  }
}

await doc.transform(prune());
await io.write(output, doc);
console.log("wrote", output);

// Avatar pipeline, optional step between FBX2glTF and prepare.mjs: replaces one part (mesh) of a
// MetaPerson avatar with the same part from another MetaPerson avatar. Both must share the MetaPerson
// skeleton and bind pose; the part's bones are matched by name.
//   node scripts/avatar/swap-part.mjs <target.glb> <source.glb> <mesh name> <output.glb>
// e.g. the current avatar wears the plain T-shirt of the earlier one:
//   node scripts/avatar/swap-part.mjs final-raw.glb model-raw.glb outfit_top raw.glb
import { NodeIO } from "@gltf-transform/core";
import { copyToDocument, prune, unpartition } from "@gltf-transform/functions";

const [targetFile, sourceFile, part, output] = process.argv.slice(2);
const io = new NodeIO();
const target = await io.read(targetFile);
const source = await io.read(sourceFile);
const withMesh = (doc) => doc.getRoot().listNodes().find((n) => n.getMesh()?.getName() === part);

const from = withMesh(source);
if (!from) throw new Error(`no "${part}" mesh in ${sourceFile}`);

// remove the target's own version of the part, remembering where it sat in the hierarchy
const old = withMesh(target);
const nodes = target.getRoot().listNodes();
const parent = old ? nodes.find((n) => n.listChildren().includes(old)) : nodes.find((n) => n.getName() === "AvatarRoot");
old?.dispose();

const map = copyToDocument(target, source, [from]);
const copy = map.get(from);
const copied = new Set(map.values());
const bones = new Map(target.getRoot().listNodes().filter((n) => !copied.has(n)).map((n) => [n.getName(), n]));

// bind the copied part to the target's own bones
const sourceSkin = copy.getSkin();
if (sourceSkin) {
  const skin = target.createSkin(part).setInverseBindMatrices(sourceSkin.getInverseBindMatrices());
  for (const joint of sourceSkin.listJoints()) {
    const bone = bones.get(joint.getName());
    if (!bone) throw new Error(`target has no bone "${joint.getName()}"`);
    skin.addJoint(bone);
  }
  const root = sourceSkin.getSkeleton();
  if (root) skin.setSkeleton(bones.get(root.getName()) ?? null);
  copy.setSkin(skin);
}
(parent ?? target.getRoot().listScenes()[0]).addChild(copy);

await target.transform(prune(), unpartition());
await io.write(output, target);
console.log(`replaced "${part}" in ${output}`);

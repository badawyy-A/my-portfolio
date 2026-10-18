// Robot pipeline, run once when the robot model changes. The source GLB is not committed.
// Current robot: "Cartoon Robot" by alexandermadrews (Sketchfab, CC-BY-4.0), named Jarvis on the site.
//
// 1. Clean it (this script): bake the Sketchfab root rotation into the vertices (Y up, faces +Z,
//    centred, about 1.9 units tall), join the two halves into one mesh, drop the tangents, and
//    add an emissive map of the glowing eyes so they can light up while he talks:
//      node scripts/robot/prepare.mjs cartoon_robot.glb robot-clean.glb
// 2. Compress and simplify (he is small on screen):
//      npx @gltf-transform/cli optimize robot-clean.glb public/models/robot.glb \
//        --compress meshopt --texture-compress webp --texture-size 1024 \
//        --simplify-ratio 0.3 --simplify-error 0.0008
//
// The skeleton is not in the file: src/components/three/avatar/robot.ts builds it at load time.
import { NodeIO } from "@gltf-transform/core";
import { clearNodeTransform, flatten, join, prune } from "@gltf-transform/functions";
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(input);
const root = doc.getRoot();

await doc.transform(flatten());
for (const node of root.listNodes()) if (node.getMesh()) clearNodeTransform(node);
await doc.transform(join(), prune());

for (const mesh of root.listMeshes()) {
  mesh.setName("robot");
  for (const prim of mesh.listPrimitives()) prim.getAttribute("TANGENT")?.dispose();
}

// the eyes are the only bright blue on the texture: copy them into an emissive map
const material = root.listMaterials()[0];
material.setName("robot");
const base = material.getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(base.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const glow = Buffer.alloc(info.width * info.height * 3);
for (let i = 0, o = 0; i < data.length; i += 4, o += 3) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  if (b > 110 && b - r > 60 && g > 70) {
    glow[o] = r;
    glow[o + 1] = g;
    glow[o + 2] = b;
  }
}
const png = await sharp(glow, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
const emissive = doc.createTexture("eyes").setImage(new Uint8Array(png)).setMimeType("image/png");
material.setEmissiveTexture(emissive).setEmissiveFactor([1, 1, 1]);
material.getEmissiveTextureInfo().copy(material.getBaseColorTextureInfo());

await io.write(output, doc);

// Reference only: avatar logic from the working hero preview (three.js r128 + FBXLoader, plain JS).
// Port this into a React Three Fiber component that loads public/models/avatar.glb.

(function () {
  var words = ["computer vision", "Arabic OCR", "LLM systems", "data pipelines"];
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var swapEl = document.getElementById("swap");
  var cap = document.getElementById("cap");
  if (!reduce) {
    var wi = 0;
    setInterval(function () { wi = (wi + 1) % words.length; swapEl.textContent = words[wi]; }, 2600);
  }

  var canvas = document.getElementById("cloud");
  if (!window.THREE || !THREE.FBXLoader) { cap.textContent = "The 3D avatar could not load in this browser."; return; }
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
  catch (e) { cap.textContent = "This browser has WebGL turned off, so the avatar can't be shown."; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);

  scene.add(new THREE.HemisphereLight(0xfff1ea, 0x1a0b0e, 0.75));
  var key = new THREE.DirectionalLight(0xfff4ee, 1.25); key.position.set(-1.2, 2.2, 2.4); scene.add(key);
  var fill = new THREE.DirectionalLight(0xffe6e0, 0.35); fill.position.set(1.6, 1.0, 1.8); scene.add(fill);
  var rimL = new THREE.DirectionalLight(0xd9455f, 1.6); rimL.position.set(-2.0, 1.8, -2.2); scene.add(rimL);
  var rimR = new THREE.DirectionalLight(0xd9455f, 1.2); rimR.position.set(2.2, 1.4, -2.0); scene.add(rimR);

  var head = null, neck = null, spine = null, headBase = null, neckBase = null, spineBase = null, focusY = 1.55;

  function bone(root, name) { var b = null; root.traverse(function (o) { if (!b && o.isBone && o.name === name) b = o; }); return b; }
  function rotateWorld(b, axis, angle) {
    if (!b || !b.parent) return;
    b.parent.updateMatrixWorld(true);
    var pq = new THREE.Quaternion(); b.parent.getWorldQuaternion(pq);
    var q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    var local = pq.clone().invert().multiply(q).multiply(pq);
    b.quaternion.premultiply(local);
    b.updateMatrixWorld(true);
  }

  try {
    var raw = atob(document.getElementById("avatar").textContent.trim());
    var buf = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    var model = new THREE.FBXLoader().parse(buf.buffer, "");
  } catch (e) { cap.textContent = "The avatar file could not be read."; return; }

  model.traverse(function (o) {
    if (o.isMesh) {
      o.frustumCulled = false;
      var ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(function (m) {
        if (m.map) m.map.encoding = THREE.sRGBEncoding;
        if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
        if (m.shininess !== undefined) m.shininess = Math.min(m.shininess, 18);
        if (m.specular) m.specular.setRGB(0.12, 0.1, 0.1);
        m.needsUpdate = true;
      });
    }
  });
  scene.add(model);
  model.updateMatrixWorld(true);

  // Bring the arms down from the T-pose into a relaxed stance.
  ["LeftArm", "RightArm"].forEach(function (nm) {
    var b = bone(model, nm); if (!b) return;
    var wp = new THREE.Vector3(); b.getWorldPosition(wp);
    var side = wp.x >= 0 ? 1 : -1;
    rotateWorld(b, new THREE.Vector3(0, 0, 1), -side * 1.22);
    rotateWorld(b, new THREE.Vector3(1, 0, 0), 0.08);
  });
  ["LeftForeArm", "RightForeArm"].forEach(function (nm) {
    var b = bone(model, nm); if (!b) return;
    var wp = new THREE.Vector3(); b.getWorldPosition(wp);
    rotateWorld(b, new THREE.Vector3(0, 1, 0), (wp.x >= 0 ? 1 : -1) * 0.12);
  });

  head = bone(model, "Head"); neck = bone(model, "Neck"); spine = bone(model, "Spine2") || bone(model, "Spine1");
  if (head) { headBase = head.quaternion.clone(); var hp = new THREE.Vector3(); head.getWorldPosition(hp); focusY = hp.y; }
  if (neck) neckBase = neck.quaternion.clone();
  if (spine) spineBase = spine.quaternion.clone();
  cap.textContent = "Move your mouse. I'm watching.";

  function frameCamera() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    var narrow = w / h < 0.9;
    camera.position.set(0, focusY - 0.02, narrow ? 1.9 : 1.55);
    camera.lookAt(0, focusY - (narrow ? 0.16 : 0.12), 0);
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", frameCamera);
  frameCamera();

  var tx = 0, ty = 0, yaw = 0, pitch = 0, lastMove = -1e9;
  window.addEventListener("pointermove", function (e) {
    var rect = canvas.getBoundingClientRect();
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height * 0.35;
    tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
    ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
    lastMove = performance.now();
  }, { passive: true });

  var Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  function aim(b, base, yawA, pitchA) {
    if (!b || !base) return;
    b.quaternion.copy(base);
    b.updateMatrixWorld(true);
    rotateWorld(b, Y, yawA);
    rotateWorld(b, X, pitchA);
  }

  var start = performance.now(), visible = true;
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(canvas);
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    var t = (now - start) / 1000;
    var idle = now - lastMove > 4000;
    var gx = idle && !reduce ? Math.sin(t * 0.4) * 0.25 : tx;
    var gy = idle && !reduce ? Math.sin(t * 0.27) * 0.08 : ty;
    yaw += (gx * 0.7 - yaw) * 0.07;
    pitch += (gy * 0.35 - pitch) * 0.07;
    if (spine && spineBase) { spine.quaternion.copy(spineBase); spine.updateMatrixWorld(true); rotateWorld(spine, Y, yaw * 0.15); rotateWorld(spine, X, reduce ? 0 : Math.sin(t * 1.4) * 0.012); }
    aim(neck, neckBase, yaw * 0.35, pitch * 0.35);
    aim(head, headBase, yaw * 0.55, pitch * 0.6);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();

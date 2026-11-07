// RobotATC design studio.  Shows the coordinated design of every work cell at every weight, on the vendor
// CAD, and plays one cycle of the robot program the sizing was done on.  All numbers, poses, props and
// trajectories come from viewer/data/*.json, written by export_viewer_data.py from the same code that
// makes the paper's figures; nothing kinematic is computed here.

const COL = { navy: 0x1A365D, mid: 0x2E5A8C, light: 0x4C7BBA, tube: 0xB8BDC7, bracket: 0xE07A2E, gripper: 0x1E1F24,
              way: 0xC0392B, arrow: 0x1A365D, part: 0xE8B931, tip: 0xFFD54A, trace: 0x7F9CC4 };
const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();   // the renderer outputs sRGB, so stored colours are converted once
const FAMILY_CLASS = { T25: "t25", T8: "t8", T5: "t5" };

let manifest = null, rec = null, cellId = "a", lam = "1";
// embed mode: the agents page frames the stage alone.  ?embed=layout shows the cell without the arm and reveals it in
// stages on request; ?embed=coord shows the coordination scene and follows the round it is told.  ?cell= and ?lam= pick the design.
const EMBED_Q = new URLSearchParams(location.search), EMBED = EMBED_Q.get("embed");
if (EMBED) document.body.classList.add("embed", `embed-${EMBED}`);
if (EMBED_Q.get("cell")) cellId = EMBED_Q.get("cell"); if (EMBED_Q.get("lam")) lam = EMBED_Q.get("lam");   // ?cell=f&lam=1 opens that design, framed or not
let layoutStage = EMBED === "layout" ? 0 : 3;   // 0 floor only, 1 fixtures, 2 + waypoints, 3 + approach axes
let scene, camera, renderer, controls;
let robotRoot = null, overlay = null, jointNodes = [], fingerNodes = [], flangeNode = null, partMesh = null;
let boxPool = {}, times = null;              // part boxes standing in the cell, by task point; the time of every frame (new exports)
const PART_COL = { A: 0xE8B931, B: 0xC97A3A };   // amber for the first part kind, terracotta for the second (fallback)
const MASS_COL = [[1.0, 0xFFCC33], [1.5, 0x428DFF], [2.5, 0xEF5660]];   // the three mass classes of the benchmark, light to heavy: yellow, blue, red (distinct hues; yellow, not orange, so the light part is not confused with the actuators' orange)
function partColor(kind) {   // colour by the mass of the part, so the same class looks the same in every cell
  const parts = rec && rec.program && rec.program.parts, m = parts && parts[kind] ? parts[kind].mass : null;
  if (m != null) { let best = MASS_COL[0]; for (const c of MASS_COL) if (Math.abs(c[0] - m) < Math.abs(best[0] - m)) best = c; return best[1]; }
  return PART_COL[kind] || COL.part;
}
let axesHelpers = [], gridHelper = null, floorMesh = null, shadowCatcher = null, paperMode = false, worldAxes = null, tipMesh = null, traceLine = null, tracePts = [];
let ambientRef = null, fillRef = null;
let frames = [], frameIdx = 0, playing = false, playClock = 0, playT = 0, lastTick = 0, traceSeen = 0;   // playT: fractional frame; traceSeen: frames of the TCP path drawn so far
let mode = "design", roundIdx = 0, coordPlaying = false, coordClock = 0, stickGroup = null;
const COORD = { kin: "#2F855A", dyn: "#9B2C2C", target: "#8E98A3", aio: "#4A5568", start: "#2E6FD8", final: "#1A365D" };   // kinematics green, dynamics red, as on the agents page
const meshCache = {}; const stlLoader = new THREE.STLLoader();
const tr = (k) => LANG.tr(k), fmt = (s, m) => s.replace(/\{(\w)\}/g, (_, k) => m[k]);   // ../lang.js: strings written here
const cellName = (id) => tr("cell." + id);
const PARTS = [["1", ["a", "b", "c"]], ["2", ["d", "e", "f"]], ["3", ["g", "h", "i"]]];   // transfer, tending, stacking (paper letters in order, 2026-10-04)

// ------------------------------------------------------------------ three.js
function initThree() {
  const el = document.getElementById("three");
  scene = new THREE.Scene(); scene.background = srgb(0xF6F7F9);
  camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.05, 50);
  camera.position.set(1.6, 1.2, 1.7);
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(el.clientWidth, el.clientHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.NoToneMapping;   // no film curve: it bleached every colour (navy to light blue, red to pink); the scene should look like the renders of the paper
  el.appendChild(renderer.domElement);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(0.15, 0.35, 0); controls.maxPolarAngle = Math.PI / 2 + 0.05;

  ambientRef = new THREE.AmbientLight(0xffffff, 0.32); scene.add(ambientRef);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xD9DEE6, 0.22));                 // sky and ground light instead of a flat ambient
  const sun = new THREE.DirectionalLight(0xffffff, 0.58); sun.position.set(3.5, 6, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -2; sun.shadow.camera.right = 2; sun.shadow.camera.top = 2; sun.shadow.camera.bottom = -2; sun.shadow.radius = 6; sun.shadow.bias = -0.0004;
  scene.add(sun);
  fillRef = new THREE.DirectionalLight(0xA9C4DD, 0.22); fillRef.position.set(-4, 3, -4); scene.add(fillRef);

  floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: srgb(0xE9ECF1), roughness: 0.95 }));
  floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true; scene.add(floorMesh);
  gridHelper = new THREE.GridHelper(4, 40, 0xC9D0D9, 0xDCE1E8); gridHelper.position.y = 0.001; scene.add(gridHelper);
  shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.16 }));
  shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = 0.0005; shadowCatcher.receiveShadow = true; shadowCatcher.visible = false; scene.add(shadowCatcher);

  // everything expressed in URDF / pybullet coordinates (z up) lives under a group that turns z up into y up
  overlay = new THREE.Group(); overlay.rotation.x = -Math.PI / 2; scene.add(overlay);
  worldAxes = new THREE.Group(); worldAxes.add(new THREE.AxesHelper(0.22));          // the robot's x (red), y (green), z (blue) at the base
  [["x", 0.26, 0, 0, "#C0392B"], ["y", 0, 0.26, 0, "#2F855A"], ["z", 0, 0, 0.26, "#2E6FD8"]].forEach(([n, x, y, z, c]) => { const s = makeLabel(n, c, 0.045); s.position.set(x, y, z); worldAxes.add(s); });
  overlay.add(worldAxes);

  window.addEventListener("resize", () => {
    camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight);
  });
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now(), dt = lastTick ? Math.min(0.1, (nowMs - lastTick) / 1000) : 0; lastTick = nowMs;
  if (playing && frames.length) {                                         // real time: the recorded cycle lasts K · t_seg seconds at speed 1
    const sp = +document.getElementById("play-speed").value;
    if (times) { playT = (playT + dt * sp) % times[times.length - 1]; showFrameT(frameAtTime(playT)); }
    else { const cycleS = (rec.K || 1) * (rec.t_seg_s || 1), fps = frames.length / cycleS; playT = (playT + dt * fps * sp) % frames.length; showFrameT(playT); }
  }
  if (coordPlaying && rec && rec.coordination && rec.coordination.length) {
    coordClock += 1 / 45;                                                  // ~0.75 s per round
    if (coordClock >= 1) { coordClock = 0; const n = rec.coordination.length; if (roundIdx + 1 >= n) { coordPlaying = false; document.getElementById("btn-coord-play").textContent = tr("dyn.playr"); } else showRound(roundIdx + 1); }
  }
  controls.update(); renderer.render(scene, camera);
}

function createMesh(geom, color, metalness = 0.25, roughness = 0.5) {
  const m = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: color.isColor ? color : srgb(color), metalness, roughness }));
  m.castShadow = true; m.receiveShadow = true; return m;
}

function loadMeshAsync(url) {
  return new Promise((resolve) => {
    if (EMBED === "layout") return resolve(null);   // the layout frame shows the cell without the arm: no need to fetch 12 MB of meshes
    if (meshCache[url]) return resolve(meshCache[url]);
    stlLoader.load(url, (g) => { g.computeVertexNormals(); meshCache[url] = g; resolve(g); }, undefined, () => resolve(null));
  });
}

// ------------------------------------------------------------------ the arm from its URDF
const nums = (t) => t.trim().split(/\s+/).map(Number);
function rpyMat(r, p, y) { return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r, p, y, "ZYX")); }
function originOf(el) {
  const o = el.querySelector(":scope > origin");
  const xyz = o && o.getAttribute("xyz") ? nums(o.getAttribute("xyz")) : [0, 0, 0];
  const rpy = o && o.getAttribute("rpy") ? nums(o.getAttribute("rpy")) : [0, 0, 0];
  return rpyMat(rpy[0], rpy[1], rpy[2]).setPosition(new THREE.Vector3(...xyz));
}

function colourFor(file, linkName) {
  const key = ((file || "") + " " + (linkName || "")).toLowerCase();
  if (/end_effector|gripper/.test(key)) return COL.gripper;
  if (/pm-21|a-22|a-20|bracket/.test(key)) return COL.bracket;
  if (/\/body/.test(key) || /t25|t8|t5|x5|x8|r8|r25/.test(file || "")) {
    if (/t25|r25|x25/.test(key)) return COL.navy;
    if (/t8|x8|r8/.test(key)) return COL.mid;
    return COL.light;
  }
  return COL.tube;
}

async function buildRobot(urdfPath, basePos) {
  if (robotRoot) scene.remove(robotRoot);
  robotRoot = new THREE.Group(); robotRoot.rotation.x = -Math.PI / 2; robotRoot.position.set(basePos[0], basePos[2], -basePos[1]);
  jointNodes = []; fingerNodes = []; axesHelpers = []; flangeNode = null;
  const txt = await (await fetch(urdfPath, { cache: "no-store" })).text();   // the arm model of a design changes between campaigns
  const doc = new DOMParser().parseFromString(txt, "text/xml");
  const links = {}; doc.querySelectorAll("robot > link").forEach((l) => (links[l.getAttribute("name")] = l));
  const joints = [...doc.querySelectorAll("robot > joint")];
  const draw = async (linkName, parent) => {
    const l = links[linkName]; if (!l) return;
    for (const v of l.querySelectorAll(":scope > visual")) {
      const g = v.querySelector("geometry"); if (!g) continue;
      const M = originOf(v); const meshEl = g.querySelector("mesh"), cyl = g.querySelector("cylinder"), box = g.querySelector("box");
      let obj = null;
      if (meshEl) {
        const file = meshEl.getAttribute("filename"); const geom = await loadMeshAsync(file); if (!geom) continue;
        const sc = meshEl.getAttribute("scale") ? nums(meshEl.getAttribute("scale")) : [1, 1, 1];
        obj = createMesh(geom, colourFor(file, linkName)); obj.applyMatrix4(M.clone().multiply(new THREE.Matrix4().makeScale(...sc)));
      } else if (cyl) {
        obj = createMesh(new THREE.CylinderGeometry(+cyl.getAttribute("radius"), +cyl.getAttribute("radius"), +cyl.getAttribute("length"), 24), colourFor("", linkName));
        obj.applyMatrix4(M.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
      } else if (box) {
        const sz = nums(box.getAttribute("size")); obj = createMesh(new THREE.BoxGeometry(...sz), colourFor("", linkName)); obj.applyMatrix4(M);
      }
      if (obj) parent.add(obj);
    }
  };
  // the URDF is a tree, not a chain: the gripper branches into two fingers and a centre hub, so every joint
  // hangs under the frame of ITS parent link, not under the previous joint (that chain assumption was the bug
  // that drew the end effector in pieces)
  const rootLink = doc.querySelector("robot > link").getAttribute("name");
  const linkFrame = { [rootLink]: robotRoot };
  await draw(rootLink, robotRoot);
  let pending = joints.slice(), armJoints = 0;
  for (let pass = 0; pass < 4 && pending.length; pass++) {
    const later = [];
    for (const j of pending) {
      const parentName = j.querySelector("parent").getAttribute("link"), childName = j.querySelector("child").getAttribute("link");
      const parent = linkFrame[parentName];
      if (!parent) { later.push(j); continue; }
      const fixed = new THREE.Group(); fixed.applyMatrix4(originOf(j)); parent.add(fixed);
      let childFrame = fixed;
      if (j.getAttribute("type") !== "fixed") {
        const ax = j.querySelector("axis");
        const a = new THREE.Vector3(...nums(ax ? ax.getAttribute("xyz") : "1 0 0")).normalize();   // URDF default axis is x
        const node = new THREE.Group(); node.userData.axis = a; node.userData.name = j.getAttribute("name"); fixed.add(node);
        if (armJoints < 6) { jointNodes.push(node); armJoints++; if (armJoints === 6) flangeNode = node; const h = new THREE.AxesHelper(0.08); h.visible = false; node.add(h); axesHelpers.push(h); }
        else fingerNodes.push(node);
        childFrame = node;
      }
      linkFrame[childName] = childFrame;
      await draw(childName, childFrame);
    }
    pending = later;
  }
  if (pending.length) console.warn("unplaced joints:", pending.map((j) => j.getAttribute("name")));
  scene.add(robotRoot);
}

function setJoints(q) {   // q: six joint values in radians, in the order of the URDF chain
  for (let i = 0; i < 6 && i < jointNodes.length; i++) jointNodes[i].quaternion.setFromAxisAngle(jointNodes[i].userData.axis, q[i]);
}
function heldWidth(i) {   // width of the part in the gripper at frame i, 0 when the gripper is empty
  const c = rec && rec.cycle, parts = rec && rec.program && rec.program.parts;
  if (!c || !parts || !c.held || !c.held[i]) return 0;
  const kind = c.part ? c.part[i] : "A"; return parts[kind] ? parts[kind].size[0] : 0.07;
}
function setFingers(closed, width) {   // the vendor's parallel-jaw four-bar: inputs and inner linkages open by theta, outer linkages counter-rotate
  // the inner gap runs from 82 mm at 0 to 52 mm at 0.55 (measured on the vendor model), so the holding angle follows the part width
  const th = closed ? Math.min(0.55, Math.max(0, 0.55 * (0.082 - (width || 0.056)) / 0.030)) : 0.0;
  for (const n of fingerNodes) {
    const nm = n.userData.name;
    let v = 0;
    if (/input_l_finger$|input_r_finger$|inner_linkage$/.test(nm)) v = th;
    else if (/outer_linkage.*_gripper$/.test(nm)) v = -th;
    n.quaternion.setFromAxisAngle(n.userData.axis, v);
  }
}

// ------------------------------------------------------------------ cell, design, overlay
function clearOverlay() { while (overlay.children.length) overlay.remove(overlay.children[0]); partMesh = null; boxPool = {}; }
function partBox(size, kind) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshStandardMaterial({ color: srgb(partColor(kind)), roughness: 0.55 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const FADE_S = 0.4;                          // a part staged at a point, or cleared when the cycle starts over, fades instead of popping
function legTable() {                        // per leg: first and last frame, whether it carries, the point it starts from
  const cyc = rec.cycle; if (cyc._legs) return cyc._legs;
  const L = [];
  cyc.leg.forEach((l, i) => { if (!L[l]) L[l] = { i0: i, i1: i, carry: false, from: null }; L[l].i1 = i; if (cyc.held[i]) L[l].carry = true; });
  L.forEach((e, l) => { e.from = cyc.legs && cyc.legs[l] ? cyc.legs[l].src : null; });
  return (cyc._legs = L);
}
function partAlpha(i0, leg, point) {         // 1 while the part stands; ramps after it is staged and before it is cleared
  const cyc = rec.cycle; if (!times || !cyc.scene) return 1;
  const L = legTable(), n = L.length, has = (l) => (cyc.scene[l] || []).some((b) => b.point === point);
  const prev = (leg + n - 1) % n, next = (leg + 1) % n, t = playT !== undefined && Number.isFinite(playT) ? playT : times[i0];
  let a = 1;
  if (!has(prev) && !(L[prev].carry && L[leg].from === point)) a = Math.min(a, (t - times[L[leg].i0]) / FADE_S);          // staged, not set down by the arm
  if (!has(next) && !(L[next].carry && L[next].from === point)) a = Math.min(a, (times[L[leg].i1] - t) / FADE_S);        // cleared, not picked by the arm
  return Math.max(0, Math.min(1, a));
}
function showParts(i0) {                     // the scene of the leg of frame i0: boxes standing by point, and the one in the gripper
  const cyc = rec.cycle; if (!cyc.scene) return false;
  const leg = cyc.leg[i0], scene = cyc.scene[leg] || [], parts = (rec.program && rec.program.parts) || {};
  const seen = new Set();
  for (const b of scene) {
    const key = `p${b.point}`; seen.add(key);
    if (!boxPool[key] || boxPool[key].userData.kind !== b.part) { if (boxPool[key]) overlay.remove(boxPool[key]); boxPool[key] = partBox(parts[b.part].size, b.part); boxPool[key].userData.kind = b.part; overlay.add(boxPool[key]); }
    boxPool[key].position.set(b.pos[0], b.pos[1], b.pos[2]); boxPool[key].visible = EMBED !== "layout";
    const al = partAlpha(i0, leg, b.point); boxPool[key].material.transparent = al < 1; boxPool[key].material.opacity = al; boxPool[key].castShadow = al > 0.5;
  }
  for (const k of Object.keys(boxPool)) if (!seen.has(k) && k !== "held") boxPool[k].visible = false;
  const held = tcpLocal(); if (tipMesh) tipMesh.position.copy(held);
  const kind = cyc.held[i0] ? cyc.part[i0] : null;
  if (kind) {
    if (!boxPool.held || boxPool.held.userData.kind !== kind) { if (boxPool.held) overlay.remove(boxPool.held); boxPool.held = partBox(parts[kind].size, kind); boxPool.held.userData.kind = kind; overlay.add(boxPool.held); }
    boxPool.held.position.copy(held); boxPool.held.visible = EMBED !== "layout";
  } else if (boxPool.held) boxPool.held.visible = false;
  return true;
}

function redrawOverlay() {
  clearOverlay(); if (!rec) return;
  const showWay = document.getElementById("chk-way").checked && layoutStage >= 2, showProps = document.getElementById("chk-props").checked && layoutStage >= 1;
  if (showProps) for (const pr of rec.props) {
    let g = null;
    if (pr.kind === "box") g = new THREE.BoxGeometry(2 * pr.halfExtents[0], 2 * pr.halfExtents[1], 2 * pr.halfExtents[2]);
    else if (pr.kind === "cylinder") { g = new THREE.CylinderGeometry(pr.radius, pr.radius, pr.length, 24); g.rotateX(Math.PI / 2); }
    else if (pr.kind === "sphere") g = new THREE.SphereGeometry(pr.radius, 20, 14);
    if (!g) continue;
    const c = pr.rgbaColor || [0.7, 0.7, 0.7, 1];
    const m = createMesh(g, new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear(), 0.05, 0.85);
    m.position.set(...pr.pos); m.quaternion.set(pr.orn[0], pr.orn[1], pr.orn[2], pr.orn[3]); overlay.add(m);
  }
  if (showWay) rec.waypoints.forEach((P, i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.014, 18, 12), new THREE.MeshStandardMaterial({ color: srgb(COL.way), roughness: 0.4 }));
    s.position.set(...P); overlay.add(s);
    const A = new THREE.Vector3(...rec.approach[i]);
    const from = new THREE.Vector3(...P).addScaledVector(A, -0.14);
    if (layoutStage >= 3) overlay.add(new THREE.ArrowHelper(A, from, 0.12, COL.arrow, 0.035, 0.018));
    const sp = makeLabel(String(i + 1)); sp.position.set(P[0], P[1], P[2] + 0.05); overlay.add(sp);
  });
  const pr = manifest.part_radius_m;
  partMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8 * pr, 1.8 * pr, 1.8 * pr), new THREE.MeshStandardMaterial({ color: srgb(COL.part), roughness: 0.55 }));
  partMesh.castShadow = true; partMesh.visible = EMBED !== "layout" && !(rec.cycle && rec.cycle.scene); overlay.add(partMesh);   // the single part of the older exports
  tipMesh = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), new THREE.MeshBasicMaterial({ color: srgb(COL.tip) }));   // the tool centre point
  tipMesh.visible = EMBED !== "layout"; overlay.add(tipMesh);
  traceLine = null;
  if (showWay && tracePts.length && EMBED !== "layout") {                       // the path of the tool centre point over the cycle, revealed as the arm travels it
    traceLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tracePts), new THREE.LineBasicMaterial({ color: srgb(COL.trace), transparent: true, opacity: 0.35 }));
    traceLine.geometry.setDrawRange(0, traceSeen); overlay.add(traceLine);
  }
  showFrame(frameIdx);
}

function makeLabel(text, color = "#C0392B", size = 0.07) {
  const c = document.createElement("canvas"); c.width = 96; c.height = 96; const x = c.getContext("2d");
  x.font = "bold 60px IBM Plex Sans, Arial"; x.textAlign = "center"; x.textBaseline = "middle";
  x.lineWidth = 10; x.strokeStyle = "white"; x.strokeText(text, 48, 50); x.fillStyle = color; x.fillText(text, 48, 50);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.scale.set(size, size, 1); return sp;
}

function frameAtTime(s) {                    // fractional frame index at time s (frames are not evenly spaced in time)
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= s) lo = m; else hi = m; }
  const d = times[hi] - times[lo]; return lo + (d > 0 ? (s - times[lo]) / d : 0);
}
function showFrameT(tf) {                    // fractional frame: joints interpolated between the two recorded frames around it
  if (!rec || !frames.length) return;
  const n = frames.length, i0 = Math.floor(tf) % n, i1 = (i0 + 1) % n, a = tf - Math.floor(tf);
  const q = frames[i0].map((v, k) => v + (frames[i1][k] - v) * a);
  frameIdx = i0; setJoints(q); setFingers(rec.cycle.closed[i0], heldWidth(i0));
  const rest = rec.cycle.rest[i0];
  document.getElementById("scrub").value = i0;
  for (let k = 0; k < 6; k++) { const s = document.getElementById(`sl${k}`); if (s) s.value = (q[k] * 180 / Math.PI).toFixed(0); const v = document.getElementById(`sv${k}`); if (v) v.textContent = `${(q[k] * 180 / Math.PI).toFixed(0)}°`; }
  placePart(rest); updateFK();
  if (traceLine) { traceSeen = Math.max(traceSeen, Math.min(n, Math.floor(tf) + 2)); traceLine.geometry.setDrawRange(0, traceSeen); }   // the path appears as the arm first travels it
}
function showFrame(i) {
  if (!rec || !frames.length) return;
  frameIdx = Math.max(0, Math.min(frames.length - 1, i)); playT = times ? times[frameIdx] : frameIdx;
  const q = frames[frameIdx]; setJoints(q); setFingers(rec.cycle.closed[frameIdx], heldWidth(frameIdx));
  const rest = rec.cycle.rest[frameIdx];
  document.getElementById("scrub").value = frameIdx;
  for (let k = 0; k < 6; k++) { const s = document.getElementById(`sl${k}`); if (s) s.value = (q[k] * 180 / Math.PI).toFixed(0); const v = document.getElementById(`sv${k}`); if (v) v.textContent = `${(q[k] * 180 / Math.PI).toFixed(0)}°`; }
  placePart(rest); updateFK();
}

function tcpLocal() {                        // the tool centre point, a gripper length past the flange, in URDF coordinates
  scene.updateMatrixWorld(true);
  const o = new THREE.Vector3(), qw = new THREE.Quaternion();
  flangeNode.getWorldPosition(o); flangeNode.getWorldQuaternion(qw);
  const held = o.clone().add(new THREE.Vector3(0, 0, manifest.grip_m).applyQuaternion(qw));
  return overlay.worldToLocal(held);
}
function placePart(rest) {
  if (!partMesh) return;
  if (showParts(frameIdx)) return;             // the program's boxes (new exports)
  const held = tcpLocal(); if (tipMesh) tipMesh.position.copy(held);
  if (rest !== null && rest !== undefined) { partMesh.position.set(...rec.tip[rest]); return; }
  partMesh.position.copy(held);
}
function computeTrace() {                    // TCP positions over the recorded cycle, once per design
  tracePts = [];
  if (!flangeNode || !frames.length) return;
  const keep = frameIdx;
  for (const q of frames) { setJoints(q); tracePts.push(tcpLocal().clone()); }
  setJoints(frames[Math.max(0, keep)]);
}

function updateFK() {
  if (!flangeNode) return;
  scene.updateMatrixWorld(true);
  const o = new THREE.Vector3(); flangeNode.getWorldPosition(o); overlay.worldToLocal(o);   // back to z-up
  document.getElementById("fk").innerHTML = `${tr("dyn.flange")} <b>x</b> ${o.x.toFixed(3)} <b>y</b> ${o.y.toFixed(3)} <b>z</b> ${o.z.toFixed(3)} m`;
}

// ------------------------------------------------------------------ UI
function fmtLam(l) { return l === "0" ? "0" : l; }
function chipClass(m) { return FAMILY_CLASS[m.split("_")[0]] || ""; }

async function loadDesign() {
  const meta = manifest.cells[cellId].designs[lam];
  rec = await (await fetch(meta.file, { cache: "no-store" })).json();          // the design data changes between campaigns: never from the browser cache
  frames = rec.cycle.q; times = rec.cycle.t && rec.cycle.t.length === frames.length ? rec.cycle.t : null; frameIdx = 0; playT = 0; traceSeen = 0; playing = false; document.getElementById("btn-play").textContent = tr("dyn.playc");
  document.getElementById("scrub").max = Math.max(0, frames.length - 1);
  await buildRobot(rec.urdf, rec.base_pos);
  toggleAxes(document.getElementById("chk-axes").checked);
  computeTrace(); redrawOverlay(); renderDesignCard(); frameCamera();
  setupCoordination();
  if (EMBED === "layout") { robotRoot.visible = false; playing = false; }
  else if (EMBED === "coord") { if (mode !== "coord") setMode("coord"); else enterCoord(); coordPlaying = false; showRound(Math.max(0, parseInt(EMBED_Q.get("round"), 10) || 0)); }   // ?round=N: that round at once (frame capture)
  else if (mode === "coord") enterCoord();
  else { playing = true; document.getElementById("btn-play").textContent = tr("dyn.pause"); }
  if (EMBED && window.parent !== window) window.parent.postMessage({ type: "ready", embed: EMBED, cell: cellId, lam }, "*");
}

// ------------------------------------------------------------------ coordination mode: the process, round by round
function setMode(m) {
  mode = m;
  document.getElementById("mode-design").classList.toggle("on", m === "design"); document.getElementById("mode-coord").classList.toggle("on", m === "coord");
  document.querySelectorAll(".design-only").forEach((el) => (el.hidden = m !== "design"));
  document.getElementById("coord-panel").hidden = m !== "coord";
  if (m === "coord") enterCoord(); else leaveCoord();
}
function setArmOpacity(alpha) {
  if (!robotRoot) return;
  robotRoot.traverse((o) => { if (o.isMesh) { o.material.transparent = alpha < 1; o.material.opacity = alpha; o.material.depthWrite = alpha >= 1; } });
}
function setupCoordination() {
  const co = (rec && rec.coordination) || [];
  const s = document.getElementById("round-scrub"); s.max = Math.max(0, co.length - 1); s.value = 0; roundIdx = 0; coordPlaying = false;
  document.getElementById("btn-coord-play").textContent = tr("dyn.playr");
}
function enterCoord() {
  playing = false; document.getElementById("btn-play").textContent = tr("dyn.playc");
  gotoWaypoint(0); setArmOpacity(0.28); showRound(0);
  if ((rec.coordination || []).length > 1) { coordPlaying = true; document.getElementById("btn-coord-play").textContent = tr("dyn.pause"); }
}
function leaveCoord() { coordPlaying = false; setArmOpacity(1); clearSticks(); if (rec) { playing = true; document.getElementById("btn-play").textContent = tr("dyn.pause"); } }
function toggleCoordPlay() {
  const co = rec.coordination || []; if (!co.length) return;
  if (!coordPlaying && roundIdx >= co.length - 1) showRound(0);
  coordPlaying = !coordPlaying; document.getElementById("btn-coord-play").textContent = coordPlaying ? tr("dyn.pause") : tr("dyn.playr");
}
function coordTo(i) { coordPlaying = false; document.getElementById("btn-coord-play").textContent = tr("dyn.playr"); showRound(i); }
function showRound(i) {
  const co = rec.coordination || []; if (!co.length) { document.getElementById("round-label").textContent = tr("dyn.noround"); return; }
  roundIdx = Math.max(0, Math.min(co.length - 1, i)); const h = co[roundIdx];
  document.getElementById("round-scrub").value = roundIdx;
  document.getElementById("round-label").textContent = fmt(tr("dyn.round"), { R: h.round, N: co[co.length - 1].round });
  const mm = (v) => `${v[0].toFixed(0)}, ${v[1].toFixed(0)} mm`;
  document.getElementById("coord-readout").innerHTML = `
    <div><span>${tr("dyn.target")}</span><b>${mm(h.a0)}</b></div>
    <div class="k"><span>${tr("dyn.kin")}</span><b>${mm(h.a1)}</b></div>
    <div class="d"><span>${tr("dyn.dynv")}</span><b>${mm(h.a2)}</b></div>
    <div><span>${tr("dyn.incons")}</span><b>${h.gap_mm.toFixed(1)} mm</b></div>
    <div><span>${tr("dyn.w")}</span><b>${h.w.toFixed(2)}</b></div>
    <div><span>${tr("dyn.vappv")}</span><b>${h.v_app !== null && h.v_app !== undefined ? h.v_app.toFixed(2) + " m/s" : "–"}</b></div>`;
  drawPlane(roundIdx); drawCurves(roundIdx); drawSticks(h);
}
function planeRange() {
  const co = rec.coordination, pts = [];
  for (const h of co) pts.push(h.a0, h.a1, h.a2);
  if (rec.design.aio && rec.design.aio.a) pts.push(rec.design.aio.a);
  for (const s of rec.design.starts || []) if (s.a) pts.push(s.a);
  let lo = Math.min(...pts.map((p) => Math.min(p[0], p[1]))), hi = Math.max(...pts.map((p) => Math.max(p[0], p[1])));
  lo = Math.floor((lo - 30) / 50) * 50; hi = Math.ceil((hi + 30) / 50) * 50; return [lo, hi];
}
function drawPlane(i) {
  const cv = document.getElementById("plane"), g = cv.getContext("2d"), W = cv.width, H = cv.height, co = rec.coordination;
  g.clearRect(0, 0, W, H); const [lo, hi] = planeRange(); const L = 40, R = 12, T = 12, B = 32;
  const X = (a) => L + (a - lo) / (hi - lo) * (W - L - R), Y = (a) => H - B - (a - lo) / (hi - lo) * (H - T - B);
  g.strokeStyle = "#D5DAE1"; g.lineWidth = 1; g.font = "11px IBM Plex Sans, sans-serif"; g.fillStyle = "#8E98A3"; g.textAlign = "center";
  for (let v = lo; v <= hi; v += 50) { g.beginPath(); g.moveTo(X(v), T); g.lineTo(X(v), H - B); g.stroke(); g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(v, X(v), H - B + 14); g.textAlign = "right"; g.fillText(v, L - 4, Y(v) + 4); g.textAlign = "center"; }
  g.fillStyle = "#1A202C"; g.fillText(tr("dyn.ax2"), (L + W - R) / 2, H - 4); g.save(); g.translate(10, (T + H - B) / 2); g.rotate(-Math.PI / 2); g.fillText(tr("dyn.ax3"), 0, 0); g.restore();
  const cross = (p, col) => { g.strokeStyle = col; g.lineWidth = 1.6; const x = X(p[0]), y = Y(p[1]); g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x - 5, y + 5); g.lineTo(x + 5, y - 5); g.stroke(); };
  if (rec.design.aio && rec.design.aio.a) cross(rec.design.aio.a, COORD.aio);
  for (const s of rec.design.starts || []) if (s.a) cross(s.a, COORD.start);
  const trace = (key, col, dash) => {
    g.strokeStyle = col; g.lineWidth = 1.4; g.setLineDash(dash); g.beginPath();
    for (let k = 0; k <= i; k++) { const p = co[k][key]; k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])); }
    g.stroke(); g.setLineDash([]);
    for (let k = 0; k <= i; k++) { const p = co[k][key]; g.fillStyle = col; g.beginPath(); g.arc(X(p[0]), Y(p[1]), k === i ? 5 : 2.2, 0, 2 * Math.PI); g.fill(); }
  };
  trace("a0", COORD.target, [3, 3]); trace("a1", COORD.kin, []); trace("a2", COORD.dyn, []);
  const h = co[i]; g.strokeStyle = "#1A202C"; g.lineWidth = 0.8; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(h.a1[0]), Y(h.a1[1])); g.lineTo(X(h.a2[0]), Y(h.a2[1])); g.stroke(); g.setLineDash([]);
  if (i === co.length - 1) { const p = [rec.design.a2_mm, rec.design.a3_mm]; g.strokeStyle = COORD.final; g.lineWidth = 2; g.beginPath(); g.arc(X(p[0]), Y(p[1]), 8, 0, 2 * Math.PI); g.stroke(); }
}
function drawCurves(i) {
  const cv = document.getElementById("curves"), g = cv.getContext("2d"), W = cv.width, H = cv.height, co = rec.coordination, n = co.length;
  g.clearRect(0, 0, W, H); g.font = "11px IBM Plex Sans, sans-serif";
  const rows = [[tr("dyn.cv1"), co.map((h) => h.gap_mm), COORD.kin], [tr("dyn.cv2"), co.map((h) => h.w), COORD.target], [tr("dyn.cv3"), co.map((h) => h.v_app || 0), COORD.dyn]];
  const L = 40, R = 10, rh = H / rows.length;
  rows.forEach(([name, ys, col], r) => {
    const top = r * rh + 14, bot = (r + 1) * rh - 8; const hi = Math.max(...ys, 1e-9), lo = 0;
    const X = (k) => L + (n > 1 ? k / (n - 1) : 0) * (W - L - R), Y = (v) => bot - (v - lo) / (hi - lo) * (bot - top);
    g.fillStyle = "#8E98A3"; g.textAlign = "left"; g.fillText(name, L, top - 3); g.textAlign = "right"; g.fillText(hi.toFixed(hi < 10 ? 2 : 0), L - 4, top + 4); g.fillText("0", L - 4, bot + 3);
    g.strokeStyle = "#D5DAE1"; g.lineWidth = 1; g.beginPath(); g.moveTo(L, bot); g.lineTo(W - R, bot); g.stroke();
    g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); ys.forEach((v, k) => (k ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v)))); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(X(i), Y(ys[i]), 4, 0, 2 * Math.PI); g.fill();
  });
  g.strokeStyle = "#1A202C"; g.lineWidth = 0.8; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(L + (n > 1 ? i / (n - 1) : 0) * (W - L - R), 8); g.lineTo(L + (n > 1 ? i / (n - 1) : 0) * (W - L - R), H - 8); g.stroke(); g.setLineDash([]);
}
function clearSticks() { if (stickGroup) { overlay.remove(stickGroup); stickGroup = null; } }
function drawSticks(h) {
  clearSticks(); stickGroup = new THREE.Group(); overlay.add(stickGroup);
  const build = (pts, hex) => {
    if (!pts) return;
    const mat = new THREE.MeshStandardMaterial({ color: srgb(hex), roughness: 0.6 });
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = new THREE.Vector3(...pts[k]), b = new THREE.Vector3(...pts[k + 1]), d = b.clone().sub(a), len = d.length(); if (len < 1e-4) continue;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 12), mat);
      cyl.position.copy(a.clone().add(b).multiplyScalar(0.5)); cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); stickGroup.add(cyl);
    }
    for (const p of pts) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 14), mat); s.position.set(...p); stickGroup.add(s); }
  };
  build(h.a1_joints, parseInt(COORD.kin.slice(1), 16)); build(h.a2_joints, parseInt(COORD.dyn.slice(1), 16));
}

function renderDesignCard() {
  const d = rec.design, ref = manifest.cells[cellId].designs["0"];
  const chips = d.motors.map((m, i) => `<span class="chip ${chipClass(m)}">J${i + 1} ${m.replace("_", "-")}</span>`).join("");
  const gap = d.aio && d.aio.obj !== undefined ? ((d.obj - d.aio.obj) * 1000) : null;
  const dm = ((d.mass_kg - ref.mass_kg) * 1000), de = d.eta - ref.eta;
  document.getElementById("design-card").innerHTML = `
    <div class="kv"><span>${tr("dyn.links")}</span><b>${d.a2_mm.toFixed(0)} mm, ${d.a3_mm.toFixed(0)} mm</b></div>
    <div class="kv"><span>${tr("dyn.vapp")}</span><b>${d.v_app.toFixed(2)} m/s</b></div>
    <div class="chips">${chips}</div>
    <div class="kv"><span>${tr("dyn.mass")}</span><b>${d.mass_kg.toFixed(3)} kg</b></div>
    <div class="kv"><span>${tr("dyn.eta")}</span><b>${d.eta.toFixed(3)}</b></div>
    <div class="kv"><span>${tr("dyn.iters")}</span><b>${d.rounds}${d.start ? tr("dyn.best") + d.start : ""}</b></div>
    ${gap !== null ? `<div class="kv"><span>${tr("dyn.gap")}</span><b>${gap >= 0 ? "+" : ""}${gap.toFixed(0)} g</b></div>` : ""}
    ${d.spread_g !== null && d.spread_g !== undefined ? `<div class="kv"><span>${tr("dyn.spread")}</span><b>${d.spread_g.toFixed(0)} g</b></div>` : ""}
    ${lam !== "0" ? `<p class="delta">${fmt(tr("dyn.delta"), { M: (dm >= 0 ? "+" : "") + dm.toFixed(0), E: (de >= 0 ? "+" : "") + de.toFixed(3) })}</p>` : `<p class="delta">${tr("dyn.delta0")}</p>`}`;
  const c = manifest.cells[cellId];
  document.getElementById("stage-note").textContent = `(${cellId}) ${cellName(cellId)} — λ = ${fmtLam(lam)} — ${d.a2_mm.toFixed(0)} / ${d.a3_mm.toFixed(0)} mm, ${d.mass_kg.toFixed(2)} kg, η = ${d.eta.toFixed(2)}`;
}

function frameCamera() {
  // The camera of the cell drawings (figures/make_nine_cell_gifs.py): the same target, distance and bearing, looking down
  // 16 degrees, so a cell reads the same here as in the preview.  Two bearings are fixed there by hand, as here.
  const PREVIEW_FACE = { b: 0, e: 320 }, PITCH = -16 * Math.PI / 180;
  const cam = rec.camera;
  if (cam && cam.target && cam.dist) {
    const yaw = (PREVIEW_FACE[cellId] !== undefined ? PREVIEW_FACE[cellId] : cam.face) * Math.PI / 180, t = cam.target, d = cam.dist;
    const eye = [t[0] + d * Math.sin(yaw) * Math.cos(PITCH), t[1] - d * Math.cos(yaw) * Math.cos(PITCH), t[2] - d * Math.sin(PITCH)];   // z up
    controls.target.set(t[0], t[2], -t[1]); camera.position.set(eye[0], eye[2], -eye[1]);
    camera.fov = cam.fov || 40; camera.updateProjectionMatrix(); controls.update(); return;
  }
  const pts = rec.waypoints.map((P) => new THREE.Vector3(P[0], P[2], -P[1]));    // older exports without a camera: frame the waypoints
  pts.push(new THREE.Vector3(0, 0.3, 0));
  const box = new THREE.Box3().setFromPoints(pts); const ctr = box.getCenter(new THREE.Vector3()); ctr.y = Math.max(0.25, ctr.y * 0.8);
  const reach = Math.max(0.9, box.getSize(new THREE.Vector3()).length());
  controls.target.copy(ctr);
  camera.position.set(ctr.x + reach * 1.5 * Math.cos(1.09), ctr.y + reach * 0.75, ctr.z - reach * 1.5 * Math.sin(1.09));
  controls.update();
}
function buildCellGrid() {
  const g = document.getElementById("cell-grid"); g.innerHTML = "";
  // the nine cells in three parts (2026-10-05): transfer, tending, stacking; the letters stay those of the paper
  for (const [part, ids] of PARTS) {
    const h = document.createElement("div"); h.className = "part-h"; h.innerHTML = `<b>${tr("part." + part)}</b><span>${tr("part." + part + ".s")}</span>`; g.appendChild(h);
    for (const id of ids) {
      const c = manifest.cells[id]; if (!c) continue;
      const b = document.createElement("button"); b.className = "cell" + (id === cellId ? " on" : ""); b.id = "cell-" + id;
      const pairs = c.pairs ? `${c.pairs} ${tr("dyn.pairs").replace(/s$/, c.pairs === 1 ? "" : "s")}` : `${c.K} ${tr("dyn.wp")}`;   // "1 pair", "2 pairs"; the Korean word has no plural
      b.innerHTML = `<b>(${id})</b> ${cellName(id)}<small>${pairs} · ${c.payload_kg} kg · ${c.t_seg_s} s</small>`;
      b.onclick = () => selectCell(id); g.appendChild(b);
    }
  }
  const r = document.getElementById("lam-row"); r.innerHTML = "";
  for (const l of manifest.lams) {
    const k = String(l); const b = document.createElement("button"); b.className = "lam" + (k === lam ? " on" : ""); b.id = "lam-" + k; b.textContent = fmtLam(k);
    b.onclick = () => selectLam(k); r.appendChild(b);
  }
  const s = document.getElementById("sliders"); s.innerHTML = "";
  const names = [1, 2, 3, 4, 5, 6].map((k) => tr("dyn.j" + k));
  for (let k = 0; k < 6; k++) s.insertAdjacentHTML("beforeend", `<div class="sl"><label>${names[k]}<span id="sv${k}">0°</span></label><input type="range" id="sl${k}" min="-180" max="180" value="0" step="1" oninput="sliderMoved()"></div>`);
}
function selectCell(id) { cellId = id; document.querySelectorAll(".cell").forEach((b) => b.classList.toggle("on", b.id === "cell-" + id)); const c = manifest.cells[id]; cellHint(); loadDesign(); }
function cellHint() { const c = manifest.cells[cellId]; document.getElementById("cell-hint").textContent = fmt(tr("dyn.hint"), { K: c.K, P: c.payload_kg, T: c.t_seg_s }); }
function selectLam(k) { lam = k; document.querySelectorAll(".lam").forEach((b) => b.classList.toggle("on", b.id === "lam-" + k)); loadDesign(); }
function sliderMoved() { playing = false; document.getElementById("btn-play").textContent = tr("dyn.playc"); const q = []; for (let k = 0; k < 6; k++) { const v = +document.getElementById(`sl${k}`).value; q.push(v * Math.PI / 180); document.getElementById(`sv${k}`).textContent = `${v}°`; } setJoints(q); placePart(null); updateFK(); }
function togglePlay() { playing = !playing; document.getElementById("btn-play").textContent = playing ? tr("dyn.pause") : tr("dyn.playc"); }
function scrubTo(i) { playing = false; document.getElementById("btn-play").textContent = tr("dyn.playc"); showFrame(i); }
function gotoWaypoint(i) {
  playing = false; document.getElementById("btn-play").textContent = tr("dyn.playc");
  let at = rec.cycle.rest.findIndex((r) => r === i);
  if (at < 0 && rec.cycle.visits) { const v = rec.cycle.visits.indexOf(i); at = v >= 0 ? rec.cycle.leg.indexOf(v) : 0; }   // the leg leaving that visit starts at the point
  showFrame(at >= 0 ? at : 0); playT = times ? times[Math.max(0, at)] : Math.max(0, at);
}
function toggleAxes(on) { for (const h of axesHelpers) h.visible = on && !paperMode; if (worldAxes) worldAxes.visible = !paperMode && EMBED !== "coord"; }
function toggleGrid(on) { gridHelper.visible = on && !paperMode; floorMesh.visible = on && !paperMode; }
function setPaperMode(on) {
  paperMode = on; scene.background = srgb(on ? 0xffffff : 0xF6F7F9);
  const grid = document.getElementById("chk-grid").checked; gridHelper.visible = grid && !on; floorMesh.visible = grid && !on; shadowCatcher.visible = on;
  toggleAxes(document.getElementById("chk-axes").checked); ambientRef.intensity = on ? 0.55 : 0.32; fillRef.intensity = on ? 0.18 : 0.22;
}
function togglePresent(on) {                 // presentation mode: hide the panel, let the scene take the width
  const next = on === undefined ? !document.body.classList.contains("present") : on;
  document.body.classList.toggle("present", next);
  document.getElementById("btn-present").textContent = next ? tr("dyn.exit") : tr("top.present");
  window.dispatchEvent(new Event("resize"));
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("present")) togglePresent(false); });
function cameraPoseString() { const p = camera.position, t = controls.target; return [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => v.toFixed(3)).join(","); }
function copyCameraPose() { const s = cameraPoseString(); document.getElementById("cam-pose").value = s; if (navigator.clipboard) navigator.clipboard.writeText(s).catch(() => {}); }
function pasteCameraPose() { const v = document.getElementById("cam-pose").value.split(",").map(Number); if (v.length !== 6 || v.some(isNaN)) return alert("camera pose: 6 numbers"); camera.position.set(v[0], v[1], v[2]); controls.target.set(v[3], v[4], v[5]); controls.update(); }
function savePNG(k = 3) {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight, pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(w * k, h * k, false); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png"); renderer.setPixelRatio(pr); renderer.setSize(w, h, false); renderer.render(scene, camera);
  const a = document.createElement("a"); a.download = `robotatc_${cellId}_lam${lam}_${w * k}x${h * k}.png`; a.href = url; a.click();
}

// ------------------------------------------------------------------ start
(async () => {
  initThree();
  manifest = await (await fetch("data/manifest.json", { cache: "no-store" })).json();
  buildCellGrid(); selectCell(cellId);
  window.addEventListener("message", (e) => {       // from the agents page (embed mode only)
    const m = e.data || {}; if (!EMBED || !rec) return;
    if (m.type === "layout" && EMBED === "layout") { layoutStage = Math.max(0, Math.min(3, m.stage | 0)); redrawOverlay(); robotRoot.visible = false; }
    if (m.type === "round" && EMBED === "coord") { coordPlaying = false; showRound(m.i | 0); }
    if (m.type === "cell" && m.cell && manifest.cells[m.cell]) { cellId = m.cell; if (m.lam) lam = String(m.lam); loadDesign(); }
  });
  window.addEventListener("langchange", () => {   // redraw the parts written by this script; keep the pose, frame and round
    const q = []; for (let k = 0; k < 6; k++) q.push(+document.getElementById(`sl${k}`).value);
    buildCellGrid(); cellHint();
    if (document.body.classList.contains("present")) document.getElementById("btn-present").textContent = tr("dyn.exit");
    for (let k = 0; k < 6; k++) { document.getElementById(`sl${k}`).value = q[k]; document.getElementById(`sv${k}`).textContent = `${q[k]}°`; }
    if (!rec) return;
    renderDesignCard(); updateFK();
    document.getElementById("btn-play").textContent = playing ? tr("dyn.pause") : tr("dyn.playc");
    document.getElementById("btn-coord-play").textContent = coordPlaying ? tr("dyn.pause") : tr("dyn.playr");
    if (mode === "coord") showRound(roundIdx);
  });
})();

// debug handle for tests
window.__studio = () => ({ frames, times, boxPool, frameIdx, playT, rec });

// RobotATC agents page: a scripted replay of the three cards for one work cell.
// Card 1 and 2 play agents/data/<cell>_replay.json (recorded runs of the two agents); card 3 plays the real coordination
// run of studio/data/<cell>_lam1.json.  No build step, no framework.
(() => {
  const $ = (s) => document.querySelector(s);
  const NAVY = "#1A365D", ORANGE = "#E07A2E", STEEL = "#5F6B7A", RULE = "#D5DAE1", GREEN = "#2F855A", RED = "#9B2C2C";
  let R = null, S = null, speed = 1, timer = null, playing = false;
  const tr = (k) => LANG.tr(k), fld = (o, k) => LANG.fld(o, k);   // ../lang.js: strings written by this script, and replay fields with a _ko twin
  const ko = () => LANG.get() === "ko";

  // ---------------------------------------------------------------- data
  const FINAL = new URLSearchParams(location.search).get("final") === "1";   // finished state at once (screenshots, printing)
  let cellId = "a";
  const CELLS = "abcdefghi";
  const PARTS = [["1", "abc"], ["2", "def"], ["3", "ghi"]];   // transfer, tending, stacking (the paper's letters, in order since 2026-10-04)
  function buildCellPick() {
    $("#cellpick").innerHTML = PARTS.map(([p, ids]) => `<span class="part" title="${tr("part." + p)}"><i>${p}</i>` + ids.split("").map(c => `<button data-cell="${c}" class="${c === cellId ? "on" : ""}" title="(${c}) ${tr("cell." + c)}">(${c})</button>`).join("") + `</span>`).join("");
    document.querySelectorAll("#cellpick button").forEach(b => b.addEventListener("click", () => switchCell(b.dataset.cell)));
  }
  async function switchCell(c) {
    if (c === cellId || !CELLS.includes(c)) return;
    stop(); cellId = c; await load(c);
    if (view !== "overview") playAgent(view);
  }
  async function load(cell) {
    cellId = cell;
    const urls = [`data/${cell}_replay.json`, `../studio/data/${cell}_lam1.json`];
    let r, s;
    if (FINAL) {                                 // synchronous, so a headless screenshot taken at the load event sees the data
      [r, s] = urls.map(u => { const x = new XMLHttpRequest(); x.open("GET", u, false); x.send(); return JSON.parse(x.responseText); });
    } else {
      [r, s] = await Promise.all(urls.map(u => fetch(u, { cache: "no-store" }).then(x => x.json())));   // the replay data changes between builds: never from the browser cache
    }
    R = r; S = s;
    buildCellPick(); mountFrames(cell);
    resetAll(); $("#status").textContent = tr("dyn.ready"); $("#task-foot").textContent = fld(R, "task_note"); $("#layout-foot").textContent = fld(R.layout, "note");
    $("#view-title").textContent = tr(`vt.${view}`); $("#view-sub").textContent = tr(`vs.${view}`);
  }

  // ---------------------------------------------------------------- static parts
  function fillTaskCard(filled, animate) {   // rows are laid out once; a filled row slides in from the left, a chip flying over from the chat
    const t = $("#task-card");
    if (!t.children.length || t.dataset.lang !== LANG.get() + ":" + cellId) {
      t.dataset.lang = LANG.get() + ":" + cellId;
      t.innerHTML = R.task_card.map(c => `<tr class="pending" data-key="${c.key}"><th>${fld(c, "label")}</th><td class="v">—</td><td class="src"></td></tr>`).join("");
    }
    R.task_card.forEach(c => {
      const row = t.querySelector(`tr[data-key="${c.key}"]`), on = filled.has(c.key), was = row.classList.contains("filled");
      if (on === was) return;
      row.classList.toggle("filled", on); row.classList.toggle("pending", !on);
      row.querySelector(".v").textContent = on ? fld(c, "value") : "—"; row.querySelector(".src").textContent = on ? fld(c, "source") : "";
      if (on && animate) { row.classList.add("enter"); fly(fld(c, "chip"), row, c.key); setTimeout(() => row.classList.remove("enter"), 1300); }
    });
  }
  function flyChip(text, from, to) {         // a chip travels from one point to another and fades as it lands
    if (!text) return;
    const f = document.createElement("div"); f.className = "token-fly"; f.textContent = text;
    f.style.left = `${from.x}px`; f.style.top = `${from.y}px`; document.body.appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.left = `${to.x}px`; f.style.top = `${to.y}px`; f.style.opacity = "0"; f.style.transform = "scale(.8)"; }));
    setTimeout(() => f.remove(), 1100);
  }
  const rectOf = (el) => el.getBoundingClientRect();
  function flyBetween(text, fromEl, toEl, delay = 0) {
    if (!playing || !fromEl || !toEl) return;
    setTimeout(() => { const a = rectOf(fromEl), b = rectOf(toEl); flyChip(text, { x: a.left + a.width * 0.5 - 30, y: a.top + a.height * 0.55 }, { x: b.left + 12, y: b.top + 6 }); }, delay);
  }
  const SKETCH_SPOT = { sequence: [0.5, 0.55], payload: [0.3, 0.65], timing: [0.5, 0.3], approach: [0.72, 0.4], range: [0.85, 0.08] };   // where each part lands on the sketch, as a fraction of its size
  function fly(text, row, key) {             // first from the last user message to the row it fills, then on from the row to the sketch
    const src = [...document.querySelectorAll("#chat .msg.user")].pop(); if (!src) return;
    const s = src.getBoundingClientRect(), r = row.getBoundingClientRect(), c = $("#sketch").getBoundingClientRect(), spot = SKETCH_SPOT[key] || [0.5, 0.5];
    flyChip(text, { x: s.left + 16, y: s.top + 8 }, { x: r.left + 12, y: r.top + 6 });
    setTimeout(() => flyChip(text, { x: r.left + 12, y: r.top + 6 }, { x: c.left + c.width * spot[0] - 30, y: c.top + c.height * spot[1] - 10 }), 650);
  }
  // Stage 2 plays the recorded run of the Layout agent (R.layout.log): st = how far the run has come.
  // build: index of the build_cell result shown under "Fixtures" (-1: none yet); checks/nChecks: the check result being reported; problem: stated or not
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function fillLayout(st = {}, from) {
    const L = R.layout, b = st.build == null ? -1 : st.build, cks = st.checks || L.checks, n = st.nChecks || 0, showProblem = !!st.problem;
    const fx = $("#fixtures"), ck = $("#checks"), pb = $("#problem"), lang = LANG.get() + ":" + cellId;
    const anim = playing;                       // slide-ins and chips only while the scene plays; the finished state is drawn at once
    if (fx.dataset.key !== `${lang}:${b}`) {    // the list is that of the latest build_cell result; before the first one, blank rows
      fx.dataset.key = `${lang}:${b}`;
      const built = b >= 0 ? L.builds[b] : null;
      fx.innerHTML = built ? built.map(f => `<li><b>${esc(f.model)}</b> · ${esc(f.points)}${f.joined ? `<span>${tr("lg.joined")}</span>` : ""}${f.dims ? `<span>${esc(fld(f, "dims"))}</span>` : ""}</li>`).join("")
                           : L.fixtures.map(() => `<li class="pending">—</li>`).join("");
      if (built && anim) [...fx.children].forEach((li, i) => { flyBetween(built[i].model, from || $("#plan3d"), li, i * 180); li.classList.add("enter"); setTimeout(() => li.classList.remove("enter"), 900 + i * 180); });
    }
    if (ck.dataset.key !== lang || ck.children.length !== cks.length) { ck.dataset.key = lang; ck.innerHTML = cks.map(c => `<li>${cap(fld(c, "label"))}<span>…</span></li>`).join(""); }
    [...ck.children].forEach((li, i) => {
      const on = i < n, c = cks[i], was = li.classList.contains("ok") || li.classList.contains("fail");
      if (on && !was && anim) { flyBetween(cap(fld(c, "label")), from || $("#plan3d"), li); li.classList.add("enter"); setTimeout(() => li.classList.remove("enter"), 900); }
      li.classList.toggle("ok", on && c.ok); li.classList.toggle("fail", on && !c.ok); li.querySelector("span").textContent = on ? c.detail : "…";
    });
    if (pb.dataset.key !== lang) { pb.dataset.key = lang; pb.innerHTML = L.problem.map(p => `<tr class="pending"><th>${fld(p, "label")}</th><td class="v">—</td></tr>`).join(""); }
    [...pb.querySelectorAll("tr")].forEach((tr, i) => { const was = tr.classList.contains("filled"); if (showProblem === was) return; tr.classList.toggle("filled", showProblem); tr.classList.toggle("pending", !showProblem); tr.querySelector(".v").textContent = showProblem ? fld(L.problem[i], "value") : "—"; if (showProblem && anim) { flyBetween(fld(L.problem[i], "label"), from || ck, tr, i * 160); tr.style.transitionDelay = `${i * 160}ms`; tr.classList.add("enter"); setTimeout(() => { tr.classList.remove("enter"); tr.style.transitionDelay = ""; }, 1200 + i * 160); } });
  }
  // one box of the Stage 2 log (the look of a tool call in the Stage 1 dialogue), and a line added to it
  function logBox(html) {
    const div = document.createElement("div"); div.className = "msg agent tool";
    $("#chat-layout").appendChild(div); logLine(div, html);
    requestAnimationFrame(() => div.classList.add("show"));
    return div;
  }
  function logLine(box, html, cls) {
    const ln = document.createElement("div"); ln.className = "ln" + (cls ? " " + cls : ""); ln.innerHTML = html;
    box.appendChild(ln); if (playing) requestAnimationFrame(() => box.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return ln;
  }
  // ---------------------------------------------------------------- target cascading diagram: one round, target down and response up
  function drawATC(i) {
    const svg = $("#atc"), h = i >= 0 ? S.coordination[i] : null, mm = (v) => v ? `(${v[0].toFixed(0)}, ${v[1].toFixed(0)}) mm` : "—";
    const P = { tk: "M165,72 L92,150", td: "M275,72 L348,150", rk: "M122,150 L197,72", rd: "M318,150 L243,72" };   // target down, response up
    svg.innerHTML = `
      <defs><marker id="atc-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke"/></marker></defs>
      <rect class="box" x="130" y="12" width="180" height="60" rx="7"/>
      <text class="t h" x="220" y="33" text-anchor="middle">${tr("atc.sys")}</text>
      <text class="t v" x="220" y="51" text-anchor="middle">a⁰ = ${mm(h && h.a0)}</text>
      <text class="t s" x="220" y="66" text-anchor="middle">${tr("atc.w")} = ${h ? h.w.toFixed(2) : "—"}</text>
      <rect class="box sub" x="12" y="150" width="190" height="98" rx="7"/>
      <text class="t h k" x="107" y="171" text-anchor="middle">${tr("atc.kin")}</text>
      <text class="t s" x="107" y="188" text-anchor="middle">${tr("atc.kinobj")}</text>
      <text class="t v k" x="107" y="207" text-anchor="middle">a¹ = ${mm(h && h.a1)}</text>
      <text class="t s" x="107" y="224" text-anchor="middle">+ w ‖a¹ − a⁰‖²</text>
      <rect class="box sub" x="238" y="150" width="190" height="98" rx="7"/>
      <text class="t h d" x="333" y="171" text-anchor="middle">${tr("atc.dyn")}</text>
      <text class="t s" x="333" y="188" text-anchor="middle">${tr("atc.dynobj")}</text>
      <text class="t v d" x="333" y="207" text-anchor="middle">a² = ${mm(h && h.a2)}</text>
      <text class="t s" x="333" y="224" text-anchor="middle">+ w ‖a² − a⁰‖²</text>
      <text class="t v d" x="333" y="241" text-anchor="middle">v_app = ${h && h.v_app != null ? h.v_app.toFixed(2) + " m/s" : "—"}</text>
      <path class="arrow" d="${P.tk}"/><path class="arrow" d="${P.td}"/><path class="arrow k" d="${P.rk}"/><path class="arrow d" d="${P.rd}"/>
      <text class="t s" x="112" y="102" text-anchor="end">${tr("atc.tgt")} ↓</text><text class="t s" x="328" y="102">↓ ${tr("atc.tgt")}</text>
      <text class="t s k" x="166" y="116">${tr("atc.rsp")} a¹ ↑</text><text class="t s d" x="296" y="140" text-anchor="end">↑ ${tr("atc.rsp")} a²</text>
      <circle class="dot tgt" style="offset-path: path('${P.tk}')"/><circle class="dot tgt" style="offset-path: path('${P.td}')"/>
      <circle class="dot rsp k" style="offset-path: path('${P.rk}')"/><circle class="dot rsp d" style="offset-path: path('${P.rd}')"/>
      <text class="t s" x="220" y="268" text-anchor="middle">${tr("atc.gap")} = ${h ? h.gap_mm.toFixed(1) + " mm" : "—"}</text>`;
    if (h && playing) { svg.style.setProperty("--atc", `${Math.round(Math.min(360, 340 / speed))}ms`); svg.classList.remove("pulse"); void svg.getBoundingClientRect(); svg.classList.add("pulse"); } else svg.classList.remove("pulse");
  }
  function fillDesign(show) {
    const d = S.design;
    const rows = [[tr("dyn.links"), `${d.a2_mm.toFixed(1)}, ${d.a3_mm.toFixed(1)} mm`], [tr("dyn.vapp"), `${d.v_app.toFixed(2)} m/s`],
                  [tr("dyn.motors"), d.motors.join(" · ").replace(/_/g, "-")], [tr("dyn.mass"), `${d.mass_kg.toFixed(3)} kg`], [tr("dyn.eta"), d.eta.toFixed(3)],
                  [tr("dyn.obj"), d.obj.toFixed(4)], [tr("dyn.rounds"), `${d.rounds} · ${d.sizings}`]];
    const t = $("#design");
    t.innerHTML = rows.map(([k, v]) => `<tr class="${show ? "filled" : "pending"}"><th>${k}</th><td class="mono v">${show ? v : "—"}</td></tr>`).join("");
    if (show && playing) [...t.querySelectorAll("tr")].forEach((tr, i) => { flyBetween(rows[i][1], $("#plane"), tr, i * 160); tr.style.transitionDelay = `${i * 160}ms`; tr.classList.add("enter"); setTimeout(() => { tr.classList.remove("enter"); tr.style.transitionDelay = ""; }, 1200 + i * 160); });
  }
  function fillLive(i) {
    const c = S.coordination[Math.max(0, Math.min(i, S.coordination.length - 1))];
    const show = i >= 0;
    const rows = [[tr("dyn.target"), show ? `${c.a0[0].toFixed(1)}, ${c.a0[1].toFixed(1)}` : "—"], [tr("dyn.kin"), show ? `${c.a1[0].toFixed(1)}, ${c.a1[1].toFixed(1)}` : "—"],
                  [tr("dyn.dyn"), show ? `${c.a2[0].toFixed(1)}, ${c.a2[1].toFixed(1)}` : "—"], [tr("dyn.gap"), show ? `${c.gap_mm.toFixed(1)} mm` : "—"],
                  [tr("dyn.w"), show ? c.w.toFixed(2) : "—"], [tr("dyn.v"), show ? `${c.v_app.toFixed(2)} m/s` : "—"]];
    $("#live").innerHTML = rows.map(([k, v]) => `<tr class="${show ? "filled settled" : "pending"}"><th>${k}</th><td class="mono">${v}</td></tr>`).join("");
    $("#round").textContent = show ? c.round : 0;
    $("#rounds").textContent = S.coordination.length;
  }

  // ---------------------------------------------------------------- canvases
  // ---------------------------------------------------------------- the studio, framed: the cell in 3D (layout) and the coordination scene (optimization)
  const frames = { plan3d: { el: null, ready: false, last: null }, coord3d: { el: null, ready: false, last: null } };
  function frameSrc(id, cell) { return `../studio/?embed=${id === "plan3d" ? "layout" : "coord"}&cell=${cell}&lam=1`; }
  function post(id, msg) { const f = frames[id]; f.last = msg; if (f.ready && f.el && f.el.contentWindow) f.el.contentWindow.postMessage(msg, "*"); }
  window.addEventListener("message", (e) => {
    const m = e.data || {}; if (m.type !== "ready") return;
    const id = m.embed === "layout" ? "plan3d" : m.embed === "coord" ? "coord3d" : null; if (!id) return;
    frames[id].ready = true; if (frames[id].last) post(id, frames[id].last);
  });
  function mountFrames(cell) {
    for (const id of Object.keys(frames)) {
      const el = $(`#${id}`); frames[id] = { el, ready: false, last: null };
      if (FINAL) {                               // a capture cannot wait for the 3D frame: show the rendered cell in its place
        let im = el.parentNode.querySelector("img.still"); if (!im) { im = document.createElement("img"); im.className = "still"; im.style.cssText = "width:100%;height:100%;object-fit:contain;background:#fff"; el.parentNode.appendChild(im); }
        im.src = `img/cell_${cell}.png`; el.style.display = "none";
      } else { el.dataset.want = frameSrc(id, cell); el.removeAttribute("src"); }
    }
    wakeFrame(view);
  }
  const FRAME_OF = { layout: "plan3d", opt: "coord3d" };
  function wakeFrame(name) {                   // a 3D frame is loaded when its view is first opened, not with the page
    const id = FRAME_OF[name], f = id && frames[id]; if (!f || !f.el || FINAL) return;
    if (f.el.dataset.want && f.el.getAttribute("src") !== f.el.dataset.want) f.el.src = f.el.dataset.want;
  }
  const setLayoutStage = (stage) => post("plan3d", { type: "layout", stage });
  const setRound3d = (i) => post("coord3d", { type: "round", i });

  // ---------------------------------------------------------------- sketch of the task (task agent), drawn from the card as it fills in
  let sketchAnim = 0;
  function animateSketch(filled, fresh) {    // fresh: the keys added by this fill; they slide in from the left over 0.5 s
    cancelAnimationFrame(sketchAnim);
    if (!fresh.size) return drawSketch(filled);
    const t0 = performance.now();
    const step = (now) => { const p = Math.min(1, (now - t0) / 500), e = 1 - Math.pow(1 - p, 3); drawSketch(filled, fresh, e); if (p < 1) sketchAnim = requestAnimationFrame(step); };
    sketchAnim = requestAnimationFrame(step);
  }
  function drawSketch(filled, fresh = new Set(), e = 1) {
    const cv = $("#sketch"), g = cv.getContext("2d"), W = cv.width, H = cv.height;
    const pts = Array.isArray(R.sketch) ? R.sketch : (R.sketch && R.sketch.points) || [], K = pts.length;
    const pairs = (R.sketch && R.sketch.pairs) || pts.slice(0, -1).map((_, k) => [k, k + 1]);   // pick -> place arrows; older data: a tour
    g.clearRect(0, 0, W, H);
    const F = (px, w = 400) => `${w} ${px}px IBM Plex Sans, Noto Sans KR, sans-serif`;
    const part = (key, fn) => { if (!filled.has(key)) return; const f = fresh.has(key); g.save(); if (f) { g.globalAlpha = e; g.translate(-16 * (1 - e), 0); } fn(); g.restore(); };
    const floorY = H - 44;
    g.strokeStyle = RULE; g.lineWidth = 1.5; g.beginPath(); g.moveTo(24, floorY); g.lineTo(W - 24, floorY); g.stroke();
    if (!filled.has("sequence") || !K) { g.fillStyle = STEEL; g.font = F(13); g.textAlign = "center"; g.fillText("…", W / 2, H / 2); return; }
    // the points spread left to right; blocks of varying height stand for the fixtures (not to scale)
    const x0 = 110, x1 = W - 110, P = pts.map((p, k) => ({ x: K === 1 ? W / 2 : x0 + (x1 - x0) * k / (K - 1), y: floorY - [48, 100, 70, 116, 86][k % 5], side: p.approach === "side" }));
    const bw = Math.min(72, (x1 - x0) / Math.max(K - 1, 1) - 16);
    part("sequence", () => {
      P.forEach((p, k) => {
        const h = floorY - p.y;
        g.fillStyle = k % 2 ? "#B89A70" : "#9AA3AD";
        if (p.side) { g.fillRect(p.x + 12, p.y - 46, 10, h + 46); g.fillRect(p.x - bw / 2, p.y - 2, bw / 2 + 12, 5); }   // a wall or shelf the point sits in front of
        else g.fillRect(p.x - bw / 2, p.y, bw, h);
        g.fillStyle = STEEL; g.font = F(12); g.textAlign = "center"; g.fillText(fld(pts[k], "fixture"), p.x, floorY + 18);
        g.fillStyle = RED; g.beginPath(); g.arc(p.x, p.y - 12, 7, 0, 2 * Math.PI); g.fill();
        g.fillStyle = "#fff"; g.font = F(10, 600); g.fillText(String(k + 1), p.x, p.y - 8.5);
        const lab = K > 2 ? fld(pts[k], "label").split(" ")[0] : fld(pts[k], "label");   // short labels when the sketch is busy
        if (K <= 2) { g.fillStyle = RED; g.font = F(12, 500); g.textAlign = "right"; g.fillText(lab, p.x - 9, p.y - 40); }                  // left of the approach arrow, clear of the path   // with more points the numbered dots carry the names
      });
      const arc = (a, b, lift, col, dash) => {
        const top = Math.min(a.y, b.y) - lift, mx = (a.x + b.x) / 2;
        g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash(dash || []); g.beginPath(); g.moveTo(a.x, a.y - 22); g.quadraticCurveTo(mx, top, b.x, b.y - 22); g.stroke(); g.setLineDash([]);
        const dx = b.x - mx, dy = (b.y - 22) - top, Ln = Math.hypot(dx, dy), ux = dx / Ln, uy = dy / Ln;
        g.fillStyle = col; g.beginPath(); g.moveTo(b.x, b.y - 22); g.lineTo(b.x - 9 * ux + 4 * uy, b.y - 22 - 9 * uy - 4 * ux); g.lineTo(b.x - 9 * ux - 4 * uy, b.y - 22 - 9 * uy + 4 * ux); g.closePath(); g.fill();
      };
      pairs.forEach(([a, b], k) => { if (P[a] && P[b] && a !== b) arc(P[a], P[b], 44 + 18 * (k % 3), NAVY); });
      const last = pairs[pairs.length - 1];
      if (last && P[last[1]] && P[pairs[0][0]] && last[1] !== pairs[0][0]) { arc(P[last[1]], P[pairs[0][0]], 60 + Math.max(...P.map(p => floorY - p.y)) * 0.5, STEEL, [4, 4]); g.fillStyle = STEEL; g.font = F(12); g.textAlign = "center"; g.fillText(tr("sk.back"), W / 2, 22); }
    });
    part("payload", () => { const p = P[pairs[0][0]] || P[0]; g.fillStyle = GREEN; g.beginPath(); g.arc(p.x, p.y - 12, 7, 0, 2 * Math.PI); g.fill(); g.fillStyle = "#fff"; g.font = F(10, 600); g.textAlign = "center"; g.fillText("1", p.x, p.y - 8.5); g.fillStyle = GREEN; g.font = F(12, 500); g.textAlign = "left"; g.fillText(K > 2 ? `${S.payload_kg} kg` : fmt(tr("sk.pay"), { P: S.payload_kg }), p.x + 13, p.y - 6); });
    part("timing", () => { g.fillStyle = NAVY; g.font = F(12, 500); g.textAlign = "center"; const a = P[pairs[0][0]] || P[0], b = P[pairs[0][1]] || P[0]; g.fillText(fmt(tr("sk.t"), { T: S.t_seg_s }), (a.x + b.x) / 2, Math.min(a.y, b.y) - 44 + 14); });
    part("approach", () => {
      P.forEach((p, k) => {
        g.strokeStyle = ORANGE; g.lineWidth = 2; g.fillStyle = ORANGE; g.beginPath();
        if (p.side) { g.moveTo(p.x - 58, p.y - 12); g.lineTo(p.x - 24, p.y - 12); g.stroke(); g.beginPath(); g.moveTo(p.x - 14, p.y - 12); g.lineTo(p.x - 24, p.y - 17); g.lineTo(p.x - 24, p.y - 7); }
        else { g.moveTo(p.x, p.y - 64); g.lineTo(p.x, p.y - 30); g.stroke(); g.beginPath(); g.moveTo(p.x, p.y - 22); g.lineTo(p.x - 5, p.y - 32); g.lineTo(p.x + 5, p.y - 32); }
        g.closePath(); g.fill();
      });
      g.fillStyle = ORANGE; g.font = F(12, 500); g.textAlign = "right"; g.fillText(fmt(tr("sk.app"), { A: 50 }), W - 24, 40);
    });
    part("range", () => { g.fillStyle = STEEL; g.font = F(12); g.textAlign = "right"; g.fillText(fmt(tr("sk.v"), { V: "0.2 – 0.6" }), W - 24, 22); });
  }

  function drawPlane(upto) {                 // link-length plane, rounds 0..upto
    const cv = $("#plane"), g = cv.getContext("2d"), W = cv.width, H = cv.height, L = 42, B = 34, T = 14, Rr = 12;
    g.clearRect(0, 0, W, H);
    // the frame follows the run of this cell (all rounds, the all-in-one point), square and padded, so the two copies
    // closing in fill the plot instead of a corner of the whole design range
    const all = []; S.coordination.forEach(r => all.push(r.a1, r.a2)); if (S.design.aio && S.design.aio.a) all.push(S.design.aio.a);
    const xs = all.map(v => v[0]), ys = all.map(v => v[1]);
    const span = Math.max(60, (Math.max(...xs) - Math.min(...xs)) * 1.25, (Math.max(...ys) - Math.min(...ys)) * 1.25);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const x0 = cx - span / 2, x1 = cx + span / 2, y0 = cy - span / 2, y1 = cy + span / 2;
    const X = (v) => L + (v - x0) / (x1 - x0) * (W - L - Rr), Y = (v) => H - B - (v - y0) / (y1 - y0) * (H - B - T);
    g.strokeStyle = RULE; g.lineWidth = 1; g.strokeRect(L, T, W - L - Rr, H - B - T);
    g.fillStyle = STEEL; g.font = "11px IBM Plex Mono, monospace";
    const step = [10, 20, 25, 50, 100].find(q => span / q <= 5) || 100;
    for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) { g.textAlign = "center"; g.fillText(v, X(v), H - B + 14); g.strokeStyle = "#EEF1F5"; g.beginPath(); g.moveTo(X(v), T); g.lineTo(X(v), H - B); g.stroke(); }
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) { g.textAlign = "right"; g.fillText(v, L - 5, Y(v) + 4); g.strokeStyle = "#EEF1F5"; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - Rr, Y(v)); g.stroke(); }
    g.textAlign = "left";
    g.fillStyle = STEEL; g.font = "12px IBM Plex Sans, sans-serif"; g.fillText("a₂ [mm]", W / 2 - 20, H - 6); g.save(); g.translate(10, H / 2 + 20); g.rotate(-Math.PI / 2); g.fillText("a₃ [mm]", 0, 0); g.restore();
    if (upto < 0) return;
    const rows = S.coordination.slice(0, upto + 1);
    const trace = (key, color, dash) => {
      g.strokeStyle = color; g.lineWidth = 1.6; g.setLineDash(dash || []); g.beginPath();
      rows.forEach((r, i) => i ? g.lineTo(X(r[key][0]), Y(r[key][1])) : g.moveTo(X(r[key][0]), Y(r[key][1]))); g.stroke(); g.setLineDash([]);
      rows.forEach((r, i) => { g.fillStyle = color; g.beginPath(); g.arc(X(r[key][0]), Y(r[key][1]), i === rows.length - 1 ? 5 : 2.5, 0, 2 * Math.PI); g.fill(); });
    };
    trace("a1", GREEN); trace("a2", RED);   // the system target lies between the two and only cluttered the plot; its value is in the round diagram
    const last = rows[rows.length - 1];
    const side = X(last.a1[0]) > W - 110 ? -1 : 1; g.textAlign = side < 0 ? "right" : "left";      // labels turn inward near the right edge
    g.fillStyle = GREEN; g.font = "12px IBM Plex Sans, Noto Sans KR, sans-serif"; g.fillText(tr("dyn.kinl"), X(last.a1[0]) + 8 * side, Y(last.a1[1]) - 6);
    g.fillStyle = RED; g.fillText(tr("dyn.dynl"), X(last.a2[0]) + 8 * side, Y(last.a2[1]) + 14); g.textAlign = "left";
    if (upto >= S.coordination.length - 1 && S.design.aio) {
      g.strokeStyle = STEEL; g.lineWidth = 1.5; const a = S.design.aio.a; g.beginPath(); g.moveTo(X(a[0]) - 5, Y(a[1]) - 5); g.lineTo(X(a[0]) + 5, Y(a[1]) + 5); g.moveTo(X(a[0]) + 5, Y(a[1]) - 5); g.lineTo(X(a[0]) - 5, Y(a[1]) + 5); g.stroke();
      g.fillStyle = STEEL; g.textAlign = "right"; g.fillText(tr("dyn.aio"), X(a[0]) - 9, Y(a[1]) + 18); g.textAlign = "left";   // below and to the left, clear of the two copies' labels
    }
  }

  function drawGap(upto) {                   // inconsistency (log) and weight per round
    const cv = $("#gap"), g = cv.getContext("2d"), W = cv.width, H = cv.height, L = 44, B = 34, T = 14, Rr = 40;
    g.clearRect(0, 0, W, H);
    const n = S.coordination.length;
    const X = (r) => L + (r - 1) / (n - 1) * (W - L - Rr);
    const gaps = S.coordination.map(r => Math.max(r.gap_mm, 0.5)), ws = S.coordination.map(r => r.w);
    const gLo = Math.log10(0.5), gHi = Math.log10(Math.max(...gaps) * 1.3), wHi = Math.max(...ws) * 1.1;
    const YG = (v) => H - B - (Math.log10(Math.max(v, 0.5)) - gLo) / (gHi - gLo) * (H - B - T), YW = (v) => H - B - v / wHi * (H - B - T);
    g.strokeStyle = RULE; g.strokeRect(L, T, W - L - Rr, H - B - T);
    g.fillStyle = STEEL; g.font = "11px IBM Plex Mono, monospace";
    for (const v of [1, 10, 100]) { if (Math.log10(v) <= gHi) { g.fillText(v, 12, YG(v) + 4); g.strokeStyle = "#EEF1F5"; g.beginPath(); g.moveTo(L, YG(v)); g.lineTo(W - Rr, YG(v)); g.stroke(); } }
    for (let r = 5; r <= n; r += 5) g.fillText(r, X(r) - 6, H - B + 14);
    g.fillStyle = STEEL; g.font = "12px IBM Plex Sans, Noto Sans KR, sans-serif"; g.fillText(tr("dyn.round"), W / 2 - 16, H - 6);
    g.fillStyle = NAVY; g.fillText("mm", 12, T + 2); g.fillStyle = ORANGE; g.fillText("w", W - Rr + 10, T + 2);
    if (upto < 0) return;
    const rows = S.coordination.slice(0, upto + 1);
    g.strokeStyle = ORANGE; g.lineWidth = 1.6; g.beginPath(); rows.forEach((r, i) => i ? g.lineTo(X(r.round), YW(r.w)) : g.moveTo(X(r.round), YW(r.w))); g.stroke();
    g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); rows.forEach((r, i) => i ? g.lineTo(X(r.round), YG(r.gap_mm)) : g.moveTo(X(r.round), YG(r.gap_mm))); g.stroke();
    rows.forEach(r => { g.fillStyle = NAVY; g.beginPath(); g.arc(X(r.round), YG(r.gap_mm), 2.5, 0, 2 * Math.PI); g.fill(); });
    const last = rows[rows.length - 1];
    g.fillStyle = ORANGE; g.font = "11px IBM Plex Mono, monospace"; g.fillText(last.w.toFixed(1), X(last.round) + 5, YW(last.w) + 4);
  }

  // ---------------------------------------------------------------- replay script
  function setStage(name, state) {           // name: task|layout|opt, state: on|done|''
    document.querySelectorAll("[data-card]").forEach(e => { if (e.dataset.card === name) { e.classList.remove("on", "done"); if (state) e.classList.add(state); } });
  }
  // ---------------------------------------------------------------- views (as on the MotorAI page: the overview is static; an agent plays its own scene when opened)
  let view = "overview";
  function showView(name) {
    view = name;
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    $("#view-title").textContent = tr(`vt.${name}`); $("#view-sub").textContent = tr(`vs.${name}`);
    document.body.classList.toggle("on-overview", name === "overview");
    window.scrollTo({ top: 0 }); wakeFrame(name);
    if (name === "overview") stop(); else playAgent(name);
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => { if (!b.disabled) showView(b.dataset.view); }));
  const fmt = (s, m) => s.replace(/\{(\w)\}/g, (_, k) => m[k]);
  function now(card, text, done) {
    const e = $(`#now-${card}`); e.textContent = text || ""; e.classList.toggle("done", !!done);
    const l = $(`#live-${card}`); if (l) l.textContent = text || tr("now.idle");
  }
  function confirm(id, on, text) { const e = $(id); e.classList.toggle("ok", on); const s = e.querySelector("span:last-child"); s.textContent = text || (ko() ? "확인 대기" : "waiting for confirmation"); }

  // ---------------------------------------------------------------- the three scenes, [delay_ms, fn]
  // ---------------------------------------------------------------- chat bubbles (task agent, layout agent, coordinator)
  function say(chatSel, m, tagKey) {
    const div = document.createElement("div");
    div.className = `msg ${m.who}${m.kind ? " " + m.kind : ""}`;
    div.innerHTML = `<span class="tag">${m.who === "user" ? tr("dyn.user") : tr(tagKey)}</span>${fld(m, "text")}`;
    $(chatSel).appendChild(div); requestAnimationFrame(() => { div.classList.add("show"); if (playing) div.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
    return div;
  }
  const SCENES = {
    task() {
      const out = [], filled = new Set();
      out.push([0, () => now("task", tr("now.read"))]);
      R.chat.forEach((m) => {
        out.push([m.who === "user" ? 1400 : 1800, () => {
          if (m.asks) now("task", tr("now.ask." + m.asks)); else if (m.who === "agent" && m.fills && !m.confirm) now("task", tr("now.note")); else if (m.confirm) now("task", tr("now.wait1"));
          say("#chat", m, "dyn.agent");
          (m.fills || []).forEach(k => filled.add(k)); if (m.fills) { const fresh = new Set([...m.fills, ...(filled.has("range") ? [] : ["range"])]); filled.add("range"); const go = () => { fillTaskCard(filled, playing); if (playing) setTimeout(() => animateSketch(filled, fresh), 1250); else drawSketch(filled); }; if (playing) setTimeout(go, 350); else go(); }   // the card fills a beat after the message
          if (m.confirm) confirm("#task-confirm", false, tr("dyn.c1wait"));
        }]);
      });
      out.push([1600, () => { confirm("#task-confirm", true, tr("dyn.c1ok")); now("task", tr("now.ok1"), true); $("#next-task").disabled = false; }]);
      return out;
    },
    layout() {                                 // the recorded run, step by step: a call of the agent, then what the tool returned
      const out = [], L = R.layout, C = "#chat-layout", st = { build: -1, checks: null, nChecks: 0, problem: false };
      const call = (tool, args) => `<i>${tr("lg.agent")}</i> <span class="fn">${esc(tool)}</span>${args ? " " + args : ""}`, tool = `<i>${tr("lg.tool")}</i> `;
      const lastBuild = L.log.map(e => e.kind).lastIndexOf("build");
      let box = null;
      L.log.forEach((e, k) => {
        if (e.kind === "input") out.push([500, () => { now("layout", tr("now.in")); box = logBox(`<i>${tr("lg.input")}</i> ${tr("lg.spec")}`); if (e.sheet) { logLine(box, tr("lg.sheet")); e.sheet.forEach(r => logLine(box, `<span class="lb">${esc(r.p)}</span> ${esc(r.equipment)} · (${esc(r.pos)}) mm · ${esc(fld(r, "side"))}${r.known ? " · " + esc(fld(r, "known")) : ""}`, "ck")); }
          else logLine(box, `${tr("lg.wps")} <span class="lb">${e.points.join(" · ")}</span>`); }]);
        else if (e.kind === "build") {
          out.push([1300, () => { now("layout", tr("now.fix")); box = logBox(call("build_cell", e.call.map(f => `${esc(f.model)} [${esc(f.points)}]`).join(" · "))); }]);
          out.push([1200, () => {
            logLine(box, tool + (e.ok ? fmt(tr("lg.built"), { F: e.n, B: e.boxes }) : esc(e.error || "—")));
            e.joined.forEach(s => logLine(box, esc(s), "key"));
            (e.dims || []).forEach(f => logLine(box, `<span class="lb">${esc(f.model)}</span> ${esc(fld(f, "text"))}`, "ck"));
            st.build = e.b; st.checks = null; st.nChecks = 0; setLayoutStage(1); fillLayout(st);
          }]);
          if (k === lastBuild) {
            out.push([1600, () => { now("layout", tr("now.wp")); setLayoutStage(2); }]);
            out.push([1200, () => { now("layout", tr("now.app")); setLayoutStage(3); }]);
          }
        }
        else if (e.kind === "check") {
          out.push([1200, () => { box = logBox(call("check")); st.checks = e.checks; st.nChecks = 0; fillLayout(st); }]);
          e.checks.forEach((c, i) => out.push([1000, () => {
            now("layout", fmt(tr("now.chk"), { C: fld(c, "label") }));
            const ln = logLine(box, `<span class="${c.ok ? "ok" : "no"}">${c.ok ? "✓" : "✗"}</span> <span class="lb">${esc(c.label)}</span> ${esc(c.line)}`, "ck");
            st.nChecks = i + 1; fillLayout(st, ln);
          }]));
        }
        else if (e.kind === "problem") {
          out.push([1300, () => { now("layout", tr("now.prob")); box = logBox(call("state_problem")); }]);
          out.push([1100, () => { logLine(box, tool + fmt(tr("lg.prob"), { V: e.variables, R: e.ranges, C: e.constraints, W: e.weights })); st.problem = true; fillLayout(st); }]);
        }
        else if (e.kind === "ask") {
          out.push([1500, () => { now("layout", tr("now.wait2")); confirm("#layout-confirm", false, tr("dyn.c1wait")); say(C, { who: "agent", text: esc(e.question) }, "dyn.lagent"); }]);
          if (e.answer) out.push([1500, () => { say(C, { who: "user", text: esc(e.answer) }, "dyn.lagent"); confirm("#layout-confirm", true, tr("dyn.c2ok")); }]);
        }
        else out.push([1000, () => { box = logBox(call(e.kind === "submit" ? "submit" : e.tool)); if (e.note) logLine(box, esc(e.note)); }]);
      });
      out.push([700, () => { if (L.submitted) now("layout", tr("now.ok2"), true); $("#next-layout").disabled = false; }]);
      return out;
    },
    opt() {
      const out = [], N = S.coordination.length, lines = (R.opt && R.opt.chat) || [], C = "#chat-opt";
      const byRound = {}; lines.forEach(m => { if (m.round !== undefined) (byRound[m.round] = byRound[m.round] || []).push(m); });
      lines.filter(m => m.round === undefined && !m.at).slice(0, lines.findIndex(m => m.round !== undefined)).forEach(m => out.push([m.who === "user" ? 1200 : 400, () => say(C, m, "dyn.coord")]));
      S.coordination.forEach((h, i) => out.push([i === 0 ? 1200 : (byRound[i] ? 700 : 380), () => {
        now("opt", fmt(tr("now.round"), { R: h.round !== undefined ? h.round : i + 1, N })); drawPlane(i); drawGap(i); fillLive(i); drawATC(i); setRound3d(i);
        (byRound[i] || []).forEach(m => say(C, m, "dyn.coord"));
      }]));
      out.push([900, () => now("opt", tr("now.verify"))]);
      out.push([1200, () => { fillDesign(true); confirm("#opt-confirm", true, tr("dyn.c3ok")); now("opt", tr("now.ok3"), true); lines.filter(m => m.at === "design").forEach(m => say(C, m, "dyn.coord")); }]);
      const tail = lines.slice(lines.findIndex(m => m.at === "design") + 1);
      tail.forEach(m => out.push([1400, () => say(C, m, "dyn.coord")]));
      return out;
    },
  };
  const RESET = {                            // the blank state of each agent view
    task() { $("#chat").innerHTML = ""; fillTaskCard(new Set()); drawSketch(new Set()); confirm("#task-confirm", false); now("task", ""); $("#next-task").disabled = true; },
    layout() { $("#chat-layout").innerHTML = ""; fillLayout(); confirm("#layout-confirm", false); setLayoutStage(0); now("layout", ""); $("#next-layout").disabled = true; },
    opt() { $("#chat-opt").innerHTML = ""; drawPlane(-1); drawGap(-1); fillLive(-1); drawATC(-1); fillDesign(false); setRound3d(0); confirm("#opt-confirm", false, ko() ? "설계를 사용자에게 반환" : "design returned to the user"); now("opt", ""); },
  };
  const done = { task: false, layout: false, opt: false };

  // ---------------------------------------------------------------- player: one agent at a time
  let queue = [], current = null;
  function run() {
    if (!playing || !queue.length) { if (!queue.length && current) finish(current); return; }
    const [d, fn] = queue.shift();
    timer = setTimeout(() => { fn(); run(); }, d / speed);
  }
  function finish(name) { playing = false; done[name] = true; setStage(name, "done"); $("#status").textContent = tr("dyn.done"); $("#status").className = "status done"; $("#btn-play").textContent = tr("dyn.play"); }
  function stop() { clearTimeout(timer); playing = false; queue = []; $("#btn-play").textContent = tr("dyn.play"); $("#status").textContent = tr("dyn.ready"); $("#status").className = "status"; }
  function playAgent(name) {
    stop(); current = name; done[name] = false;
    RESET[name](); setStage(name, "on"); $("#status").textContent = $(`.nav-item[data-card=${name}] b`).textContent; $("#status").className = "status live";
    queue = SCENES[name](); playing = true; $("#btn-play").textContent = tr("dyn.pause"); run();
  }
  function finishNow(name) {                 // the end state at once (screenshots, printing, language switch)
    stop(); current = name; RESET[name](); SCENES[name]().forEach(([, fn]) => fn()); finish(name);
    document.querySelectorAll(".msg").forEach(m => { m.style.transition = "none"; m.classList.add("show"); });
  }
  function resetAll() { ["task", "layout", "opt"].forEach(n => { RESET[n](); setStage(n, ""); done[n] = false; }); document.querySelectorAll(".stages .live").forEach(l => l.textContent = tr("now.idle"));  }
  function reset() { stop(); resetAll(); if (view !== "overview") current = view; }

  $("#btn-play").addEventListener("click", () => {
    if (view === "overview") return;
    if (playing) { playing = false; clearTimeout(timer); $("#btn-play").textContent = tr("dyn.resume"); return; }
    if (queue.length) { playing = true; $("#btn-play").textContent = tr("dyn.pause"); run(); return; }
    playAgent(view);
  });
  $("#btn-reset").addEventListener("click", () => { if (view === "overview") reset(); else { stop(); RESET[view](); setStage(view, ""); done[view] = false; } });
  document.querySelectorAll(".speed button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".speed button").forEach(x => x.classList.remove("on")); b.classList.add("on"); speed = parseFloat(b.dataset.speed);
  }));
  window.addEventListener("langchange", () => {   // redraw in the new language: finished scenes stay finished, a running scene restarts
    if (!R) return;
    $("#task-foot").textContent = fld(R, "task_note");
    $("#layout-foot").textContent = fld(R.layout, "note");
    const wasPlaying = playing, snapshot = { ...done };
    stop(); resetAll();
    ["task", "layout", "opt"].forEach(n => { if (snapshot[n]) finishNow(n); });
    $("#view-title").textContent = tr(`vt.${view}`); $("#view-sub").textContent = tr(`vs.${view}`);
    if (view !== "overview" && wasPlaying) playAgent(view);
    else if (view !== "overview" && !snapshot[view]) setStage(view, "on");
    if (view === "overview") $("#status").textContent = tr("dyn.ready");
  });

  const c0 = new URLSearchParams(location.search).get("cell");
  load(c0 && CELLS.includes(c0) ? c0 : "a").then(() => {
    const v0 = new URLSearchParams(location.search).get("view");          // ?view=task|layout|opt opens that agent and plays its scene
    const at = parseInt(new URLSearchParams(location.search).get("at"), 10);   // ?final=1&view=<agent>&at=N: that agent after its first N steps (frame capture)
    if (FINAL && v0 && SCENES[v0] && Number.isFinite(at)) {
      const order = ["task", "layout", "opt"]; order.slice(0, order.indexOf(v0)).forEach(finishNow);
      stop(); current = v0; RESET[v0](); setStage(v0, "on"); SCENES[v0]().slice(0, at).forEach(([, fn]) => fn());
      document.querySelectorAll(".msg").forEach(m => { m.style.transition = "none"; m.classList.add("show"); });
      document.title = `steps ${SCENES[v0]().length}`;
      document.body.classList.add("capture");      // frames of one card: nothing under it, and the same height in every frame
      const cm = parseInt(new URLSearchParams(location.search).get("chatmax"), 10);   // ?chatmax=N: the dialogue as a window N px high that follows its last line (frame capture)
      if (cm) document.querySelectorAll(".chat").forEach(c => { c.style.maxHeight = cm + "px"; c.style.overflow = "hidden"; c.style.justifyContent = "flex-end"; [...c.children].forEach(m => m.style.flexShrink = "0"); });   // a column that overflows at its start: the last lines stay in view without scrolling
    } else
    if (FINAL) { ["task", "layout", "opt"].forEach(finishNow); $("#status").textContent = tr("dyn.done"); }
    if (v0 && $(`#view-${v0}`) && v0 !== "overview") { if (FINAL) { view = v0; document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${v0}`)); document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === v0)); $("#view-title").textContent = tr(`vt.${v0}`); $("#view-sub").textContent = tr(`vs.${v0}`); document.body.classList.remove("on-overview"); } else showView(v0); }
    else document.body.classList.add("on-overview");
  });
})();

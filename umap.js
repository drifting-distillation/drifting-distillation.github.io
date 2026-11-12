// UMAP of real vs distilled CLS embeddings, styled after the paper's scatter figure:
// real images are grey circles, distilled images are colored stars tethered to their
// thumbnails, and their augmentations are triangles. Over the plot, a lens magnifies the
// area around the cursor and the nearest real point or triangle is previewed.
// Data from src/tools/export_site_umap.py.
(() => {
  const ROOT = "assets/umap";
  const W = 1000, T = 110, GAP = 28, PH = 400, PAD = 16;   // width, thumb size, row gap, plot height
  const TOP = T + GAP, H = 2 * T + 2 * GAP + PH;
  const MARGIN = 10;                                       // blank band above and below the thumbnails
  const LENS_R = 70, ZOOM = 3;                             // lens radius (viewBox units), magnification
  const PICK_R = LENS_R / ZOOM;                            // pick anything visible in the lens
  const NS = "http://www.w3.org/2000/svg";

  const svg = document.getElementById("umap-plot");
  const tip = document.getElementById("umap-tip");
  const tipImg = tip.querySelector("div");
  const tipLabel = tip.querySelector("span");

  const el = (name, attrs, parent) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const pos = ([x, y]) => [PAD + x * (W - 2 * PAD), TOP + PAD + (1 - y) * (PH - 2 * PAD)];

  function starPath(cx, cy, r) {
    let d = "";
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
      d += `${k ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
    }
    return d + "Z";
  }
  const triPath = (cx, cy, r) =>
    `M${cx},${cy - r}L${cx + r * 0.9},${cy + r * 0.6}L${cx - r * 0.9},${cy + r * 0.6}Z`;

  fetch(`${ROOT}/points.json`).then((r) => r.json()).then((d) => {
    svg.setAttribute("viewBox", `0 ${-MARGIN} ${W} ${H + 2 * MARGIN}`);   // room for the frames' strokes
    const n = d.syn.length;
    const content = el("g", { id: "umap-content" }, svg);

    // Pickable points: every real image and every augmentation.
    const picks = [];
    const real = el("g", { class: "umap-real" }, content);
    d.real.forEach((p, k) => {
      const [cx, cy] = pos(p);
      el("circle", { cx, cy, r: 4.5 }, real);
      picks.push({ x: cx, y: cy, sheet: "real.webp", k, cols: d.cols, label: `Real goldfish #${k + 1}` });
    });
    // Augmentations are stored pass by pass (pass p holds one augmentation of every distilled
    // image), so showing the first `passes` of them is a prefix of the list.
    const aug = el("g", { class: "umap-aug" }, content);
    const triangles = d.aug.map(([x, y, src], k) => {
      const [cx, cy] = pos([x, y]);
      picks.push({ x: cx, y: cy, sheet: "aug.webp", k, cols: d.aug_cols, src, pass: Math.floor(k / n),
                   label: "" });          // filled in once the thumbnails are laid out
      return el("path", { d: triPath(cx, cy, 7), fill: d.colors[src] }, aug);
    });
    const augSlider = document.getElementById("umap-augs");
    const augCount = document.getElementById("umap-augs-n");
    let passes = 0;
    function setPasses(p) {
      passes = p;
      triangles.forEach((t, k) => t.setAttribute("visibility", Math.floor(k / n) < p ? "visible" : "hidden"));
      augCount.textContent = p;
    }
    augSlider.max = d.aug_passes;
    augSlider.oninput = () => setPasses(Number(augSlider.value));
    setPasses(Number(augSlider.value));

    // Thumbnail slots: the upper half of the stars go to the top row, the rest to the
    // bottom row, each row ordered by x so the tethers don't cross.
    const stars = d.syn.map((p, k) => ({ k, xy: pos(p) }));
    const byY = [...stars].sort((a, b) => a.xy[1] - b.xy[1]);
    const rows = [byY.slice(0, Math.ceil(n / 2)), byY.slice(Math.ceil(n / 2))];
    const parts = stars.map(() => ({}));                  // per distilled image: its tether, thumb, frame, star
    const tethers = el("g", { class: "umap-tethers" }, content);
    const thumbs = el("g", { class: "umap-thumbs" }, content);
    rows.forEach((row, r) => {
      row.sort((a, b) => a.xy[0] - b.xy[0]);
      const m = (W - row.length * T) / (row.length + 1);
      row.forEach((s, j) => {
        const tx = m + j * (T + m), ty = r === 0 ? 0 : H - T;
        parts[s.k].tether = el("line", { x1: s.xy[0], y1: s.xy[1], x2: tx + T / 2,
                                         y2: r === 0 ? ty + T : ty }, tethers);
        parts[s.k].thumb = el("svg", { x: tx, y: ty, width: T, height: T,
                                       viewBox: `${s.k * d.syn_thumb} 0 ${d.syn_thumb} ${d.syn_thumb}` }, thumbs);
        el("image", { href: `${ROOT}/syn.webp`, width: n * d.syn_thumb, height: d.syn_thumb }, parts[s.k].thumb);
        parts[s.k].frame = el("rect", { x: tx, y: ty, width: T, height: T, class: "frame" }, thumbs);
        parts[s.k].slot = r * rows[0].length + j + 1;     // 1-5 top row, 6-10 bottom row, left to right
      });
    });
    // Number each augmentation by where its distilled image's thumbnail is shown.
    picks.forEach((p) => { if (p.src !== undefined) p.label = `Aug. of Distilled #${parts[p.src].slot}`; });
    const syn = el("g", { class: "umap-syn" }, content);
    stars.forEach(({ k, xy }) => {
      parts[k].star = el("path", { d: starPath(xy[0], xy[1], 15), fill: d.colors[k] }, syn);
    });

    // Emphasize distilled image k (its star, tether and framed thumbnail); null clears.
    let lit = null;
    function highlight(k) {
      if (k === lit) return;
      const els = (k) => ["tether", "thumb", "frame", "star"].map((key) => parts[k][key]);
      if (lit !== null) els(lit).forEach((e) => e.classList.remove("hl"));
      lit = k;
      content.classList.toggle("focus", k !== null);
      if (k === null) return;
      els(k).forEach((e) => e.classList.add("hl"));
      parts[k].frame.style.setProperty("--hl", d.colors[k]);
      parts[k].tether.style.setProperty("--hl", d.colors[k]);
    }

    // Ring around the picked point; inside `content`, so the lens shows it too.
    const ring = el("circle", { class: "umap-ring", r: 9, visibility: "hidden" }, content);

    // The lens: a magnified copy of `content` around the cursor, clipped to a circle drawn
    // beside the cursor; a dashed circle at the cursor marks the magnified area.
    const defs = el("defs", {}, svg);
    const clip = el("clipPath", { id: "umap-lens-clip" }, defs);
    const clipCircle = el("circle", { r: LENS_R }, clip);
    const lens = el("g", { class: "umap-lens", visibility: "hidden" }, svg);
    const lensBg = el("circle", { r: LENS_R, class: "lens-bg" }, lens);
    const lensView = el("g", { "clip-path": "url(#umap-lens-clip)" }, lens);
    const zoomed = el("use", { href: "#umap-content" }, lensView);
    const lensRim = el("circle", { r: LENS_R, class: "lens-rim" }, lens);
    const lensSrc = el("circle", { r: PICK_R, class: "lens-src" }, lens);
    const LENS_GAP = 12;                                   // between the marked area and the lens

    function toView(evt) {
      const p = svg.createSVGPoint();
      p.x = evt.clientX;
      p.y = evt.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    }

    function hide() {
      lens.setAttribute("visibility", "hidden");
      ring.setAttribute("visibility", "hidden");
      tip.hidden = true;
      highlight(null);
    }

    svg.addEventListener("mousemove", (evt) => {
      const { x, y } = toView(evt);
      if (y < TOP || y > TOP + PH) return hide();      // only over the scatter, not the thumbnails
      // Lens to the right of the cursor, or to the left near the right edge.
      const right = x + PICK_R + LENS_GAP + 2 * LENS_R <= W;
      const lx = right ? x + PICK_R + LENS_GAP + LENS_R : x - PICK_R - LENS_GAP - LENS_R, ly = y;
      for (const c of [clipCircle, lensBg, lensRim]) {
        c.setAttribute("cx", lx);
        c.setAttribute("cy", ly);
      }
      lensSrc.setAttribute("cx", x);
      lensSrc.setAttribute("cy", y);
      zoomed.setAttribute("transform", `translate(${lx} ${ly}) scale(${ZOOM}) translate(${-x} ${-y})`);
      lens.setAttribute("visibility", "visible");

      let best = null, bestD = PICK_R * PICK_R;
      for (const p of picks) {
        if (p.pass !== undefined && p.pass >= passes) continue;   // hidden by the slider
        const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (dd < bestD) { best = p; bestD = dd; }
      }
      if (!best) {
        ring.setAttribute("visibility", "hidden");
        tip.hidden = true;
        highlight(null);
        return;
      }
      highlight(best.src === undefined ? null : best.src);
      ring.setAttribute("cx", best.x);
      ring.setAttribute("cy", best.y);
      ring.setAttribute("visibility", "visible");

      const s = 128;
      tipImg.style.width = tipImg.style.height = `${s}px`;
      tipImg.style.backgroundImage = `url(${ROOT}/${best.sheet})`;
      tipImg.style.backgroundSize = `${best.cols * s}px auto`;
      tipImg.style.backgroundPosition = `-${(best.k % best.cols) * s}px -${Math.floor(best.k / best.cols) * s}px`;
      tipLabel.textContent = best.label;
      tip.hidden = false;

      // Place the preview on the other side of the cursor from the lens; if it doesn't fit
      // there, put it beyond the lens instead.
      const box = svg.parentElement.getBoundingClientRect();
      const px = box.width / W, cx = evt.clientX - box.left, tw = tip.offsetWidth;
      const near = PICK_R * px + 10, far = (PICK_R + LENS_GAP + 2 * LENS_R) * px + 10;
      let tx = right ? cx - near - tw : cx + near;
      if (tx < 0 || tx + tw > box.width) tx = right ? cx + far : cx - far - tw;
      tx = Math.max(0, Math.min(tx, box.width - tw));
      let ty = evt.clientY - box.top - tip.offsetHeight / 2;
      ty = Math.max(0, Math.min(ty, box.height - tip.offsetHeight));
      tip.style.left = `${tx}px`;
      tip.style.top = `${ty}px`;
    });
    svg.addEventListener("mouseleave", hide);
  });
})();

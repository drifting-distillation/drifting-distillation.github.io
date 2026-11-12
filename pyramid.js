// Pyramid explorer: decode sigmoid(2 * sum of enabled levels) client-side.
// Each level PNG holds that level's upsampled, color-decorrelated contribution,
// quantized to [lo, hi] (see src/tools/export_site_pyramid.py).
(() => {
  const ROOT = "assets/pyramid";
  const R = 256;
  const DEFAULT_IMAGE = 1;   // index of the jellyfish shown first (and first in the strip)

  const canvas = document.getElementById("pyr-canvas");
  const ctx = canvas.getContext("2d");
  const slider = document.getElementById("pyr-slider");
  const originalBtn = document.getElementById("pyr-original");
  const interpolatedBtn = document.getElementById("pyr-interpolated");
  const play = document.getElementById("pyr-play");
  const levelsEl = document.getElementById("pyr-levels");
  const thumbsEl = document.getElementById("pyr-thumbs");

  let meta, current = 0, levels = [], enabled = [], chips = [], timer = null;
  const pad = (n) => String(n).padStart(2, "0");

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Decode a quantized level PNG back to float RGB values.
  async function loadLevel(i, k) {
    const img = await loadImage(`${ROOT}/${pad(i)}_L${k}.png`);
    const c = document.createElement("canvas");
    c.width = c.height = R;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, R, R).data;
    const [lo, hi] = meta.ranges[i][k];
    const out = new Float32Array(R * R * 3);
    for (let p = 0, q = 0; p < px.length; p += 4, q += 3) {
      out[q] = lo + (px[p] / 255) * (hi - lo);
      out[q + 1] = lo + (px[p + 1] / 255) * (hi - lo);
      out[q + 2] = lo + (px[p + 2] / 255) * (hi - lo);
    }
    return out;
  }

  // Write sigmoid(2 * scale * sum of the given levels) to a 2D context.
  function paint(target, idxs, scale) {
    const img = target.createImageData(R, R);
    const d = img.data;
    for (let q = 0, p = 0; q < R * R * 3; q += 3, p += 4) {
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        for (const k of idxs) s += levels[k][q + ch];
        d[p + ch] = 255 / (1 + Math.exp(-2 * scale * s));
      }
      d[p + 3] = 255;
    }
    target.putImageData(img, 0, 0);
  }

  function render() {
    const idxs = enabled.flatMap((on, k) => (on ? [k] : []));
    const scale = idxs.length ? levels.length / idxs.length : 1;
    paint(ctx, idxs, scale);
    chips.forEach((chip, k) => chip.classList.toggle("off", !enabled[k]));
  }

  function setUpTo(k) {
    enabled = levels.map((_, j) => j <= k);
    slider.value = k;
    render();
  }

  async function selectImage(i) {
    current = i;
    [...thumbsEl.children].forEach((t) => t.classList.toggle("active", Number(t.dataset.index) === i));
    const [lv, natives] = await Promise.all([
      Promise.all(meta.resolutions.map((_, k) => loadLevel(i, k))),
      Promise.all(meta.resolutions.map((_, k) => loadImage(`${ROOT}/${pad(i)}_N${k}.png`))),
    ]);
    if (current !== i) return;  // a newer selection won the race
    levels = lv;
    chips.forEach((chip, k) => {
      const [interp, orig] = chip.querySelectorAll("canvas");
      paint(interp.getContext("2d"), [k], levels.length);
      // Nearest-neighbor enlarge into the 256x256 bitmap: blocks are an exact integer
      // number of pixels, so the tile scales cleanly at any browser zoom.
      const oc = orig.getContext("2d");
      oc.imageSmoothingEnabled = false;
      oc.drawImage(natives[k], 0, 0, R, R);
    });
    render();
  }

  function buildChips() {
    chips = meta.resolutions.map((res, k) => {
      const chip = document.createElement("button");
      chip.className = "pyr-chip";
      chip.title = "Toggle this level";
      const [interp, orig] = [0, 1].map(() => {
        const c = document.createElement("canvas");
        c.width = c.height = R;
        return c;
      });
      orig.className = "orig";
      const label = document.createElement("span");
      label.textContent = `${res}×${res}`;
      chip.append(interp, orig, label);
      chip.onclick = () => { stop(); enabled[k] = !enabled[k]; render(); };
      levelsEl.appendChild(chip);
      return chip;
    });
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    play.textContent = "Play";
  }

  play.onclick = () => {
    if (timer) return stop();
    let k = 0;
    setUpTo(k);
    play.textContent = "Stop";
    timer = setInterval(() => {
      if (++k >= levels.length) return stop();
      setUpTo(k);
    }, 600);
  };
  slider.oninput = () => { stop(); setUpTo(Number(slider.value)); };
  function setOriginal(on) {
    levelsEl.classList.toggle("original", on);
    originalBtn.classList.toggle("active", on);
    interpolatedBtn.classList.toggle("active", !on);
  }
  originalBtn.onclick = () => setOriginal(true);
  interpolatedBtn.onclick = () => setOriginal(false);

  fetch(`${ROOT}/meta.json`)
    .then((r) => r.json())
    .then((m) => {
      meta = m;
      slider.max = meta.resolutions.length - 1;
      enabled = meta.resolutions.map(() => true);
      buildChips();
      // The strip starts at DEFAULT_IMAGE and wraps around to the ones before it.
      const n = meta.ranges.length;
      [...Array(n).keys()].map((j) => (j + DEFAULT_IMAGE) % n).forEach((i) => {
        const t = document.createElement("img");
        t.dataset.index = i;
        t.src = `${ROOT}/${pad(i)}.webp`;
        t.alt = `Distilled jellyfish ${i + 1}`;
        t.loading = "lazy";
        t.onclick = () => { stop(); selectImage(i); };
        thumbsEl.appendChild(t);
      });
      selectImage(DEFAULT_IMAGE);
    });
})();

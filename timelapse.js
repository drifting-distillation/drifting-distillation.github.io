// Timelapse: every distilled image of one class at the same optimization step.
// Each image's frames are tiled into one sprite sheet (see src/tools/export_site_timelapse.py).
(() => {
  const ROOT = "assets/timelapse";
  const FRAME_MS = 50;

  const section = document.getElementById("scrubber");
  const grid = document.getElementById("tl-grid");
  const slider = document.getElementById("tl-slider");
  const stepLabel = document.getElementById("tl-step");
  const play = document.getElementById("tl-play");

  let meta, sheets = [], canvases = [], timer = null;
  const pad = (n) => String(n).padStart(2, "0");

  function draw(f) {
    const s = meta.size;
    const sx = (f % meta.cols) * s, sy = Math.floor(f / meta.cols) * s;
    canvases.forEach((c, i) => c.getContext("2d").drawImage(sheets[i], sx, sy, s, s, 0, 0, s, s));
    slider.value = f;
    stepLabel.textContent = `Step ${meta.steps[f].toLocaleString()}`;
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    play.textContent = "Play";
  }

  play.onclick = () => {
    if (timer) return stop();
    let f = Number(slider.value) >= meta.steps.length - 1 ? 0 : Number(slider.value);
    draw(f);
    play.textContent = "Pause";
    timer = setInterval(() => {
      if (++f >= meta.steps.length) return stop();
      draw(f);
    }, FRAME_MS);
  };
  slider.oninput = () => { stop(); draw(Number(slider.value)); };

  async function load() {
    stepLabel.textContent = "Loading…";
    meta = await (await fetch(`${ROOT}/meta.json`)).json();
    sheets = await Promise.all([...Array(meta.num_images).keys()].map((i) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `${ROOT}/${pad(i)}.webp`;
    })));
    canvases = sheets.map(() => {
      const c = document.createElement("canvas");
      c.width = c.height = meta.size;
      grid.appendChild(c);
      return c;
    });
    slider.max = meta.steps.length - 1;
    slider.disabled = play.disabled = false;
    draw(meta.steps.length - 1);   // open on the finished images
  }

  // The sheets are ~11 MB, so fetch them only when the section comes into view.
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) {
      obs.disconnect();
      load().catch(() => { stepLabel.textContent = "Could not load the timelapse."; });
    }
  }, { rootMargin: "400px" }).observe(section);
})();

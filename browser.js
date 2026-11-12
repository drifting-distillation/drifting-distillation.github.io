// Distilled-set browser: 10 images per ImageNet-1k class.
const BACKBONE = "dinov3";
const IPC = 10;
const ROOT = "assets/browser";

const grid = document.getElementById("grid");
const label = document.getElementById("class-label");
const search = document.getElementById("search");
const list = document.getElementById("class-list");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");

let names = [];
const DEFAULT_CLASS = 327;   // starfish
let current = DEFAULT_CLASS;

const pad = (n) => String(n).padStart(4, "0");
const optionText = (i) => `${names[i]} (#${i})`;

function show(c) {
  current = (c + names.length) % names.length;
  label.textContent = optionText(current);
  grid.replaceChildren();
  for (let k = 0; k < IPC; k++) {
    const img = document.createElement("img");
    img.src = `${ROOT}/${BACKBONE}/${pad(current)}_${k}.webp`;
    img.alt = `Distilled ${names[current]} ${k + 1}`;
    img.loading = "lazy";
    grid.appendChild(img);
  }
}

fetch(`${ROOT}/classes.json`)
  .then((r) => r.json())
  .then((data) => {
    names = data;
    for (let i = 0; i < names.length; i++) {
      const opt = document.createElement("option");
      opt.value = optionText(i);
      list.appendChild(opt);
    }
    show(DEFAULT_CLASS);
  });

search.addEventListener("change", () => {
  const m = search.value.match(/#(\d+)\)$/);
  const i = m ? Number(m[1]) : names.findIndex((n) => n.toLowerCase() === search.value.trim().toLowerCase());
  if (i >= 0) { show(i); search.value = ""; search.blur(); }
});
document.getElementById("prev").onclick = () => show(current - 1);
document.getElementById("next").onclick = () => show(current + 1);
document.getElementById("random").onclick = () => show(Math.floor(Math.random() * names.length));

document.addEventListener("keydown", (e) => {
  if (e.target === search) return;
  if (e.key === "ArrowLeft") show(current - 1);
  if (e.key === "ArrowRight") show(current + 1);
  if (e.key === "Escape") lightbox.hidden = true;
});

grid.addEventListener("click", (e) => {
  if (e.target.tagName !== "IMG") return;
  lightboxImg.src = e.target.src;
  lightboxImg.alt = e.target.alt;
  lightbox.hidden = false;
});
lightbox.addEventListener("click", () => { lightbox.hidden = true; });

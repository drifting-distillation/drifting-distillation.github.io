// Distilled-data browser.  Reads manifest.json from the Hugging Face dataset
// repo, then fetches one class at a time: each set is parquet with one row group
// per class, so hyparquet's HTTP range reads pull only that class's bytes.
// Deep links: #set=<set id>&class=<index>.  ?base=<url> points at another copy
// of the repo (e.g. a local server while testing).
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from "./hyparquet.mjs";

const HF = "https://huggingface.co/datasets/georgecazenavette/drifting-distillation/resolve/main/";
const BASE = new URLSearchParams(location.search).get("base") || HF;

const DATASETS = {
  "imagenet-1k": "ImageNet-1k",
  imagenette: "ImageNette",
  imagewoof: "ImageWoof",
  hmdb51: "HMDB51 (video)",
  fma: "FMA (audio)",
};
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp4: "video/mp4", wav: "audio/wav" };

const $ = (id) => document.getElementById(id);
const dsSel = $("dataset"), setSel = $("setting"), ipcSel = $("ipc");
const grid = $("grid"), label = $("class-label"), status = $("status"), search = $("search");

let manifest, set, names = [], current = 0, token = 0, urls = [];

const settingKey = (s) => `${s.group}|${s.variant}`;
function settingLabel(s) {
  if (s.modality !== "image") return s.backbone_label;
  const init = s.init === "real" ? "real init" : "noise init";
  return s.note ? `${s.backbone_label} · ${s.note}` : `${s.backbone_label} · ${init}`;
}

function setStatus(msg, error = false) {
  status.textContent = msg;
  status.classList.toggle("error", error);
}

function fill(select, items) {          // items: [{value, text, group?}]
  select.replaceChildren();
  const groups = new Map();
  for (const it of items) {
    let parent = select;
    if (it.group) {
      if (!groups.has(it.group)) {
        const og = document.createElement("optgroup");
        og.label = it.group;
        select.appendChild(og);
        groups.set(it.group, og);
      }
      parent = groups.get(it.group);
    }
    const o = document.createElement("option");
    o.value = it.value;
    o.textContent = it.text;
    parent.appendChild(o);
  }
}

// ── parquet access ─────────────────────────────────────────────────────────
const files = new Map();   // url -> Promise<{file, rowStarts}>
function openFile(url) {
  if (!files.has(url)) {
    files.set(url, (async () => {
      const file = await asyncBufferFromUrl({ url });
      const md = await parquetMetadataAsync(file);
      const rowStarts = [0];
      for (const rg of md.row_groups) rowStarts.push(rowStarts.at(-1) + Number(rg.num_rows));
      return { file, rowStarts };
    })().catch((e) => { files.delete(url); throw e; }));
  }
  return files.get(url);
}

async function readClass(s, c) {
  const f = s.files.find((x) => c >= x.classes[0] && c < x.classes[1]);
  const { file, rowStarts } = await openFile(BASE + f.path);
  const rg = c - f.classes[0];
  // utf8:false keeps the binary column as bytes (otherwise it is decoded as
  // text and the media is corrupted); names are decoded by hand.
  const rows = await parquetReadObjects({
    file, rowStart: rowStarts[rg], rowEnd: rowStarts[rg + 1], columns: ["name", "data"], utf8: false,
  });
  const dec = new TextDecoder();
  return rows.map((r) => ({ name: typeof r.name === "string" ? r.name : dec.decode(r.name), data: r.data }));
}

// ── rendering ──────────────────────────────────────────────────────────────
async function showClass(c) {
  current = (c + names.length) % names.length;
  const mine = ++token;
  label.textContent = `${names[current]} (#${current})`;
  history.replaceState(null, "", `#set=${encodeURIComponent(set.id)}&class=${current}`);
  setStatus("Loading…");
  try {
    const rows = await readClass(set, current);
    if (mine !== token) return;                 // a newer request won
    urls.forEach(URL.revokeObjectURL);
    urls = [];
    grid.replaceChildren();
    grid.classList.toggle("wide", set.modality !== "image");
    for (const [k, r] of rows.entries()) {
      const ext = r.name.split(".").pop().toLowerCase();
      const url = URL.createObjectURL(new Blob([r.data], { type: MIME[ext] || "application/octet-stream" }));
      urls.push(url);
      const cell = document.createElement("div");
      cell.className = "cell";
      let el;
      if (set.modality === "video") {
        el = Object.assign(document.createElement("video"), { src: url, controls: true, loop: true, muted: true, autoplay: true, playsInline: true });
      } else if (set.modality === "audio") {
        el = Object.assign(document.createElement("audio"), { src: url, controls: true, preload: "metadata", volume: 0.1 });
      } else {
        el = Object.assign(document.createElement("img"), { src: url, alt: `Distilled ${names[current]} ${k + 1}` });
      }
      cell.appendChild(el);
      if (set.modality === "audio") {
        const cap = document.createElement("div");
        cap.className = "cap";
        cap.textContent = `Sample ${k + 1}`;
        cell.appendChild(cap);
      }
      grid.appendChild(cell);
    }
    setStatus("");
  } catch (e) {
    if (mine !== token) return;
    console.error(e);
    setStatus(`Could not load this class (${e.message}).`, true);
  }
}

function chooseSet(s, c = 0) {
  set = s;
  names = manifest.class_names[s.dataset];
  const list = $("class-list");
  list.replaceChildren(...names.map((n, i) => Object.assign(document.createElement("option"), { value: `${n} (#${i})` })));
  const per = s.ipc === 1 ? "1 sample" : `${s.ipc} samples`;
  const mb = s.bytes / 2 ** 20;
  $("setinfo").textContent = `${s.num_classes} classes × ${per} · ${mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB"} · ${s.files.map((f) => f.path).join(", ")}`;
  showClass(Math.min(c, names.length - 1));
}

function onDataset(pref) {
  const sets = manifest.sets.filter((s) => s.dataset === dsSel.value);
  const seen = new Map();
  for (const s of sets) if (!seen.has(settingKey(s))) seen.set(settingKey(s), s);
  fill(setSel, [...seen.values()].map((s) => ({ value: settingKey(s), text: settingLabel(s), group: s.group })));
  if (pref) setSel.value = settingKey(pref);
  onSetting(pref);
}

function onSetting(pref) {
  const sets = manifest.sets.filter((s) => s.dataset === dsSel.value && settingKey(s) === setSel.value)
    .sort((a, b) => a.ipc - b.ipc);
  fill(ipcSel, sets.map((s) => ({ value: s.id, text: String(s.ipc) })));
  const keep = pref && sets.find((s) => s.id === pref.id);
  const byIpc = !keep && set && sets.find((s) => s.ipc === set.ipc);    // keep IPC when switching setting
  const s = keep || byIpc || sets[0];
  ipcSel.value = s.id;
  chooseSet(s, current);
}

// ── wiring ─────────────────────────────────────────────────────────────────
dsSel.addEventListener("change", () => { current = 0; onDataset(); });
setSel.addEventListener("change", () => onSetting());
ipcSel.addEventListener("change", () => chooseSet(manifest.sets.find((s) => s.id === ipcSel.value), current));
$("prev").onclick = () => showClass(current - 1);
$("next").onclick = () => showClass(current + 1);
$("random").onclick = () => showClass(Math.floor(Math.random() * names.length));
search.addEventListener("change", () => {
  const m = search.value.match(/#(\d+)\)$/);
  const i = m ? Number(m[1]) : names.findIndex((n) => n.toLowerCase() === search.value.trim().toLowerCase());
  if (i >= 0) { showClass(i); search.value = ""; search.blur(); }
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select")) return;
  if (e.key === "ArrowLeft") showClass(current - 1);
  if (e.key === "ArrowRight") showClass(current + 1);
  if (e.key === "Escape") $("lightbox").hidden = true;
});
grid.addEventListener("click", (e) => {
  if (e.target.tagName !== "IMG") return;
  $("lightbox-img").src = e.target.src;
  $("lightbox").hidden = false;
});
$("lightbox").addEventListener("click", () => { $("lightbox").hidden = true; });

(async () => {
  setStatus("Loading the dataset list…");
  try {
    manifest = await (await fetch(BASE + "manifest.json")).json();
  } catch (e) {
    setStatus(`Could not load the dataset list (${e.message}).`, true);
    return;
  }
  const present = Object.keys(DATASETS).filter((d) => manifest.sets.some((s) => s.dataset === d));
  fill(dsSel, present.map((d) => ({ value: d, text: DATASETS[d] })));
  const h = new URLSearchParams(location.hash.slice(1));
  const linked = manifest.sets.find((s) => s.id === h.get("set"));
  const start = linked || manifest.sets.find((s) => s.id === "image/imagenet-1k/dinov3_noise/10_ipc") || manifest.sets[0];
  dsSel.value = start.dataset;
  current = Number(h.get("class") || (start.dataset === "imagenet-1k" ? 1 : 0));
  onDataset(start);
})();

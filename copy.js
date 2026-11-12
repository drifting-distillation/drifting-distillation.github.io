// "Copy" button on every <pre class="bibtex">.  Uses the Clipboard API where the page is a
// secure context (https / localhost) and falls back to a hidden textarea otherwise.
document.addEventListener("DOMContentLoaded", () => {
  for (const pre of document.querySelectorAll("pre.bibtex")) {
    const wrap = document.createElement("div");
    wrap.className = "bib-wrap";
    pre.replaceWith(wrap);
    wrap.append(pre);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.onclick = async () => {
      const text = pre.textContent;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        const ta = Object.assign(document.createElement("textarea"), { value: text });
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.append(ta);
        ta.select();
        try { ok = document.execCommand("copy"); } catch (e2) {}
        ta.remove();
      }
      if (!ok) getSelection().selectAllChildren(pre);   // leave it selected for Ctrl+C
      btn.textContent = ok ? "Copied!" : "Press Ctrl+C";
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    };
    wrap.append(btn);
  }
});

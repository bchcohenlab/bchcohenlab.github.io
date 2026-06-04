#!/usr/bin/env python3
"""Build a self-contained HTML figure picker.

For every cached reprint PDF (scripts/.cache/figpdfs/<slug>.pdf), detect each
whole figure (multi-panel figures are kept together — see figure_extract) and lay
them out grouped by paper in one HTML file. Click to select one or more figures
per paper; "Export picks.json" downloads your choices. Hand picks.json to the
agent (or run apply-figure-picks.py) to write the chosen figure(s) into the site.

Thumbnails are base64-inlined, so the HTML works by double-clicking (no server).

Requires PyMuPDF. Run: python3 scripts/build-figure-picker.py
Open:  open scripts/.cache/figure-picker.html
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import fitz  # PyMuPDF
from figure_extract import figure_clusters, render_region

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts/.cache/figpdfs"
PUBS = ROOT / "src/content/publications"
OUT = ROOT / "scripts/.cache/figure-picker.html"

THUMB_MAX = 460        # px, longest side of the inlined thumbnail
MAX_PER_PAPER = 40     # safety cap on figures shown per paper


def title_for(slug: str) -> str:
    f = PUBS / f"{slug}.md"
    if not f.exists():
        return slug
    m = re.search(r"^title: (.+)$", f.read_text(), re.M)
    return json.loads(m.group(1)) if m else slug


def thumb_b64(doc, page_no: int, rect: fitz.Rect) -> str | None:
    try:
        pix = render_region(doc, page_no, rect, zoom=1.6)
    except Exception:
        return None
    longest = max(pix.width, pix.height)
    k = 0
    while longest >> k > THUMB_MAX:
        k += 1
    if k:
        pix.shrink(k)
    try:
        data = pix.tobytes("jpeg", jpg_quality=72)
    except Exception:
        data = pix.tobytes("png")
    return base64.b64encode(data).decode()


def candidates(pdf: Path):
    doc = fitz.open(pdf)
    out = []
    for i, c in enumerate(figure_clusters(doc)[:MAX_PER_PAPER]):
        r = c["rect"]
        thumb = thumb_b64(doc, c["page"], r)
        if not thumb:
            continue
        out.append({
            "page0": c["page"], "x0": round(r.x0, 1), "y0": round(r.y0, 1),
            "x1": round(r.x1, 1), "y1": round(r.y1, 1), "panels": c["panels"],
            "w": int(r.width * 3), "h": int(r.height * 3),
            "thumb": thumb, "largest": i == 0,
        })
    return out


def build():
    papers = []
    for pdf in sorted(CACHE.glob("*.pdf")):
        figs = candidates(pdf)
        if figs:
            papers.append({"slug": pdf.stem, "title": title_for(pdf.stem), "figures": figs})

    sections = []
    for p in papers:
        cells = []
        for it in p["figures"]:
            badge = '<span class="badge">largest</span>' if it["largest"] else ""
            panels = f'{it["panels"]} panels' if it["panels"] > 1 else "1 panel"
            cells.append(
                f'<div class="cell" data-slug="{p["slug"]}" data-page0="{it["page0"]}" '
                f'data-x0="{it["x0"]}" data-y0="{it["y0"]}" data-x1="{it["x1"]}" data-y1="{it["y1"]}" '
                f'data-panels="{it["panels"]}" data-w="{it["w"]}" data-h="{it["h"]}" onclick="toggle(this)">'
                f'{badge}'
                f'<img loading="lazy" src="data:image/jpeg;base64,{it["thumb"]}">'
                f'<div class="meta">p{it["page0"] + 1} · {panels} · {it["w"]}×{it["h"]}</div>'
                f'<span class="check">✓</span>'
                f"</div>"
            )
        sections.append(
            f'<section class="paper"><h2>{p["title"]}</h2>'
            f'<div class="slug">{p["slug"]} · {len(p["figures"])} figures</div>'
            f'<div class="grid">{"".join(cells)}</div></section>'
        )

    total = sum(len(p["figures"]) for p in papers)
    html = (HTML_TEMPLATE.replace("__BODY__", "\n".join(sections))
            .replace("__N_PAPERS__", str(len(papers))).replace("__N_FIGS__", str(total)))
    OUT.write_text(html)
    print(f"Wrote {OUT}")
    print(f"  {len(papers)} papers, {total} candidate figures (multi-panel kept whole)")
    print(f"Open it:  open {OUT.relative_to(ROOT)}")


HTML_TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cohen Lab — figure picker</title>
<style>
  :root { --pri:#155e9c; --acc:#d6409f; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 0; color:#1e293b; background:#f8fafc; }
  header { position: sticky; top:0; z-index:10; background:#fff; border-bottom:1px solid #e2e8f0;
           padding:12px 20px; display:flex; align-items:center; gap:16px; }
  header h1 { font-size:16px; margin:0; }
  header .count { color:#64748b; font-size:13px; }
  header .spacer { flex:1; }
  button { font:inherit; border:1px solid #cbd5e1; background:#fff; border-radius:6px;
           padding:6px 12px; cursor:pointer; }
  button.primary { background:var(--pri); color:#fff; border-color:var(--pri); }
  button:hover { filter:brightness(0.97); }
  .wrap { padding: 20px; max-width: 1200px; margin:0 auto; }
  .paper { margin-bottom: 28px; }
  .paper h2 { font-size:16px; margin:0 0 2px; }
  .paper .slug { color:#94a3b8; font-size:12px; margin-bottom:10px; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap:12px; }
  .cell { position:relative; border:2px solid #e2e8f0; border-radius:8px; overflow:hidden;
          background:#fff; cursor:pointer; transition:border-color .1s; }
  .cell:hover { border-color:#cbd5e1; }
  .cell.sel { border-color:var(--acc); box-shadow:0 0 0 2px rgba(214,64,159,.25); }
  .cell img { display:block; width:100%; height:190px; object-fit:contain; background:#0f172a08; }
  .cell .meta { font-size:11px; color:#64748b; padding:4px 6px; border-top:1px solid #f1f5f9; }
  .cell .check { position:absolute; top:6px; left:6px; width:22px; height:22px; border-radius:50%;
                 background:var(--acc); color:#fff; display:none; align-items:center; justify-content:center;
                 font-size:13px; }
  .cell.sel .check { display:flex; }
  .badge { position:absolute; top:6px; right:6px; background:#0f172ab3; color:#fff; font-size:10px;
           padding:2px 6px; border-radius:99px; z-index:1; }
</style></head>
<body>
<header>
  <h1>Cohen Lab figure picker</h1>
  <span class="count"><b id="selcount">0</b> selected · __N_FIGS__ figures / __N_PAPERS__ papers</span>
  <span class="spacer"></span>
  <button onclick="clearAll()">Clear</button>
  <button class="primary" onclick="exportPicks()">Export picks.json</button>
</header>
<div class="wrap">__BODY__</div>
<script>
  const KEY = "cohenlab-figure-picks";
  const id = (c) => [c.dataset.slug, c.dataset.page0, c.dataset.x0, c.dataset.y0, c.dataset.x1, c.dataset.y1].join(":");
  let picks = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));

  function paint() {
    document.querySelectorAll(".cell").forEach(c => c.classList.toggle("sel", picks.has(id(c))));
    document.getElementById("selcount").textContent = picks.size;
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify([...picks])); paint(); }
  function toggle(c) { const k = id(c); picks.has(k) ? picks.delete(k) : picks.add(k); persist(); }
  function clearAll() { picks.clear(); persist(); }

  function exportPicks() {
    const out = {};
    document.querySelectorAll(".cell").forEach(c => {
      if (!picks.has(id(c))) return;
      (out[c.dataset.slug] ||= []).push({
        page0: +c.dataset.page0, x0: +c.dataset.x0, y0: +c.dataset.y0,
        x1: +c.dataset.x1, y1: +c.dataset.y1, panels: +c.dataset.panels,
        w: +c.dataset.w, h: +c.dataset.h,
      });
    });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "picks.json"; a.click();
  }
  paint();
</script>
</body></html>
"""

if __name__ == "__main__":
    build()

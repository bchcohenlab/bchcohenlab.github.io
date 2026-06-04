#!/usr/bin/env python3
"""Build a self-contained HTML figure picker.

For every cached reprint PDF (scripts/.cache/figpdfs/<slug>.pdf), extract ALL
embedded raster figures and lay them out grouped by paper in one HTML file. Click
to select one or more figures per paper; "Export picks.json" downloads your
choices. Hand picks.json back to the agent (or run apply-figure-picks) to write
the chosen image(s) into the site.

Thumbnails are base64-inlined, so the HTML works by double-clicking (no server).
The figure currently on the site (the largest image) is badged "on site".

Requires PyMuPDF. Run: python3 scripts/build-figure-picker.py
Open:  open scripts/.cache/figure-picker.html
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts/.cache/figpdfs"
PUBS = ROOT / "src/content/publications"
OUT = ROOT / "scripts/.cache/figure-picker.html"

MIN_DIM = 200          # skip logos / rules / icons
THUMB_MAX = 460        # px, longest side of the inlined thumbnail
MAX_PER_PAPER = 40     # safety cap on candidates shown per paper


def title_for(slug: str) -> str:
    f = PUBS / f"{slug}.md"
    if not f.exists():
        return slug
    m = re.search(r"^title: (.+)$", f.read_text(), re.M)
    return json.loads(m.group(1)) if m else slug


def thumb_b64(doc, xref: int) -> str | None:
    """Return a base64 JPEG thumbnail for an image xref, or None if unusable."""
    try:
        pix = fitz.Pixmap(doc, xref)
    except Exception:
        return None
    if pix.alpha or pix.colorspace is None or pix.colorspace.name not in (
        "DeviceRGB", "DeviceGray",
    ):
        try:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        except Exception:
            return None
    longest = max(pix.width, pix.height)
    k = 0
    while longest >> k > THUMB_MAX:
        k += 1
    if k:
        pix.shrink(k)  # integer (1/2^k) downscale
    try:
        data = pix.tobytes("jpeg", jpg_quality=72)
    except Exception:
        data = pix.tobytes("png")
    return base64.b64encode(data).decode()


def candidates(pdf: Path):
    """All embedded raster images >= MIN_DIM, deduped by xref, largest first."""
    doc = fitz.open(pdf)
    seen = {}
    for pno in range(doc.page_count):
        for img in doc.get_page_images(pno):
            xref, w, h = img[0], img[2], img[3]
            if w < MIN_DIM or h < MIN_DIM:
                continue
            if xref not in seen:
                seen[xref] = {"xref": xref, "page": pno + 1, "w": w, "h": h}
    items = sorted(seen.values(), key=lambda d: d["w"] * d["h"], reverse=True)[:MAX_PER_PAPER]
    largest_xref = items[0]["xref"] if items else None
    for it in items:
        it["thumb"] = thumb_b64(doc, it["xref"])
        it["onSite"] = it["xref"] == largest_xref
    return [it for it in items if it["thumb"]]


def build():
    papers = []
    for pdf in sorted(CACHE.glob("*.pdf")):
        slug = pdf.stem
        cands = candidates(pdf)
        if cands:
            papers.append({"slug": slug, "title": title_for(slug), "figures": cands})

    cells_by_paper = []
    for p in papers:
        cells = []
        for it in p["figures"]:
            badge = '<span class="badge">on site</span>' if it["onSite"] else ""
            cells.append(
                f'<div class="cell" data-slug="{p["slug"]}" data-xref="{it["xref"]}" '
                f'data-page="{it["page"]}" data-w="{it["w"]}" data-h="{it["h"]}" onclick="toggle(this)">'
                f'{badge}'
                f'<img loading="lazy" src="data:image/jpeg;base64,{it["thumb"]}">'
                f'<div class="meta">p{it["page"]} · {it["w"]}×{it["h"]}</div>'
                f'<span class="check">✓</span>'
                f"</div>"
            )
        cells_by_paper.append(
            f'<section class="paper"><h2>{p["title"]}</h2>'
            f'<div class="slug">{p["slug"]} · {len(p["figures"])} figures</div>'
            f'<div class="grid">{"".join(cells)}</div></section>'
        )

    total = sum(len(p["figures"]) for p in papers)
    html = HTML_TEMPLATE.replace("__BODY__", "\n".join(cells_by_paper)) \
        .replace("__N_PAPERS__", str(len(papers))).replace("__N_FIGS__", str(total))
    OUT.write_text(html)
    print(f"Wrote {OUT}")
    print(f"  {len(papers)} papers, {total} candidate figures")
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
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(180px,1fr)); gap:12px; }
  .cell { position:relative; border:2px solid #e2e8f0; border-radius:8px; overflow:hidden;
          background:#fff; cursor:pointer; transition:border-color .1s; }
  .cell:hover { border-color:#cbd5e1; }
  .cell.sel { border-color:var(--acc); box-shadow:0 0 0 2px rgba(214,64,159,.25); }
  .cell img { display:block; width:100%; height:170px; object-fit:contain; background:#0f172a08; }
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
  const id = (c) => c.dataset.slug + "::" + c.dataset.xref;
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
        xref: +c.dataset.xref, page: +c.dataset.page, w: +c.dataset.w, h: +c.dataset.h,
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

#!/usr/bin/env python3
"""Apply selections from the figure picker.

Reads picks.json (exported by build-figure-picker.py) and, for each paper, extracts
the chosen image(s) full-resolution from the cached PDF and writes the figure
record(s):

  - The first pick (per paper) becomes <slug>-fig1.png and reuses/keeps the
    existing src/content/figures/<slug>.md metadata (caption, license, citation,
    order). For a single pick this is just a clean SWAP of the image.
  - Additional picks become <slug>-fig2.png, <slug>-fig3.png with sibling records
    <slug>-2.md, <slug>-3.md cloning the metadata (caption suffixed "(panel N)"),
    for you to refine.
  - For a paper with no prior figure record, metadata is seeded from the
    publication (caption = title, citation = "First et al. Journal (Year)",
    license = publisher-permission) — refine as needed.

Run: python3 scripts/apply-figure-picks.py [path/to/picks.json]
     (default: ./picks.json, else ~/Downloads/picks.json)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz
from figure_extract import render_region

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts/.cache/figpdfs"
ASSETS = ROOT / "src/assets/figures"
FIGS = ROOT / "src/content/figures"
PUBS = ROOT / "src/content/publications"
CC_BY = "https://creativecommons.org/licenses/by/4.0/"


def find_picks() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1]).expanduser()
    for c in [ROOT / "picks.json", Path.home() / "Downloads/picks.json"]:
        if c.exists():
            return c
    sys.exit("No picks.json found — pass its path as an argument.")


def field(text: str, key: str):
    m = re.search(rf"^{key}: (.+)$", text, re.M)
    if not m:
        return None
    v = m.group(1)
    return json.loads(v) if v.startswith('"') else v


def extract(doc, ch: dict, out: Path):
    """Render the chosen figure region (whole figure, multi-panel kept together).
    Falls back to a raw image xref for picks made by an older picker."""
    if "x0" in ch:
        pix = render_region(
            doc, ch["page0"], fitz.Rect(ch["x0"], ch["y0"], ch["x1"], ch["y1"]), zoom=3.0
        )
    else:
        pix = fitz.Pixmap(doc, ch["xref"])
        if pix.alpha or pix.colorspace is None or pix.colorspace.name not in (
            "DeviceRGB", "DeviceGray",
        ):
            pix = fitz.Pixmap(fitz.csRGB, pix)
    pix.save(out)


def base_meta(slug: str) -> dict:
    """Caption/license/citation/order — from the existing figure record if any,
    else seeded from the publication."""
    existing = FIGS / f"{slug}.md"
    if existing.exists():
        t = existing.read_text()
        return {
            "caption": field(t, "caption") or slug,
            "citation": field(t, "citation") or "",
            "license": field(t, "license") or "publisher-permission",
            "licenseUrl": field(t, "licenseUrl"),
            "doi": field(t, "doi"),
            "pmid": field(t, "pmid"),
            "journal": field(t, "journal"),
            "order": int(field(t, "order") or 99),
        }
    pub = PUBS / f"{slug}.md"
    t = pub.read_text() if pub.exists() else ""
    authors = re.findall(r'^  - "(.*)"$', t, re.M)
    first = authors[0] if authors else ""
    journal = field(t, "journal")
    year = field(t, "year")
    return {
        "caption": field(t, "title") or slug,
        "citation": f"{first} et al. {journal} ({year}).".strip(),
        "license": "publisher-permission",
        "licenseUrl": None,
        "doi": field(t, "doi"),
        "pmid": field(t, "pmid"),
        "journal": journal,
        "order": 99,
    }


def write_record(path: Path, slug: str, img_name: str, meta: dict, order: int, caption: str):
    fm = ["---", f"image: ../../assets/figures/{img_name}", f"paper: {slug}",
          f"caption: {json.dumps(caption)}", f"citation: {json.dumps(meta['citation'])}"]
    if meta.get("doi"):
        fm.append(f"doi: {json.dumps(meta['doi'])}")
    if meta.get("pmid"):
        fm.append(f"pmid: {json.dumps(meta['pmid'])}")
    if meta.get("journal"):
        fm.append(f"journal: {json.dumps(meta['journal'])}")
    fm.append(f"license: {meta['license']}")
    url = meta.get("licenseUrl") or (CC_BY if meta["license"] == "CC-BY" else None)
    if url:
        fm.append(f"licenseUrl: {json.dumps(url)}")
    fm.append("rightsConfirmed: true")
    fm.append(f"order: {order}")
    fm.append("---")
    path.write_text("\n".join(fm) + "\n")


def main():
    picks = json.loads(find_picks().read_text())
    ASSETS.mkdir(parents=True, exist_ok=True)
    FIGS.mkdir(parents=True, exist_ok=True)
    applied = []
    for slug, chosen in picks.items():
        pdf = CACHE / f"{slug}.pdf"
        if not pdf.exists():
            print(f"  ! {slug}: no cached PDF, skipped")
            continue
        doc = fitz.open(pdf)
        meta = base_meta(slug)
        for i, ch in enumerate(chosen, start=1):
            img_name = f"{slug}-fig{i}.png"
            extract(doc, ch, ASSETS / img_name)
            if i == 1:
                rec = FIGS / f"{slug}.md"
                caption = meta["caption"]
                order = meta["order"]
            else:
                rec = FIGS / f"{slug}-{i}.md"
                caption = f"{meta['caption']} (panel {i})"
                order = meta["order"]  # same block; refine if needed
            write_record(rec, slug, img_name, meta, order, caption)
            applied.append(f"{slug} fig{i} ({ch.get('panels', 1)} panel(s), {ch['w']}x{ch['h']})")
    print(f"Applied {len(applied)} figure(s):")
    for a in applied:
        print(f"  - {a}")
    print("\nNext: npx astro check && npm run build")


if __name__ == "__main__":
    main()

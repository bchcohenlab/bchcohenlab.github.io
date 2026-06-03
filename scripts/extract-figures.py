#!/usr/bin/env python3
"""Extract a representative figure from each open-access (CC-BY) featured paper
and emit a rights-gated Astro `figures` content entry.

Source PDFs come from the lab's Drive "2_Article_Reprint_PDFs" folder
(id 1r3dBJZkXJpLXf8p24qSZYN61kVs5cnlM). Node scripts can't reach the Drive MCP
connector, so the operator (agent) downloads each PDF via MCP and places it in
the local cache dir below (gitignored — PDFs are copyrighted and large). Only
papers with a confirmed CC-BY venue are processed, so every emitted figure has
rightsConfirmed: true and can be shown. Papers in subscription journals, or
CC-BY papers whose PDF is not in the cache, are logged for the PI rather than
emitted (no figure beats a broken build or an un-cleared image).

Figure selection: the largest embedded raster image (by pixel area) on any page,
which for these neuroimaging papers is the main multi-panel figure. The PI can
swap any specific figure later.

Requires: PyMuPDF (`pip install pymupdf`).
Run: python3 scripts/extract-figures.py
"""

import os
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF not installed (`pip install pymupdf`); skipping figure "
          "extraction. Build proceeds with no figures.", file=sys.stderr)
    sys.exit(0)

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get("FIGPDF_DIR", ROOT / "scripts/.cache/figpdfs"))
ASSETS = ROOT / "src/assets/figures"
OUT = ROOT / "src/content/figures"
PUBS = ROOT / "src/content/publications"

CC_BY = "https://creativecommons.org/licenses/by/4.0/"

# Confirmed CC-BY featured papers (slug == publication slug == cache PDF name).
FIGURES = {
    "wall-2025-coordinate": {
        "order": 1, "license": "CC-BY", "licenseUrl": CC_BY,
        "caption": "Coordinate network mapping of focal brain-volume differences "
                   "in ADHD, compared with psychiatric, neurodegenerative, and "
                   "ischemic-stroke lesion networks.",
    },
    "herman-2025-lesions": {
        "order": 2, "license": "CC-BY", "licenseUrl": CC_BY,
        "caption": "Lesions associated with autism symptoms in tuberous sclerosis "
                   "complex map to a common cerebellar brain network.",
    },
    "peng-2024-heterogenous": {
        "order": 3, "license": "CC-BY", "licenseUrl": CC_BY,
        "caption": "Heterogeneous brain activations across individuals localize to "
                   "a common brain network.",
    },
    "steeby-2026-naturalistic": {
        "order": 4, "license": "CC-BY", "licenseUrl": CC_BY,
        "caption": "Head motion during naturalistic movie viewing versus task runs "
                   "in adolescents with and without autism.",
    },
    "miller-2025-comparison": {
        "order": 5, "license": "CC-BY", "licenseUrl": CC_BY,
        "caption": "Overlap (Jaccard coefficient) of deformed and target lesion "
                   "masks across normalization algorithms, by lesion severity.",
    },
}


def yaml_str(s: str) -> str:
    """A JSON-encoded string is a valid YAML double-quoted scalar."""
    import json
    return json.dumps(s)


def read_pub(slug: str) -> dict:
    """Pull a few fields from an emitted publication .md frontmatter."""
    text = (PUBS / f"{slug}.md").read_text()
    def grab(key):
        m = re.search(rf'^{key}: "?(.*?)"?$', text, re.M)
        return m.group(1) if m else None
    authors = re.findall(r'^  - "(.*)"$', text, re.M)
    return {
        "title": grab("title"), "year": grab("year"), "journal": grab("journal"),
        "doi": grab("doi"), "pmid": grab("pmid"), "first": authors[0] if authors else "",
    }


def largest_image(doc):
    best = None  # (area, xref)
    for pno in range(doc.page_count):
        for img in doc.get_page_images(pno):
            xref, w, h = img[0], img[2], img[3]
            if w < 300 or h < 300:  # skip logos / icons / rules
                continue
            if best is None or w * h > best[0]:
                best = (w * h, xref)
    return best[1] if best else None


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    emitted, skipped = [], []

    for slug, meta in FIGURES.items():
        pdf = CACHE / f"{slug}.pdf"
        if not pdf.exists():
            skipped.append(f"{slug}: PDF not in cache ({pdf.name})")
            continue
        doc = fitz.open(pdf)
        xref = largest_image(doc)
        if xref is None:
            skipped.append(f"{slug}: no suitable embedded image found")
            continue
        pix = fitz.Pixmap(doc, xref)
        if pix.n >= 5 or pix.alpha:  # CMYK / alpha -> RGB
            pix = fitz.Pixmap(fitz.csRGB, pix)
        img_path = ASSETS / f"{slug}-fig1.png"
        pix.save(img_path)

        pub = read_pub(slug)
        citation = f"{pub['first']} et al. {pub['journal']} ({pub['year']})."
        fm = ["---"]
        fm.append(f"image: ../../assets/figures/{slug}-fig1.png")
        fm.append(f"paper: {slug}")
        fm.append(f"caption: {yaml_str(meta['caption'])}")
        fm.append(f"citation: {yaml_str(citation)}")
        if pub["doi"]:
            fm.append(f"doi: {yaml_str(pub['doi'])}")
        if pub["pmid"]:
            fm.append(f"pmid: {yaml_str(pub['pmid'])}")
        if pub["journal"]:
            fm.append(f"journal: {yaml_str(pub['journal'])}")
        fm.append(f"license: {meta['license']}")
        fm.append(f"licenseUrl: {yaml_str(meta['licenseUrl'])}")
        fm.append("rightsConfirmed: true")
        fm.append(f"order: {meta['order']}")
        fm.append("---")
        (OUT / f"{slug}.md").write_text("\n".join(fm) + "\n")
        emitted.append(f"{slug} ({pix.width}x{pix.height})")

    print(f"\nEmitted {len(emitted)} CC-BY figures:")
    for e in emitted:
        print(f"  - {e}")
    if skipped:
        print(f"\nSkipped {len(skipped)} (logged):")
        for s in skipped:
            print(f"  - {s}")
    print("\nNote: subscription-journal featured papers and CC-BY papers whose PDF "
          "is not yet in the reprint folder get NO figure (logged for the PI). "
          "Add the PDF to Drive (or document permission) and re-run to include them.")


if __name__ == "__main__":
    main()

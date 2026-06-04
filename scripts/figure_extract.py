"""Detect whole figures in a PDF (including multi-panel figures) and render them.

A multi-panel figure is often stored as several separate embedded images (one per
panel) placed next to each other on the page. Extracting embedded images directly
therefore breaks a figure into subpanels. Instead we:

  1. Get the on-page bounding box of every placed image.
  2. Cluster boxes that sit close together (panels of one figure) into one region.
  3. Render that page REGION (not the raw images) — which also captures panel
     labels, colorbars, and arrows drawn as vector/text on top.

So one figure (however many panels) comes out as one image.

Requires PyMuPDF. Shared by build-figure-picker.py, apply-figure-picks.py, and
extract-figures.py.
"""

from __future__ import annotations

import fitz

# An image placement smaller than this fraction of the page area is treated as a
# logo/icon/rule and ignored.
MIN_AREA_FRAC = 0.010
# Two placements within this fraction of the page's short side are considered the
# same figure (panel gutter). Larger gaps separate distinct figures.
MERGE_FRAC = 0.035


def _overlap(a: fitz.Rect, b: fitz.Rect) -> bool:
    return not (a.x1 < b.x0 or b.x1 < a.x0 or a.y1 < b.y0 or b.y1 < a.y0)


def figure_clusters(doc) -> list[dict]:
    """Return figure regions across the document, largest first.

    Each: {"page": int (0-based), "rect": fitz.Rect (page coords), "panels": int}.
    """
    clusters: list[dict] = []
    for pno in range(doc.page_count):
        page = doc[pno]
        pr = page.rect
        page_area = pr.width * pr.height or 1
        margin = MERGE_FRAC * min(pr.width, pr.height)

        boxes: list[fitz.Rect] = []
        try:
            infos = page.get_image_info(xrefs=True)
        except Exception:
            infos = []
        for info in infos:
            r = fitz.Rect(info["bbox"])
            if r.is_empty or r.width <= 0 or r.height <= 0:
                continue
            if (r.width * r.height) < MIN_AREA_FRAC * page_area:
                continue
            boxes.append(r)
        if not boxes:
            continue

        # Union-find on margin-expanded boxes -> connected components.
        n = len(boxes)
        parent = list(range(n))

        def find(i: int) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        exp = [fitz.Rect(b.x0 - margin, b.y0 - margin, b.x1 + margin, b.y1 + margin) for b in boxes]
        for i in range(n):
            for j in range(i + 1, n):
                if _overlap(exp[i], exp[j]):
                    parent[find(i)] = find(j)

        groups: dict[int, list[int]] = {}
        for i in range(n):
            groups.setdefault(find(i), []).append(i)

        for members in groups.values():
            u = fitz.Rect(boxes[members[0]])
            for k in members[1:]:
                u |= boxes[k]
            clusters.append({"page": pno, "rect": u, "panels": len(members)})

    clusters.sort(key=lambda c: c["rect"].width * c["rect"].height, reverse=True)
    return clusters


def render_region(doc, page_no: int, rect: fitz.Rect, zoom: float = 3.0):
    """Render a page region to an RGB pixmap (full figure, panels + annotations)."""
    page = doc[page_no]
    clip = rect & page.rect
    pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(zoom, zoom))
    if pix.alpha or pix.colorspace is None or pix.colorspace.name not in (
        "DeviceRGB", "DeviceGray",
    ):
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return pix

#!/usr/bin/env python3
"""Pull real figure legends from the reprint PDFs into the figure records.

Uses the picked regions (picks JSON from the figure picker) to locate each chosen
figure on its page, then grabs the nearby "Figure N ..." caption block. Maps each
pick to its figure record (1st pick -> <slug>.md, 2nd -> <slug>-2.md, ...).

Dry-run by default (prints what it found); pass --apply to write the captions
into src/content/figures/*.md.

  python3 scripts/extract-figure-captions.py [path/to/picks.json] [--apply]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts/.cache/figpdfs"
FIGS = ROOT / "src/content/figures"

CAP_RE = re.compile(r"^\s*(fig(?:ure)?\.?\s*\d+)", re.I)


LIGATURES = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
}


def clean(t: str) -> str:
    for k, v in LIGATURES.items():
        t = t.replace(k, v)
    t = re.sub(r"-\n(\w)", r"\1", t)        # de-hyphenate hard hyphen at line break
    t = re.sub(r"­\s*", "", t)         # soft hyphen (+ any space) -> join word
    t = re.sub(r"\s*\n\s*", " ", t)         # newlines -> spaces
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()


def find_caption(page, region: fitz.Rect) -> str | None:
    blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
    cands = [b for b in blocks if CAP_RE.match(b[4].strip())]
    if cands:
        fx0, fx1 = region.x0, region.x1
        overlap = lambda b: min(b[2], fx1) - max(b[0], fx0)
        below = [b for b in cands if b[1] >= region.y0 - 5 and overlap(b) > 0]
        pick = (
            min(below, key=lambda b: abs(b[1] - region.y1))
            if below
            else min(cands, key=lambda b: abs((b[1] + b[3]) / 2 - (region.y0 + region.y1) / 2))
        )
        return clean(pick[4])
    # No numbered figure legend (e.g. a journal "Graphical Abstract" page).
    if any(re.search(r"graphical abstract", b[4], re.I) for b in blocks):
        return "Graphical abstract."
    return None


def record_for(slug: str, i: int) -> Path:
    return FIGS / (f"{slug}.md" if i == 0 else f"{slug}-{i + 1}.md")


def main():
    args = [a for a in sys.argv[1:] if a != "--apply"]
    apply = "--apply" in sys.argv
    picks_path = Path(args[0]).expanduser() if args else (Path.home() / "Downloads/picks-4.json")
    picks = json.loads(picks_path.read_text())

    rows, applied, missing = [], 0, []
    for slug, chosen in picks.items():
        pdf = CACHE / f"{slug}.pdf"
        doc = fitz.open(pdf) if pdf.exists() else None
        for i, ch in enumerate(chosen):
            rec = record_for(slug, i)
            cap = None
            if doc:
                cap = find_caption(doc[ch["page0"]], fitz.Rect(ch["x0"], ch["y0"], ch["x1"], ch["y1"]))
            rows.append((rec.name, cap))
            if not cap:
                missing.append(rec.name)
                continue
            if apply and rec.exists():
                t = rec.read_text()
                repl = f"caption: {json.dumps(cap)}"
                t2 = re.sub(r"^caption: .*$", lambda _m: repl, t, count=1, flags=re.M)
                if t2 != t:
                    rec.write_text(t2)
                    applied += 1

    for name, cap in rows:
        print(f"\n• {name}\n  {(cap[:160] + '…') if cap and len(cap) > 160 else (cap or '!! NO CAPTION FOUND')}")
    print(f"\n{'APPLIED ' + str(applied) + ' captions.' if apply else 'DRY RUN — pass --apply to write.'}")
    if missing:
        print(f"No caption found ({len(missing)}): {', '.join(missing)}")


if __name__ == "__main__":
    main()

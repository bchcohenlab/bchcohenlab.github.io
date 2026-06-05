# Design audit — Cohen Lab website (2026-06-05)

Consult on the current Astro/Tailwind site (branch `rebuild/astro`). Recommendations
only — nothing implemented yet. To be tackled next session with the **frontend-design**
and **playwright** plugins active (both installed, user scope; activate on restart).

## Overall
Clean, credible, figure-forward. Good serif/sans pairing (Newsreader + Inter),
consistent header/footer, sensible IA, solid responsive behavior, brain imagery is an
asset. Bones are strong — the rest is polish toward a more designed, cohesive feel.

## High-impact
1. **Hero brain image is a hard black rectangle on the light hero** — reads as a pasted
   box. Fixes (in order): (a) transparent-background brain render; (b) soft rounded /
   gradient frame that blends the black edges; or (c) make the whole hero a dark panel so
   the black is intentional. Biggest single visual issue.
2. **"From our work" strip = four tiny, busy thumbnails** on a gray band; panels are
   indistinct at that size. Show 2–3 larger crops, add a one-line caption/hover label,
   consider cropping to a striking detail rather than the full multi-panel figure.
3. **Headshot inconsistency on People** — crops, zoom, lighting, backgrounds vary, so the
   grid looks uneven. Apply a uniform treatment: consistent circular crop + subtle ring,
   or duotone / grayscale-default → color-on-hover.

## Refinements (medium)
4. **Accent pink underused** — only in eyebrow labels; primary blue carries everything.
   Use accent deliberately (active nav/filter state, link hovers, a hero rule).
5. **Home section rhythm** — "From our work / Research themes / Recent work" have similar
   weight; alternate backgrounds or vary scale for cadence.
6. **Research-theme cards are flat** bordered boxes — add a per-theme icon or accent
   top-border.
7. **Publications items are dense** (badges + headshot row + long authors) — more vertical
   spacing; slightly smaller/secondary headshots.

## Polish / accessibility
8. **Contrast** — light-gray secondary text (`slate-500`) on white is borderline for WCAG
   AA at small sizes; bump roles/captions/meta to `slate-600`/`700`.
9. **Lab Life** is an empty "coming soon" page in the nav — hide the nav item until there
   are photos.
10. Contact map is the raw Google default — a lightly-styled / static branded map looks
    more finished.
11. Nav logo mark is small/generic — refine the wordmark or use a crisper brain glyph.

## Deeper pass available next session
- **frontend-design** plugin → design-system lens (type scale, spacing tokens, motion).
- **playwright** MCP → critique interaction states not capturable with static shots:
  figure carousel scroll, figure lightbox, mobile-nav open, publications filter/sort.

## Suggested first implementation round
#1 (hero image), #2 (featured strip), #3 (headshot consistency), #4 (accent usage),
#8 (contrast) — high payoff, low risk. Show before/afters.

# Rebuild the Cohen Lab Website (Astro + GitHub Pages)

> **Setup status (2026-06-03):** Repo cloned to `~/projects/bchcohenlab.github.io`. Verified: remote
> `origin` = `bchcohenlab/bchcohenlab.github.io`, `CNAME` = `bchcohenlab.com`, content present
> (`authors/`, `publication/`, `images/`, `index.json`; 39 author dirs). **Default branch is `master`,
> NOT `main`** — the deploy workflow trigger and the cutover merge must target `master` (or rename the
> default branch to `main` first). This plan is being handed to Ultraplan for remote refinement.

## Context

The Cohen Laboratory of Translational Neuroimaging (Boston Children's Hospital / Harvard Medical
School, PI **Alexander Li Cohen, MD, PhD**) site at https://bchcohenlab.com is out of date. The
current repo (`bchcohenlab/bchcohenlab.github.io`) is a Hugo "Academic" / academic-kickstart theme
whose repo holds only the **compiled** output (no Hugo source), so all content must be scraped from
rendered HTML + `index.json`.

**Goal:** a modern, clean, figure-forward site that (1) preserves every headshot, org title, and bio
from the old site, (2) features figures from recent mentee-authored papers (the `*` entries on
`Cohen_HMS_CV_DB_2026-05-29.docx`), (3) adds a current-vs-alumni split, and (4) reuses the
`bchcohenlab.com` apex domain on free GitHub Pages — dropping the old Netlify/academic-kickstart infra.

**Decisions confirmed with the user:**
- **Framework:** Astro + Tailwind CSS v4, deployed to GitHub Pages via GitHub Actions.
- **Editing model:** Admin-only for v1 (members email bio+photo or open a PR; admin merges). **No auth
  infra now**, but the people content model is built **CMS-ready** so Sveltia/Decap + GitHub OAuth can
  be layered on later with zero schema changes.
- **Alumni split:** Current = **Faculty + Researchers**; everyone else (~25) = **Alumni**. Exact roster
  finalized by the PI during the build (one field per person).
- **Paper figures:** Include figures from all featured mentee papers, but each figure carries a
  `rightsConfirmed` boolean — only `true` renders. CC-BY journals (Imaging Neuroscience, Brain
  Communications, Communications Biology, Annals of CNS) are auto-safe; subscription journals
  (Biological Psychiatry, Journal of Neurology) stay hidden until permission is documented.
- **Group photos:** PI will supply lab group photos from various dates → a dated "Lab Life" gallery
  + a "latest photo" on the home page.

## Source material (already located)
- **Old site content:** scrape `authors/<slug>/index.html` + `index.json` (36 profiles; drop the fake
  "Nelson Bighetti" placeholder) and `publication/<slug>/index.html` (34 papers). Headshots at
  `authors/<slug>/avatar.{jpg,jpeg,png}`.
- **CV (Google Drive `1_CV_and_Self_Docs/Cohen_HMS_CV_DB_2026-05-29.docx`)** → bio/titles + mentee
  (starred) publications.
- **Reprint PDFs (Google Drive `2_Article_Reprint_PDFs`)** → source for figures. ~10 recent mentee
  first-author papers to feature: Miller 2025 & Steeby 2026 (Imaging Neurosci), Tripathy 2025 (Brain
  Comm), Peng 2024 ×2 (Biol Psych, Comm Bio), Jiang 2023 (Biol Psych), Kletenik 2023 (J Neurology),
  Wall 2025 & Herman 2025 (Annals CNS), Zagury-Orly 2021 (JADD).

---

## Implementation

### 1. Preserve the old site (do FIRST)
Clone `bchcohenlab/bchcohenlab.github.io` into `/Users/alex/projects/` (DONE), then on `master`:
- Immutable tag: `git tag -a old-site-compiled -m "..."; git push origin old-site-compiled`
- Recovery branch: `git checkout -b archive/old-site; git push -u origin archive/old-site`
- Do the rebuild on a feature branch `rebuild/astro`. Never force-push over the tag/branch.

### 2. Scaffold Astro at repo root
`npm create astro@latest` (minimal, strict TS) into the repo; `npx astro add tailwind sitemap`.
- `astro.config.mjs`: `site: 'https://bchcohenlab.com'`, **no `base`** (apex Pages serves from root —
  setting `base` is the #1 footgun and would 404 all assets).
- `public/CNAME` = `bchcohenlab.com` (republished every build → keeps the domain bound).
- `public/.nojekyll`.

### 3. Deploy pipeline — `.github/workflows/deploy.yml`
Official actions: `withastro/action@v3` (build + upload `./dist`) → `actions/deploy-pages@v4`. Perms
`pages: write` + `id-token: write`, trigger on push to `master` + `workflow_dispatch`. **One-time manual
step at cutover:** repo Settings → Pages → Source = **"GitHub Actions"** (old site used branch deploy).

### 4. Content collections + schemas — `src/content/config.ts`
Four `defineCollection`s (use `astro:content` `z` + `image()` helper):
- **`people`** (`type: 'content'`, bio in markdown body — CMS-shaped): `name`, `status`
  (`current|alumni`), `group` (`Faculty|Researchers|Staff|Students|Affiliates|Alumni`), `role`,
  `title`, `headshot: image().optional()`, `links{email,twitter,scholar,orcid,linkedin,website}`,
  `order`, `featured`.
- **`publications`**: `title`, `authors[]`, `year`, `journal`, `doi`, `pmid`, `pmcid`, `url`,
  `isMenteePaper`, `menteeFirstAuthor`, `featured`, `openAccess`.
- **`figures`**: `image()`, `paper: reference('publications')`, `caption`, `citation`, `doi`/`pmid`,
  `journal`, `license` enum, `licenseUrl`, **`rightsConfirmed` (hard gate)**, `order`.
- **`gallery`**: `image()`, `caption`, `date`, `people[]`, `featured`.

Enforcement: every figure query filters `rightsConfirmed === true`; people pages partition by `status`
then `group`. Site singletons (contact/social) live in `src/data/site.ts`.

### 5. Migration scripts — `scripts/` (Node ESM, dev-dep `cheerio`)
- **`migrate-people.mjs <old-repo-path>`**: enumerate authors from `index.json`; cheerio-parse each
  `authors/<slug>/index.html` for name/role/bio; copy `avatar.*` → `src/assets/people/<slug>.jpg`
  (glob the extension, log misses); skip the Nelson Bighetti placeholder; default everyone to
  `status: current`, `group: Researchers` (Cohen → `Faculty`, `order: 1`); emit
  `src/content/people/<slug>.md` with frontmatter + bio body and `headshot: ../../assets/people/<slug>.jpg`.
  Reuse old slugs so inbound `/people/<slug>` links keep matching.
- **`migrate-publications.mjs`**: from `index.json` + `publication/<slug>/index.html`, emit
  `publications/<slug>.md`; then flag the ~10 featured mentee papers (`isMenteePaper`/`featured`/
  `menteeFirstAuthor`, `openAccess` for CC-BY venues), matching by title/year and logging any unmatched
  (2026 papers may post-date the old index → add by hand).
- **Figures are not scraped** — exported from reprint PDFs into `src/assets/figures/` + a content file
  each, `rightsConfirmed: false` until license verified.

### 6. Pages & components
- **Pages:** Home (hero w/ brain motif + mission + featured-figures strip + latest group photo),
  `people/index.astro` (Faculty → Researchers → Alumni), `people/[slug].astro` (profile via
  `getStaticPaths`), `research.astro`, `publications.astro` (client-filterable, mentee badges),
  `figures.astro` (rights-gated gallery), `lab-life.astro` (dated photo grid), `participate/`
  (neurofeedback + k23 study carried from old site), `contact.astro` (email/phone/300 Longwood +
  map embed), `404.astro`.
- **Components:** `BaseLayout`, `ProfileLayout`, `Nav`, `Footer`, `SEO`, `Hero`, `SectionHeading`,
  `PersonCard` (initials placeholder when no headshot), `PersonGroup`, `PubItem`/`PubList`,
  `FigureCard` (caption + citation + license badge + DOI), `GalleryGrid`.
- All raster images via `astro:assets` `<Image>` (responsive WebP, lazy).

### 7. Styling
Tailwind v4 CSS-first `@theme` in `src/styles/global.css`: ocean-blue primary + brain-motif pink
accents (derived from old brand), serif headings (Newsreader) + Inter body via `@fontsource`,
`max-w-6xl` container, generous whitespace, AA contrast, alt text everywhere. Light-first; dark-mode
tokens stubbed but not gating launch.

---

## Build order (verify at each step)
1. Preserve old site (tag + branch pushed) — `git ls-remote --tags` confirms.
2. Branch + scaffold + tailwind/sitemap — `astro dev` serves starter.
3. Config + `public/CNAME`/`.nojekyll` + BaseLayout/Nav/Footer/global.css — internal links resolve at root.
4. Schemas (`content/config.ts`) — `astro check` passes empty.
5. Run migration scripts against `archive/old-site` — 35 people `.md` + headshots, 34 publications; `astro check` validates all frontmatter.
6. People pages → every profile route builds, headshots optimize.
7. Publications page → filter works, 10 mentee papers flagged.
8. Figures → flip one `rightsConfirmed` false/true and confirm show/hide.
9. Lab Life, Research, Participate, Contact, Home hero, 404.
10. `astro build` + `astro preview` → confirm `dist/CNAME` contains `bchcohenlab.com`, sitemap present, no broken links (preview serves at root = apex parity).
11. **Cutover:** merge `rebuild/astro` → `master`; set Pages Source = "GitHub Actions"; push triggers deploy. Verify Actions green, `curl -I https://bchcohenlab.com` → 200 (not a redirect to github.io), HTTPS on. DNS unchanged (apex records already point at Pages).
12. PI curates current/alumni + Faculty/Researchers split and adds rights-cleared figures over time.

## Risks / edge cases
- **`base` path:** keep `/` for apex Pages; never set to repo name. Use `astro preview` as truth.
- **CNAME loss** silently unbinds the domain → `public/CNAME` + leave Pages "Custom domain" populated; verify post-deploy.
- **Headshot extension drift** (`.jpg/.jpeg/.png`) → glob `avatar.*`, normalize, placeholder when absent (`headshot` optional).
- **Figure copyright** → subscription-journal figures default hidden; gate enforced at query time so half-filled records can't leak.
- **Old `/publication/<slug>/` inbound links** → optionally mirror old slugs with thin detail routes/redirect pages (GitHub Pages ignores `_redirects`).
- **Tailwind v4** (Vite plugin + `@theme`), not v3 (`tailwind.config.js`/PostCSS) — don't follow v3 tutorials.
- **Rollback:** `git checkout old-site-compiled` → `master` + Pages source back to branch.

## Later (NOT built now)
Member self-service: Sveltia/Decap CMS at `/admin` (the `type:'content'` people model already maps to
CMS widgets), GitHub OAuth via a free Cloudflare Worker, lab members added to a GitHub team with write
access. No schema/content changes required.

## Verification (end-to-end)
- Local: `npm run dev`, `npm run build && npm run preview`; `astro check` clean; spot-check every page.
- `dist/CNAME` present and correct; sitemap generated; figures with `rightsConfirmed:false` absent.
- Post-deploy: Actions green; `https://bchcohenlab.com` serves new site over HTTPS with domain bound;
  old site recoverable from tag/branch.

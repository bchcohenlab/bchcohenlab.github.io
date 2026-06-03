# Cohen Laboratory of Translational Neuroimaging — website

Source for **https://bchcohenlab.com**, the site of the Cohen Laboratory of Translational
Neuroimaging (Boston Children's Hospital / Harvard Medical School, PI Alexander Li Cohen, MD, PhD).

This is a modern rebuild on **Astro + Tailwind v4**, deployed to **GitHub Pages** at the
`bchcohenlab.com` apex domain. It replaces a stale Hugo "Academic" (Wowchemy) build.

## Status

Rebuild in progress on the `rebuild/astro` branch, following [`REBUILD_PLAN.md`](./REBUILD_PLAN.md).

## Recovering the old site

The previous compiled Hugo site is preserved and recoverable:

- Tag: `old-site-compiled`
- Branch: `archive/old-site`

The legacy directories (`authors/`, `publication/`, `index.json`, `index.html`, etc.) currently
remain on this branch as the **migration source** and are removed only after the migration scripts
have run and their output is validated. Astro builds only from `src/` and `public/`, so they are
never emitted into `dist/`.

## Commands

All commands are run from the root of the project, from a terminal:

| Command           | Action                                           |
| :---------------- | :----------------------------------------------- |
| `npm install`     | Installs dependencies                            |
| `npm run dev`     | Starts local dev server at `localhost:4321`      |
| `npm run build`   | Build the production site to `./dist/`           |
| `npm run preview` | Preview the production build locally             |
| `npx astro check` | Type-check `.astro` files and content frontmatter |

## Deployment

GitHub Pages serves from the apex domain `bchcohenlab.com`. `astro.config.mjs` sets
`site: 'https://bchcohenlab.com'` with **no `base`** (apex Pages serves from `/`). `public/CNAME`
keeps the domain bound on every build and `public/.nojekyll` disables Jekyll processing.

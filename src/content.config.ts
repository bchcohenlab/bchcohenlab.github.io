import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";

/*
  Content collections for the Cohen Lab site (Astro 6 Content Layer API).

  Content lives in src/content/<collection>/*.md so a CMS (Sveltia/Decap) can
  layer on later with no schema change. Schemas mirror REBUILD_PLAN.md §4.
  Safety defaults fail closed: figures default to rightsConfirmed:false and are
  filtered out of every figure query, so a half-filled record can never leak.
*/

// People — bio lives in the markdown body (use render()).
const people = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/people" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      status: z.enum(["current", "alumni"]),
      group: z.enum([
        "Faculty",
        "Researchers",
        "Staff",
        "Students",
        "Affiliates",
        "Alumni",
      ]),
      role: z.string(),
      title: z.string().optional(),
      headshot: image().optional(),
      links: z
        .object({
          email: z.email().optional(),
          twitter: z.url().optional(),
          scholar: z.url().optional(),
          orcid: z.url().optional(),
          linkedin: z.url().optional(),
          website: z.url().optional(),
        })
        .default({}),
      order: z.number().default(0),
      featured: z.boolean().default(false),
    }),
});

// Publications — frontmatter only (any markdown body is optional notes).
const publications = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/publications" }),
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    year: z.number(),
    journal: z.string().optional(),
    doi: z.string().optional(),
    pmid: z.string().optional(),
    pmcid: z.string().optional(),
    url: z.url().optional(),
    scholarUrl: z.url().optional(),
    citations: z.number().optional(),
    isMenteePaper: z.boolean().default(false),
    menteeFirstAuthor: z.boolean().default(false),
    // Cohen is first or last (senior) author.
    cohenFirstOrSenior: z.boolean().default(false),
    featured: z.boolean().default(false),
    openAccess: z.boolean().default(false),
    // Research tags — disease/population AREAS (drive the Research page) plus
    // cross-cutting METHOD facets (network-mapping, lesion-derived). One field;
    // a paper may carry several. Vocabulary mirrored in src/lib/content.ts.
    areas: z
      .array(
        z.enum([
          "autism",
          "adhd",
          "tsc-epilepsy",
          "perinatal-stroke",
          "methods",
          "functional-connectivity",
          "network-mapping",
          "lesion-derived",
          "review",
          "letter",
        ]),
      )
      .default([]),
  }),
});

// Figures — gated by rightsConfirmed (hard gate, defaults closed).
const figures = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/figures" }),
  schema: ({ image }) =>
    z.object({
      image: image(),
      paper: reference("publications"),
      caption: z.string(),
      citation: z.string(),
      doi: z.string().optional(),
      pmid: z.string().optional(),
      journal: z.string().optional(),
      license: z.enum([
        "CC-BY",
        "CC-BY-SA",
        "CC0",
        "publisher-permission",
        "unknown",
      ]),
      licenseUrl: z.url().optional(),
      // Hard gate: only true figures are ever rendered.
      rightsConfirmed: z.boolean().default(false),
      order: z.number().default(0),
    }),
});

// Gallery — lab-life photos.
const gallery = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/gallery" }),
  schema: ({ image }) =>
    z.object({
      image: image(),
      caption: z.string(),
      date: z.coerce.date(),
      people: z.array(z.string()).optional(),
      featured: z.boolean().default(false),
    }),
});

export const collections = { people, publications, figures, gallery };

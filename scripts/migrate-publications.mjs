// Migrate publications into the Astro content collection.
//
//   Primary source: scripts/data/cv-publications.json — the lab's authoritative,
//   current peer-reviewed record, parsed from the CV (Drive docx) by the agent.
//   Each record: { title, authors[{name,mentee,coFirstSenior}], journal, year,
//   doi, pmid, pmcid }.
//
//   Slug reuse: where a CV paper matches a legacy index.json publication (by DOI,
//   via scripts/data/pubmed.json), the OLD slug is reused so inbound
//   /publication/<slug> links keep working. New papers get a generated slug.
//
//   Flags:
//     - menteeFirstAuthor: first author carries the CV "**" (mentee) marker
//     - isMenteePaper:      any author carries "**"
//     - cohenFirstOrSenior: Cohen is first or last author, OR a Cohen author
//                           carries the CV "*" (co-first/-senior) marker
//     - featured:           menteeFirstAuthor || (cohenFirstOrSenior && year>=2019)
//     - openAccess:         a PMCID exists
//
//   Output: src/content/publications/<slug>.md
//   Run: node scripts/migrate-publications.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "src/content/publications");

const cvPubs = JSON.parse(readFileSync(join(__dirname, "data/cv-publications.json"), "utf8"));
const pubmed = JSON.parse(readFileSync(join(__dirname, "data/pubmed.json"), "utf8"));
// Legacy index.json (old Hugo site) was only used to reuse old slugs for inbound
// links during the initial migration; it's removed after cutover. Optional now.
let indexJson = [];
try {
  indexJson = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf8"));
} catch {
  /* legacy index.json gone — slug reuse no longer needed for new papers */
}
// Optional Scholar enrichment (citations + scholarUrl). Absent => skipped.
let scholar = {};
try {
  scholar = JSON.parse(readFileSync(join(__dirname, "data/scholar.json"), "utf8"));
} catch {
  /* best-effort; never block the build */
}

// JSON.stringify produces a valid YAML double-quoted scalar.
const y = (s) => JSON.stringify(s);
const isCohen = (name) => /\bcohen\b/i.test(name || "");

// --- legacy slug map (DOI -> old index.json slug) --------------------------
const legacySlugByDoi = {};
const legacyPubSlugs = indexJson
  .filter((x) => x.kind === "page")
  .map((p) => (p.relpermalink || "").replace(/^\/|\/$/g, "").replace(/^publication\//, ""));
for (const [slug, meta] of Object.entries(pubmed)) {
  if (meta && meta.doi) legacySlugByDoi[meta.doi.toLowerCase()] = slug;
}

// --- slug generation for new papers ----------------------------------------
const STOP = new Set(["a", "an", "the", "of", "in", "on", "for", "to", "and", "with",
  "is", "are", "as", "by", "from", "using", "based", "that", "this"]);
const lastName = (name) => {
  const toks = (name || "").trim().split(/\s+/);
  // drop a trailing initials token (all uppercase, e.g. "GN", "AL", "I")
  if (toks.length > 1 && /^[A-Z]+$/.test(toks[toks.length - 1])) toks.pop();
  return toks.join(" ");
};
const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const titleKeyword = (title) => {
  const w = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((t) => t && !STOP.has(t));
  return w[0] || "paper";
};

// --- build records ----------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });

// Additive mode: scan publications already in the collection so a re-run ADDS
// only genuinely-new papers and never overwrites existing files (which carry
// live Scholar citations + scholarUrl from refresh-citations.mjs, plus any hand
// edits). This is the "add from the CV" path used when new papers are published.
const normTitle = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const existingFiles = readdirSync(OUT_DIR).filter((f) => f.endsWith(".md"));
const existingSlugs = new Set(existingFiles.map((f) => f.replace(/\.md$/, "")));
const existingDois = new Set();
const existingTitles = new Set();
for (const f of existingFiles) {
  const t = readFileSync(join(OUT_DIR, f), "utf8");
  const d = /^doi: "(.*)"$/m.exec(t);
  if (d) existingDois.add(d[1].toLowerCase());
  const ti = /^title: (.+)$/m.exec(t);
  if (ti) existingTitles.add(normTitle(JSON.parse(ti[1])));
}

const used = new Set(existingSlugs);
const log = { added: [], skipped: [], dropped: [], featured: [], mentee: [] };

const records = [];
for (const p of cvPubs) {
  const title = p.title.replace(/\s*\[(abstr|review)[^\]]*\]\s*$/i, "").trim();
  // Drop non-article items with neither DOI nor PMID (e.g. meeting abstracts).
  if (!p.doi && !p.pmid) {
    log.dropped.push(`${title} (no DOI/PMID — likely abstract)`);
    continue;
  }
  const authorNames = p.authors.map((a) => a.name);
  const menteeFirstAuthor = !!(p.authors[0] && p.authors[0].mentee);
  const isMenteePaper = p.authors.some((a) => a.mentee);
  const cohenFirstOrSenior =
    isCohen(authorNames[0]) ||
    isCohen(authorNames[authorNames.length - 1]) ||
    p.authors.some((a) => a.coFirstSenior && isCohen(a.name));
  const featured = menteeFirstAuthor || (cohenFirstOrSenior && p.year >= 2019);

  // Skip papers already in the collection (don't clobber live citations / edits).
  if (
    (p.doi && existingDois.has(p.doi.toLowerCase())) ||
    existingTitles.has(normTitle(title))
  ) {
    log.skipped.push(title.slice(0, 50));
    continue;
  }

  // slug: reuse legacy slug by DOI (initial migration), else generate
  // <lastname>-<year>-<keyword>; ensure no collision with existing/new slugs.
  let slug = (p.doi && legacySlugByDoi[p.doi.toLowerCase()]) || null;
  if (!slug || used.has(slug)) {
    const base = `${slugify(lastName(authorNames[0]))}-${p.year}-${titleKeyword(title)}`;
    slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
  }
  used.add(slug);
  log.added.push(slug);
  if (featured) log.featured.push(slug);
  if (isMenteePaper) log.mentee.push(slug);

  const sch = scholar[slug] || {};
  records.push({
    slug, title, authors: authorNames, year: p.year, journal: p.journal || null,
    doi: p.doi || null, pmid: p.pmid || null, pmcid: p.pmcid || null,
    url: p.doi ? `https://doi.org/${p.doi}` : p.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` : null,
    scholarUrl: sch.scholarUrl || null, citations: typeof sch.citations === "number" ? sch.citations : null,
    isMenteePaper, menteeFirstAuthor, cohenFirstOrSenior, featured,
    openAccess: !!p.pmcid,
  });
}

// --- emit -------------------------------------------------------------------
const emit = (r) => {
  const fm = ["---"];
  fm.push(`title: ${y(r.title)}`);
  fm.push("authors:");
  for (const a of r.authors) fm.push(`  - ${y(a)}`);
  fm.push(`year: ${r.year}`);
  if (r.journal) fm.push(`journal: ${y(r.journal)}`);
  if (r.doi) fm.push(`doi: ${y(r.doi)}`);
  if (r.pmid) fm.push(`pmid: ${y(r.pmid)}`);
  if (r.pmcid) fm.push(`pmcid: ${y(r.pmcid)}`);
  if (r.url) fm.push(`url: ${y(r.url)}`);
  if (r.scholarUrl) fm.push(`scholarUrl: ${y(r.scholarUrl)}`);
  if (r.citations != null) fm.push(`citations: ${r.citations}`);
  fm.push(`isMenteePaper: ${r.isMenteePaper}`);
  fm.push(`menteeFirstAuthor: ${r.menteeFirstAuthor}`);
  fm.push(`cohenFirstOrSenior: ${r.cohenFirstOrSenior}`);
  fm.push(`featured: ${r.featured}`);
  fm.push(`openAccess: ${r.openAccess}`);
  fm.push("---");
  writeFileSync(join(OUT_DIR, `${r.slug}.md`), fm.join("\n") + "\n");
};
records.forEach(emit);

// --- report -----------------------------------------------------------------
console.log(
  `\nAdded ${records.length} new publication(s); skipped ${log.skipped.length} already present.`,
);
if (log.added.length) console.log(`  added: ${log.added.join(", ")}`);
console.log(`  (of added) featured: ${log.featured.length}, mentee-authored: ${log.mentee.length}`);

if (log.dropped.length) {
  console.log(`\nDropped (${log.dropped.length}):`);
  for (const d of log.dropped) console.log(`  - ${d}`);
}

// During the initial migration (index.json present), report old /publication/
// slugs not carried over so the PI can review.
if (legacyPubSlugs.length) {
  const orphaned = legacyPubSlugs.filter((s) => !existingSlugs.has(s) && !log.added.includes(s));
  if (orphaned.length) {
    console.log(`\nOld /publication/ slugs NOT carried over (${orphaned.length}) — review:`);
    for (const s of orphaned) console.log(`  - ${s}`);
  }
}

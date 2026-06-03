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

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "src/content/publications");

const cvPubs = JSON.parse(readFileSync(join(__dirname, "data/cv-publications.json"), "utf8"));
const pubmed = JSON.parse(readFileSync(join(__dirname, "data/pubmed.json"), "utf8"));
const indexJson = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf8"));
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

const used = new Set();
const log = { reused: [], generated: [], dropped: [], featured: [], mentee: [] };

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

  // slug: reuse legacy slug by DOI, else generate <lastname>-<year>-<keyword>
  let slug = (p.doi && legacySlugByDoi[p.doi.toLowerCase()]) || null;
  const reused = !!slug;
  if (!slug) {
    const base = `${slugify(lastName(authorNames[0]))}-${p.year}-${titleKeyword(title)}`;
    slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
  }
  used.add(slug);
  (reused ? log.reused : log.generated).push(slug);
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
console.log(`\nEmitted ${records.length} publications`);
console.log(`  slugs reused from old site: ${log.reused.length}`);
console.log(`  new slugs generated:        ${log.generated.length}`);
console.log(`  featured:                   ${log.featured.length}`);
console.log(`  mentee-authored:            ${log.mentee.length}`);
console.log(`  open access (PMCID):        ${records.filter((r) => r.openAccess).length}`);
console.log(`  with citations (Scholar):   ${records.filter((r) => r.citations != null).length}`);

if (log.dropped.length) {
  console.log(`\nDropped (${log.dropped.length}):`);
  for (const d of log.dropped) console.log(`  - ${d}`);
}

// Legacy index.json publications not carried over (not in the CV's peer-reviewed
// record). Logged so the PI can re-add or add a redirect if desired.
const carried = new Set(log.reused);
const orphaned = legacyPubSlugs.filter((s) => !carried.has(s));
if (orphaned.length) {
  console.log(`\nOld /publication/ slugs NOT carried over (${orphaned.length}) — review:`);
  for (const s of orphaned) console.log(`  - ${s}`);
}

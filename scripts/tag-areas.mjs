// First-pass research tagging (ADDITIVE — never removes existing tags, so the
// imported letter/review tags and any manual edits survive a re-run).
//   • disease areas + methods   : keyword on title/journal/slug
//   • network-mapping            : keyword (LNM / network localization)
//   • lesion-derived             : keyword (lesion/tuber/stroke/tumor/resection)
//   • review                     : PubMed article types (scripts/.cache/pubmed-review-pmids.json)
//   • letter                     : preserved from frontmatter (imported)
//   node scripts/tag-areas.mjs           # write
//   node scripts/tag-areas.mjs --dry     # report only
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "../src/content/publications");
const DRY = process.argv.includes("--dry");

const ORDER = ["autism", "adhd", "tsc-epilepsy", "perinatal-stroke", "methods", "network-mapping", "lesion-derived", "review", "letter"];

const DISEASE = [
  ["autism", /autism|autistic|\basd\b|prosopagnos|fusiform|face processing|\bfaces?\b|social communication|\bados\b/i],
  ["adhd", /\badhd\b|\battention\b|attentional|hyperactiv|inattent/i],
  ["tsc-epilepsy", /tuber|tuberous|\btsc\b|sclerosis|epilep|seizure|\btonic\b|lennox|gastaut|paroxysmal|ictal|spasms|status epilepticus/i],
  ["perinatal-stroke", /perinatal|neonatal|arterial ischemic/i],
];
const INFRA = /\bbids\b|normaliz|registration|reproduc|pipelin|preprocess|parcellat|\batlas\b|container|neurodebian|harmoniz|segmentation|grafting|convolutional|connectom/i;
const CATCHALL = /lesion network|network mapping|network localization|\bmapping\b|localization|\bnetworks?\b|connectivity|develop|maturing|maturation|cortical|regional|heterogen|generalized|functional|task control|\bcontrol\b|neural correlate|cingulo|\bdual\b|distributed|resting/i;
const NETWORK = /lesion.?network|network mapping|network localization|coordinate network|connectome|maps? to a|connected to a/i;
const LESION = /\blesions?\b|\btubers?\b|\bstrokes?\b|tumou?r|resection|epileptogenic/i;

let reviewPmids = new Set();
try {
  reviewPmids = new Set(JSON.parse(readFileSync(join(HERE, ".cache/pubmed-review-pmids.json"), "utf8")));
} catch {}

const v = (fm, k) => {
  const m = fm.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m"));
  return m ? m[1] : "";
};

const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
const report = [];

for (const file of files) {
  const path = join(DIR, file);
  const raw = readFileSync(path, "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  const slug = file.replace(/\.md$/, "");
  const hay = `${v(fm[1], "title")} ${v(fm[1], "journal")} ${slug}`;
  const pmid = v(fm[1], "pmid");

  // start from existing tags (additive)
  const areasM = fm[1].match(/^areas:\s*\[(.*?)\]/m);
  const set = new Set(
    areasM ? areasM[1].split(",").map((s) => s.replace(/["'\s]/g, "")).filter(Boolean) : [],
  );

  const disease = DISEASE.filter(([, re]) => re.test(hay)).map(([a]) => a);
  disease.forEach((a) => set.add(a));
  if (INFRA.test(hay) || (!disease.length && CATCHALL.test(hay))) set.add("methods");
  if (NETWORK.test(hay)) set.add("network-mapping");
  if (LESION.test(hay)) set.add("lesion-derived");
  if (pmid && reviewPmids.has(pmid)) set.add("review");

  const areas = ORDER.filter((a) => set.has(a));
  report.push([slug, areas]);
  if (DRY) continue;

  const line = `areas: [${areas.map((a) => `"${a}"`).join(", ")}]`;
  let body = fm[1].replace(/^areas:.*\n?/m, "");
  body = /^year:.*$/m.test(body)
    ? body.replace(/^(year:.*)$/m, `$1\n${line}`)
    : `${body.trimEnd()}\n${line}`;
  writeFileSync(path, raw.replace(/^---\n[\s\S]*?\n---/, `---\n${body}\n---`));
}

for (const [slug, areas] of report) {
  console.log(`${areas.length ? "" : "•UNTAGGED "}${slug.padEnd(40)} ${areas.join(", ")}`);
}
const counts = {};
for (const [, areas] of report) for (const a of areas) counts[a] = (counts[a] || 0) + 1;
console.log("\ncounts:", counts, "| untagged:", report.filter(([, a]) => !a.length).length);

// Apply the curated tags.json (from the tagger) to publication frontmatter,
// authoritatively replacing each paper's `areas`. Also seeds the new
// `functional-connectivity` facet onto the early WashU resting-state/parcellation
// foundational papers (additive; existing `methods` is kept for you to refine).
//   node scripts/apply-tags.mjs [path-to-tags.json]   (default: ~/Downloads/tags.json)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/content/publications");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SEED_FC = process.argv.includes("--seed-fc"); // first-pass only; off by default
const TAGS_PATH = args[0] || join(homedir(), "Downloads/tags.json");
const tags = JSON.parse(readFileSync(TAGS_PATH, "utf8"));

const FC_SET = new Set([
  "barnes-2010-identifying", "barnes-2012-parcellation", "church-2009-control",
  "cohen-2008-defining", "dosenbach-2007-distinct", "dosenbach-2008-dual",
  "dosenbach-2010-prediction", "fair-2007-development", "fair-2007-method",
  "fair-2008-maturing", "fair-2009-functional", "nelson-2010-parcellation",
  "nelson-2010-role", "power-2011-functional", "white-2009-resting",
  "wig-2014-parcellating",
]);
const ORDER = ["autism", "adhd", "tsc-epilepsy", "perinatal-stroke", "methods", "functional-connectivity", "network-mapping", "lesion-derived", "review", "letter"];

// sanity: tags.json vs files on disk
const files = new Set(readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")));
const missingFile = Object.keys(tags).filter((s) => !files.has(s));
const missingTags = [...files].filter((s) => !(s in tags));
if (missingFile.length) console.log("⚠ in tags.json but no file:", missingFile);
if (missingTags.length) console.log("⚠ file but not in tags.json (left unchanged):", missingTags);

let changed = 0;
const counts = {};
for (const [slug, areas0] of Object.entries(tags)) {
  const path = join(DIR, slug + ".md");
  if (!existsSync(path)) continue;
  const set = new Set(areas0);
  if (SEED_FC && FC_SET.has(slug)) set.add("functional-connectivity");
  const areas = ORDER.filter((a) => set.has(a));
  for (const a of areas) counts[a] = (counts[a] || 0) + 1;
  const line = `areas: [${areas.map((a) => `"${a}"`).join(", ")}]`;
  const raw = readFileSync(path, "utf8");
  const out = /^areas:.*$/m.test(raw)
    ? raw.replace(/^areas:.*$/m, line)
    : raw.replace(/^(year:.*)$/m, `$1\n${line}`);
  if (out !== raw) changed++;
  writeFileSync(path, out);
}
console.log(`\napplied tags to ${Object.keys(tags).length} papers (${changed} files changed)`);
console.log("final counts:", counts);

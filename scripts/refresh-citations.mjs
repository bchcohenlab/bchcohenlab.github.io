// Refresh per-paper Google Scholar citation counts (and per-paper Scholar links)
// for the publications collection, via SerpAPI's Google Scholar Author API.
//
// Runs on a weekly schedule (.github/workflows/refresh-citations.yml): it patches
// `citations:` and `scholarUrl:` in src/content/publications/*.md in place, the
// workflow commits any changes, rebuilds, and redeploys. Decoupled from the
// one-time migration (migrate-publications.mjs), so it keeps working after the
// legacy index.json was removed.
//
// Resilient by design: if SERPAPI_KEY is missing or the API fails, it logs and
// exits 0 without touching anything — citations never block a build and the last
// good values are preserved.
//
//   Env:
//     SERPAPI_KEY        SerpAPI api key (required for a live run)
//     SCHOLAR_AUTHOR_ID  Scholar profile id (default P9Z-BEcAAAAJ)
//     SERPAPI_FIXTURE    optional path to a JSON file (array of articles, or a
//                        full SerpAPI response) — used instead of the network,
//                        for testing.
//
//   Run: SERPAPI_KEY=... node scripts/refresh-citations.mjs

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBS = join(ROOT, "src/content/publications");
const AUTHOR_ID = process.env.SCHOLAR_AUTHOR_ID || "P9Z-BEcAAAAJ";
const KEY = process.env.SERPAPI_KEY;
const FIXTURE = process.env.SERPAPI_FIXTURE;

// Greek letters appear as symbols in some Scholar titles (e.g. "α-dystrobrevin")
// but spelled out in ours ("alpha-dystrobrevin"); transliterate so they match.
const GREEK = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta",
  η: "eta", θ: "theta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu",
  ξ: "xi", ο: "omicron", π: "pi", ρ: "rho", σ: "sigma", ς: "sigma", τ: "tau",
  υ: "upsilon", φ: "phi", χ: "chi", ψ: "psi", ω: "omega",
};
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[α-ω]/g, (c) => GREEK[c] ?? "")
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");

async function getArticles() {
  if (FIXTURE) {
    const data = JSON.parse(readFileSync(FIXTURE, "utf8"));
    return Array.isArray(data) ? data : data.articles || [];
  }
  const articles = [];
  for (let start = 0; start < 500; start += 100) {
    const url =
      `https://serpapi.com/search.json?engine=google_scholar_author` +
      `&author_id=${AUTHOR_ID}&num=100&start=${start}&api_key=${KEY}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`SerpAPI HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(`SerpAPI: ${j.error}`);
    const batch = j.articles || [];
    articles.push(...batch);
    if (batch.length < 100) break;
  }
  return articles;
}

// Patch a frontmatter scalar: replace if present, else insert after `anchor`.
function setField(text, key, valueLiteral, anchorRe) {
  const re = new RegExp(`^${key}: .*$`, "m");
  if (re.test(text)) return text.replace(re, `${key}: ${valueLiteral}`);
  return text.replace(anchorRe, (m) => `${m}\n${key}: ${valueLiteral}`);
}

if (!KEY && !FIXTURE) {
  console.log(
    "SERPAPI_KEY not set — skipping citation refresh (keeping existing values).",
  );
  process.exit(0);
}

let articles;
try {
  articles = await getArticles();
} catch (e) {
  console.log(`Citation refresh failed (${e.message}) — keeping existing values.`);
  process.exit(0);
}

const byTitle = new Map();
for (const a of articles) {
  if (!a.title) continue;
  const v = a.cited_by?.value;
  byTitle.set(norm(a.title), {
    citations: typeof v === "number" ? v : 0,
    link: a.link || null,
  });
}

const files = readdirSync(PUBS).filter((f) => f.endsWith(".md"));
let changed = 0,
  matched = 0;
const unmatched = [];

for (const f of files) {
  const file = join(PUBS, f);
  let text = readFileSync(file, "utf8");
  const orig = text;
  const tm = /^title: (.+)$/m.exec(text);
  if (!tm) continue;
  const title = JSON.parse(tm[1]);
  const hit = byTitle.get(norm(title));
  if (!hit) {
    unmatched.push(f.replace(".md", ""));
    continue;
  }
  matched++;
  // Only show a count when it's > 0 (avoids "Cited by 0" on brand-new papers).
  if (hit.citations > 0) {
    text = setField(text, "citations", String(hit.citations), /^year: .*$/m);
  }
  if (hit.link) {
    text = setField(text, "scholarUrl", JSON.stringify(hit.link), /^year: .*$/m);
  }
  if (text !== orig) {
    writeFileSync(file, text);
    changed++;
  }
}

console.log(
  `SerpAPI articles: ${articles.length}; matched ${matched}/${files.length} ` +
    `publications; updated ${changed} file(s).`,
);
if (unmatched.length) {
  console.log(`No Scholar entry (left as-is): ${unmatched.join(", ")}`);
}

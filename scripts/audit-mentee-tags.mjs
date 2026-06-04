// Audit CV mentee (**) tagging against lab membership.
//
// Rule (per PI): every profiled lab member EXCEPT the PI and Jurriaan Peters is a
// mentee. This finds every publication where such a person is an author but is
// NOT marked ** (mentee) in scripts/data/cv-publications.json — i.e. CV tagging
// gaps to fix.
//
// Run: node scripts/audit-mentee-tags.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PEOPLE = join(ROOT, "src/content/people");
const cv = JSON.parse(readFileSync(join(__dirname, "data/cv-publications.json"), "utf8"));

const NOT_MENTEE = new Set(["a-cohen", "j-peters"]); // PI + faculty

const normAlpha = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
const personKey = (name) => {
  const base = name.split(",")[0].trim();
  const toks = base.split(/\s+/);
  return { initial: normAlpha(toks[0])[0] || "", last: normAlpha(toks[toks.length - 1] || "") };
};
const authorIsPerson = (author, pk) => {
  if (!pk.last) return false;
  const m = author.trim().match(/^(.*?)\s+([A-Za-z]{1,4})$/);
  const wholeLast = normAlpha(m ? m[1] : author);
  const initials = m ? m[2].toLowerCase() : "";
  return wholeLast.includes(pk.last) && (!pk.initial || !initials || initials[0] === pk.initial);
};

// Build the mentee directory (profiled people minus PI/faculty).
const mentees = readdirSync(PEOPLE)
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const t = readFileSync(join(PEOPLE, f), "utf8");
    const name = JSON.parse(/^name: (.+)$/m.exec(t)[1]);
    return { slug: f.replace(/\.md$/, ""), name, key: personKey(name) };
  })
  .filter((p) => !NOT_MENTEE.has(p.slug));

const findMentee = (author) => mentees.find((m) => authorIsPerson(author, m.key)) || null;

// Scan CV records for untagged mentee authors.
const byPerson = new Map(); // slug -> [{title, year, author}]
let untaggedTotal = 0;
for (const rec of cv) {
  for (const a of rec.authors) {
    const m = findMentee(a.name);
    if (m && !a.mentee) {
      untaggedTotal++;
      if (!byPerson.has(m.slug)) byPerson.set(m.slug, { name: m.name, items: [] });
      byPerson.get(m.slug).items.push({ title: rec.title, year: rec.year, author: a.name });
    }
  }
}

console.log(
  `Untagged mentee author instances: ${untaggedTotal} across ${byPerson.size} people.\n`,
);
const sorted = [...byPerson.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
for (const [slug, info] of sorted) {
  console.log(`${info.name} (${slug}) — ${info.items.length} paper(s):`);
  for (const it of info.items.sort((x, y) => y.year - x.year)) {
    console.log(`   ${it.year}  [author "${it.author}"]  ${it.title.slice(0, 70)}`);
  }
  console.log("");
}

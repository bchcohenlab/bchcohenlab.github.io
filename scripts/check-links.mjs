// Verify every publication's DOI + url resolve.
//  - DOI: doi.org handle API (responseCode 1 = registered/valid) — registrar-agnostic, bot-safe.
//  - url: HEAD (follow redirects); 403/429 treated as bot-block (not broken).
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/content/publications");
const v = (t, k) => {
  const m = t.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m"));
  return m ? m[1] : "";
};
const pubs = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const t = readFileSync(join(DIR, f), "utf8");
    return { slug: f.replace(/\.md$/, ""), doi: v(t, "doi"), url: v(t, "url"), scholar: v(t, "scholarUrl") };
  });

async function withTimeout(fn, ms = 15000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  try {
    return await fn(c.signal);
  } finally {
    clearTimeout(id);
  }
}
async function checkDoi(doi) {
  if (!doi) return null;
  try {
    return await withTimeout(async (signal) => {
      const r = await fetch("https://doi.org/api/handles/" + encodeURIComponent(doi), { signal });
      const j = await r.json();
      return j.responseCode === 1 ? "ok" : `NOT-REGISTERED(${j.responseCode})`;
    });
  } catch (e) {
    return "ERR " + (e.name || e.message);
  }
}
async function checkUrl(url) {
  if (!url) return null;
  try {
    return await withTimeout(async (signal) => {
      const r = await fetch(url, { method: "HEAD", redirect: "follow", signal });
      return r.status;
    });
  } catch (e) {
    return "ERR " + (e.name || e.message);
  }
}

const queue = [...pubs];
const results = [];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const p = queue.shift();
      const [doiStatus, urlStatus] = await Promise.all([checkDoi(p.doi), checkUrl(p.url)]);
      results.push({ ...p, doiStatus, urlStatus });
    }
  }),
);
results.sort((a, b) => a.slug.localeCompare(b.slug));

const issues = [];
const blocked = [];
for (const r of results) {
  const probs = [];
  if (r.doi && r.doiStatus !== "ok") probs.push("DOI " + r.doiStatus);
  if (r.url && typeof r.urlStatus === "number" && r.urlStatus >= 400) {
    if ([403, 429, 999].includes(r.urlStatus)) blocked.push(`${r.slug} url ${r.urlStatus}`);
    else probs.push("URL " + r.urlStatus);
  }
  if (r.url && typeof r.urlStatus === "string") probs.push("URL " + r.urlStatus);
  if (!r.doi && !r.url) probs.push("NO LINK");
  if (probs.length) issues.push(`✗ ${r.slug.padEnd(42)} ${probs.join(" | ")}`);
}

console.log(`Checked ${results.length} publications (${results.filter((r) => r.doi).length} with DOI, ${results.filter((r) => r.url).length} with url).\n`);
console.log(issues.length ? "ISSUES:\n" + issues.join("\n") : "✓ All DOIs registered and all url fields resolve.");
if (blocked.length) console.log("\nBot-blocked (403/429 — verify manually, likely fine):\n  " + blocked.join("\n  "));

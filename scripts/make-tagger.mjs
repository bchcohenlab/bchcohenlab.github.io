// Generates a self-contained HTML tagger (tag-review.html) from the current
// publication frontmatter, so the PI can toggle research-area tags by hand and
// export the corrected mapping. Re-run after tags change.
//   node scripts/make-tagger.mjs   →   open tag-review.html
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "src/content/publications");

const AREAS = [
  // Disease/population areas
  { slug: "autism", label: "Autism", color: "#1f73b8" },
  { slug: "adhd", label: "ADHD & attention", color: "#0d9488" },
  { slug: "tsc-epilepsy", label: "TSC & epilepsy", color: "#7c3aed" },
  { slug: "perinatal-stroke", label: "Perinatal stroke", color: "#d6409f" },
  { slug: "methods", label: "Methods & open data", color: "#64748b" },
  // Cross-cutting method facets
  { slug: "functional-connectivity", label: "Functional connectivity", color: "#4338ca" },
  { slug: "network-mapping", label: "Network mapping", color: "#0891b2" },
  { slug: "lesion-derived", label: "Lesion-derived", color: "#ea580c" },
  // Publication-type facets
  { slug: "review", label: "Review", color: "#475569" },
  { slug: "letter", label: "Letter / commentary", color: "#a16207" },
];

const v = (fm, k) => {
  const m = fm.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m"));
  return m ? m[1] : "";
};

const data = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .map((file) => {
    const fm = readFileSync(join(DIR, file), "utf8").match(/^---\n([\s\S]*?)\n---/)[1];
    const am = fm.match(/^authors:\s*\n((?:\s*-\s*.*\n?)+)/m);
    const authors = am
      ? am[1].split("\n").map((l) => l.replace(/^\s*-\s*/, "").replace(/^"|"$/g, "").trim()).filter(Boolean)
      : [];
    const areasM = fm.match(/^areas:\s*\[(.*?)\]/m);
    const areas = areasM
      ? areasM[1].split(",").map((s) => s.replace(/["'\s]/g, "")).filter(Boolean)
      : [];
    return {
      slug: file.replace(/\.md$/, ""),
      title: v(fm, "title"),
      journal: v(fm, "journal"),
      year: Number(v(fm, "year")) || "",
      authors: authors.slice(0, 4),
      areas,
    };
  })
  .sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));

// --- HTML template (runtime JS avoids backticks / template-literals to stay inside) ---
const TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cohen Lab — Research Area Tagger</title>
<style>
  :root { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #0f172a; background: #f8fafc; }
  header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e2e8f0; padding: 14px 20px; z-index: 5; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .counts { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .cnt { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
  .cnt[style] { border-color: var(--c); }
  input[type=search] { padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; min-width: 220px; }
  label.chk { font-size: 13px; color: #475569; display: inline-flex; gap: 4px; align-items: center; }
  button.act { padding: 6px 12px; border: 1px solid #155e9c; background: #155e9c; color: #fff; border-radius: 8px; font-size: 13px; cursor: pointer; }
  button.ghost { background: #fff; color: #155e9c; }
  textarea { width: 100%; height: 64px; margin-top: 8px; font: 12px/1.4 ui-monospace, Menlo, monospace; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; resize: vertical; }
  main { padding: 16px 20px 80px; max-width: 920px; margin: 0 auto; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .card.changed { box-shadow: inset 3px 0 0 #d6409f; }
  .meta { font-size: 12px; color: #64748b; }
  .meta code { background: #f1f5f9; padding: 0 4px; border-radius: 4px; }
  .title { font-weight: 600; margin: 3px 0; }
  .auth { font-size: 12px; color: #475569; margin-bottom: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border: 1px solid #cbd5e1; background: #fff; color: #64748b; border-radius: 999px; padding: 4px 11px; font-size: 12px; cursor: pointer; transition: all .12s; }
  .chip:hover { border-color: var(--c); color: var(--c); }
  .chip.on { background: var(--c); border-color: var(--c); color: #fff; }
</style>
</head>
<body>
<header>
  <h1>Cohen Lab — Research Area Tagger</h1>
  <div class="row">
    <input type="search" id="search" placeholder="Search title / author / slug…" />
    <label class="chk"><input type="checkbox" id="untaggedOnly" /> untagged only</label>
    <label class="chk"><input type="checkbox" id="changedOnly" /> changed only</label>
    <button class="act ghost" id="copy">Copy JSON</button>
    <button class="act" id="download">Download tags.json</button>
  </div>
  <div class="counts" id="counts"></div>
  <textarea id="json" readonly></textarea>
</header>
<main id="list"></main>
<script>
var AREAS = __AREAS__;
var DATA = __DATA__;
var state = {};
DATA.forEach(function (d) { state[d.slug] = {}; AREAS.forEach(function (a) { state[d.slug][a.slug] = d.areas.indexOf(a.slug) > -1; }); });
var origJSON = {}; DATA.forEach(function (d) { origJSON[d.slug] = d.areas.slice().sort().join(","); });

var listEl = document.getElementById("list");
var searchEl = document.getElementById("search");
var untaggedEl = document.getElementById("untaggedOnly");
var changedEl = document.getElementById("changedOnly");
var jsonEl = document.getElementById("json");
var countsEl = document.getElementById("counts");

function currentAreas(slug) { return AREAS.filter(function (a) { return state[slug][a.slug]; }).map(function (a) { return a.slug; }); }
function isChanged(slug) { return currentAreas(slug).slice().sort().join(",") !== origJSON[slug]; }
function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function updateJSON() {
  var obj = {}; DATA.forEach(function (d) { obj[d.slug] = currentAreas(d.slug); });
  jsonEl.value = JSON.stringify(obj);
  var html = "";
  AREAS.forEach(function (a) {
    var n = DATA.filter(function (d) { return state[d.slug][a.slug]; }).length;
    html += '<span class="cnt" style="--c:' + a.color + '">' + a.label + ": " + n + "</span>";
  });
  var unt = DATA.filter(function (d) { return currentAreas(d.slug).length === 0; }).length;
  var chg = DATA.filter(function (d) { return isChanged(d.slug); }).length;
  html += '<span class="cnt">untagged: ' + unt + "</span>";
  html += '<span class="cnt">changed: ' + chg + "</span>";
  countsEl.innerHTML = html;
}

function applyFilter() {
  var q = (searchEl.value || "").toLowerCase(), uo = untaggedEl.checked, co = changedEl.checked;
  var cards = listEl.querySelectorAll(".card");
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i], slug = card.getAttribute("data-slug"), hay = card.getAttribute("data-hay");
    var ok = (!q || hay.indexOf(q) > -1) && (!uo || currentAreas(slug).length === 0) && (!co || isChanged(slug));
    card.style.display = ok ? "" : "none";
  }
}

function build() {
  var html = "";
  DATA.forEach(function (d) {
    var hay = (d.title + " " + (d.journal || "") + " " + d.authors.join(" ") + " " + d.slug).toLowerCase().replace(/"/g, "&quot;");
    html += '<div class="card" data-slug="' + d.slug + '" data-hay="' + hay + '">';
    html += '<div class="meta">' + (d.journal ? esc(d.journal) + " · " : "") + (d.year || "") + ' · <code>' + d.slug + "</code></div>";
    html += '<div class="title">' + esc(d.title) + "</div>";
    html += '<div class="auth">' + esc(d.authors.join(", ")) + (d.authors.length >= 4 ? " …" : "") + "</div>";
    html += '<div class="chips">';
    AREAS.forEach(function (a) {
      html += '<button class="chip' + (state[d.slug][a.slug] ? " on" : "") + '" style="--c:' + a.color + '" data-slug="' + d.slug + '" data-area="' + a.slug + '">' + a.label + "</button>";
    });
    html += "</div></div>";
  });
  listEl.innerHTML = html;
  var chips = listEl.querySelectorAll(".chip");
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener("click", function () {
      var slug = this.getAttribute("data-slug"), area = this.getAttribute("data-area");
      state[slug][area] = !state[slug][area];
      this.classList.toggle("on", state[slug][area]);
      var card = this.closest(".card");
      if (card) card.classList.toggle("changed", isChanged(slug));
      updateJSON(); applyFilter();
    });
  }
}

document.getElementById("download").addEventListener("click", function () {
  var blob = new Blob([jsonEl.value], { type: "application/json" });
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tags.json"; a.click();
});
document.getElementById("copy").addEventListener("click", function () {
  jsonEl.select(); try { document.execCommand("copy"); } catch (e) {}
});
searchEl.addEventListener("input", applyFilter);
untaggedEl.addEventListener("change", applyFilter);
changedEl.addEventListener("change", applyFilter);
build(); updateJSON();
</script>
</body>
</html>`;

const html = TEMPLATE.replace("__AREAS__", JSON.stringify(AREAS)).replace("__DATA__", JSON.stringify(data));
writeFileSync(join(ROOT, "tag-review.html"), html);
console.log("Wrote tag-review.html (" + data.length + " papers)");

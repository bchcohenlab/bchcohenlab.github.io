// Migrate people from the legacy Hugo site into Astro content collections.
//
//   Sources (all local):
//     - index.html "Meet the Team" widget -> group, role, order, social links
//     - authors/<slug>/index.html         -> bio (markdown body)
//     - authors/<slug>/avatar.{jpg,jpeg,png} -> headshot asset
//   MCP-sourced enrichment (fetched by the agent, baked in below):
//     - a-cohen title from the CV docx (Drive 1xbxOMlghEZK8U59aJFL2Hmh4x-35-UI8)
//
//   Output: src/content/people/<slug>.md + src/assets/people/<slug>.<ext>
//   Slugs are reused verbatim so old /authors/<slug> links keep matching.
//
//   Run: node scripts/migrate-people.mjs
//
// Node scripts cannot reach the MCP connectors, so anything sourced from
// Drive/PubMed/Scholar is fetched by the agent and passed in as constants
// (here) or data files (publications/figures scripts).

import { load } from "cheerio";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PEOPLE_DIR = join(ROOT, "src/content/people");
const ASSETS_DIR = join(ROOT, "src/assets/people");

// Map widget group heading -> collection status.
const GROUP_STATUS = {
  Faculty: "current",
  Researchers: "current",
  Staff: "current",
  Students: "current",
  Alumni: "alumni",
};
const KNOWN_GROUPS = Object.keys(GROUP_STATUS);

// Author dirs that are intentionally not migrated (logged, not emitted):
//   admin        -> Wowchemy demo placeholder
//   a-gholipour  -> external collaborator (Ali Gholipour), no headshot
//   m-fox        -> external collaborator (Michael Fox), no headshot
// They are simply absent from the team widget, so iterating the widget skips
// them automatically; we still report them for transparency.
const KNOWN_NON_WIDGET = new Set(["admin", "a-gholipour", "m-fox"]);

// Per-PI override: Shaoling Peng moved Researchers -> Alumni.
const GROUP_OVERRIDE = { "s-peng": "Alumni" };

// a-cohen enrichment from the CV (Faculty Academic Appointments + DoCS).
const COHEN = {
  slug: "a-cohen",
  name: "Alexander Li Cohen, MD, PhD",
  title:
    "Assistant Professor of Neurology, Harvard Medical School · Director, " +
    "Data Organization Collaborative Service (DoCS), Boston Children's Hospital",
};

// --- helpers ---------------------------------------------------------------

// JSON.stringify produces a valid YAML double-quoted scalar (same escaping).
const y = (s) => JSON.stringify(s);

const slugFromAuthorHref = (href) => {
  const m = /\/authors\/([^/]+)\/?/.exec(href || "");
  return m ? m[1] : null;
};

const cleanUrl = (u) =>
  (u || "")
    .trim()
    // strip stray zero-width spaces that crept into some legacy hrefs
    .replace(/%e2%80%8b/gi, "")
    .replace(/​/g, "");

// Map a network-icon <i> class to a links schema field (or null to skip).
const iconField = (cls) => {
  if (/fa-twitter/.test(cls)) return "twitter";
  if (/ai-google-scholar/.test(cls)) return "scholar";
  if (/ai-orcid/.test(cls)) return "orcid";
  if (/fa-linkedin/.test(cls)) return "linkedin";
  if (/fa-globe|fa-home/.test(cls)) return "website";
  return null; // github, address-card (catalyst), cv, envelope handled separately
};

const extractLinks = ($, $person) => {
  const links = {};
  $person.find("ul.network-icon a").each((_, a) => {
    const $a = $(a);
    const href = cleanUrl($a.attr("href"));
    if (!href) return;
    const iconCls = $a.find("i").attr("class") || "";
    if (/fa-envelope/.test(iconCls)) {
      // Only a real mailto counts as an email (a-cohen's points at /#contact).
      if (href.startsWith("mailto:")) links.email = href.replace(/^mailto:/, "");
      return;
    }
    const field = iconField(iconCls);
    if (field && !links[field]) links[field] = href;
  });
  return links;
};

const extractBio = (slug) => {
  const file = join(ROOT, "authors", slug, "index.html");
  if (!existsSync(file)) return { bio: "", warn: `no author page for ${slug}` };
  const $ = load(readFileSync(file, "utf8"));
  // Bio = direct <p> children of the main content column (before the
  // Interests/Education .row, which are nested deeper).
  const paras = [];
  $(".col-lg-8")
    .first()
    .children("p")
    .each((_, p) => {
      const t = $(p).text().replace(/\s+/g, " ").trim();
      if (t) paras.push(t);
    });
  return { bio: paras.join("\n\n"), warn: paras.length ? null : `empty bio for ${slug}` };
};

const findAvatar = (slug) => {
  for (const ext of ["jpg", "jpeg", "png"]) {
    const p = join(ROOT, "authors", slug, `avatar.${ext}`);
    if (existsSync(p)) return { path: p, ext };
  }
  return null;
};

const emitPerson = (person) => {
  const { slug, name, status, group, role, title, links, order, headshotExt } = person;
  const fm = [];
  fm.push("---");
  fm.push(`name: ${y(name)}`);
  fm.push(`status: ${status}`);
  fm.push(`group: ${group}`);
  fm.push(`role: ${y(role)}`);
  if (title) fm.push(`title: ${y(title)}`);
  if (headshotExt) fm.push(`headshot: ../../assets/people/${slug}.${headshotExt}`);
  const linkKeys = Object.keys(links);
  if (linkKeys.length) {
    fm.push("links:");
    for (const k of linkKeys) fm.push(`  ${k}: ${y(links[k])}`);
  }
  fm.push(`order: ${order}`);
  fm.push(`featured: ${slug === "a-cohen"}`);
  fm.push("---");
  const body = person.bio ? `\n${person.bio}\n` : "\n";
  writeFileSync(join(PEOPLE_DIR, `${slug}.md`), fm.join("\n") + "\n" + body);
};

// --- main ------------------------------------------------------------------

mkdirSync(PEOPLE_DIR, { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

const $ = load(readFileSync(join(ROOT, "index.html"), "utf8"));
const widget = $(".people-widget");
if (!widget.length) {
  console.error("FATAL: .people-widget not found in index.html");
  process.exit(1);
}

const people = [];
const warnings = [];
let currentGroup = null;
let order = 0;

widget.children().each((_, el) => {
  const $el = $(el);
  if ($el.hasClass("people-person")) {
    if (!currentGroup) {
      warnings.push("person card before any group heading; skipped");
      return;
    }
    const slug = slugFromAuthorHref($el.find('a[href^="/authors/"]').attr("href"));
    // Name + role live in <h2><a>…</a></h2> and the first <h3>, inside either
    // .portrait-title (Faculty/Researchers) or .alumni-portrait-title (Alumni).
    // The avatar's <a> wraps an <img> only, so "h2 a" never matches it.
    const name = $el.find("h2 a").first().text().trim();
    const role = $el.find("h3").first().text().trim();
    if (!slug) {
      warnings.push(`person "${name}" has no /authors/ link; skipped`);
      return;
    }
    const group = GROUP_OVERRIDE[slug] || currentGroup;
    const status = GROUP_STATUS[group] || "current";
    const links = extractLinks($, $el);
    const { bio, warn } = extractBio(slug);
    if (warn) warnings.push(warn);

    const avatar = findAvatar(slug);
    let headshotExt = null;
    if (avatar) {
      headshotExt = avatar.ext;
      copyFileSync(avatar.path, join(ASSETS_DIR, `${slug}.${avatar.ext}`));
    } else {
      warnings.push(`no avatar for ${slug} (will use initials placeholder)`);
    }

    const person = {
      slug,
      name: slug === COHEN.slug ? COHEN.name : name,
      status,
      group,
      role,
      title: slug === COHEN.slug ? COHEN.title : undefined,
      links,
      order: ++order,
      bio,
      headshotExt,
    };
    people.push(person);
    emitPerson(person);
  } else {
    const heading = $el.find("h2").first().text().trim();
    if (KNOWN_GROUPS.includes(heading)) currentGroup = heading;
  }
});

// --- report ----------------------------------------------------------------

const byGroup = (g) => people.filter((p) => p.group === g);
const counts = {
  total: people.length,
  Faculty: byGroup("Faculty").length,
  Researchers: byGroup("Researchers").length,
  Alumni: byGroup("Alumni").length,
  current: people.filter((p) => p.status === "current").length,
  alumni: people.filter((p) => p.status === "alumni").length,
};

console.log(`\nMigrated ${counts.total} people:`);
console.log(`  Faculty:     ${counts.Faculty}`);
console.log(`  Researchers: ${counts.Researchers}`);
console.log(`  Alumni:      ${counts.Alumni}`);
console.log(`  (status: ${counts.current} current, ${counts.alumni} alumni)`);

const migratedSlugs = new Set(people.map((p) => p.slug));
const sPeng = people.find((p) => p.slug === "s-peng");
console.log(`\ns-peng group: ${sPeng ? sPeng.group : "(not found!)"}`);

// Report author dirs that exist on disk but weren't migrated.
const authorDirs = readdirSync(join(ROOT, "authors"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((d) => existsSync(join(ROOT, "authors", d, "index.html")));
const skipped = authorDirs.filter((d) => !migratedSlugs.has(d));
console.log(`\nAuthor dirs not migrated (${skipped.length}): ${skipped.join(", ")}`);
const unexpectedSkips = skipped.filter((d) => !KNOWN_NON_WIDGET.has(d));
if (unexpectedSkips.length)
  warnings.push(`UNEXPECTED un-migrated author dirs: ${unexpectedSkips.join(", ")}`);

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  - ${w}`);
} else {
  console.log("\nNo warnings.");
}

// One-off import of CV "Letters to the Editor", the "Reviews" section, and the
// Siddiqi 2026 preprint — papers that were absent from the CV-derived collection.
// areas here set only the manual facets (letter/review/type); keyword + PubMed
// passes (tag-areas.mjs) add network-mapping / lesion-derived / disease / methods.
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/content/publications");

const PUBS = [
  // --- Letters to the Editor ---
  {
    slug: "cohen-2018-narcolepsy-fatigue",
    title: 'Response to "High fatigue frequency in narcolepsy type 1 and type 2 in a Brazilian Sleep Center"',
    authors: ["Cohen AL", "Mandrekar J", "St Louis EK", "Silber MH", "Kotagal S"],
    year: 2018, journal: "Sleep Medicine", doi: "10.1016/j.sleep.2018.08.010", pmid: "30293846",
    cohenFirstOrSenior: true, areas: ["letter"],
  },
  {
    slug: "cohen-2018-narcolepsy-smoking",
    title: 'Response to "Smoking, co-morbidities and narcolepsy"',
    authors: ["Cohen AL", "Mandrekar J", "St Louis EK", "Silber MH", "Kotagal S"],
    year: 2018, journal: "Sleep Medicine", doi: "10.1016/j.sleep.2018.08.009", pmid: "30316702",
    cohenFirstOrSenior: true, areas: ["letter"],
  },
  {
    slug: "cohen-2020-sample-size",
    title: "Reply: The influence of sample size and arbitrary statistical thresholds in lesion-network mapping",
    authors: ["Cohen AL", "Fox MD"],
    year: 2020, journal: "Brain", doi: "10.1093/brain/awaa095", pmid: "32365379",
    cohenFirstOrSenior: true, areas: ["letter"],
  },
  {
    slug: "cohen-2021-post-stroke-localization",
    title: "Lesion network mapping predicts post-stroke behavioural deficits and improves localization",
    authors: ["Cohen AL", "Ferguson M", "Fox MD"],
    year: 2021, journal: "Brain", doi: "10.1093/brain/awab002", pmid: "33899085", pmcid: "PMC8105033",
    cohenFirstOrSenior: true, areas: ["letter"],
  },
  {
    slug: "cohen-2021-prosopagnosia-reply",
    title: "Reply: Looking beyond indirect lesion network mapping of prosopagnosia: direct measures required",
    authors: ["Cohen AL", "Fox MD"],
    year: 2021, journal: "Brain", doi: "10.1093/brain/awab277", pmid: "34273160",
    cohenFirstOrSenior: true, areas: ["letter"],
  },
  {
    slug: "cohen-2023-fusiform-reply",
    title: 'Reply to "Is There an Association between Tuber Involvement of the Fusiform Face Area in Autism Diagnosis?"',
    authors: ["Cohen AL", "Kroeck MR", "Fox MD", "TACERN Study Group"],
    year: 2023, journal: "Annals of Neurology", doi: "10.1002/ana.26634", pmid: "36895052",
    cohenFirstOrSenior: true, areas: ["letter"],
  },
  {
    slug: "taylor-2024-tms-target",
    title: "Brain Circuits Involved in Transcranial Magnetic Stimulation Response in Adults Are Connected to a Similar Prefrontal Target in Children",
    authors: ["Taylor JJ", "Palm ST", "Cohen AL", "Croarkin PE", "Drew W", "Fox MD", "Siddiqi S"],
    year: 2024, journal: "Biological Psychiatry", doi: "10.1016/j.biopsych.2023.08.019", pmid: "37877924",
    cohenFirstOrSenior: false, areas: ["letter", "network-mapping"],
  },
  // --- Reviews ---
  {
    slug: "cohen-2022-causal-methods",
    title: "Using causal methods to map symptoms to brain circuits in neurodevelopmental disorders: moving from identifying correlates to developing treatments",
    authors: ["Cohen AL"],
    year: 2022, journal: "Journal of Neurodevelopmental Disorders", doi: "10.1186/s11689-022-09433-1",
    pmid: "35279095", pmcid: "PMC8918299",
    cohenFirstOrSenior: true, openAccess: true,
    areas: ["review", "methods", "network-mapping", "lesion-derived", "autism"],
  },
  // --- Preprints ---
  {
    slug: "siddiqi-2026-foundations",
    title: "The methodological foundations of lesion network mapping remain sound",
    authors: ["Siddiqi SH", "Horn A", "Schaper FLWVJ", "Khosravani S", "Cohen AL", "Joutsa J", "Rolston JD", "Ferguson MA", "Snider SB", "Winkler AM", "Akram H", "Smith SM", "Nichols TE", "Friston K", "Boes AD", "Fox MD"],
    year: 2026, journal: "bioRxiv (preprint)", doi: "10.64898/2026.02.24.707529",
    cohenFirstOrSenior: false, openAccess: true,
    areas: ["methods", "network-mapping", "lesion-derived"],
  },
];

const q = (s) => '"' + s.replace(/"/g, '\\"') + '"';
let written = 0;
for (const p of PUBS) {
  const fm = ["---", `title: ${q(p.title)}`, "authors:"];
  for (const a of p.authors) fm.push(`  - ${q(a)}`);
  fm.push(`year: ${p.year}`);
  fm.push(`areas: [${p.areas.map(q).join(", ")}]`);
  if (p.journal) fm.push(`journal: ${q(p.journal)}`);
  if (p.doi) fm.push(`doi: ${q(p.doi)}`);
  if (p.pmid) fm.push(`pmid: ${q(p.pmid)}`);
  if (p.pmcid) fm.push(`pmcid: ${q(p.pmcid)}`);
  fm.push(`cohenFirstOrSenior: ${p.cohenFirstOrSenior ? "true" : "false"}`);
  fm.push(`openAccess: ${p.openAccess ? "true" : "false"}`);
  fm.push("---", "");
  const path = join(DIR, p.slug + ".md");
  writeFileSync(path, fm.join("\n"));
  written++;
  console.log((existsSync(path) ? "ok  " : "NEW ") + p.slug);
}
console.log(`\nwrote ${written} files`);

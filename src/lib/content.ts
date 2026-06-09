import { getCollection, type CollectionEntry } from "astro:content";

export type Person = CollectionEntry<"people">;
export type Publication = CollectionEntry<"publications">;
export type Figure = CollectionEntry<"figures">;

// Tag vocabulary (must match the `areas` enum in content.config.ts). A paper may
// carry several — disease/population, method/approach, and publication type.
export type AreaSlug =
  | "autism"
  | "adhd"
  | "tsc-epilepsy"
  | "perinatal-stroke"
  | "functional-connectivity"
  | "network-mapping"
  | "lesion-derived"
  | "methods"
  | "review"
  | "letter";

export const AREA_LABELS: Record<AreaSlug, string> = {
  autism: "Autism",
  adhd: "ADHD & attention",
  "tsc-epilepsy": "Tuberous sclerosis & epilepsy",
  "perinatal-stroke": "Perinatal stroke",
  "functional-connectivity": "Functional connectivity",
  "network-mapping": "Network mapping",
  "lesion-derived": "Lesion-derived",
  methods: "Methods & open tools",
  review: "Review",
  letter: "Letter / commentary",
};

// Research-page sections, grouped (conditions vs. approaches), with blurbs.
export const RESEARCH_GROUPS: { title: string; areas: { slug: AreaSlug; blurb: string }[] }[] = [
  {
    title: "Conditions we study",
    areas: [
      { slug: "autism", blurb: "Localizing the circuits behind autism's core and associated symptoms — social communication, sensory differences, face processing — and how to modulate them." },
      { slug: "adhd", blurb: "Coordinate and lesion network mapping of attention, with pharmaco-fMRI and real-time fMRI neurofeedback to probe and modulate the circuits involved." },
      { slug: "tsc-epilepsy", blurb: "Tubers and epilepsy foci as natural experiments — focal anomalies that, when they share a symptom, reveal the responsible brain network." },
      { slug: "perinatal-stroke", blurb: "Mapping how early focal injury reshapes developing brain networks and gives rise to specific cognitive and behavioral symptoms." },
    ],
  },
  {
    title: "Methods & approaches",
    areas: [
      { slug: "functional-connectivity", blurb: "Resting-state functional connectivity and functional parcellation of the brain — and how its network architecture develops from childhood to adulthood." },
      { slug: "network-mapping", blurb: "Linking focal lesions, tubers, and coordinates to common brain networks, localizing the circuits that produce specific symptoms across disorders." },
      { slug: "methods", blurb: "Reproducible, open neuroimaging tooling — preprocessing, normalization, BIDS-standard pipelines, and the connectome resources that make this work possible." },
    ],
  },
];

// Publications filter chips, grouped (slugs reference AREA_LABELS).
export const FILTER_GROUPS: { title: string; slugs: AreaSlug[] }[] = [
  { title: "Condition", slugs: ["autism", "adhd", "tsc-epilepsy", "perinatal-stroke"] },
  { title: "Approach", slugs: ["functional-connectivity", "network-mapping", "lesion-derived", "methods"] },
  { title: "Type", slugs: ["review", "letter"] },
];

/** Research-page groups → each area with its most-recent pubs (capped) + total count. */
export async function getResearchGroups(limit = 4) {
  const pubs = await getPublications();
  return RESEARCH_GROUPS.map((g) => ({
    title: g.title,
    areas: g.areas
      .map((a) => {
        const all = pubs.filter((p) => p.data.areas.includes(a.slug));
        return { slug: a.slug, label: AREA_LABELS[a.slug], blurb: a.blurb, pubs: all.slice(0, limit), total: all.length };
      })
      .filter((a) => a.total > 0),
  })).filter((g) => g.areas.length > 0);
}

/** Count of publications per area slug (for filter-chip labels). */
export async function getAreaCounts() {
  const pubs = await getPublications();
  const counts: Partial<Record<AreaSlug, number>> = {};
  for (const p of pubs) for (const a of p.data.areas as AreaSlug[]) counts[a] = (counts[a] || 0) + 1;
  return counts;
}

// Display order of groups within the People page.
export const GROUP_ORDER = [
  "Faculty",
  "Researchers",
  "Staff",
  "Students",
  "Affiliates",
  "Alumni",
] as const;

const byOrder = (a: Person, b: Person) => a.data.order - b.data.order;

// Surname for alphabetizing: slugs are "<first-initial>-<surname>", so drop the
// leading initial. localeCompare keeps it accent-aware; byOrder breaks ties.
const surname = (p: Person) => p.id.replace(/^[^-]+-/, "");
const bySurname = (a: Person, b: Person) =>
  surname(a).localeCompare(surname(b)) || byOrder(a, b);

// These groups are listed alphabetically by last name; the rest use manual order.
const ALPHA_GROUPS = new Set<string>(["Researchers", "Alumni"]);

/** People grouped and ordered: current groups first, then Alumni. */
export async function getGroupedPeople() {
  const people = await getCollection("people");
  return GROUP_ORDER.map((group) => ({
    group,
    people: people
      .filter((p) => p.data.group === group)
      .sort(ALPHA_GROUPS.has(group) ? bySurname : byOrder),
  })).filter((g) => g.people.length > 0);
}

/** Publications newest-first. */
export async function getPublications() {
  const pubs = await getCollection("publications");
  return pubs.sort(
    (a, b) => b.data.year - a.data.year || a.data.title.localeCompare(b.data.title),
  );
}

/** Only rights-confirmed figures may ever be rendered (hard gate). */
export async function getConfirmedFigures() {
  const figs = await getCollection("figures");
  return figs
    .filter((f) => f.data.rightsConfirmed === true)
    .sort((a, b) => a.data.order - b.data.order);
}

/** Rights-confirmed figures grouped by their publication, ordered for display. */
export async function getFiguresByPaper() {
  const figs = await getConfirmedFigures();
  const pubById = new Map((await getCollection("publications")).map((p) => [p.id, p]));
  const groups = new Map<string, { paper: Publication; figures: Figure[]; order: number }>();
  for (const f of figs) {
    const id = f.data.paper.id;
    const paper = pubById.get(id);
    if (!paper) continue;
    if (!groups.has(id)) groups.set(id, { paper, figures: [], order: f.data.order });
    groups.get(id)!.figures.push(f);
  }
  // Order a paper's figures by figure number parsed from the legend (Figure 2,
  // 5, 9, …); a graphical abstract (no number) leads, anything unparsed trails.
  const figNum = (caption: string) => {
    const m = /^\s*fig(?:ure)?\.?\s*(\d+)/i.exec(caption);
    if (m) return Number(m[1]);
    if (/graphical abstract/i.test(caption)) return 0;
    return Number.POSITIVE_INFINITY;
  };
  const arr = [...groups.values()];
  for (const g of arr) g.figures.sort((a, b) => figNum(a.data.caption) - figNum(b.data.caption));
  // Papers chronological, most recent first.
  arr.sort((a, b) => b.paper.data.year - a.paper.data.year || a.order - b.order);
  return arr;
}

// --- author <-> person matching (best-effort, for profile pages) -----------

const normAlpha = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

export interface PersonKey {
  initial: string;
  last: string;
}

export function personKey(name: string): PersonKey {
  const base = name.split(",")[0].trim(); // drop trailing credentials
  const toks = base.split(/\s+/);
  return {
    initial: (normAlpha(toks[0])[0] || ""),
    last: normAlpha(toks[toks.length - 1] || ""),
  };
}

/** Does a CV-style author string ("Miller GN", "Ortega-Marquez J") name this person? */
export function authorIsPerson(author: string, pk: PersonKey): boolean {
  if (!pk.last) return false;
  const m = author.trim().match(/^(.*?)\s+([A-Za-z]{1,4})$/);
  const wholeLast = normAlpha(m ? m[1] : author);
  const initials = m ? m[2].toLowerCase() : "";
  const lastOk = wholeLast.includes(pk.last);
  const initialOk = !pk.initial || !initials || initials[0] === pk.initial;
  return lastOk && initialOk;
}

/** Publications authored by a person, newest-first (best-effort name match). */
export function publicationsForPerson(person: Person, pubs: Publication[]) {
  const pk = personKey(person.data.name);
  return pubs.filter((p) => p.data.authors.some((a) => authorIsPerson(a, pk)));
}

// Per the PI: every profiled lab member EXCEPT the PI and faculty is a mentee.
// Deriving mentee status from membership (not CV ** tags) keeps it correct even
// when the CV's tagging drifts.
export const NON_MENTEE_SLUGS = new Set(["a-cohen", "j-peters"]);

/** Build an `isMentee(authorString)` predicate from the people collection. */
export function menteeMatcher(people: Person[]) {
  const dir = people.map((p) => ({ slug: p.id, key: personKey(p.data.name) }));
  return (author: string) => {
    const d = dir.find((x) => authorIsPerson(author, x.key));
    return !!d && !NON_MENTEE_SLUGS.has(d.slug);
  };
}

const menteeLed = (p: Publication, isMentee: (a: string) => boolean) =>
  isMentee(p.data.authors[0] ?? "");

/**
 * Featured predicate: a mentee-led paper, or a Cohen first/senior paper from
 * 2019 on. Mentee status is membership-derived (see menteeMatcher).
 */
export function featuredMatcher(people: Person[]) {
  const isMentee = menteeMatcher(people);
  return (p: Publication) => {
    // Letters and reviews aren't "featured" primary research on the homepage.
    if (p.data.areas.includes("letter") || p.data.areas.includes("review")) return false;
    return menteeLed(p, isMentee) || (p.data.cohenFirstOrSenior && p.data.year >= 2019);
  };
}

/** Sort featured papers: mentee-led first, then most recent. */
export function featuredSorter(people: Person[]) {
  const isMentee = menteeMatcher(people);
  return (a: Publication, b: Publication) => {
    const diff = Number(menteeLed(b, isMentee)) - Number(menteeLed(a, isMentee));
    return diff || b.data.year - a.data.year;
  };
}

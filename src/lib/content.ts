import { getCollection, type CollectionEntry } from "astro:content";

export type Person = CollectionEntry<"people">;
export type Publication = CollectionEntry<"publications">;
export type Figure = CollectionEntry<"figures">;

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

/** People grouped and ordered: current groups first, then Alumni. */
export async function getGroupedPeople() {
  const people = await getCollection("people");
  return GROUP_ORDER.map((group) => ({
    group,
    people: people.filter((p) => p.data.group === group).sort(byOrder),
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
  const arr = [...groups.values()];
  for (const g of arr) g.figures.sort((a, b) => a.id.localeCompare(b.id));
  arr.sort((a, b) => a.order - b.order || b.paper.data.year - a.paper.data.year);
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
  return (p: Publication) =>
    menteeLed(p, isMentee) || (p.data.cohenFirstOrSenior && p.data.year >= 2019);
}

/** Sort featured papers: mentee-led first, then most recent. */
export function featuredSorter(people: Person[]) {
  const isMentee = menteeMatcher(people);
  return (a: Publication, b: Publication) => {
    const diff = Number(menteeLed(b, isMentee)) - Number(menteeLed(a, isMentee));
    return diff || b.data.year - a.data.year;
  };
}

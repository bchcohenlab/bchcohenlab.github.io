// Site-wide singletons (identity, contact, social, navigation).
// Kept here rather than in a content collection so layout components can
// import them directly. Address is intentionally deferred to the Contact
// page pending PI confirmation (Longwood vs. Brookline Place).

export interface NavItem {
  label: string;
  href: string;
}

export interface SiteConfig {
  name: string;
  shortName: string;
  pi: string;
  institution: string;
  university: string;
  url: string;
  description: string;
  email: string;
  phone: string;
  address: string[];
  mapQuery: string;
  social: {
    scholar?: string;
    twitter?: string;
    github?: string;
  };
  nav: NavItem[];
}

export const site: SiteConfig = {
  name: "Cohen Laboratory of Translational Neuroimaging",
  shortName: "Cohen Lab",
  pi: "Alexander Li Cohen, MD, PhD",
  institution: "Boston Children's Hospital",
  university: "Harvard Medical School",
  url: "https://bchcohenlab.com",
  description:
    "We use causal neuroimaging — brain lesions and pharmaco-fMRI — to map the " +
    "circuits behind autism and ADHD symptoms, then pilot non-invasive " +
    "neuromodulation (TMS and real-time fMRI neurofeedback) to support rapid clinical trials.",
  email: "CohenLab@childrens.harvard.edu",
  phone: "617-355-6388",
  address: [
    "Cohen Laboratory of Translational Neuroimaging",
    "Boston Children's Hospital",
    "Two Brookline Place, BC525.5",
    "Brookline, MA 02445",
  ],
  mapQuery: "Two Brookline Place, Brookline, MA 02445",
  social: {
    scholar: "https://scholar.google.com/citations?user=P9Z-BEcAAAAJ&hl=en",
    twitter: "https://twitter.com/DrDrXanderli",
    github: "https://github.com/alexlicohen",
  },
  nav: [
    { label: "People", href: "/people" },
    { label: "Research", href: "/research" },
    { label: "Publications", href: "/publications" },
    { label: "Figures", href: "/figures" },
    { label: "Contact", href: "/contact" },
  ],
};

/**
 * Which universities Honk knows about.
 *
 * One registry, no database table. A school is a handful of constants — a
 * name, the email domains that prove you go there, and how to get a schedule
 * out of its portal — and every one of those is a code change anyway, since
 * turning a school on means teaching the parser its format. Putting them in
 * Postgres would buy an admin UI nobody is going to build and cost a query on
 * every sign-in.
 *
 * Pure and dependency-free, like the parser, so the same list renders on the
 * server, runs in the browser, and can be tested exhaustively.
 *
 * Adding a school:
 *  1. Add a row below with `status: "live"` and its root email domain.
 *  2. Give it a `guide` — the steps someone actually follows in their portal.
 *  3. Point `parser` at the format its portal produces.
 *  4. Get one real paste from a student there and add it to the parser tests.
 *
 * Step 4 is the one that matters. Everything else is typing.
 */

import { isOutOfBeta } from "./schools-out-of-beta";

export type SchoolStatus = "live" | "waitlist";

/**
 * Which parser reads this portal's output.
 *
 * `peoplesoft` is Oracle Campus Solutions, which Waterloo brands Quest and
 * McMaster brands Mosaic. The two produce the same List View down to the
 * column headings, so they share a parser that has been checked against real
 * pastes.
 *
 * `generic` is the tolerant fallback: it finds course codes and day/time runs
 * anywhere in the text rather than expecting a fixed table. It is what reads
 * York's REM, Brock's Self Serve and Guelph-Humber's Student Planning, none of
 * which lay their pages out the same way.
 */
export type ParserId = "peoplesoft" | "generic";

export interface PasteGuide {
  /** What the portal is called on that campus. Students know the brand name. */
  portal: string;
  /**
   * How to get to the schedule page. Navigation only — the copy step is added
   * to every guide by `withCopyStep`, so it cannot be worded differently at one
   * school or forgotten at a new one.
   */
  steps: string[];
  /** Said out loud when Honk has not seen many real pastes from here yet. */
  note?: string;
}

/**
 * The last step at every school, written once.
 *
 * "Select the whole page and copy it" is what a person who already knows how
 * to do this reads as obvious and what everybody else reads as vague. The
 * keystrokes are the instruction — naming them is the difference between a
 * student copying the page and a student copying the one line they happened to
 * drag over, which parses as an empty schedule and looks like Honk is broken.
 *
 * Both platforms named, because a Mac has no Ctrl+A and being told to press a
 * key that does nothing is worse than being told nothing.
 */
const COPY_STEP =
  "Press Ctrl+A then Ctrl+C to select and copy the whole page — ⌘A then ⌘C on a Mac — and paste it above.";

/** Every guide ends the same way. */
function withCopyStep(guide: PasteGuide): PasteGuide {
  return { ...guide, steps: [...guide.steps, COPY_STEP] };
}

/**
 * True of every portal here, so it is said once rather than per school.
 *
 * No student information system in the country renders a class schedule page
 * on a phone — they either have no mobile view or drop the schedule from it.
 * Somebody trying this on their phone will get an empty box and conclude Honk
 * does not work, which is the wrong conclusion and an expensive one.
 */
export const LAPTOP_ONLY_NOTE =
  "Laptop only — no student portal shows a class schedule page on a phone.";

export interface School {
  id: string;
  name: string;
  short: string;
  province: string;
  status: SchoolStatus;
  /**
   * True until somebody has proved Honk can read this school's portal.
   *
   * Computed, never written by hand — the switch is the list in
   * `schools-out-of-beta.ts`, which is the one file to edit when a school
   * graduates. See that file for what the bar actually is.
   */
  beta: boolean;
  /**
   * Root email domains. An address matches when its domain is one of these or
   * a subdomain of one, so `@my.yorku.ca`, `@mail.utoronto.ca` and
   * `@edu.uwaterloo.ca` all land on the right school without listing every
   * variant a registrar has ever issued.
   */
  domains: string[];
  /**
   * Where a matched address is stored. Usernames are unique per institution in
   * all of these systems, so folding a subdomain onto the root is what stops
   * one person ending up with two accounts and half a schedule in each.
   */
  canonicalDomain: string;
  /** Schools straddle four time zones; "free right now" has to know. */
  timezone: string;
  parser: ParserId;
  guide?: PasteGuide;
}

/**
 * Live schools, in the order they were switched on.
 *
 * Waterloo first because that is where Honk was built and where the parser has
 * actually seen real pastes. Everything after it is inferred from its portal's
 * documentation and carries a beta tag until a real paste says otherwise —
 * which is what `schools-out-of-beta.ts` is for.
 *
 * Ontario-heavy on purpose: cross-campus friends are only interesting when the
 * two campuses are close enough that "we are both free Thursday afternoon"
 * leads somewhere. UBC is the exception and earns its place differently — it
 * is where a Waterloo student's friends go when they go far.
 */
const LIVE: Array<Omit<School, "beta">> = [
  {
    id: "waterloo",
    name: "University of Waterloo",
    short: "Waterloo",
    province: "ON",
    status: "live",
    domains: ["uwaterloo.ca"],
    canonicalDomain: "uwaterloo.ca",
    timezone: "America/Toronto",
    parser: "peoplesoft",
    guide: {
      portal: "Quest",
      steps: [
        "Open Quest and go to Enroll → My Class Schedule.",
        "Switch to List View.",
      ],
    },
  },
  {
    id: "laurier",
    name: "Wilfrid Laurier University",
    short: "Laurier",
    province: "ON",
    status: "live",
    // Students are issued @mylaurier.ca; staff and alumni keep @wlu.ca.
    domains: ["mylaurier.ca", "wlu.ca"],
    canonicalDomain: "mylaurier.ca",
    timezone: "America/Toronto",
    parser: "generic",
    guide: {
      portal: "LORIS",
      steps: [
        "Sign in to LORIS from the Laurier portal.",
        "Open Student Services → Registration → Student Detail Schedule.",
      ],
      note: "Laurier and Waterloo share a term, so a double-degree schedule from both pastes fine — do them one after the other.",
    },
  },
  {
    id: "toronto",
    name: "University of Toronto",
    short: "Toronto",
    province: "ON",
    status: "live",
    domains: ["utoronto.ca"],
    canonicalDomain: "utoronto.ca",
    timezone: "America/Toronto",
    parser: "generic",
    guide: {
      portal: "ACORN",
      steps: [
        "Open ACORN and sign in with your UTORid.",
        "Go to Academics → Timetable and pick the term.",
      ],
    },
  },
  {
    id: "western",
    name: "Western University",
    short: "Western",
    province: "ON",
    status: "live",
    domains: ["uwo.ca"],
    canonicalDomain: "uwo.ca",
    timezone: "America/Toronto",
    // Western runs PeopleSoft, the same product as Quest and Mosaic.
    parser: "peoplesoft",
    guide: {
      portal: "Student Center",
      steps: [
        "Sign in to Student Center from the Western portal.",
        "Open My Academics → My Class Schedule and pick the term.",
        "Switch to List View.",
      ],
    },
  },
  {
    id: "mcmaster",
    name: "McMaster University",
    short: "McMaster",
    province: "ON",
    status: "live",
    domains: ["mcmaster.ca"],
    canonicalDomain: "mcmaster.ca",
    timezone: "America/Toronto",
    parser: "peoplesoft",
    guide: {
      portal: "Mosaic",
      steps: [
        "Open Mosaic and go to Student Center → Weekly Schedule.",
        "Switch to List View.",
      ],
      note: "Mosaic and Quest are the same system underneath, so Honk reads this one well.",
    },
  },
  {
    id: "queens",
    name: "Queen's University",
    short: "Queen's",
    province: "ON",
    status: "live",
    domains: ["queensu.ca"],
    canonicalDomain: "queensu.ca",
    timezone: "America/Toronto",
    // SOLUS is PeopleSoft too, so it gets the parser with real pastes behind it.
    parser: "peoplesoft",
    guide: {
      portal: "SOLUS",
      steps: [
        "Open SOLUS from the Queen's portal.",
        "Go to Enrolment → My Class Schedule and pick the term.",
        "Switch to List View.",
      ],
    },
  },
  {
    id: "ubc",
    name: "University of British Columbia",
    short: "UBC",
    province: "BC",
    status: "live",
    domains: ["ubc.ca"],
    canonicalDomain: "ubc.ca",
    /*
     * The first school Honk runs at outside Eastern time, which turns the
     * time-zone shift in `overlap/queries.ts` from dormant code into load-
     * bearing code. A UBC student's 9am Monday is a Waterloo friend's noon.
     */
    timezone: "America/Vancouver",
    parser: "generic",
    guide: {
      portal: "Workday",
      steps: [
        "Sign in to Workday and open the Academics app.",
        "Go to Registration & Courses → View My Courses, or open your Schedule.",
      ],
      note: "Workday is unlike every other portal here, so this is the one most likely to need a fix. Send the paste if it comes out wrong.",
    },
  },
  {
    id: "york",
    name: "York University",
    short: "York",
    province: "ON",
    status: "live",
    domains: ["yorku.ca"],
    canonicalDomain: "yorku.ca",
    timezone: "America/Toronto",
    parser: "generic",
    guide: {
      portal: "REM",
      steps: [
        "Sign in to My Online Services with your Passport York account.",
        "Open Manage My Enrolment → Registration and Enrolment Module, then Plot My Timetable.",
      ],
      note: "Visual Schedule Builder works too — copy the list underneath the grid, not the grid.",
    },
  },
  {
    id: "guelphhumber",
    name: "University of Guelph-Humber",
    short: "Guelph-Humber",
    province: "ON",
    status: "live",
    domains: ["guelphhumber.ca"],
    canonicalDomain: "guelphhumber.ca",
    timezone: "America/Toronto",
    parser: "generic",
    guide: {
      portal: "WebAdvisor",
      steps: [
        "Open WebAdvisor and sign in, then go to Academics → Student Planning.",
        "Open Plan, Schedule, Register & Drop and pick the term.",
      ],
    },
  },
  {
    id: "brock",
    name: "Brock University",
    short: "Brock",
    province: "ON",
    status: "live",
    domains: ["brocku.ca"],
    canonicalDomain: "brocku.ca",
    timezone: "America/Toronto",
    parser: "generic",
    guide: {
      portal: "my.brocku.ca",
      steps: [
        "Sign in to my.brocku.ca and open the Applicant and Student Self Serve tab.",
        "Open your timetable for the term from the menu on the left.",
      ],
    },
  },
];

/**
 * Everywhere else, in waiting.
 *
 * These are not dead entries. An address from one of them is recognised at
 * sign-in and gets a real answer — the school's own name, and the offer to be
 * the person who turns it on — rather than "that isn't a valid address". A
 * student who typed their address is the highest-intent person Honk will ever
 * see, and the sign-in form is the wrong place to lose them.
 *
 * Only `domains` and the name are needed here. The guide and the parser get
 * written when somebody actually shows up with a paste.
 */
const WAITLIST: Array<
  Omit<School, "status" | "parser" | "canonicalDomain" | "timezone" | "beta"> & {
    timezone?: string;
  }
> = [
  { id: "ottawa", name: "University of Ottawa", short: "Ottawa", province: "ON", domains: ["uottawa.ca"] },
  { id: "carleton", name: "Carleton University", short: "Carleton", province: "ON", domains: ["carleton.ca"] },
  { id: "tmu", name: "Toronto Metropolitan University", short: "TMU", province: "ON", domains: ["torontomu.ca", "ryerson.ca"] },
  { id: "guelph", name: "University of Guelph", short: "Guelph", province: "ON", domains: ["uoguelph.ca"] },
  { id: "windsor", name: "University of Windsor", short: "Windsor", province: "ON", domains: ["uwindsor.ca"] },
  { id: "ontariotech", name: "Ontario Tech University", short: "Ontario Tech", province: "ON", domains: ["ontariotechu.net", "ontariotechu.ca"] },
  { id: "trent", name: "Trent University", short: "Trent", province: "ON", domains: ["trentu.ca"] },
  { id: "lakehead", name: "Lakehead University", short: "Lakehead", province: "ON", domains: ["lakeheadu.ca"] },
  { id: "laurentian", name: "Laurentian University", short: "Laurentian", province: "ON", domains: ["laurentian.ca"] },
  { id: "nipissing", name: "Nipissing University", short: "Nipissing", province: "ON", domains: ["nipissingu.ca"] },
  { id: "algoma", name: "Algoma University", short: "Algoma", province: "ON", domains: ["algomau.ca"] },
  { id: "ocad", name: "OCAD University", short: "OCAD", province: "ON", domains: ["ocadu.ca"] },
  { id: "mcgill", name: "McGill University", short: "McGill", province: "QC", domains: ["mcgill.ca"] },
  { id: "concordia", name: "Concordia University", short: "Concordia", province: "QC", domains: ["concordia.ca"] },
  { id: "montreal", name: "Université de Montréal", short: "Montréal", province: "QC", domains: ["umontreal.ca"] },
  { id: "laval", name: "Université Laval", short: "Laval", province: "QC", domains: ["ulaval.ca"] },
  { id: "sherbrooke", name: "Université de Sherbrooke", short: "Sherbrooke", province: "QC", domains: ["usherbrooke.ca"] },
  { id: "uqam", name: "Université du Québec à Montréal", short: "UQAM", province: "QC", domains: ["uqam.ca"] },
  { id: "bishops", name: "Bishop's University", short: "Bishop's", province: "QC", domains: ["ubishops.ca"] },
  { id: "sfu", name: "Simon Fraser University", short: "SFU", province: "BC", domains: ["sfu.ca"], timezone: "America/Vancouver" },
  { id: "uvic", name: "University of Victoria", short: "UVic", province: "BC", domains: ["uvic.ca"], timezone: "America/Vancouver" },
  { id: "unbc", name: "University of Northern British Columbia", short: "UNBC", province: "BC", domains: ["unbc.ca"], timezone: "America/Vancouver" },
  { id: "tru", name: "Thompson Rivers University", short: "TRU", province: "BC", domains: ["tru.ca", "mytru.ca"], timezone: "America/Vancouver" },
  { id: "ufv", name: "University of the Fraser Valley", short: "UFV", province: "BC", domains: ["ufv.ca"], timezone: "America/Vancouver" },
  { id: "kpu", name: "Kwantlen Polytechnic University", short: "KPU", province: "BC", domains: ["kpu.ca"], timezone: "America/Vancouver" },
  { id: "viu", name: "Vancouver Island University", short: "VIU", province: "BC", domains: ["viu.ca"], timezone: "America/Vancouver" },
  { id: "alberta", name: "University of Alberta", short: "Alberta", province: "AB", domains: ["ualberta.ca"], timezone: "America/Edmonton" },
  { id: "calgary", name: "University of Calgary", short: "Calgary", province: "AB", domains: ["ucalgary.ca"], timezone: "America/Edmonton" },
  { id: "lethbridge", name: "University of Lethbridge", short: "Lethbridge", province: "AB", domains: ["uleth.ca"], timezone: "America/Edmonton" },
  { id: "mountroyal", name: "Mount Royal University", short: "Mount Royal", province: "AB", domains: ["mtroyal.ca"], timezone: "America/Edmonton" },
  { id: "macewan", name: "MacEwan University", short: "MacEwan", province: "AB", domains: ["macewan.ca"], timezone: "America/Edmonton" },
  { id: "athabasca", name: "Athabasca University", short: "Athabasca", province: "AB", domains: ["athabascau.ca"], timezone: "America/Edmonton" },
  { id: "saskatchewan", name: "University of Saskatchewan", short: "Saskatchewan", province: "SK", domains: ["usask.ca"], timezone: "America/Regina" },
  { id: "regina", name: "University of Regina", short: "Regina", province: "SK", domains: ["uregina.ca"], timezone: "America/Regina" },
  { id: "manitoba", name: "University of Manitoba", short: "Manitoba", province: "MB", domains: ["umanitoba.ca", "myumanitoba.ca"], timezone: "America/Winnipeg" },
  { id: "winnipeg", name: "University of Winnipeg", short: "Winnipeg", province: "MB", domains: ["uwinnipeg.ca"], timezone: "America/Winnipeg" },
  { id: "brandon", name: "Brandon University", short: "Brandon", province: "MB", domains: ["brandonu.ca"], timezone: "America/Winnipeg" },
  { id: "dalhousie", name: "Dalhousie University", short: "Dalhousie", province: "NS", domains: ["dal.ca"], timezone: "America/Halifax" },
  { id: "smu", name: "Saint Mary's University", short: "Saint Mary's", province: "NS", domains: ["smu.ca"], timezone: "America/Halifax" },
  { id: "acadia", name: "Acadia University", short: "Acadia", province: "NS", domains: ["acadiau.ca"], timezone: "America/Halifax" },
  { id: "stfx", name: "St. Francis Xavier University", short: "StFX", province: "NS", domains: ["stfx.ca"], timezone: "America/Halifax" },
  { id: "cbu", name: "Cape Breton University", short: "Cape Breton", province: "NS", domains: ["cbu.ca"], timezone: "America/Halifax" },
  { id: "msvu", name: "Mount Saint Vincent University", short: "Mount Saint Vincent", province: "NS", domains: ["msvu.ca"], timezone: "America/Halifax" },
  { id: "unb", name: "University of New Brunswick", short: "UNB", province: "NB", domains: ["unb.ca"], timezone: "America/Halifax" },
  { id: "mta", name: "Mount Allison University", short: "Mount Allison", province: "NB", domains: ["mta.ca"], timezone: "America/Halifax" },
  { id: "stu", name: "St. Thomas University", short: "St. Thomas", province: "NB", domains: ["stu.ca"], timezone: "America/Halifax" },
  { id: "upei", name: "University of Prince Edward Island", short: "UPEI", province: "PE", domains: ["upei.ca"], timezone: "America/Halifax" },
  { id: "memorial", name: "Memorial University of Newfoundland", short: "Memorial", province: "NL", domains: ["mun.ca"], timezone: "America/St_Johns" },
];

/**
 * Every school Honk knows, live first.
 *
 * A waitlist row is a real `School` with the same shape, so nothing downstream
 * has to special-case it — the only difference is that `status` gates sign-in
 * and the parser is a guess until somebody proves it.
 */
export const SCHOOLS: School[] = [
  ...LIVE.map(
    (s): School => ({
      ...s,
      beta: !isOutOfBeta(s.id),
      guide: s.guide ? withCopyStep(s.guide) : undefined,
    }),
  ),
  ...WAITLIST.map(
    (s): School => ({
      ...s,
      status: "waitlist",
      canonicalDomain: s.domains[0],
      timezone: s.timezone ?? "America/Toronto",
      parser: "generic",
      // A school nobody can sign in to yet is beta by definition.
      beta: true,
    }),
  ),
];

export const LIVE_SCHOOLS: School[] = SCHOOLS.filter((s) => s.status === "live");
export const WAITLIST_SCHOOLS: School[] = SCHOOLS.filter((s) => s.status === "waitlist");

/** The school Honk was built at, and the fallback for a row written before schools existed. */
export const DEFAULT_SCHOOL_ID = "waterloo";

const BY_ID = new Map(SCHOOLS.map((s) => [s.id, s]));

export function getSchool(id: string | null | undefined): School | null {
  return (id && BY_ID.get(id)) || null;
}

/**
 * The school for a stored `school_id`, never null.
 *
 * Every user row has one, but an id can outlive a rename or arrive from an
 * older deploy, and a missing school must not blank out a page. Waterloo is
 * the fallback because it is what every row predating this file actually is.
 */
export function schoolOrDefault(id: string | null | undefined): School {
  return getSchool(id) ?? getSchool(DEFAULT_SCHOOL_ID)!;
}

export function isLive(id: string | null | undefined): boolean {
  return getSchool(id)?.status === "live";
}

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

/** Matches a domain against a root: equal, or a subdomain of it. */
function domainMatches(domain: string, root: string): boolean {
  return domain === root || domain.endsWith(`.${root}`);
}

export function schoolForDomain(domain: string): School | null {
  const d = domain.trim().toLowerCase();
  if (!d) return null;
  for (const school of SCHOOLS) {
    if (school.domains.some((root) => domainMatches(d, root))) return school;
  }
  return null;
}

export interface SchoolAddress {
  /** Lower-cased and folded onto the school's canonical domain. */
  email: string;
  school: School;
}

const ADDRESS_RE = /^([a-z0-9._%+-]+)@([a-z0-9.-]+)$/;

/**
 * Read an address as a school address.
 *
 * Returns the school whatever its status, so a caller can tell "we don't know
 * that university" from "we know it and it isn't switched on yet" — those are
 * completely different things to say to somebody. Only the caller decides
 * which statuses it will accept.
 */
export function parseSchoolAddress(raw: string): SchoolAddress | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  const match = ADDRESS_RE.exec(trimmed);
  if (!match) return null;
  const [, local, domain] = match;
  const school = schoolForDomain(domain);
  if (!school) return null;
  return { email: `${local}@${school.canonicalDomain}`, school };
}

/* ------------------------------------------------------------------ *
 * Copy helpers
 * ------------------------------------------------------------------ */

/** Every live school, spelled out. Only for places with room for all of them. */
export function liveSchoolList(): string {
  const names = LIVE_SCHOOLS.map((s) => s.short);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function liveSchoolCount(): number {
  return LIVE_SCHOOLS.length;
}

/**
 * "Waterloo, Laurier, Toronto and 7 more" — for the places prose has to fit.
 *
 * The full list was fine at five schools and is a mouthful at ten. It is on
 * the link-preview card, under the sign-in box and in the refusal an unknown
 * address gets, none of which have room to name every campus in the country —
 * and a reader stops parsing a list at about three anyway.
 */
export function liveSchoolSummary(max = 3): string {
  const names = LIVE_SCHOOLS.map((s) => s.short);
  if (names.length <= max + 1) return liveSchoolList();
  const shown = names.slice(0, max).join(", ");
  return `${shown} and ${names.length - max} more`;
}

/** Waitlist schools grouped by province, each group alphabetical. */
export function waitlistByProvince(): Array<{ province: string; schools: School[] }> {
  const order = ["ON", "QC", "BC", "AB", "SK", "MB", "NS", "NB", "PE", "NL"];
  const names: Record<string, string> = {
    ON: "Ontario",
    QC: "Quebec",
    BC: "British Columbia",
    AB: "Alberta",
    SK: "Saskatchewan",
    MB: "Manitoba",
    NS: "Nova Scotia",
    NB: "New Brunswick",
    PE: "Prince Edward Island",
    NL: "Newfoundland and Labrador",
  };
  return order
    .map((code) => ({
      province: names[code] ?? code,
      schools: WAITLIST_SCHOOLS.filter((s) => s.province === code).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }))
    .filter((group) => group.schools.length > 0);
}

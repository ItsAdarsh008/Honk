import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Always stored normalised and lower-case. Gated to @uwaterloo.ca. */
    email: text("email").notNull(),
    handle: text("handle"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    program: text("program"),
    termLevel: text("term_level"),
    /** Opt-in. A new user is in nobody's class roster until they turn this on. */
    discoverable: boolean("discoverable").notNull().default(false),
    /** Set once the discoverability prompt has been shown and answered. */
    privacyPromptedAt: timestamp("privacy_prompted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /**
     * Entra object id, when the account signed in with Waterloo rather than a
     * code. Immutable per user per tenant, which is why identity keys on it
     * and not on the address: a `preferred_username` can change, this cannot.
     * Null for accounts that only ever used an email code.
     */
    entraOid: text("entra_oid"),
    /**
     * scrypt of the five-digit PIN, salted per user. Null for an account that
     * only uses a passkey. See `auth/pin.ts` for the format, and for why five
     * digits is the right trade here despite being a small space.
     */
    pinHash: text("pin_hash"),
    /** Consecutive failed sign-ins, reset on success. Brute-force brake. */
    failedLogins: integer("failed_logins").notNull().default(0),
    /** Set once `failedLogins` crosses the limit; sign-in refuses until then. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_email_key").on(t.email),
    unique("users_handle_key").on(t.handle),
    unique("users_entra_oid_key").on(t.entraOid),
  ],
);

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

/**
 * Passkeys.
 *
 * A device-held credential, so signing in needs no email and no password. This
 * is what lets somebody get into Honk when the sending domain is being
 * throttled — the account is created by the passkey, not by a code arriving.
 *
 * Only the public key is stored, which is the point: a dump of this table lets
 * nobody sign in as anybody. `counter` is the authenticator's signature count,
 * kept so a cloned credential can be spotted.
 */
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Base64url, as the authenticator returns it. */
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    /** "internal", "hybrid", … — lets the browser hint at the right device. */
    transports: text("transports"),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("credentials_credential_id_key").on(t.credentialId),
    index("credentials_user_idx").on(t.userId),
  ],
);

/** Six-digit sign-in codes. Only the hash is stored. */
export const loginCodes = pgTable(
  "login_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    /** Coarse IP, used only for rate limiting. */
    requestIp: text("request_ip"),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_codes_email_idx").on(t.email, t.createdAt),
    index("login_codes_ip_idx").on(t.requestIp, t.createdAt),
  ],
);

/** Sessions live in the database; the cookie holds an opaque token. */
export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie token. The raw token is never stored. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ *
 * Academic data — shared across users, not per-user copies
 * ------------------------------------------------------------------ */

export const terms = pgTable("terms", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
});

export const courses = pgTable(
  "courses",
  {
    id: serial("id").primaryKey(),
    subject: text("subject").notNull(),
    catalog: text("catalog").notNull(),
    title: text("title"),
  },
  (t) => [unique("courses_subject_catalog_key").on(t.subject, t.catalog)],
);

/**
 * Two students in the same lecture point at the *same* row, keyed on
 * (term_code, class_number) which Quest guarantees unique. That is what makes
 * overlap an index lookup instead of a time-range comparison.
 */
export const sections = pgTable(
  "sections",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    termCode: text("term_code").notNull(),
    classNumber: integer("class_number").notNull(),
    sectionCode: text("section_code").notNull(),
    component: text("component").notNull(),
    instructor: text("instructor"),
    startDate: date("start_date"),
    endDate: date("end_date"),
  },
  (t) => [
    unique("sections_term_class_key").on(t.termCode, t.classNumber),
    index("sections_course_idx").on(t.courseId, t.termCode),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: serial("id").primaryKey(),
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    /** 1 = Monday ... 7 = Sunday */
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    location: text("location"),
  },
  (t) => [
    index("meetings_section_idx").on(t.sectionId),
    unique("meetings_unique_slot").on(t.sectionId, t.weekday, t.startMin, t.endMin),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    termCode: text("term_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.sectionId] }),
    index("enrollments_section_idx").on(t.sectionId),
    index("enrollments_user_term_idx").on(t.userId, t.termCode),
  ],
);

/* ------------------------------------------------------------------ *
 * Friend graph
 * ------------------------------------------------------------------ */

export const friendshipStatuses = ["pending", "accepted", "blocked"] as const;
export type FriendshipStatus = (typeof friendshipStatuses)[number];

/**
 * Stored as an ordered pair — `userAId` is always the lexicographically
 * smaller uuid — so a pair can exist only once no matter who asked first.
 * `requesterId` remembers the direction; `blockedById` remembers who blocked,
 * since only the blocker may undo it.
 */
export const friendships = pgTable(
  "friendships",
  {
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedById: uuid("blocked_by_id").references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().$type<FriendshipStatus>().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userAId, t.userBId] }),
    index("friendships_b_idx").on(t.userBId),
    index("friendships_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const coursesRelations = relations(courses, ({ many }) => ({
  sections: many(sections),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  course: one(courses, { fields: [sections.courseId], references: [courses.id] }),
  meetings: many(meetings),
  enrollments: many(enrollments),
}));

export const meetingsRelations = relations(meetings, ({ one }) => ({
  section: one(sections, { fields: [meetings.sectionId], references: [sections.id] }),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, { fields: [enrollments.userId], references: [users.id] }),
  section: one(sections, { fields: [enrollments.sectionId], references: [sections.id] }),
}));

export type User = typeof users.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;

/** Ordered-pair helper shared by every friendship query. */
export function orderedPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

export const NOW = sql`now()`;

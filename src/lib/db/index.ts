import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "./url";

/**
 * A single lazily-created connection pool. Next.js reloads modules in dev, so
 * the client is cached on globalThis to avoid exhausting Postgres connections.
 */
const globalForDb = globalThis as unknown as {
  honkSql?: ReturnType<typeof postgres>;
};

function connectionString(): string {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres database.",
    );
  }
  return url;
}

export function getSql() {
  if (!globalForDb.honkSql) {
    globalForDb.honkSql = postgres(connectionString(), { max: 5 });
  }
  return globalForDb.honkSql;
}

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;

export function getDb(): Db {
  if (!cached) cached = drizzle(getSql(), { schema });
  return cached;
}

/** True when persistence is configured at all. Screens degrade rather than crash. */
export function hasDatabase(): boolean {
  return databaseUrl() !== null;
}

export { schema };

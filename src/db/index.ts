import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// The connection is created lazily so `next build` succeeds even when
// DATABASE_URL is not configured (e.g. a Vercel deployment that only uses
// live contract mode). The error surfaces only when a mirror query actually
// runs without a database.
const globalForDb = globalThis as typeof globalThis & {
  __modelGuardPool?: Pool;
  __modelGuardDb?: NodePgDatabase;
};

function createDatabase(): NodePgDatabase {
  if (globalForDb.__modelGuardDb) {
    return globalForDb.__modelGuardDb;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for the localnet mirror API (demo mode). Live contract mode does not need a database.",
    );
  }
  globalForDb.__modelGuardPool ??= new Pool({
    connectionString: databaseUrl,
  });
  globalForDb.__modelGuardDb = drizzle(globalForDb.__modelGuardPool);
  return globalForDb.__modelGuardDb;
}

export const db = new Proxy({} as NodePgDatabase, {
  get(_target, property) {
    const instance = createDatabase();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export const pool = new Proxy({} as Pool, {
  get(_target, property) {
    createDatabase();
    const instance = globalForDb.__modelGuardPool as Pool;
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

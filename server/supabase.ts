import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

export let db: ReturnType<typeof drizzle> | null = null;

// Build the list of connection candidates. We prefer DATABASE_URL when it
// looks like a real postgres connection string, but if it isn't (or it fails),
// we fall back to building one from PG* variables — which Replit's managed
// PostgreSQL always sets correctly.
function buildCandidates(): string[] {
  const candidates: string[] = [];
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//i.test(url)) {
    candidates.push(url);
  }
  const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
  if (PGUSER && PGPASSWORD && PGHOST && PGDATABASE) {
    const port = PGPORT || '5432';
    const built = `postgres://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${port}/${PGDATABASE}`;
    if (!candidates.includes(built)) candidates.push(built);
  }
  return candidates;
}

// Initialize the database connection — exported promise so storage.ts can await it
export const dbReady: Promise<void> = (async () => {
  const candidates = buildCandidates();
  if (candidates.length === 0) {
    console.warn('No PostgreSQL connection info found, using in-memory storage');
    return;
  }

  for (let i = 0; i < candidates.length; i++) {
    const connStr = candidates[i];
    const safeHost = (() => {
      try { return new URL(connStr).host; } catch { return 'unknown'; }
    })();
    try {
      console.log(`Connecting to PostgreSQL database at ${safeHost}...`);
      const client = postgres(connStr, {
        max: 5,
        idle_timeout: 20,
        connect_timeout: 10,
        max_lifetime: 60 * 30,
      });

      const candidate = drizzle(client, { schema });
      await candidate.execute('SELECT 1');
      db = candidate;
      console.log(`Successfully connected to PostgreSQL database at ${safeHost}`);
      return;
    } catch (error: any) {
      console.warn(`Database connection to ${safeHost} failed (${error.message})`);
      if (i === candidates.length - 1) {
        console.warn('All connection attempts failed, falling back to in-memory storage');
        db = null;
      }
    }
  }
})();

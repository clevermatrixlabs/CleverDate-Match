import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

export let db: ReturnType<typeof drizzle> | null = null;

// Initialize the database connection — exported promise so storage.ts can await it
export const dbReady: Promise<void> = (async () => {
  if (!process.env.DATABASE_URL) {
    console.warn('No DATABASE_URL found, using in-memory storage');
    return;
  }

  try {
    console.log('Connecting to PostgreSQL database...');
    const client = postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 30,
    });

    const candidate = drizzle(client, { schema });

    // Test with a lightweight query to confirm the connection works
    await candidate.execute('SELECT 1');
    db = candidate;
    console.log('Successfully connected to PostgreSQL database');
  } catch (error: any) {
    console.warn(`Database connection failed (${error.message}), falling back to in-memory storage`);
    db = null;
  }
})();

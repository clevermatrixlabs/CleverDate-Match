import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

export let db: ReturnType<typeof drizzle> | null = null;

// Initialize the database connection
(async () => {
  console.log('Connecting to Supabase PostgreSQL database...');

  try {
    // If there's a DATABASE_URL in the environment, use it
    if (process.env.DATABASE_URL) {
      const client = postgres(process.env.DATABASE_URL, {
        max: 5, // Maximum number of connections
        idle_timeout: 20, // Close connections after 20 seconds of inactivity
        connect_timeout: 10, // Connection timeout of 10 seconds
        max_lifetime: 60 * 30 // Connection lifetime of 30 minutes
      });

      db = drizzle(client, { schema });
      console.log('Successfully connected to Supabase PostgreSQL database');
    } else {
      console.warn('No DATABASE_URL found in environment, database features will be disabled');
    }
  } catch (error) {
    console.error('Failed to connect to database:', error);
  }
})();
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

const databaseUrl = process.env.DATABASE_URL;
let db: ReturnType<typeof drizzle> | null = null;

if (databaseUrl) {
  try {
    console.log("Connecting to Supabase PostgreSQL database...");

    const client = postgres(databaseUrl, { 
      prepare: false,
      max: 10
    });

    db = drizzle(client, { schema });
    console.log("Successfully connected to Supabase PostgreSQL database");
  } catch (err) {
    console.error("Failed to connect to Supabase PostgreSQL database:", err);
    console.log("Using in-memory storage as fallback");
  }
} else {
  console.log("DATABASE_URL not found. Using in-memory storage");
}

export { db };

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Check if DATABASE_URL is available
const databaseUrl = process.env.DATABASE_URL;

// Initialize database connection if URL is available
let db: ReturnType<typeof drizzle> | null = null;

if (databaseUrl) {
  try {
    // Log database connection attempt
    console.log("Connecting to Supabase PostgreSQL database...");
    
    // Create postgres client with improved connection settings
    const client = postgres(databaseUrl, { 
      prepare: false,
      connect_timeout: 60, // Increased timeout
      max_retries: 5,      // Increased retries
      retry_interval: 3,   // Shorter interval between retries
      idle_timeout: 120,
      max_lifetime: 60 * 30,
      connection_limit: 10,
      connection_timeout: 60000, // Increased connection timeout
      keepalive: true
    });
    
    // Initialize drizzle with the client
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

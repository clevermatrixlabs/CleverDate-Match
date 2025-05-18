import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";

// Check for DATABASE_URL environment variable
if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not found in environment variables");
  console.warn("Please set up your Supabase connection string as explained in the README");
  console.warn("For now, using in-memory storage");
}

// Create database connection if DATABASE_URL is available
const connectionString = process.env.DATABASE_URL;
let client;
let db;

if (connectionString) {
  try {
    // Setup the PostgreSQL client with the connection string
    client = postgres(connectionString, { max: 10 });
    
    // Initialize Drizzle with the client and schema
    db = drizzle(client, { schema });
    
    console.log("Connected to Supabase database");
  } catch (error) {
    console.error("Failed to connect to Supabase database:", error);
    console.warn("Falling back to in-memory storage");
  }
}

export { db };

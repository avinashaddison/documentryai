import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

const clientPromise = client.connect();

export const db = drizzle({ client, schema, casing: "snake_case" });

export async function ensureDbConnected() {
  await clientPromise;
}

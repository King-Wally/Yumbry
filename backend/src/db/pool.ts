import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Multi-user create/update recipe calls each hold a client for the duration
  // of a transaction (see db/transaction.ts) — pg's default of 10 is tight
  // once several users write concurrently.
  max: 20,
});

/**
 * PostgreSQL client for local hosting (replaces Supabase).
 * Uses DATABASE_URL from .env.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || !url.startsWith("postgres")) {
  console.error("Missing or invalid DATABASE_URL (e.g. postgresql://user:pass@localhost:5432/emtesseract_ops)");
  process.exit(1);
}

export const pool = new pg.Pool({ connectionString: url });

/** Run a query; returns { rows, rowCount, error } */
export async function query(sql, params = []) {
  try {
    const res = await pool.query(sql, params);
    return { rows: res.rows, rowCount: res.rowCount, error: null };
  } catch (err) {
    return { rows: null, rowCount: 0, error: err };
  }
}

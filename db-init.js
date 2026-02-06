import { pool } from "./db.js";

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price_usd NUMERIC NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qrs (
      id UUID PRIMARY KEY,
      product_id INTEGER REFERENCES products(id),
      value_usd NUMERIC NOT NULL,
      used BOOLEAN DEFAULT false,
      used_at TIMESTAMP,
      wallet TEXT
    );
  `);

  console.log("📦 Base de datos lista");
}

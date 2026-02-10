import express from "express";
import pkg from "pg";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = "https://galapagos-backend-1.onrender.com";
const TOKEN_PRICE_USD = 0.000001; // precio actual (ajustable)

// -------------------- DB INIT --------------------
await pool.query(`
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  price_usd NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS qrs (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
`);

console.log("✅ DB inicializada");

// -------------------- ADMIN: CREAR PRODUCTO + QRS --------------------
app.post("/admin/create-product", async (req, res) => {
  try {
    const { name, price_usd, units, admin_token } = req.body;

    if (admin_token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!name || !price_usd || !units) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const productId = uuidv4();

    await pool.query(
      "INSERT INTO products(id,name,price_usd) VALUES ($1,$2,$3)",
      [productId, name, price_usd]
    );

    const qrs = [];

    for (let i = 0; i < units; i++) {
      const qrId = uuidv4();

      await pool.query(
        "INSERT INTO qrs(id,product_id) VALUES ($1,$2)",
        [qrId, productId]
      );

      const qrPath = `public/qrs/${qrId}.png`;
      await QRCode.toFile(qrPath, `${BASE_URL}/r/${qrId}`);

      qrs.push({
        id: qrId,
        url: `${BASE_URL}/qrs/${qrId}.png`
      });
    }

    res.json({ success: true, productId, units, qrs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------- API QR INFO (LO QUE FALTABA) --------------------
app.get("/api/qr/:id", async (req, res) => {
  const { id } = req.params;

  const r = await pool.query(`
    SELECT
      q.id,
      q.used,
      p.name,
      p.price_usd
    FROM qrs q
    JOIN products p ON p.id = q.product_id
    WHERE q.id = $1
  `, [id]);

  if (r.rows.length === 0) {
    return res.status(404).json({ error: "QR no existe" });
  }

  const row = r.rows[0];
  const rewardUsd = row.price_usd * 0.01;
  const tokens = rewardUsd / TOKEN_PRICE_USD;

  res.json({
    product: row.name,
    price_usd: row.price_usd,
    reward_usd: rewardUsd,
    tokens,
    used: row.used
  });
});

// -------------------- RECLAMAR (marca usado) --------------------
app.post("/api/claim/:id", async (req, res) => {
  const { id } = req.params;

  const r = await pool.query(
    "SELECT used FROM qrs WHERE id=$1",
    [id]
  );

  if (r.rows.length === 0) {
    return res.status(404).json({ error: "QR no existe" });
  }

  if (r.rows[0].used) {
    return res.status(400).json({ error: "QR ya reclamado" });
  }

  // 🔥 AQUÍ VA TU TRANSFERENCIA REAL SPL (Phantom / Solana)
  // ahora solo marcamos como usado

  await pool.query(
    "UPDATE qrs SET used=true WHERE id=$1",
    [id]
  );

  res.json({ success: true });
});

// -------------------- SERVIR PÁGINA QR --------------------
app.get("/r/:id", (req, res) => {
  res.sendFile(path.resolve("public/r.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log("🚀 Servidor corriendo en", PORT)
);

console.log("🔥 SERVER VERSION 2026-02-10 v3 — NO USED COLUMN 🔥");

import express from "express";
import cors from "cors";
import pkg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";

const { Pool } = pkg;
const app = express();

/* ---------- PATH ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- MIDDLEWARE ---------- */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ---------- DB ---------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ---------- CONFIG ---------- */
const BASE_URL = process.env.BASE_URL || "https://galapagos-backend-1.onrender.com";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const TOKEN_PRICE_USD = 0.000001;
const PORT = process.env.PORT || 10000;

/* =========================================================
   ADMIN
========================================================= */

/* LISTAR PRODUCTOS */
app.get("/admin/products", async (req, res) => {
  const r = await pool.query(`
    SELECT 
      p.id,
      p.name,
      p.price_usd,
      COUNT(q.id) AS total_qrs,
      COUNT(q.id) FILTER (WHERE q.claimed = true) AS claimed_qrs
    FROM products p
    LEFT JOIN qrs q ON q.product_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);

  res.json(r.rows);
});

/* CREAR PRODUCTO + QRS */
app.post("/admin/create-product", async (req, res) => {
  try {
    const token = req.headers["x-admin-token"];
    if (token !== ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, value, units } = req.body;
    if (!name || !value || !units) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const productId = uuidv4();

    await pool.query(
      "INSERT INTO products (id,name,price_usd,created_at) VALUES ($1,$2,$3,NOW())",
      [productId, name, value]
    );

    const qrs = [];

    for (let i = 0; i < units; i++) {
      const qrId = uuidv4();

      await pool.query(
        "INSERT INTO qrs (id,product_id,claimed) VALUES ($1,$2,false)",
        [qrId, productId]
      );

      await QRCode.toFile(
        `public/qrs/${qrId}.png`,
        `${BASE_URL}/r/${qrId}`
      );

      qrs.push({
        id: qrId,
        url: `${BASE_URL}/qrs/${qrId}.png`
      });
    }

    res.json({
      success: true,
      productId,
      units,
      qrs
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   QR INFO (MÓVIL / PHANTOM)
========================================================= */

app.get("/api/qr/:id", async (req, res) => {
  const { id } = req.params;

  const r = await pool.query(`
    SELECT 
      q.id,
      q.claimed,
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
  const rewardUsd = Number(row.price_usd) * 0.01;
  const tokens = rewardUsd / TOKEN_PRICE_USD;

  res.json({
    product: row.name,
    price_usd: row.price_usd,
    tokens,
    claimed: row.claimed
  });
});

/* =========================================================
   RECLAMAR QR
========================================================= */

app.post("/api/claim/:id", async (req, res) => {
  const { id } = req.params;

  const r = await pool.query(
    "SELECT claimed FROM qrs WHERE id = $1",
    [id]
  );

  if (r.rows.length === 0) {
    return res.status(404).json({ error: "QR no existe" });
  }

  if (r.rows[0].claimed) {
    return res.status(400).json({ error: "QR ya reclamado" });
  }

  await pool.query(
    "UPDATE qrs SET claimed = true, used_at = NOW() WHERE id = $1",
    [id]
  );

  res.json({ success: true });
});

/* =========================================================
   SERVIR PÁGINA QR
========================================================= */

app.get("/r/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "r.html"));
});

/* =========================================================
   START
========================================================= */

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});

import express from "express";
import pkg from "pg";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pkg;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static("public"));
app.use("/qrs", express.static("public/qrs"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = "https://galapagos-backend-1.onrender.com";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/* ========== ADMIN ========== */

app.get("/admin/products", async (req, res) => {
  const { rows } = await pool.query(`
    SELECT 
      p.id,
      p.name,
      p.price_usd,
      p.units,
      COUNT(q.id) FILTER (WHERE q.claimed = true) AS claimed
    FROM products p
    LEFT JOIN qrs q ON q.product_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  res.json(rows);
});

app.post("/admin/create-product", async (req, res) => {
  if (req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const name = req.body.name;
  const price = Number(req.body.value);
  const units = Number(req.body.units);

  if (!name || !price || !units || units <= 0) {
    return res.status(400).json({ error: "Invalid input", body: req.body });
  }

  const productId = uuidv4();

  await pool.query(
    `INSERT INTO products (id,name,price_usd,units,created_at)
     VALUES ($1,$2,$3,$4,NOW())`,
    [productId, name, price, units]
  );

  for (let i = 0; i < units; i++) {
    const qrId = uuidv4();

    await pool.query(
      `INSERT INTO qrs (id,product_id,created_at)
       VALUES ($1,$2,NOW())`,
      [qrId, productId]
    );

    await QRCode.toFile(
      `public/qrs/${qrId}.png`,
      `${BASE_URL}/r/${qrId}`
    );
  }

  res.json({ success: true });
});

/* ========== QR / CLAIM ========== */

app.get("/r/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public/claim.html"));
});

app.get("/api/qr/:id", async (req, res) => {
  const { rows } = await pool.query(`
    SELECT 
      q.id,
      q.claimed,
      p.name,
      p.price_usd
    FROM qrs q
    JOIN products p ON p.id = q.product_id
    WHERE q.id = $1
  `, [req.params.id]);

  if (!rows.length) return res.status(404).json({ error: "QR inválido" });
  res.json(rows[0]);
});

app.post("/api/qr/:id/claim", async (req, res) => {
  const r = await pool.query(
    "SELECT claimed FROM qrs WHERE id=$1",
    [req.params.id]
  );

  if (!r.rows.length) return res.status(404).json({ error: "QR no existe" });
  if (r.rows[0].claimed) return res.status(400).json({ error: "QR ya usado" });

  await pool.query(
    "UPDATE qrs SET claimed=true, used_at=NOW() WHERE id=$1",
    [req.params.id]
  );

  res.json({ success: true });
});

app.listen(process.env.PORT || 10000, () =>
  console.log("🚀 Backend listo y estable")
);

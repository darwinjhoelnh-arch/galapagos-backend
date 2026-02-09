import express from "express";
import cors from "cors";
import pg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = "https://galapagos-backend.onrender.com";
const ADMIN_TOKEN = "galapagos_admin_2026";

/* ---------------- ADMIN ---------------- */

app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(403).send("Forbidden");
  res.sendFile(path.join(__dirname, "public/admin.html"));
});

app.post("/admin/generate", async (req, res) => {
  const { product, value_usd, amount } = req.body;
  if (!product || !value_usd || !amount) return res.status(400).json({ error: "Datos inválidos" });

  const qrs = [];
  for (let i = 0; i < amount; i++) {
    const { rows } = await pool.query(
      "INSERT INTO qrs(product_name,value_usd) VALUES($1,$2) RETURNING id",
      [product, value_usd]
    );
    const id = rows[0].id;
    const claimUrl = `${BASE_URL}/claim/${id}`;
    const qr = await QRCode.toBuffer(claimUrl);
    qrs.push({ id, qr });
  }

  res.json({ ok: true });
});

app.get("/admin/stats", async (_, res) => {
  const total = await pool.query("SELECT COUNT(*) FROM qrs");
  const claimed = await pool.query("SELECT COUNT(*) FROM qrs WHERE claimed_at IS NOT NULL");
  res.json({
    total: total.rows[0].count,
    claimed: claimed.rows[0].count
  });
});

app.get("/admin/download/:product", async (req, res) => {
  const onlyNew = req.query.onlyNew === "1";
  const product = req.params.product;

  let sql = "SELECT id FROM qrs WHERE product_name=$1";
  if (onlyNew) sql += " AND downloaded=false";

  const { rows } = await pool.query(sql, [product]);
  if (!rows.length) return res.status(404).send("No QRs");

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=${product}.zip`);

  const archive = archiver("zip");
  archive.pipe(res);

  for (const r of rows) {
    const url = `${BASE_URL}/claim/${r.id}`;
    const img = await QRCode.toBuffer(url);
    archive.append(img, { name: `${product}/${r.id}.png` });
  }

  archive.finalize();
  await pool.query("UPDATE qrs SET downloaded=true WHERE product_name=$1", [product]);
});

/* ---------------- CLAIM (PHANTOM) ---------------- */

app.get("/claim/:id", async (req, res) => {
  res.sendFile(path.join(__dirname, "public/claim.html"));
});

app.get("/api/claim/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM qrs WHERE id=$1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "QR inválido" });
  res.json(rows[0]);
});

app.post("/api/claim/:id", async (req, res) => {
  await pool.query(
    "UPDATE qrs SET claimed_at=NOW(), wallet=$1 WHERE id=$2 AND claimed_at IS NULL",
    [req.body.wallet, req.params.id]
  );
  res.json({ ok: true });
});

app.get("/api/token-price", async (_, res) => {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
  const j = await r.json();
  res.json({ price: j.solana.usd });
});

/* ---------------- START ---------------- */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("RUNNING", PORT));

import express from "express";
import cors from "cors";
import path from "path";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const __dirname = path.resolve();
const BASE_URL = process.env.BASE_URL;

/* ================= DB INIT ================= */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      name TEXT,
      value_usd NUMERIC,
      units INT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS qrs (
      id UUID PRIMARY KEY,
      product_id UUID,
      used BOOLEAN DEFAULT FALSE,
      claimed_by TEXT,
      claimed_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS claims (
      id UUID PRIMARY KEY,
      qr_id UUID,
      wallet TEXT,
      reward_usd NUMERIC,
      token_price_usd NUMERIC,
      tokens NUMERIC,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
initDB();

/* ============ PRECIO REAL DEX ============ */
async function getTokenPriceUSD() {
  const MINT = "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump";
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${MINT}`
  );
  const data = await res.json();
  const pair = data.pairs.sort(
    (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
  )[0];
  return Number(pair.priceUsd);
}

/* ============ QR → PHANTOM ============ */
app.get("/r/:id", (req, res) => {
  const target = encodeURIComponent(`${BASE_URL}/claim/${req.params.id}`);
  res.send(`
<html><body style="background:#000;color:#fff;text-align:center;padding-top:80px">
<h3>Abriendo Phantom Wallet…</h3>
<a id="o" href="https://phantom.app/ul/browse/${target}">Abrir</a>
<script>setTimeout(()=>o.click(),800)</script>
</body></html>
  `);
});

/* ============ CLAIM PAGE ============ */
app.get("/claim/:id", (_, res) =>
  res.sendFile(path.join(__dirname, "public/claim.html"))
);

/* ============ CLAIM LOGIC ============ */
app.post("/claim/:id/sign", async (req, res) => {
  const { id } = req.params;
  const { publicKey } = req.body;

  const qr = await pool.query("SELECT * FROM qrs WHERE id=$1", [id]);
  if (!qr.rows[0] || qr.rows[0].used)
    return res.json({ error: "QR inválido" });

  const product = await pool.query(
    "SELECT * FROM products WHERE id=$1",
    [qr.rows[0].product_id]
  );

  const rewardUSD = Number(product.rows[0].value_usd) * 0.01;
  const priceUSD = await getTokenPriceUSD();
  const tokens = rewardUSD / priceUSD;

  await pool.query(
    "UPDATE qrs SET used=true, claimed_by=$1, claimed_at=NOW() WHERE id=$2",
    [publicKey, id]
  );

  await pool.query(
    "INSERT INTO claims VALUES ($1,$2,$3,$4,$5,$6)",
    [uuidv4(), id, publicKey, rewardUSD, priceUSD, tokens]
  );

  res.json({ success: true, rewardUSD, priceUSD, tokens });
});

/* ============ ADMIN ============ */
app.post("/admin/create-product", async (req, res) => {
  if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: "Unauthorized" });

  const { name, value, units } = req.body;
  const productId = uuidv4();

  await pool.query(
    "INSERT INTO products VALUES ($1,$2,$3,$4)",
    [productId, name, value, units]
  );

  const qrs = [];
  for (let i = 0; i < units; i++) {
    const qrId = uuidv4();
    await pool.query(
      "INSERT INTO qrs(id,product_id) VALUES ($1,$2)",
      [qrId, productId]
    );
    await QRCode.toFile(
      `public/qrs/${qrId}.png`,
      `${BASE_URL}/r/${qrId}`
    );
    qrs.push(qrId);
  }

  res.json({ productId, qrs });
});

app.listen(process.env.PORT || 8080);

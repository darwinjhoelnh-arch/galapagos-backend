import express from "express";
import cors from "cors";
import { Pool } from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = "https://galapagos-backend.onrender.com";

/* ================= HEALTH ================= */
app.get("/", (_, res) => res.send("OK"));

/* ================= QR → PHANTOM ================= */
app.get("/r/:id", (req, res) => {
  const url = `${BASE_URL}/claim/${req.params.id}`;
  const phantom = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
  res.redirect(302, phantom);
});

/* ================= CLAIM ================= */
app.get("/claim/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [req.params.id]
  );

  if (!rows.length) return res.send("QR inválido");
  if (rows[0].claimed_at) return res.send("QR ya usado");

  const rewardUsd = rows[0].value_usd * 0.01;

  let price = 0;
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=galapagos-token&vs_currencies=usd"
    );
    const j = await r.json();
    price = j["galapagos-token"]?.usd || 0;
  } catch {}

  const tokens = price ? (rewardUsd / price).toFixed(4) : "—";

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<script src="https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js"></script>
<style>
body{
  margin:0;
  background:radial-gradient(circle,#003828,#00140f);
  font-family:Arial;
  color:#eafff4;
}
.card{
  margin:40px auto;
  max-width:420px;
  background:#002b1f;
  padding:24px;
  border-radius:18px;
  text-align:center;
  box-shadow:0 0 40px #00ffb244;
}
img{width:120px;margin-bottom:10px}
button{
  background:#00ffb2;
  border:none;
  padding:14px;
  width:100%;
  font-size:16px;
  border-radius:10px;
  margin-top:14px;
}
small{opacity:.7}
</style>
</head>

<body>
<div class="card">
  <img src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png"/>
  <h2>🌱 Galápagos Token</h2>
  <p><b>Producto:</b> ${rows[0].product_name}</p>
  <p><b>Recompensa:</b> $${rewardUsd.toFixed(2)} USD</p>
  <p><b>Precio token:</b> $${price || "—"}</p>
  <p><b>Tokens:</b> ${tokens}</p>
  <button onclick="sign()">Firmar y reclamar</button>
  <small>Seguro vía Phantom Wallet</small>
</div>

<script>
async function sign(){
  if(!window.solana){
    alert("Instala Phantom");
    return;
  }
  await window.solana.connect();
  const msg = new TextEncoder().encode("Reclamo Galápagos Token");
  await window.solana.signMessage(msg);
  alert("🎉 Felicidades por ser parte de Galápagos Token");
}
</script>
</body>
</html>
`);
});

/* ================= ADMIN ================= */
app.get("/admin", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id,product_name,value_usd,claimed_at FROM qrs ORDER BY created_at DESC"
  );
  res.json(rows);
});

/* ================= GENERAR QRS ================= */
app.post("/admin/generate", async (req, res) => {
  const { product, value_usd, qty } = req.body;
  if (!product || !value_usd || !qty) return res.status(400).send("Datos inválidos");

  for (let i = 0; i < qty; i++) {
    await pool.query(
      "INSERT INTO qrs(product_name,value_usd) VALUES($1,$2)",
      [product, value_usd]
    );
  }
  res.json({ success: true });
});

/* ================= DESCARGAR ZIP ================= */
app.get("/admin/download/:product", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id FROM qrs WHERE product_name=$1",
    [req.params.product]
  );

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=${req.params.product}.zip`);

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const url = `${BASE_URL}/r/${qr.id}`;
    const img = await QRCode.toBuffer(url);
    archive.append(img, { name: `${qr.id}.png` });
  }

  archive.finalize();
});

/* ================= SERVER ================= */
app.listen(process.env.PORT || 8080, () =>
  console.log("Galápagos backend listo")
);

import express from "express";
import cors from "cors";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import fetch from "node-fetch";

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// TU MINT REAL
const TOKEN_MINT =
  "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ================= ADMIN ================= */

app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const stats = await pool.query(`
    SELECT
      COUNT(*) total,
      COUNT(*) FILTER (WHERE claimed_at IS NOT NULL) claimed,
      COUNT(*) FILTER (WHERE claimed_at IS NULL) active,
      SUM(value_usd) total_usd,
      SUM(value_usd) FILTER (WHERE claimed_at IS NOT NULL) claimed_usd
    FROM qrs
  `);

  const products = await pool.query(`
    SELECT
      product_name,
      COUNT(*) total,
      COUNT(*) FILTER (WHERE claimed_at IS NOT NULL) claimed,
      COUNT(*) FILTER (WHERE claimed_at IS NULL) active
    FROM qrs
    GROUP BY product_name
  `);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Galápagos Admin</title>
<style>
body{background:#02140f;color:#c9ffe9;font-family:Arial;padding:30px}
.card{background:#03261b;padding:20px;border-radius:16px;margin-bottom:20px}
table{width:100%;border-collapse:collapse}
td,th{padding:6px;border-bottom:1px solid #00ffb333}
</style>
</head>
<body>

<h1>🌱 Galápagos Token Admin</h1>

<div class="card">
<h3>📊 Estadísticas globales</h3>
<p>Total QRs: ${stats.rows[0].total}</p>
<p>Reclamados: ${stats.rows[0].claimed}</p>
<p>Activos: ${stats.rows[0].active}</p>
<p>USD total: $${Number(stats.rows[0].total_usd || 0).toFixed(2)}</p>
<p>USD reclamado: $${Number(stats.rows[0].claimed_usd || 0).toFixed(2)}</p>
</div>

<div class="card">
<h3>📦 Por producto</h3>
<table>
<tr><th>Producto</th><th>Total</th><th>Reclamados</th><th>Activos</th></tr>
${products.rows.map(p=>`
<tr>
<td>${p.product_name}</td>
<td>${p.total}</td>
<td>${p.claimed}</td>
<td>${p.active}</td>
</tr>
`).join("")}
</table>
</div>

</body>
</html>
`);
});

/* ================= CLAIM ================= */

app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT product_name,value_usd FROM qrs WHERE id=$1",
    [id]
  );
  if (!rows.length) return res.send("QR inválido");

  const product = rows[0].product_name;
  const valueUsd = Number(rows[0].value_usd);
  const rewardUsd = valueUsd * 0.01;

  // PRECIO REAL
  let price = 0;
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/token_price/solana" +
      "?contract_addresses=" + TOKEN_MINT +
      "&vs_currencies=usd"
    );
    const j = await r.json();
    price = j[TOKEN_MINT.toLowerCase()]?.usd || 0;
  } catch {}

  const tokens = price
    ? (rewardUsd / price).toFixed(6)
    : "—";

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width"/>
<title>Galápagos Token</title>
<style>
body{background:#02140f;color:#c9ffe9;font-family:Arial;
display:flex;justify-content:center;align-items:center;height:100vh}
.card{background:#03261b;padding:26px;border-radius:18px;text-align:center;width:320px}
button{background:#00ffb3;border:none;padding:12px;border-radius:10px;width:100%}
</style>
</head>
<body>
<div class="card">
<h2>🌱 Galápagos Token</h2>
<p>Producto: <b>${product}</b></p>
<p>Valor: $${valueUsd.toFixed(2)} USD</p>
<p>Recompensa (1%): $${rewardUsd.toFixed(2)} USD</p>
<p>Precio token: $${price || "—"}</p>
<p><b>Tokens a recibir:</b> ${tokens}</p>
<button onclick="connect()">Firmar y reclamar</button>
<p id="s"></p>
</div>

<script>
async function connect(){
  if(!window.solana){
    document.getElementById("s").innerText="Abrir desde Phantom";
    return;
  }
  await window.solana.connect();
  const msg=new TextEncoder().encode("Reclamo Galápagos Token");
  await window.solana.signMessage(msg);
  document.getElementById("s").innerText="🎉 Reclamo firmado";
}
</script>
</body>
</html>
`);
});

/* ================= START ================= */

app.listen(PORT,()=>console.log("Backend listo"));

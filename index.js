import express from "express";
import cors from "cors";
import pg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const { Pool } = pg;

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// MINT REAL GALAPAGOS TOKEN
const TOKEN_MINT =
  "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =====================================================
   ADMIN DASHBOARD PRO (NO TOCAR)
===================================================== */

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
    ORDER BY product_name
  `);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Galápagos Admin</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
body{
background:radial-gradient(circle,#021b14,#010d09);
color:#d0fff0;
font-family:Arial;
padding:30px;
}
h1{color:#00ffb3}
.card{
background:#03261b;
padding:20px;
border-radius:18px;
margin-bottom:25px;
box-shadow:0 0 25px #00ffb344;
}
.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
gap:15px;
}
.stat{
background:#041f16;
padding:15px;
border-radius:14px;
text-align:center;
}
button{
background:#00ffb3;
border:none;
padding:10px 16px;
border-radius:10px;
font-weight:bold;
cursor:pointer;
}
input{
padding:10px;
border-radius:10px;
border:none;
margin:5px 0;
width:100%;
}
table{
width:100%;
border-collapse:collapse;
}
td,th{
padding:8px;
border-bottom:1px solid #00ffb333;
}
</style>
</head>
<body>

<h1>🌱 Galápagos Token – Admin Pro</h1>

<div class="card">
<h3>📊 Estadísticas Globales</h3>
<div class="grid">
<div class="stat">Total QRs<br><b>${stats.rows[0].total}</b></div>
<div class="stat">Reclamados<br><b>${stats.rows[0].claimed}</b></div>
<div class="stat">Activos<br><b>${stats.rows[0].active}</b></div>
<div class="stat">USD Total<br><b>$${Number(stats.rows[0].total_usd||0).toFixed(2)}</b></div>
<div class="stat">USD Reclamado<br><b>$${Number(stats.rows[0].claimed_usd||0).toFixed(2)}</b></div>
</div>
</div>

<div class="card">
<h3>➕ Generar QRs</h3>
<form method="GET" action="/admin/generate">
<input name="product" placeholder="Producto" required>
<input name="usd" placeholder="Valor USD" type="number" step="0.01" required>
<input name="qty" placeholder="Cantidad" type="number" required>
<input type="hidden" name="token" value="${ADMIN_TOKEN}">
<button>Generar</button>
</form>
</div>

<div class="card">
<h3>📦 Productos</h3>
<table>
<tr>
<th>Producto</th>
<th>Total</th>
<th>Reclamados</th>
<th>Activos</th>
<th>Descargar</th>
</tr>
${products.rows.map(p=>`
<tr>
<td>${p.product_name}</td>
<td>${p.total}</td>
<td>${p.claimed}</td>
<td>${p.active}</td>
<td>
<a href="/admin/download/${p.product_name}?token=${ADMIN_TOKEN}">
<button>ZIP</button>
</a>
<a href="/admin/download/${p.product_name}?onlyNew=1&token=${ADMIN_TOKEN}">
<button>Nuevos</button>
</a>
</td>
</tr>
`).join("")}
</table>
</div>

</body>
</html>
`);
});

/* =====================================================
   GENERAR QRS (NO TOCAR)
===================================================== */

app.get("/admin/generate", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const { product, usd, qty } = req.query;

  for (let i = 0; i < Number(qty); i++) {
    await pool.query(
      "INSERT INTO qrs (product_name,value_usd) VALUES ($1,$2)",
      [product, usd]
    );
  }

  res.redirect(`/admin?token=${ADMIN_TOKEN}`);
});

/* =====================================================
   DESCARGAR ZIP (NO TOCAR)
===================================================== */

app.get("/admin/download/:product", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const { product } = req.params;
  const onlyNew = req.query.onlyNew === "1";

  const { rows } = await pool.query(`
    SELECT id
    FROM qrs
    WHERE product_name=$1
    ${onlyNew ? "AND downloaded_at IS NULL" : ""}
  `,[product]);

  if (!rows.length) return res.send("No hay QRs");

  res.setHeader("Content-Type","application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${product}_qrs.zip`
  );

  const archive = archiver("zip",{zlib:{level:9}});
  archive.pipe(res);

  for (const qr of rows) {
    const phantomUrl =
      "https://phantom.app/ul/browse/" +
      encodeURIComponent(`${BASE_URL}/claim/${qr.id}`);

    const img = await QRCode.toBuffer(phantomUrl);
    archive.append(img,{ name:`${product}/${qr.id}.png` });
  }

  await archive.finalize();

  if (onlyNew) {
    await pool.query(`
      UPDATE qrs
      SET downloaded_at=NOW()
      WHERE product_name=$1
      AND downloaded_at IS NULL
    `,[product]);
  }
});

/* =====================================================
   CLAIM (ÚNICO CAMBIO REAL AQUÍ)
===================================================== */

app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT product_name,value_usd FROM qrs WHERE id=$1",
    [id]
  );
  if (!rows.length) return res.send("QR inválido");

  const valueUsd = Number(rows[0].value_usd);
  const rewardUsd = valueUsd * 0.01;

  // ===== FIX REAL DE PRECIO =====
  let price = null;
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/token_price/solana" +
      "?contract_addresses=" + TOKEN_MINT +
      "&vs_currencies=usd"
    );
    const j = await r.json();
    price = j[TOKEN_MINT.toLowerCase()]?.usd ?? null;
  } catch {}

  let tokens = null;
  if (price && price > 0) {
    tokens = (rewardUsd / price).toFixed(6);
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width"/>
<title>Galápagos Token</title>
<style>
body{
background:radial-gradient(circle,#021b14,#010d09);
color:#d0fff0;
font-family:Arial;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
margin:0;
}
.card{
background:#03261b;
padding:26px;
border-radius:18px;
text-align:center;
width:320px;
}
button{
background:#00ffb3;
border:none;
padding:12px;
border-radius:10px;
width:100%;
font-weight:bold;
}
</style>
</head>
<body>
<div class="card">
<h2>🌱 Galápagos Token</h2>

<p>Valor producto: $${valueUsd.toFixed(2)} USD</p>
<p>Recompensa (1%): $${rewardUsd.toFixed(2)} USD</p>

<p><b>Precio del token:</b>
${price ? `$${price}` : "No disponible aún"}
</p>

<p><b>Tokens a recibir:</b>
${tokens ? tokens : "Se calculará al confirmar"}
</p>

<button onclick="claim()">Firmar y reclamar</button>
<p id="s"></p>
</div>

<script>
async function claim(){
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

/* =====================================================
   START
===================================================== */

app.listen(PORT,()=>console.log("Backend Galápagos listo"));

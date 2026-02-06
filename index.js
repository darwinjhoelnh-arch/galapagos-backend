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
const BASE_URL = process.env.BASE_URL || "https://galapagos-backend.onrender.com";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "galapagos_admin_2026";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =====================================================
   ADMIN (NO TOCAR – ES EL QUE YA TE FUNCIONABA)
===================================================== */

app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const { rows } = await pool.query(`
    SELECT id, product_name, value_usd, claimed_at
    FROM qrs
    ORDER BY created_at DESC
  `);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Galápagos Token Admin</title>
<style>
body{
background:radial-gradient(circle,#062d22,#02140f);
color:#b9ffe6;
font-family:Arial;
padding:30px;
}
.card{
background:#031f16;
padding:20px;
border-radius:16px;
box-shadow:0 0 25px #00ffb3;
margin-bottom:20px;
}
button{
background:#00ffb3;
border:none;
padding:10px 16px;
border-radius:10px;
cursor:pointer;
font-weight:bold;
}
input{
width:100%;
padding:10px;
border-radius:10px;
border:none;
margin-bottom:10px;
}
</style>
</head>
<body>

<h1>🌱 Galápagos Token Admin</h1>

<div class="card">
<h3>Generar QRs</h3>
<input id="product" placeholder="Producto"/>
<input id="value" placeholder="Valor USD"/>
<input id="qty" placeholder="Cantidad"/>
<button onclick="gen()">Generar</button>
</div>

<div class="card">
<h3>Descargar QRs</h3>
<input id="prodDl" placeholder="Producto"/>
<button onclick="dl()">Descargar ZIP</button>
</div>

<script>
async function gen(){
  await fetch("/admin/generate?token=${ADMIN_TOKEN}",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      product:product.value,
      value:value.value,
      qty:qty.value
    })
  });
  location.reload();
}
function dl(){
  window.location="/admin/download/"+prodDl.value+"?token=${ADMIN_TOKEN}";
}
</script>

</body>
</html>
`);
});

app.post("/admin/generate", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.sendStatus(403);

  const { product, value, qty } = req.body;

  for (let i = 0; i < Number(qty); i++) {
    await pool.query(
      `INSERT INTO qrs (product_name, value_usd)
       VALUES ($1,$2)`,
      [product, value]
    );
  }
  res.send("OK");
});

app.get("/admin/download/:product", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.sendStatus(403);

  const { rows } = await pool.query(
    "SELECT id FROM qrs WHERE product_name=$1",
    [req.params.product]
  );

  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition","attachment; filename=qrs.zip");

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const qrUrl =
      "https://phantom.app/ul/browse/" +
      encodeURIComponent(`${BASE_URL}/claim/${qr.id}`);

    const img = await QRCode.toBuffer(qrUrl);
    archive.append(img,{ name:`${qr.id}.png`});
  }

  archive.finalize();
});

/* =====================================================
   CLAIM – AQUÍ ESTÁ EL ARREGLO REAL
===================================================== */

app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT product_name, value_usd FROM qrs WHERE id=$1",
    [id]
  );

  if (!rows.length) return res.send("QR inválido");

  const product = rows[0].product_name;
  const valueUsd = Number(rows[0].value_usd);
  const rewardUsd = valueUsd * 0.01;

  // Precio real del token (CoinGecko)
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
<meta name="viewport" content="width=device-width"/>
<title>Galápagos Token</title>
<script src="https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js"></script>
<style>
body{
background:radial-gradient(circle,#063227,#02140f);
color:#c9ffe9;
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
border-radius:20px;
box-shadow:0 0 30px #00ffb3;
text-align:center;
width:320px;
}
button{
background:#00ffb3;
border:none;
padding:12px 18px;
border-radius:10px;
font-weight:bold;
margin-top:15px;
cursor:pointer;
width:100%;
}
img{width:80px;margin-bottom:10px;}
</style>
</head>
<body>

<div class="card">
<img src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png"/>
<h2>Galápagos Token</h2>

<p><b>Producto:</b> ${product}</p>
<p><b>Valor producto:</b> $${valueUsd.toFixed(2)} USD</p>
<p><b>Recompensa (1%):</b> $${rewardUsd.toFixed(2)} USD</p>
<p><b>Precio token:</b> $${price || "—"}</p>
<p><b>Tokens a recibir:</b> ${tokens}</p>

<button id="btn" onclick="claim()">Firmar y reclamar</button>
<p id="status"></p>
</div>

<script>
async function claim(){
  if (!window.solana || !window.solana.isPhantom) {
    document.getElementById("status").innerText =
      "Debes abrir esto desde Phantom";
    return;
  }

  try {
    const resp = await window.solana.connect();
    const msg = new TextEncoder().encode("Reclamo Galápagos Token");
    await window.solana.signMessage(msg);
    document.getElementById("status").innerText =
      "🎉 Reclamo firmado correctamente";
    document.getElementById("btn").disabled = true;
  } catch (e) {
    document.getElementById("status").innerText =
      "Firma cancelada";
  }
}
</script>

</body>
</html>
`);
});

/* =====================================================
   START
===================================================== */

app.listen(PORT, () => {
  console.log("Backend corriendo en puerto", PORT);
});

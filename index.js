import express from "express";
import cors from "cors";
import pg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";

const app = express();
app.use(cors());
app.use(express.json());

const { Pool } = pg;

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const TOKEN_MINT = "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ================= ADMIN DASHBOARD ================= */

app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const stats = await pool.query(`
    SELECT
      COUNT(*) total,
      COUNT(*) FILTER (WHERE claimed_at IS NOT NULL) claimed,
      COUNT(*) FILTER (WHERE claimed_at IS NULL) active
    FROM qrs
  `);

  const products = await pool.query(`
    SELECT product_name, COUNT(*) qty
    FROM qrs
    GROUP BY product_name
    ORDER BY product_name
  `);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Galápagos Admin</title>
<style>
body{
background:#021b14;
color:#d0fff0;
font-family:Arial;
padding:40px;
}
.card{
background:#03261b;
padding:20px;
border-radius:16px;
margin-bottom:20px;
}
button,input{
padding:10px;
border-radius:8px;
border:none;
margin:4px;
}
button{
background:#00ffb3;
font-weight:bold;
}
</style>
</head>
<body>

<h1>🌱 Galápagos Token Admin</h1>

<div class="card">
<b>Total:</b> ${stats.rows[0].total} |
<b>Activos:</b> ${stats.rows[0].active} |
<b>Reclamados:</b> ${stats.rows[0].claimed}
</div>

<div class="card">
<h3>Generar QRs</h3>
<form action="/admin/generate">
<input type="hidden" name="token" value="${ADMIN_TOKEN}">
<input name="product" placeholder="Producto" required>
<input name="usd" placeholder="USD" required>
<input name="qty" placeholder="Cantidad" required>
<button>Generar</button>
</form>
</div>

<div class="card">
<h3>Descargas por producto</h3>
${products.rows.map(p=>`
<div>
<b>${p.product_name}</b> (${p.qty})
<a href="/admin/download/${p.product_name}?token=${ADMIN_TOKEN}">
<button>Descargar ZIP</button>
</a>
</div>
`).join("")}
</div>

</body>
</html>
`);
});

/* ================= GENERATE ================= */

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

/* ================= DOWNLOAD ZIP ================= */

app.get("/admin/download/:product", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const { rows } = await pool.query(
    "SELECT id FROM qrs WHERE product_name=$1",
    [req.params.product]
  );

  const archive = archiver("zip");
  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition","attachment; filename=qrs.zip");
  archive.pipe(res);

  for (const qr of rows) {
    const url =
      "https://phantom.app/ul/browse/" +
      encodeURIComponent(`${BASE_URL}/claim/${qr.id}`);
    const img = await QRCode.toBuffer(url);
    archive.append(img,{ name:`${qr.id}.png`});
  }

  archive.finalize();
});

/* ================= CLAIM (NO TOCAR) ================= */

// ===============================
// PHANTOM DEEP LINK FIX
// ===============================
app.get("/claim/:id", (req, res) => {
  const { id } = req.params;

  const claimPageUrl = `https://galapagos-backend.onrender.com/claim-page/${id}`;
  const encodedUrl = encodeURIComponent(claimPageUrl);
  const phantomUrl = `https://phantom.app/ul/browse/${encodedUrl}`;

  res.redirect(302, phantomUrl);
});

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width"/>
<style>
body{background:#021b14;color:#d0fff0;font-family:Arial;
display:flex;justify-content:center;align-items:center;height:100vh;}
.card{background:#03261b;padding:24px;border-radius:16px;width:320px;text-align:center;}
button{background:#00ffb3;border:none;padding:12px;border-radius:10px;width:100%;}
</style>
</head>
<body>
<div class="card">
<h2>🌱 Galápagos Token</h2>
<p>Producto: ${product}</p>
<p>Recompensa: $${rewardUsd}</p>
<p>Precio token: <span id="price">...</span></p>
<p>Tokens: <span id="tokens">...</span></p>
<button onclick="claim()">Firmar y reclamar</button>
<p id="status"></p>
</div>

<script>
const mint="${TOKEN_MINT.toLowerCase()}";
const reward=${rewardUsd};

async function load(){
const r=await fetch(
"https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses="+mint+"&vs_currencies=usd"
);
const j=await r.json();
const p=j[mint]?.usd;
if(p){
document.getElementById("price").innerText="$"+p;
document.getElementById("tokens").innerText=(reward/p).toFixed(6);
}
}
async function claim(){
await window.solana.connect();
await window.solana.signMessage(new TextEncoder().encode("Galapagos Claim"));
document.getElementById("status").innerText="🎉 Reclamado";
}
load();
</script>
</body>
</html>
`);
});

/* ================= START ================= */

app.listen(PORT,()=>console.log("OK"));

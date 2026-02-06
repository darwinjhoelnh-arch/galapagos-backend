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

// MINT REAL
const TOKEN_MINT =
  "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ================= ADMIN (NO TOCAR) ================= */

app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const stats = await pool.query(`
    SELECT
      COUNT(*) total,
      COUNT(*) FILTER (WHERE claimed_at IS NOT NULL) claimed,
      COUNT(*) FILTER (WHERE claimed_at IS NULL) active
    FROM qrs
  `);

  res.send(`
<h1>Admin OK</h1>
<p>Total: ${stats.rows[0].total}</p>
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
    const phantomUrl =
      "https://phantom.app/ul/browse/" +
      encodeURIComponent(`${BASE_URL}/claim/${qr.id}`);
    const img = await QRCode.toBuffer(phantomUrl);
    archive.append(img,{ name:`${qr.id}.png`});
  }

  archive.finalize();
});

/* ================= CLAIM (FIX REAL) ================= */

app.get("/claim/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT product_name,value_usd FROM qrs WHERE id=$1",
    [req.params.id]
  );
  if (!rows.length) return res.send("QR inválido");

  const product = rows[0].product_name;
  const valueUsd = Number(rows[0].value_usd);
  const rewardUsd = valueUsd * 0.01;

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width"/>
<title>Galápagos Token</title>
<style>
body{
background:#021b14;
color:#d0fff0;
font-family:Arial;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}
.card{
background:#03261b;
padding:24px;
border-radius:16px;
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

<p>Producto: <b>${product}</b></p>
<p>Valor: $${valueUsd.toFixed(2)} USD</p>
<p>Recompensa (1%): $${rewardUsd.toFixed(2)} USD</p>

<p><b>Precio token:</b> <span id="price">Cargando…</span></p>
<p><b>Tokens a recibir:</b> <span id="tokens">—</span></p>

<button onclick="claim()">Firmar y reclamar</button>
<p id="status"></p>
</div>

<script>
const rewardUsd = ${rewardUsd};
const mint = "${TOKEN_MINT.toLowerCase()}";

async function loadPrice(){
  try{
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/token_price/solana" +
      "?contract_addresses=" + mint +
      "&vs_currencies=usd"
    );
    const j = await r.json();
    const price = j[mint]?.usd;

    if(price){
      document.getElementById("price").innerText = "$" + price;
      document.getElementById("tokens").innerText =
        (rewardUsd / price).toFixed(6);
    }else{
      document.getElementById("price").innerText =
        "No disponible aún";
    }
  }catch{
    document.getElementById("price").innerText =
      "Error al obtener precio";
  }
}

async function claim(){
  if(!window.solana){
    document.getElementById("status").innerText =
      "Abrir desde Phantom";
    return;
  }
  await window.solana.connect();
  const msg = new TextEncoder().encode("Reclamo Galápagos Token");
  await window.solana.signMessage(msg);
  document.getElementById("status").innerText =
    "🎉 Reclamo firmado";
}

loadPrice();
</script>

</body>
</html>
`);
});

/* ================= START ================= */

app.listen(PORT,()=>console.log("Backend listo"));

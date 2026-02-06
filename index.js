import express from "express";
import cors from "cors";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = "https://galapagos-backend.onrender.com";
const ADMIN_TOKEN = "galapagos_admin_2026";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ===========================
   ADMIN DASHBOARD (NO TOCAR)
=========================== */

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
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
body{
background:radial-gradient(circle,#062d22,#02140f);
color:#b9ffe6;
font-family:Arial;
margin:0;
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

<div class="card">
<h3>Códigos existentes</h3>
<pre>${JSON.stringify(rows,null,2)}</pre>
</div>

<script>
async function gen(){
  const product=document.getElementById("product").value;
  const value=document.getElementById("value").value;
  const qty=document.getElementById("qty").value;
  await fetch("/admin/generate?token=${ADMIN_TOKEN}",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({product,value,qty})
  });
  location.reload();
}
function dl(){
  const p=document.getElementById("prodDl").value;
  window.location="/admin/download/"+p+"?token=${ADMIN_TOKEN}";
}
</script>

</body>
</html>
`);
});

/* ===========================
   GENERAR QRS
=========================== */

app.post("/admin/generate", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.sendStatus(403);

  const { product, value, qty } = req.body;

  for (let i = 0; i < qty; i++) {
    await pool.query(
      `INSERT INTO qrs (product_name, value_usd)
       VALUES ($1,$2)`,
      [product, value]
    );
  }
  res.send("OK");
});

/* ===========================
   DESCARGAR ZIP
=========================== */

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

/* ===========================
   CLAIM — ESTE ES EL FIX
=========================== */

app.get("/claim/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT product_name,value_usd FROM qrs WHERE id=$1",
    [req.params.id]
  );

  if (!rows.length) return res.send("QR inválido");

  const qr = rows[0];

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width"/>
<title>Galápagos Token</title>
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
}
img{width:80px;margin-bottom:10px;}
</style>
</head>
<body>

<div class="card">
<img src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png"/>
<h2>Galápagos Token</h2>
<p>Producto: <b>${qr.product_name}</b></p>
<p>Recompensa: <b>$${qr.value_usd} USD</b></p>
<button onclick="connect()">Conectar Phantom</button>
<p id="s"></p>
</div>

<script>
async function connect(){
  if(!window.solana||!window.solana.isPhantom){
    document.getElementById("s").innerText=
      "Abrir desde Phantom Wallet";
    return;
  }
  const r=await window.solana.connect();
  document.getElementById("s").innerText=
    "Wallet conectada";
}
</script>

</body>
</html>
`);
});

/* ===========================
   START
=========================== */

app.listen(PORT, () =>
  console.log("Running on", PORT)
);

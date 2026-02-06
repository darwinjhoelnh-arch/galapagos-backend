import express from "express";
import cors from "cors";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import crypto from "crypto";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* ================= CONFIG ================= */

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "galapagos_admin_2026";
const BASE_URL = process.env.BASE_URL || "https://galapagos-backend.onrender.com";
const PORT = process.env.PORT || 10000;

/* ================= DATABASE ================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ================= HEALTH ================= */

app.get("/", (_, res) => res.send("OK"));

/* ================= ADMIN UI ================= */

app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const { rows } = await pool.query(`
    SELECT id, product_name, value_usd,
    CASE WHEN claimed_at IS NULL THEN 'Activo' ELSE 'Reclamado' END estado
    FROM qrs
    ORDER BY created_at DESC
  `);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Galápagos Token Admin</title>
<style>
body{
  background:#001b14;
  color:#aaffdd;
  font-family:Arial;
  padding:40px;
}
.card{
  background:#002b1f;
  padding:20px;
  border-radius:16px;
  margin-bottom:20px;
}
button{
  background:#00ffb2;
  border:none;
  padding:10px 20px;
  border-radius:8px;
  cursor:pointer;
  font-weight:bold;
}
input{
  width:100%;
  padding:10px;
  margin:6px 0;
  border-radius:6px;
  border:none;
}
table{
  width:100%;
  margin-top:20px;
  font-size:12px;
}
td,th{padding:6px;}
</style>
</head>
<body>

<h1>🌱 Galápagos Token Admin</h1>

<div class="card">
<h3>Generar QRs</h3>
<input id="product" placeholder="Producto (ej: cafe)">
<input id="usd" type="number" placeholder="Precio USD">
<input id="qty" type="number" placeholder="Cantidad">
<button onclick="gen()">Generar</button>
</div>

<div class="card">
<h3>Descargar QRs</h3>
<button onclick="download()">Descargar ZIP</button>
</div>

<div class="card">
<h3>QRs existentes</h3>
<table border="1">
<tr><th>ID</th><th>Producto</th><th>USD</th><th>Estado</th></tr>
${rows.map(r=>`
<tr>
<td>${r.id}</td>
<td>${r.product_name}</td>
<td>${r.value_usd}</td>
<td>${r.estado}</td>
</tr>`).join("")}
</table>
</div>

<script>
function gen(){
fetch('/admin/generate?token=${ADMIN_TOKEN}',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
product:document.getElementById('product').value,
usd:document.getElementById('usd').value,
qty:document.getElementById('qty').value
})
}).then(()=>location.reload())
}

function download(){
window.location='/admin/download?token=${ADMIN_TOKEN}'
}
</script>
</body>
</html>
`);
});

/* ================= GENERAR QRS ================= */

app.post("/admin/generate", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.sendStatus(403);

  const { product, usd, qty } = req.body;
  if (!product || !usd || !qty) return res.sendStatus(400);

  for (let i = 0; i < qty; i++) {
    await pool.query(
      `INSERT INTO qrs (product_name,value_usd)
       VALUES ($1,$2)`,
      [product, usd]
    );
  }

  res.sendStatus(200);
});

/* ================= DESCARGAR ZIP ================= */

app.get("/admin/download", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.sendStatus(403);

  const { rows } = await pool.query(
    `SELECT id, product_name FROM qrs WHERE claimed_at IS NULL`
  );

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=qrs.zip");

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const claimUrl = `${BASE_URL}/claim/${qr.id}`;
    const phantomUrl =
      `https://phantom.app/ul/browse/${encodeURIComponent(claimUrl)}`;

    const img = await QRCode.toBuffer(phantomUrl, { width: 800 });
    archive.append(img, { name: `${qr.product_name}/${qr.id}.png` });
  }

  archive.finalize();
});

/* ================= CLAIM ================= */

app.get("/claim/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM qrs WHERE id=$1`,
    [req.params.id]
  );

  if (!rows.length) return res.send("QR inválido");
  if (rows[0].claimed_at) return res.send("Este QR ya fue usado");

  const reward = rows[0].value_usd * 0.01;

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Galápagos Token</title>
<style>
body{
  background:#001b14;
  color:#aaffdd;
  font-family:Arial;
  text-align:center;
  padding-top:60px;
}
.card{
  background:#002b1f;
  border-radius:16px;
  padding:30px;
  width:90%;
  max-width:400px;
  margin:auto;
}
</style>
</head>
<body>

<div class="card">
<h1>🌱 Galápagos Token</h1>
<p><b>Producto:</b> ${rows[0].product_name}</p>
<p><b>Recompensa:</b> $${reward.toFixed(2)} USD</p>
<p>✔ Abierto desde Phantom</p>
</div>

</body>
</html>
`);
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log("Galápagos backend listo en puerto", PORT);
});

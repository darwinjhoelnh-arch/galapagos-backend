import express from "express";
import cors from "cors";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import fetch from "node-fetch";
import { randomUUID } from "crypto";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CONFIG
========================= */

const ADMIN_TOKEN = "galapagos_admin_2026";
const BASE_URL = "https://galapagos-backend.onrender.com";

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   ADMIN UI
========================= */

app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send("Acceso denegado");
  }

  const { rows } = await pool.query(`
    SELECT
      id,
      product_name,
      value_usd,
      created_at,
      claimed_at,
      CASE
        WHEN claimed_at IS NULL THEN 'Activo'
        ELSE 'Reclamado'
      END AS estado
    FROM qrs
    ORDER BY created_at DESC
  `);

  const rowsHtml = rows.map(r => `
    <tr>
      <td>${r.product_name}</td>
      <td>$${r.value_usd}</td>
      <td>${r.estado}</td>
    </tr>
  `).join("");

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Galápagos Token Admin</title>
<style>
body{
  background:#021b16;
  color:#aaffdd;
  font-family:Arial;
}
.container{
  max-width:900px;
  margin:40px auto;
}
.card{
  background:#042a22;
  border-radius:14px;
  padding:20px;
  margin-bottom:20px;
}
button{
  background:#00ff99;
  border:none;
  padding:12px 18px;
  border-radius:8px;
  font-weight:bold;
  cursor:pointer;
}
table{
  width:100%;
  border-collapse:collapse;
}
td,th{
  padding:10px;
  border-bottom:1px solid #0a4;
}
</style>
</head>
<body>
<div class="container">

<h1>🌱 Galápagos Token Admin</h1>

<div class="card">
<h2>Generar QRs</h2>
<form id="generateForm">
<input placeholder="Producto" id="product" required/><br/><br/>
<input placeholder="Valor USD" id="value" type="number" required/><br/><br/>
<input placeholder="Cantidad" id="quantity" type="number" required/><br/><br/>
<button>Generar</button>
</form>
</div>

<div class="card">
<h2>Códigos existentes</h2>
<table>
<tr><th>Producto</th><th>Valor</th><th>Estado</th></tr>
${rowsHtml}
</table>
</div>

<div class="card">
<h2>Descargas</h2>
<a href="/admin/download?token=${ADMIN_TOKEN}">
<button>Descargar ZIP de QRs</button>
</a>
</div>

</div>

<script>
document.getElementById("generateForm").addEventListener("submit", async e=>{
  e.preventDefault();
  await fetch("/admin/generate",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      product_name:product.value,
      value_usd:value.value,
      quantity:quantity.value
    })
  });
  location.href="/admin?token=${ADMIN_TOKEN}";
});
</script>

</body>
</html>
`);
});

/* =========================
   GENERAR QRs
========================= */

app.post("/admin/generate", async (req, res) => {
  const { product_name, value_usd, quantity } = req.body;

  for (let i = 0; i < quantity; i++) {
    await pool.query(`
      INSERT INTO qrs (id, product_name, value_usd)
      VALUES ($1,$2,$3)
    `, [randomUUID(), product_name, value_usd]);
  }

  res.json({ ok: true });
});

/* =========================
   DESCARGAR ZIP
========================= */

app.get("/admin/download", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send("Acceso denegado");
  }

  const { rows } = await pool.query(`
    SELECT id, product_name FROM qrs WHERE claimed_at IS NULL
  `);

  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition","attachment; filename=galapagos_qrs.zip");

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const url = \`\${BASE_URL}/claim/${qr.id}\`;
    const img = await QRCode.toBuffer(url);
    archive.append(img,{ name:\`\${qr.product_name}/\${qr.id}.png\` });
  }

  await archive.finalize();
});

/* =========================
   CLAIM PAGE (simple)
========================= */

app.get("/claim/:id", async (req,res)=>{
  res.send(`
  <h1>Galápagos Token</h1>
  <p>Escanea con Phantom para reclamar</p>
  `);
});

/* =========================
   START
========================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("Backend activo"));

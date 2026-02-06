import express from "express";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import cors from "cors";
import { Readable } from "stream";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_TOKEN = "galapagos_admin_2026";
const BASE_URL = "https://galapagos-backend.onrender.com";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   ADMIN DASHBOARD
========================= */
app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.send("Unauthorized");

  const { rows } = await pool.query(`
    SELECT id, product_name, value_usd, batch_id, claimed_at
    FROM qrs
    ORDER BY created_at DESC
    LIMIT 100
  `);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Galápagos Admin</title>
<style>
body{
  background:radial-gradient(circle,#003b2f,#000);
  color:#eafff6;
  font-family:Arial;
}
.card{
  background:#031f18;
  border:1px solid #0a4;
  border-radius:16px;
  padding:20px;
  margin:20px auto;
  width:90%;
  max-width:700px;
}
input,button{
  width:100%;
  padding:12px;
  margin-top:8px;
  border-radius:8px;
  border:none;
}
button{
  background:#00ffb3;
  font-weight:bold;
  cursor:pointer;
}
table{
  width:100%;
  margin-top:10px;
  font-size:12px;
}
td{padding:4px;}
</style>
</head>
<body>

<div class="card">
<h2>Generar QRs</h2>
<input id="product" placeholder="Producto">
<input id="value" placeholder="Valor USD">
<input id="qty" placeholder="Cantidad">
<button onclick="gen()">Generar</button>
</div>

<div class="card">
<h2>Descargar ZIP por producto</h2>
<input id="batch" placeholder="Nombre del producto">
<button onclick="zip()">Descargar ZIP</button>
</div>

<div class="card">
<h2>Últimos QRs</h2>
<table>
${rows.map(r=>`
<tr>
<td>${r.product_name}</td>
<td>$${r.value_usd}</td>
<td>${r.claimed_at ? "Reclamado" : "Activo"}</td>
</tr>
`).join("")}
</table>
</div>

<script>
function gen(){
 fetch("/admin/generate?token=${ADMIN_TOKEN}",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({
    product:product.value,
    value:value.value,
    qty:qty.value
  })
 }).then(()=>location.reload());
}

function zip(){
 window.location="/admin/download/"+batch.value+"?token=${ADMIN_TOKEN}";
}
</script>

</body>
</html>
`);
});

/* =========================
   GENERAR QRs
========================= */
app.post("/admin/generate", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.sendStatus(401);

  const { product, value, qty } = req.body;
  const batch = product.toLowerCase().replace(/\s+/g,"_");

  for (let i = 0; i < qty; i++) {
    await pool.query(`
      INSERT INTO qrs (product_name,value_usd,batch_id)
      VALUES ($1,$2,$3)
    `,[product,value,batch]);
  }
  res.send("OK");
});

/* =========================
   DESCARGAR ZIP
========================= */
app.get("/admin/download/:batch", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.sendStatus(401);

  const { rows } = await pool.query(
    `SELECT id FROM qrs WHERE batch_id=$1`,
    [req.params.batch]
  );

  res.setHeader("Content-Disposition","attachment; filename=qrs.zip");
  const archive = archiver("zip");
  archive.pipe(res);

  for (const r of rows) {
    const url = `${BASE_URL}/claim/${r.id}`;
    const img = await QRCode.toBuffer(url);
    archive.append(img,{name:`${req.params.batch}/${r.id}.png`});
  }

  archive.finalize();
});

/* =========================
   RECLAMO QR
========================= */
app.get("/claim/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT product_name,value_usd,claimed_at FROM qrs WHERE id=$1`,
    [req.params.id]
  );

  if (!rows.length) return res.send("QR inválido");
  if (rows[0].claimed_at) return res.send("QR ya usado");

  const reward = rows[0].value_usd * 0.01;

  res.send(`
<h2>🌱 Galápagos Token</h2>
<p>Producto: ${rows[0].product_name}</p>
<p>Recompensa: $${reward.toFixed(2)} USD</p>
<button onclick="connect()">Conectar Phantom</button>

<script>
function connect(){
 if(!window.solana) alert("Instala Phantom");
 else window.solana.connect();
}
</script>
`);
});

app.listen(3000,()=>console.log("OK"));

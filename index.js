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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const BASE_URL = process.env.BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/* ======================
   HEALTH
====================== */
app.get("/", (_, res) => res.send("OK"));

/* ======================
   ADMIN UI
====================== */
app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }

  const { rows } = await pool.query(`
   SELECT 
  product_name,
  batch_id,
  value_usd,
  COUNT(*) AS total,
  MAX(created_at) AS created_at
FROM qrs
WHERE batch_id IS NOT NULL
GROUP BY product_name, batch_id, value_usd
ORDER BY created_at DESC

  `);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Galápagos Token Admin</title>
<style>
body{
  background:radial-gradient(circle at top,#0a3d2e,#000);
  font-family:Arial;
  color:#e0fff5;
}
.container{max-width:900px;margin:40px auto;}
.card{
  background:#041b15;
  border:1px solid #0f5132;
  border-radius:16px;
  padding:20px;
  margin-bottom:20px;
  box-shadow:0 0 25px rgba(0,255,180,.15);
}
h1,h2{color:#38f5c5}
button{
  background:#20c997;
  color:#000;
  border:none;
  padding:10px 18px;
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
small{color:#9df}
</style>
</head>
<body>
<div class="container">
  <h1>🌿 Galápagos Token Admin</h1>

  <div class="card">
    <h2>Generar QRs</h2>
    <input id="product" placeholder="Producto" />
    <input id="value" type="number" placeholder="Valor USD" />
    <input id="qty" type="number" placeholder="Cantidad" />
    <button onclick="generate()">Generar</button>
  </div>

  <div class="card">
    <h2>Lotes generados</h2>
    ${rows.map(r=>`
      <div style="margin-bottom:12px">
        <b>${r.product_name}</b> – $${r.value_usd} USD<br/>
        QRs: ${r.total}<br/>
        <a href="/admin/download/${r.batch_id}?token=${ADMIN_TOKEN}">
          <button>Descargar ZIP</button>
        </a>
      </div>
    `).join("")}
  </div>
</div>

<script>
async function generate(){
  const res = await fetch("/admin/generate?token=${ADMIN_TOKEN}",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      product_name:product.value,
      value_usd:value.value,
      quantity:qty.value
    })
  });
  if(res.ok) location.reload();
  else alert("Error generando QRs");
}
</script>
</body>
</html>
`);
});

/* ======================
   GENERAR QRs
====================== */
app.post("/admin/generate", async (req, res) => {
  try {
    const { product_name, value_usd, quantity } = req.body;

    if (!product_name || !value_usd || !quantity) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const batchId = crypto.randomUUID();

    for (let i = 0; i < quantity; i++) {
      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO qrs (id, product_name, value_usd, batch_id)
         VALUES ($1, $2, $3, $4)`,
        [id, product_name, value_usd, batchId]
      );
    }

    res.json({ success: true, batchId });

  } catch (err) {
    console.error("ERROR GENERANDO QRS:", err);
    res.status(500).json({ error: "Error generando QRs" });
  }
});

/* ======================
   DESCARGAR ZIP
====================== */
if (!req.params.batchId || req.params.batchId === "null") {
  return res.status(400).send("Batch inválido");
}
app.get("/admin/download/:batchId", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }

  const { batchId } = req.params;
  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE batch_id=$1",
    [batchId]
  );

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=${batchId}.zip`);

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const url = `${BASE_URL}/r/${qr.id}`;
    const img = await QRCode.toBuffer(url);
    archive.append(img, {
      name: `${qr.product_name}/${qr.id}.png`,
    });
  }

  archive.finalize();
});

/* ======================
   REDIRECT QR
====================== */
app.get("/r/:id", (req, res) => {
  res.redirect(
    `https://phantom.app/ul/browse/${encodeURIComponent(
      BASE_URL + "/claim/" + req.params.id
    )}`
  );
});

/* ======================
   SERVER
====================== */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Backend listo en", PORT));

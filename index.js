import express from "express";
import cors from "cors";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CONFIG
========================= */
const ADMIN_TOKEN = "galapagos_admin_2026";
const BASE_URL = "https://galapagos-backend.onrender.com";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =========================
   ADMIN AUTH
========================= */
function adminAuth(req, res, next) {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send("Acceso denegado");
  }
  next();
}

/* =========================
   ADMIN HTML (VISTA)
========================= */
app.get("/admin", adminAuth, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Galápagos Token Admin</title>
  <style>
    body {
      background: radial-gradient(circle at top, #0f3d2e, #02130e);
      font-family: Arial, sans-serif;
      color: #d1fff0;
      padding: 40px;
    }
    h1 { color: #1cffb7; }
    .card {
      background: rgba(0,0,0,.4);
      border: 1px solid #1cffb7;
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 20px;
    }
    button {
      background: #1cffb7;
      border: none;
      padding: 10px 16px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td, th {
      border-bottom: 1px solid #1cffb733;
      padding: 8px;
      text-align: left;
    }
  </style>
</head>
<body>

<h1>🌱 Galápagos Token Admin</h1>

<div class="card">
  <h2>📊 Estadísticas</h2>
  <div id="stats">Cargando...</div>
</div>

<div class="card">
  <h2>➕ Generar QRs</h2>
  <input id="product" placeholder="Producto"/>
  <input id="value" placeholder="Valor USD"/>
  <input id="qty" placeholder="Cantidad"/>
  <br/><br/>
  <button onclick="generate()">Generar</button>
</div>

<div class="card">
  <h2>📥 Descargas</h2>
  <input id="downloadProduct" placeholder="Producto"/>
  <br/><br/>
  <button onclick="download(true)">Descargar SOLO nuevos</button>
  <button onclick="download(false)">Descargar TODOS</button>
</div>

<div class="card">
  <h2>📋 QRs</h2>
  <table id="table"></table>
</div>

<script>
async function load() {
  const stats = await fetch('/api/admin/stats?token=${ADMIN_TOKEN}').then(r=>r.json());
  document.getElementById('stats').innerHTML =
    'Total QRs: ' + stats.total +
    '<br/>Reclamados: ' + stats.claimed +
    '<br/>Pendientes: ' + stats.active;

  const qrs = await fetch('/api/admin/qrs?token=${ADMIN_TOKEN}').then(r=>r.json());
  let html = '<tr><th>ID</th><th>Producto</th><th>USD</th><th>Estado</th></tr>';
  qrs.forEach(q=>{
    html += '<tr><td>'+q.id+'</td><td>'+q.product_name+'</td><td>'+q.value_usd+'</td><td>'+(q.claimed_at?'Reclamado':'Activo')+'</td></tr>';
  });
  document.getElementById('table').innerHTML = html;
}

async function generate() {
  await fetch('/api/admin/generate?token=${ADMIN_TOKEN}', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      product: product.value,
      value: value.value,
      qty: qty.value
    })
  });
  load();
}

function download(onlyNew) {
  const p = document.getElementById('downloadProduct').value;
  window.location = '/admin/download/' + p + '?onlyNew=' + (onlyNew?1:0) + '&token=${ADMIN_TOKEN}';
}

load();
</script>

</body>
</html>
`);
});

/* =========================
   ADMIN API
========================= */
app.get("/api/admin/qrs", adminAuth, async (req,res)=>{
  const r = await pool.query("SELECT * FROM qrs ORDER BY created_at DESC");
  res.json(r.rows);
});

app.get("/api/admin/stats", adminAuth, async (req,res)=>{
  const r = await pool.query(`
    SELECT
      COUNT(*) total,
      COUNT(*) FILTER (WHERE claimed_at IS NOT NULL) claimed,
      COUNT(*) FILTER (WHERE claimed_at IS NULL) active
    FROM qrs
  `);
  res.json(r.rows[0]);
});

app.post("/api/admin/generate", adminAuth, async (req,res)=>{
  const { product, value, qty } = req.body;
  for (let i=0;i<qty;i++) {
    await pool.query(
      "INSERT INTO qrs (product_name,value_usd) VALUES ($1,$2)",
      [product,value]
    );
  }
  res.json({ok:true});
});

app.get("/admin/download/:product", adminAuth, async (req,res)=>{
  const onlyNew = req.query.onlyNew === "1";
  const rows = await pool.query(`
    SELECT * FROM qrs
    WHERE product_name=$1
    ${onlyNew ? "AND downloaded_at IS NULL" : ""}
  `,[req.params.product]);

  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition","attachment; filename=qrs.zip");

  const zip = archiver("zip");
  zip.pipe(res);

  for (const qr of rows.rows) {
    const url = BASE_URL + "/r/" + qr.id;
    const img = await QRCode.toBuffer(url);
    zip.append(img,{ name: qr.id + ".png" });
  }

  zip.finalize();

  if (onlyNew) {
    await pool.query(
      "UPDATE qrs SET downloaded_at=NOW() WHERE product_name=$1 AND downloaded_at IS NULL",
      [req.params.product]
    );
  }
});

/* =========================
   SERVER
========================= */
app.listen(8080, ()=>console.log("Admin OK"));

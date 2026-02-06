import express from "express";
import cors from "cors";
import pg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";

const app = express();
app.use(cors());
app.use(express.json());

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = process.env.BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/* ===================== HELPERS ===================== */

function adminAuth(req, res) {
  if (req.query.token !== ADMIN_TOKEN) {
    res.status(403).send("Unauthorized");
    return false;
  }
  return true;
}

/* ===================== CLAIM PAGE ===================== */

app.get("/r/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [id]
  );

  if (!rows.length) return res.send("QR inválido");

  const qr = rows[0];
  const phantomLink =
    `https://phantom.app/ul/browse/` +
    encodeURIComponent(`${BASE_URL}/r/${id}`);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Galápagos Token</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
body{
background:radial-gradient(circle,#0a2f23,#02150f);
color:#aef7d1;
font-family:Arial;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}
.card{
background:#03261b;
padding:30px;
border-radius:16px;
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
}
img{width:80px;margin-bottom:15px;}
</style>
</head>
<body>
<div class="card">
<img src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png"/>
<h2>Galápagos Token</h2>
<p>Producto: <b>${qr.product_name}</b></p>
<p>Recompensa: <b>$${qr.value_usd} USD</b></p>
<p>✔ Abierto desde Phantom</p>
<a href="${phantomLink}">
<button>Reclamar con Phantom</button>
</a>
</div>
</body>
</html>
`);
});

/* ===================== ADMIN DASHBOARD ===================== */

app.get("/admin", async (req, res) => {
  if (!adminAuth(req, res)) return;

  const stats = await pool.query(`
    SELECT
      COUNT(*) total,
      COUNT(claimed_at) claimed,
      COUNT(*) - COUNT(claimed_at) available
    FROM qrs
  `);

  const products = await pool.query(`
    SELECT product_name,
           COUNT(*) total,
           COUNT(claimed_at) claimed
    FROM qrs
    GROUP BY product_name
  `);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Galápagos Admin</title>
<style>
body{background:#02150f;color:#aef7d1;font-family:Arial;padding:30px;}
.card{background:#03261b;padding:20px;border-radius:14px;margin-bottom:20px;box-shadow:0 0 20px #00ffb3;}
button{background:#00ffb3;border:none;padding:10px 16px;border-radius:8px;font-weight:bold;}
input{padding:8px;border-radius:6px;border:none;margin:5px;}
</style>
</head>
<body>

<h1>🌱 Galápagos Token Admin</h1>

<div class="card">
<h3>📊 Estadísticas</h3>
<p>Total QRs: ${stats.rows[0].total}</p>
<p>Reclamados: ${stats.rows[0].claimed}</p>
<p>Disponibles: ${stats.rows[0].available}</p>
</div>

<div class="card">
<h3>➕ Generar QRs</h3>
<form action="/admin/generate" method="get">
<input name="product" placeholder="Producto" required>
<input name="usd" placeholder="USD" type="number" required>
<input name="qty" placeholder="Cantidad" type="number" required>
<input type="hidden" name="token" value="${ADMIN_TOKEN}">
<br>
<button>Generar</button>
</form>
</div>

<div class="card">
<h3>📦 Descargas por producto</h3>
${products.rows.map(p=>`
<p>
<b>${p.product_name}</b>
(${p.claimed}/${p.total})
<a href="/admin/download/${p.product_name}?token=${ADMIN_TOKEN}">
<button>ZIP</button>
</a>
<a href="/admin/download/${p.product_name}?onlyNew=1&token=${ADMIN_TOKEN}">
<button>Solo nuevos</button>
</a>
</p>
`).join("")}
</div>

</body>
</html>
`);
});

/* ===================== GENERAR QRS ===================== */

app.get("/admin/generate", async (req, res) => {
  if (!adminAuth(req, res)) return;

  const { product, usd, qty } = req.query;

  for (let i = 0; i < qty; i++) {
    await pool.query(
      `INSERT INTO qrs (product_name,value_usd) VALUES ($1,$2)`,
      [product, usd]
    );
  }

  res.redirect(`/admin?token=${ADMIN_TOKEN}`);
});

/* ===================== DESCARGAR ZIP ===================== */

app.get("/admin/download/:product", async (req, res) => {
  if (!adminAuth(req, res)) return;

  const { product } = req.params;
  const onlyNew = req.query.onlyNew === "1";

  const q = `
    SELECT * FROM qrs
    WHERE product_name=$1
    ${onlyNew ? "AND downloaded_at IS NULL" : ""}
  `;
  const { rows } = await pool.query(q, [product]);

  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition",`attachment; filename=${product}.zip`);

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const phantomUrl =
      `https://phantom.app/ul/browse/` +
      encodeURIComponent(`${BASE_URL}/r/${qr.id}`);

    const img = await QRCode.toBuffer(phantomUrl);
    archive.append(img, { name: `${product}/${qr.id}.png` });

    await pool.query(
      "UPDATE qrs SET downloaded_at=now() WHERE id=$1",
      [qr.id]
    );
  }

  archive.finalize();
});

/* ===================== START ===================== */

app.listen(3000, () => console.log("Galápagos backend live"));

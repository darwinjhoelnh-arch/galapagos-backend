import express from "express";
import cors from "cors";
import http from "http";
import pkg from "pg";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import archiver from "archiver";
import { v4 as uuidv4 } from "uuid";

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===============================
   CONFIG
================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const BASE_URL = "https://galapagos-backend.onrender.com";

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => res.send("Galápagos Backend OK 🐢"));

/* ===============================
   REDIRECT QR → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const url = `${BASE_URL}/claim/${req.params.id}`;
  const phantom =
    "https://phantom.app/ul/browse/" + encodeURIComponent(url);
  res.redirect(302, phantom);
});

/* ===============================
   CLAIM PAGE (NO SE TOCA)
================================ */
app.get("/claim/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [req.params.id]
  );

  if (!rows.length) return res.send("QR no existe");
  if (rows[0].used) return res.send("QR ya usado");

  const reward = (rows[0].value_usd * 0.01).toFixed(2);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Reclamar</title>
<style>
body{background:#020b08;color:#eafff5;font-family:Arial}
.card{max-width:420px;margin:40px auto;background:#041a12;
border-radius:20px;padding:24px;text-align:center}
button{background:#00ffb3;border:none;padding:14px;
width:100%;border-radius:12px;font-size:18px}
</style>
</head>
<body>
<div class="card">
<h2>GALÁPAGOS TOKEN</h2>
<p>Producto: ${rows[0].product_name}</p>
<p>Recompensa: $${reward} USD en tokens</p>
<button onclick="claim()">Firmar y reclamar</button>
</div>
<script>
async function claim(){
  if(!window.solana){alert("Abrir en Phantom");return;}
  await window.solana.connect();
  await fetch("/claim/${rows[0].id}/sign",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      wallet:window.solana.publicKey.toString()
    })
  });
  alert("🎉 Felicidades por ser parte de Galápagos Token");
}
</script>
</body>
</html>
`);
});

/* ===============================
   CONFIRM CLAIM
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  const r = await pool.query(
    "UPDATE qrs SET used=true, wallet=$1, claimed_at=NOW() WHERE id=$2 AND used=false",
    [req.body.wallet, req.params.id]
  );
  res.json({
    mensaje: r.rowCount
      ? "🎉 Felicidades por ser parte de Galápagos Token"
      : "QR inválido"
  });
});

/* ===============================
   ADMIN DASHBOARD (YA FUNCIONABA)
================================ */
app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN)
    return res.status(403).send("No autorizado");

  const { rows } = await pool.query(
    "SELECT * FROM qrs ORDER BY created_at DESC"
  );

  res.send(`
<h2>Galápagos Admin</h2>
<form method="POST" action="/admin/generate?token=${req.query.token}">
Producto: <input name="product" required>
Cantidad: <input name="qty" type="number" required>
Valor USD: <input name="value_usd" type="number" step="0.01" required>
<button>Generar QRs</button>
</form>
<ul>
${rows.map(r=>`<li>${r.product_name} | batch ${r.batch_id} | ${r.id}</li>`).join("")}
</ul>
`);
});

/* ===============================
   GENERAR QRs POR PRODUCTO + BATCH
================================ */
app.post("/admin/generate", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN)
    return res.status(403).send("No autorizado");

  const { product, qty, value_usd } = req.body;

  const batchRes = await pool.query(
    "SELECT COALESCE(MAX(batch_id),0)+1 AS next FROM qrs WHERE product_name=$1",
    [product]
  );

  const batch = batchRes.rows[0].next;
  const folder = `qrs/${product}/batch_${batch}`;
  fs.mkdirSync(folder, { recursive: true });

  const ids = [];

  for (let i = 0; i < qty; i++) {
    const id = uuidv4();
    ids.push(id);

    await pool.query(
      "INSERT INTO qrs (id, product_name, batch_id, value_usd) VALUES ($1,$2,$3,$4)",
      [id, product, batch, value_usd]
    );

    await QRCode.toFile(
      `${folder}/${id}.png`,
      `${BASE_URL}/r/${id}`,
      { width: 600 }
    );
  }

  // ZIP SOLO DEL BATCH NUEVO
  const zipPath = `${folder}.zip`;
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip");

  archive.pipe(output);
  archive.directory(folder, false);
  await archive.finalize();

  res.download(zipPath);
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
http.createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log("Backend Galápagos LIVE 🐢");
});

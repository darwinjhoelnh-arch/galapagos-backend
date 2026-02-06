import express from "express";
import cors from "cors";
import http from "http";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===============================
   CONFIGURACIÓN
================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("Galapagos Backend OK");
});

/* ===============================
   REDIRECT QR → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const claimUrl = `https://galapagos-backend.onrender.com/claim/${req.params.id}`;
  const phantomUrl =
    "https://phantom.app/ul/browse/" + encodeURIComponent(claimUrl);

  res.redirect(302, phantomUrl);
});

/* ===============================
   CLAIM PAGE
================================ */
app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const qrRes = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [id]
  );

  if (!qrRes.rows.length) {
    return res.send("QR no existe");
  }

  const qr = qrRes.rows[0];

  if (qr.used) {
    return res.send("Este QR ya fue usado");
  }

  const rewardUsd = qr.value_usd * 0.01;

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Reclamar Galápagos Token</title>
<style>
body{
  background:#020b08;
  font-family:Arial;
  color:#eafff5;
}
.card{
  max-width:420px;
  margin:40px auto;
  background:#041a12;
  border-radius:20px;
  padding:24px;
  text-align:center;
  box-shadow:0 0 30px #0aff9d55;
}
.logo{
  width:120px;
  margin-bottom:10px;
}
.amount{
  font-size:26px;
  color:#00ffb3;
  margin:15px 0;
}
button{
  background:#0aff9d;
  border:none;
  padding:14px;
  width:100%;
  border-radius:12px;
  font-size:18px;
  cursor:pointer;
}
</style>
</head>
<body>
<div class="card">
<img class="logo" src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png"/>
<h2>GALÁPAGOS TOKEN</h2>
<p>Recompensa ecológica</p>
<div class="amount">$${rewardUsd.toFixed(2)} USD en tokens</div>
<button onclick="claim()">Firmar y reclamar</button>
</div>

<script>
async function claim(){
  if(!window.solana){
    alert("Abre este enlace dentro de Phantom Wallet");
    return;
  }

  await window.solana.connect();
  const msg = new TextEncoder().encode("Reclamo Galápagos QR ${id}");
  await window.solana.signMessage(msg,"utf8");

  const r = await fetch("/claim/${id}/sign",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      wallet: window.solana.publicKey.toString()
    })
  });

  const d = await r.json();
  alert(d.mensaje);
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
  const { id } = req.params;
  const { wallet } = req.body;

  const result = await pool.query(
    "UPDATE qrs SET used=true, wallet=$1, claimed_at=NOW() WHERE id=$2 AND used=false",
    [wallet, id]
  );

  if (!result.rowCount) {
    return res.json({ mensaje: "QR inválido o ya usado" });
  }

  res.json({
    mensaje: "🎉 Felicidades por ser parte de Galápagos Token 🐢🌱"
  });
});

/* ===============================
   ADMIN DASHBOARD PRO
================================ */
app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send("Acceso denegado");
  }

  const qrs = await pool.query(`
    SELECT
      q.id,
      q.value_usd,
      q.used,
      q.created_at,
      q.wallet,
      q.claimed_at
    FROM qrs q
    ORDER BY q.created_at DESC
  `);

  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE used=true) AS usados,
      COUNT(*) FILTER (WHERE used=false) AS libres,
      COALESCE(SUM(value_usd) FILTER (WHERE used=true),0) AS total_usd
    FROM qrs
  `);

  const s = stats.rows[0];

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Galápagos Admin</title>
<style>
body{background:#050b0a;color:#eafff5;font-family:Arial}
.container{max-width:1200px;margin:30px auto}
.card{background:#041a12;padding:20px;border-radius:14px;margin-bottom:20px}
h1{color:#00ffb3}
.stat{display:inline-block;margin-right:20px}
table{width:100%;border-collapse:collapse}
th,td{padding:8px;border-bottom:1px solid #0aff9d22;font-size:13px}
th{color:#0aff9d}
.used{color:#ff6b6b;font-weight:bold}
.free{color:#00ffb3;font-weight:bold}
button{background:#00ffb3;border:none;padding:10px;border-radius:8px;cursor:pointer}
input{padding:8px;border-radius:6px;border:none;margin-right:10px}
</style>
</head>
<body>
<div class="container">

<h1>🐢 Galápagos Token — Admin</h1>

<div class="card">
  <div class="stat">Total QRs: <b>${s.total}</b></div>
  <div class="stat">Usados: <b>${s.usados}</b></div>
  <div class="stat">Libres: <b>${s.libres}</b></div>
  <div class="stat">USD reclamado: <b>$${Number(s.total_usd).toFixed(2)}</b></div>
  <br><br>

  <a href="/admin/csv?token=${req.query.token}">
    <button>⬇ Descargar CSV</button>
  </a>

  <hr style="border-color:#0aff9d22;margin:16px 0"/>

  <form method="POST" action="/admin/generate?token=${req.query.token}">
    <label>Cantidad:</label>
    <input name="qty" type="number" min="1" required>
    <label>Valor USD:</label>
    <input name="value_usd" type="number" step="0.01" required>
    <button type="submit">➕ Generar QRs</button>
  </form>
</div>

<div class="card">
<table>
<tr>
<th>ID</th><th>USD</th><th>Estado</th><th>Wallet</th><th>Creado</th><th>Reclamado</th>
</tr>
${qrs.rows.map(r=>`
<tr>
<td>${r.id}</td>
<td>$${r.value_usd}</td>
<td class="${r.used?'used':'free'}">${r.used?'USADO':'LIBRE'}</td>
<td>${r.wallet||'-'}</td>
<td>${r.created_at?new Date(r.created_at).toLocaleString():''}</td>
<td>${r.claimed_at?new Date(r.claimed_at).toLocaleString():''}</td>
</tr>`).join("")}
</table>
</div>

</div>
</body>
</html>
`);
});

/* ===============================
   ADMIN CSV
================================ */
app.get("/admin/csv", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send("No autorizado");
  }

  const { rows } = await pool.query(`
    SELECT id,value_usd,used,wallet,created_at,claimed_at
    FROM qrs
    ORDER BY created_at DESC
  `);

  let csv = "id,value_usd,used,wallet,created_at,claimed_at\n";
  rows.forEach(r=>{
    csv += `${r.id},${r.value_usd},${r.used},${r.wallet||""},${r.created_at||""},${r.claimed_at||""}\n`;
  });

  res.setHeader("Content-Type","text/csv");
  res.setHeader("Content-Disposition","attachment; filename=galapagos_qrs.csv");
  res.send(csv);
});

/* ===============================
   ADMIN GENERATE QRS
================================ */
app.post("/admin/generate", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send("No autorizado");
  }

  const qty = parseInt(req.body.qty);
  const value = parseFloat(req.body.value_usd);

  if (!qty || !value) {
    return res.send("Datos inválidos");
  }

  await pool.query(
    `
    INSERT INTO qrs (id, value_usd)
    SELECT gen_random_uuid(), $1
    FROM generate_series(1, $2)
    `,
    [value, qty]
  );

  res.redirect("/admin?token=" + req.query.token);
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
http.createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log("🐢 Galápagos Backend LIVE");
});

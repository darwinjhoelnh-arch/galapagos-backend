import express from "express";
import cors from "cors";
import http from "http";
import pkg from "pg";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   DATABASE
================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ===============================
   HEALTH
================================ */
app.get("/", (_, res) => res.send("Galápagos Backend OK"));

/* ===============================
   QR → PHANTOM REDIRECT
================================ */
app.get("/r/:id", (req, res) => {
  const url = `https://phantom.app/ul/browse/${encodeURIComponent(
    `https://galapagos-backend.onrender.com/claim/${req.params.id}`
  )}`;
  res.redirect(302, url);
});

/* ===============================
   CLAIM PAGE
================================ */
app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [id]
  );

  if (!rows.length) return res.send("QR no existe");
  if (rows[0].used) return res.send("QR ya utilizado");

  const qr = rows[0];

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Reclamar Galápagos Token</title>
<style>
body {
  background: radial-gradient(circle, #0a1f1a, #000);
  font-family: Arial;
  color: #e6fff3;
  display:flex;
  align-items:center;
  justify-content:center;
  height:100vh;
}
.card {
  background:#031e16;
  padding:30px;
  border-radius:20px;
  width:360px;
  text-align:center;
  box-shadow:0 0 40px #00ffb3;
}
.logo {
  width:120px;
  margin-bottom:20px;
}
button {
  background:#00ffb3;
  border:none;
  padding:14px;
  width:100%;
  border-radius:12px;
  font-size:16px;
  cursor:pointer;
}
</style>
</head>
<body>
<div class="card">
<img class="logo" src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png"/>
<h2>Galápagos Token</h2>
<p>Producto: <b>${qr.product_name}</b></p>
<p>Valor: $${qr.product_price_usd}</p>
<p>Recompensa: <b>${qr.claim_percent}%</b></p>

<button onclick="firmar()">Firmar y reclamar</button>

<script>
async function firmar(){
  const provider = window.solana;
  if(!provider){ alert("Abre con Phantom"); return; }

  const msg = new TextEncoder().encode("Galápagos QR ${id}");
  const signed = await provider.signMessage(msg, "utf8");

  const r = await fetch("/claim/${id}/sign", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      wallet: provider.publicKey.toString(),
      signature: Array.from(signed.signature)
    })
  });

  const d = await r.json();
  alert(d.mensaje);
}
</script>
</div>
</body>
</html>
`);
});

/* ===============================
   CLAIM SIGN
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  const { id } = req.params;
  const { wallet } = req.body;

  const qrRes = await pool.query(
    "SELECT * FROM qrs WHERE id=$1 AND used=false",
    [id]
  );

  if (!qrRes.rows.length)
    return res.json({ mensaje: "QR inválido o usado" });

  const qr = qrRes.rows[0];

  // 🔥 Precio real del token (ejemplo con Jupiter API)
  const priceRes = await fetch(
    "https://price.jup.ag/v4/price?ids=6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump"
  );
  const priceData = await priceRes.json();
  const tokenPrice = priceData.data[Object.keys(priceData.data)[0]].price;

  const rewardUSD = qr.product_price_usd * (qr.claim_percent / 100);
  const tokens = rewardUSD / tokenPrice;

  await pool.query(
    "UPDATE qrs SET used=true WHERE id=$1",
    [id]
  );

  await pool.query(
    "INSERT INTO claims VALUES ($1,$2,$3,$4,$5,NOW())",
    [uuidv4(), id, wallet, tokens, null]
  );

  res.json({
    mensaje: "🎉 Felicidades por ser parte de Galápagos Token 🐢",
    tokens: tokens.toFixed(6)
  });
});

/* ===============================
   ADMIN DASHBOARD
================================ */
app.get("/admin", async (req, res) => {
  if (req.query.token !== process.env.ADMIN_TOKEN) {
    return res.status(403).send("Acceso denegado");
  }

  const qrs = await pool.query(`
    SELECT
      q.id,
      q.value_usd,
      q.used,
      q.created_at,
      c.wallet,
      c.created_at AS claimed_at
    FROM qrs q
    LEFT JOIN claims c ON c.qr_id = q.id
    ORDER BY q.created_at DESC
  `);

  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE used = true) AS usados,
      COUNT(*) FILTER (WHERE used = false) AS libres,
      COALESCE(SUM(value_usd) FILTER (WHERE used = true),0) AS total_usd
    FROM qrs
  `);

  const s = stats.rows[0];

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
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

app.get("/admin/csv", async (req, res) => {
  if (req.query.token !== process.env.ADMIN_TOKEN) {
    return res.status(403).send("No autorizado");
  }

  const { rows } = await pool.query(`
    SELECT
      q.id,
      q.value_usd,
      q.used,
      q.created_at,
      c.wallet,
      c.created_at AS claimed_at
    FROM qrs q
    LEFT JOIN claims c ON c.qr_id = q.id
    ORDER BY q.created_at DESC
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
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
http.createServer(app).listen(PORT, "0.0.0.0");

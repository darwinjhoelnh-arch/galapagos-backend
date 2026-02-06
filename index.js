import express from "express";
import cors from "cors";
import http from "http";
import pkg from "pg";
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

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin123";

/* ===============================
   INIT DB (AUTO)
================================ */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price_usd NUMERIC NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qrs (
      id UUID PRIMARY KEY,
      product_id INTEGER REFERENCES products(id),
      value_usd NUMERIC NOT NULL,
      used BOOLEAN DEFAULT false,
      wallet TEXT,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("📦 DB lista");
}

await initDB();

/* ===============================
   HEALTH
================================ */
app.get("/", (req, res) => {
  res.send("OK");
});

/* ===============================
   QR REDIRECT → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const url = `https://galapagos-backend.onrender.com/claim/${req.params.id}`;
  const phantom =
    "https://phantom.app/ul/browse/" + encodeURIComponent(url);
  res.redirect(302, phantom);
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
<meta charset="UTF-8">
<title>Galápagos Token</title>
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
    alert("Abre esto dentro de Phantom");
    return;
  }

  await window.solana.connect();
  const msg = new TextEncoder().encode("Reclamo Galápagos ${id}");
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
    "UPDATE qrs SET used=true, wallet=$1, used_at=NOW() WHERE id=$2 AND used=false",
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
   ADMIN AUTH
================================ */
function adminAuth(req, res, next) {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send("No autorizado");
  }
  next();
}

/* ===============================
   ADMIN DASHBOARD
================================ */
app.get("/admin", adminAuth, async (req, res) => {
  const products = await pool.query("SELECT * FROM products");
  const qrs = await pool.query("SELECT * FROM qrs ORDER BY created_at DESC");

  res.send(`
<html>
<head>
<style>
body{background:#020b08;color:#eafff5;font-family:Arial}
.card{background:#041a12;padding:20px;margin:20px;border-radius:12px}
table{width:100%;border-collapse:collapse}
td,th{padding:8px;border-bottom:1px solid #0aff9d33}
button{background:#0aff9d;border:none;padding:8px;border-radius:6px}
</style>
</head>
<body>

<div class="card">
<h2>Crear producto</h2>
<form method="POST" action="/admin/product?token=${req.query.token}">
<input name="name" placeholder="Nombre">
<input name="price" placeholder="Precio USD">
<button>Crear</button>
</form>
</div>

<div class="card">
<h2>Generar QRs</h2>
<form method="POST" action="/admin/qrs?token=${req.query.token}">
<input name="product_id" placeholder="ID producto">
<input name="qty" placeholder="Cantidad">
<button>Generar</button>
</form>
</div>

<div class="card">
<h2>QRs</h2>
<table>
<tr><th>ID</th><th>USD</th><th>Estado</th><th>Wallet</th></tr>
${qrs.rows.map(q=>`
<tr>
<td>${q.id}</td>
<td>$${q.value_usd}</td>
<td>${q.used?"Usado":"Libre"}</td>
<td>${q.wallet||"-"}</td>
</tr>`).join("")}
</table>
</div>

</body>
</html>
`);
});

/* ===============================
   ADMIN ACTIONS
================================ */
app.post("/admin/product", adminAuth, async (req,res)=>{
  await pool.query(
    "INSERT INTO products(name,price_usd) VALUES($1,$2)",
    [req.body.name, req.body.price]
  );
  res.redirect("/admin?token="+req.query.token);
});

app.post("/admin/qrs", adminAuth, async (req,res)=>{
  const prod = await pool.query(
    "SELECT * FROM products WHERE id=$1",
    [req.body.product_id]
  );

  if(!prod.rows.length){
    return res.send("Producto no existe");
  }

  for(let i=0;i<req.body.qty;i++){
    await pool.query(
      "INSERT INTO qrs(id,product_id,value_usd) VALUES($1,$2,$3)",
      [uuidv4(), req.body.product_id, prod.rows[0].price_usd]
    );
  }

  res.redirect("/admin?token="+req.query.token);
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
http.createServer(app).listen(PORT, "0.0.0.0", () => {
  console.log("🐢 Galápagos Backend LIVE");
});

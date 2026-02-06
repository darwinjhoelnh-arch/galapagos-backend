import express from "express";
import cors from "cors";
import http from "http";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import { pool } from "./db.js";
import { initDB } from "./db-init.js";

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 INIT DB
await initDB();

// 🔹 HEALTH
app.get("/", (req, res) => {
  res.send("OK");
});

/* ===============================
   REDIRECT QR → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const { id } = req.params;

  const phantomUrl =
    "https://phantom.app/ul/browse/" +
    encodeURIComponent(`https://galapagos-backend.onrender.com/claim/${id}`);

  res.redirect(302, phantomUrl);
});

/* ===============================
   CLAIM PAGE
================================ */
app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id = $1",
    [id]
  );

  if (rows.length === 0) {
    return res.send("QR no existe");
  }

  const qr = rows[0];
  if (qr.used) {
    return res.send("Este QR ya fue reclamado");
  }

  // 1% del valor
  const rewardUsd = qr.value_usd * 0.01;

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Reclamar Galápagos Token</title>
<style>
body{
  margin:0;
  background:#020b08;
  font-family:Arial, sans-serif;
  color:#e6fff4;
}
.container{
  max-width:420px;
  margin:40px auto;
  background:#041a12;
  border-radius:20px;
  padding:24px;
  box-shadow:0 0 40px #0aff9d33;
  text-align:center;
}
.logo{
  width:120px;
  margin-bottom:16px;
}
h1{
  color:#0aff9d;
}
.amount{
  font-size:28px;
  margin:16px 0;
  color:#00ffb3;
}
button{
  background:#0aff9d;
  color:#022;
  border:none;
  padding:14px 20px;
  border-radius:12px;
  font-size:18px;
  cursor:pointer;
}
.footer{
  margin-top:16px;
  font-size:12px;
  opacity:.7;
}
</style>
</head>
<body>
<div class="container">
  <img class="logo" src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png"/>
  <h1>GALÁPAGOS TOKEN</h1>
  <p>Recompensa ecológica verificada</p>
  <div class="amount">$${rewardUsd.toFixed(2)} USD en tokens</div>

  <button onclick="firmar()">Firmar y reclamar</button>

  <div class="footer">
    Reclamo seguro vía Phantom Wallet
  </div>
</div>

<script>
async function firmar(){
  const provider = window.solana;
  if(!provider){
    alert("Abre este enlace dentro de Phantom");
    return;
  }

  const msg = new TextEncoder().encode("Reclamo Galápagos ${id}");
  const signed = await provider.signMessage(msg, "utf8");

  const res = await fetch("/claim/${id}/sign",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      wallet: provider.publicKey.toString(),
      signature: Array.from(signed.signature)
    })
  });

  const data = await res.json();
  alert(data.mensaje);
}
</script>
</body>
</html>
`);
});

/* ===============================
   SIGN CONFIRM
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  const { id } = req.params;
  const { wallet } = req.body;

  const { rowCount } = await pool.query(
    "UPDATE qrs SET used=true, used_at=NOW(), wallet=$1 WHERE id=$2 AND used=false",
    [wallet, id]
  );

  if (!rowCount) {
    return res.json({ mensaje:"QR ya usado o inválido" });
  }

  res.json({
    mensaje:"🎉 Felicidades por ser parte de Galápagos Token 🐢🌱"
  });
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Backend corriendo en puerto " + PORT);
});

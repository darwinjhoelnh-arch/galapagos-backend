import express from "express";
import fs from "fs";
import cors from "cors";
import http from "http";
import fetch from "node-fetch";

import {
  Connection,
  PublicKey,
  Keypair
} from "@solana/web3.js";

import {
  getOrCreateAssociatedTokenAccount,
  transfer
} from "@solana/spl-token";

/* ===============================
   CONFIG
================================ */
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const MINT_ADDRESS = "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump";
const DECIMALS = 6;

const LOGO_URL =
  "https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png";

/* ===============================
   SOLANA SETUP
================================ */
if (!process.env.TREASURY_PRIVATE_KEY) {
  throw new Error("TREASURY_PRIVATE_KEY no definida");
}

const treasurySecret = JSON.parse(process.env.TREASURY_PRIVATE_KEY);
const treasuryKeypair = Keypair.fromSecretKey(
  Uint8Array.from(treasurySecret)
);

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

/* ===============================
   PRECIO TOKEN (CACHE)
================================ */
let cachedPrice = null;
let lastFetch = 0;

async function getTokenPriceUSD() {
  const now = Date.now();
  if (cachedPrice && now - lastFetch < 30000) {
    return cachedPrice;
  }

  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=galapagos-token&vs_currencies=usd"
  );
  const data = await res.json();

  cachedPrice = data["galapagos-token"].usd;
  lastFetch = now;

  return cachedPrice;
}

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("Galápagos Token Backend OK 🌱");
});

/* ===============================
   REDIRECT QR → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const { id } = req.params;

  const phantomLink =
    "https://phantom.app/ul/browse/" +
    encodeURIComponent(
      `https://galapagos-backend.onrender.com/claim/${id}`
    );

  res.redirect(302, phantomLink);
});

/* ===============================
   PÁGINA DE RECLAMO
================================ */
app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;
  const qrs = JSON.parse(fs.readFileSync("qrs.json"));

  if (!qrs[id]) return res.send("QR inválido");
  if (qrs[id].usado) return res.send("Este QR ya fue reclamado");

  const valorUsd = qrs[id].valor_usd;
  const recompensaUsd = valorUsd * 0.01;

  let price;
  try {
    price = await getTokenPriceUSD();
  } catch {
    return res.send("No se pudo obtener el precio del token");
  }

  const tokens = (recompensaUsd / price).toFixed(4);

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Reclamar Galápagos Token</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{margin:0;background:#050b08;font-family:Arial;color:#e8ffe8}
.container{min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#0c1f17;padding:30px;border-radius:18px;width:360px;text-align:center}
.reward span{font-size:26px;color:#00ff9c}
button{width:100%;padding:14px;border-radius:12px;border:none;background:#00ff9c;font-weight:bold}
.success{margin-top:16px;padding:14px;background:rgba(0,255,150,.15);border-radius:12px}
</style>
</head>

<body>
<div class="container">
  <div class="card">
    <img src="${LOGO_URL}" width="140" />
    <h2>Galápagos Token</h2>

    <p>Valor QR: <b>$${valorUsd} USD</b></p>
    <p>Precio actual token: <b>$${price} USD</b></p>

    <div class="reward">
      Recompensa (1%)
      <span>${tokens} GAL</span>
    </div>

    <button onclick="firmar()">Firmar y reclamar</button>
    <div id="res"></div>
  </div>
</div>

<script>
async function firmar(){
  if(!window.solana){
    document.getElementById("res").innerHTML =
      "<div class='success'>Abre desde Phantom</div>";
    return;
  }

  await window.solana.connect();
  const msg = new TextEncoder().encode("Reclamo Galápagos QR ${id}");
  await window.solana.signMessage(msg,"utf8");

  const r = await fetch("/claim/${id}/sign",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ wallet:window.solana.publicKey.toString() })
  });

  document.getElementById("res").innerHTML =
    "<div class='success'>🌱 Felicidades, ya eres parte de Galápagos Token</div>";
}
</script>

</body>
</html>
`);
});

/* ===============================
   ENVÍO REAL DE TOKENS
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  const { id } = req.params;
  const { wallet } = req.body;

  const qrs = JSON.parse(fs.readFileSync("qrs.json"));
  if (!qrs[id] || qrs[id].usado) {
    return res.status(400).json({ error:"QR inválido" });
  }

  const recompensaUsd = qrs[id].valor_usd * 0.01;
  const price = await getTokenPriceUSD();
  const tokens = recompensaUsd / price;
  const amount = Math.floor(tokens * 10 ** DECIMALS);

  try {
    const mint = new PublicKey(MINT_ADDRESS);
    const user = new PublicKey(wallet);

    const fromAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair,
      mint,
      treasuryKeypair.publicKey
    );

    const toAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair,
      mint,
      user
    );

    await transfer(
      connection,
      treasuryKeypair,
      fromAccount.address,
      toAccount.address,
      treasuryKeypair,
      amount
    );

    qrs[id].usado = true;
    fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));

    res.json({ success:true });
  } catch (e) {
    res.status(500).json({ error:"Error enviando tokens" });
  }
});

/* ===============================
   SERVER
================================ */
http.createServer(app).listen(PORT,"0.0.0.0",()=>{
  console.log("Galápagos Backend LIVE 🚀");
});

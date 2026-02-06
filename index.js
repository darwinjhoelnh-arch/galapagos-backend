import express from "express";
import cors from "cors";
import fs from "fs";
import http from "http";
import fetch from "node-fetch";
import bs58 from "bs58";

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction
} from "@solana/web3.js";

import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction
} from "@solana/spl-token";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const RPC_URL = process.env.RPC_URL;
const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT);
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;

if (!TREASURY_PRIVATE_KEY) {
  throw new Error("TREASURY_PRIVATE_KEY no definida");
}

const treasury = Keypair.fromSecretKey(
  bs58.decode(TREASURY_PRIVATE_KEY)
);

const connection = new Connection(RPC_URL, "confirmed");

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("OK");
});

/* ===============================
   REDIRECT QR → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const url = `https://galapagos-backend.onrender.com/claim/${req.params.id}`;
  const phantomLink = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
  res.redirect(302, phantomLink);
});

/* ===============================
   CLAIM PAGE
================================ */
app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;
  const qrs = JSON.parse(fs.readFileSync("qrs.json"));

  if (!qrs[id]) return res.send("QR no existe");
  if (qrs[id].usado) return res.send("Este QR ya fue usado");

  const usdValue = qrs[id].valor_usd;
  const claimUsd = usdValue * 0.01;

  const priceRes = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
  );
  const priceData = await priceRes.json();
  const solPrice = priceData.solana.usd;

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Reclamar Galápagos Token</title>
<style>
body{
  background:radial-gradient(circle,#0b2f24,#000);
  font-family:Arial;
  color:#fff;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
}
.card{
  background:rgba(0,0,0,.6);
  padding:30px;
  border-radius:20px;
  width:320px;
  text-align:center;
  box-shadow:0 0 30px #00ffb3;
}
.logo{
  width:140px;
  margin-bottom:15px;
}
button{
  background:#00c897;
  border:none;
  padding:15px;
  width:100%;
  border-radius:12px;
  font-size:16px;
  font-weight:bold;
  cursor:pointer;
}
button:hover{opacity:.85}
.success{
  margin-top:15px;
  color:#00ffb3;
}
</style>
</head>

<body>
<div class="card">
  <img class="logo" src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png"/>
  <h2>GALÁPAGOS TOKEN</h2>
  <p>Valor QR: <b>$${usdValue} USD</b></p>
  <p>Reclamas: <b>$${claimUsd.toFixed(2)} USD</b></p>

  <button onclick="firmar()">Firmar y reclamar</button>

  <div id="msg"></div>

<script>
async function firmar(){
  const provider = window.solana;
  if(!provider){ alert("Phantom no disponible"); return; }

  await provider.connect();
  const message = new TextEncoder().encode("Reclamo Galapagos QR ${id}");
  const signed = await provider.signMessage(message,"utf8");

  const r = await fetch("/claim/${id}/sign",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      wallet:provider.publicKey.toString(),
      signature:Array.from(signed.signature)
    })
  });

  const d = await r.json();
  document.getElementById("msg").innerHTML =
    "<div class='success'>🎉 Felicidades por ser parte de Galápagos Token</div>";
}
</script>
</div>
</body>
</html>
`);
});

/* ===============================
   SIGN + TRANSFER
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  const { id } = req.params;
  const { wallet } = req.body;

  const qrs = JSON.parse(fs.readFileSync("qrs.json"));
  if (!qrs[id] || qrs[id].usado) {
    return res.status(400).json({ error: "QR inválido" });
  }

  const usd = qrs[id].valor_usd * 0.01;

  const priceRes = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
  );
  const priceData = await priceRes.json();
  const tokenPrice = priceData.solana.usd;

  const tokens = (usd / tokenPrice) * 10 ** 6;

  const userWallet = new PublicKey(wallet);

  const fromATA = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    TOKEN_MINT,
    treasury.publicKey
  );

  const toATA = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    TOKEN_MINT,
    userWallet
  );

  const tx = new Transaction().add(
    createTransferInstruction(
      fromATA.address,
      toATA.address,
      treasury.publicKey,
      Math.floor(tokens)
    )
  );

  await connection.sendTransaction(tx, [treasury]);

  qrs[id].usado = true;
  qrs[id].wallet = wallet;
  fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));

  res.json({ success: true });
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
http.createServer(app).listen(PORT, "0.0.0.0", () =>
  console.log("Galápagos Backend LIVE 🐢🚀")
);

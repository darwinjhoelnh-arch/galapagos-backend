import express from "express";
import fs from "fs";
import cors from "cors";
import http from "http";

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";

import bs58 from "bs58";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG SOLANA
================================ */
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
if (!TREASURY_PRIVATE_KEY) {
  throw new Error("TREASURY_PRIVATE_KEY no definida");
}

const treasury = Keypair.fromSecretKey(
  bs58.decode(TREASURY_PRIVATE_KEY)
);

const MINT = new PublicKey(
  "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump"
);

const TOKEN_DECIMALS = 6;

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (_, res) => res.send("OK"));

/* ===============================
   QR → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const url = `https://galapagos-backend.onrender.com/claim/${req.params.id}`;
  const phantom = "https://phantom.app/ul/browse/" + encodeURIComponent(url);
  res.redirect(302, phantom);
});

/* ===============================
   UI PHANTOM
================================ */
app.get("/claim/:id", (req, res) => {
  const qrs = JSON.parse(fs.readFileSync("qrs.json"));
  const qr = qrs[req.params.id];

  if (!qr) return res.send("QR no existe");
  if (qr.usado) return res.send("QR ya usado");

  res.send(`
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0f2027;color:white;padding:20px">
<h2>🌱 Galápagos Token</h2>
<p>QR: ${req.params.id}</p>
<p>Valor: $${qr.valor_usd} USD</p>
<button onclick="firmar()">Firmar y reclamar</button>

<script>
async function firmar() {
  const provider = window.solana;
  if (!provider) return alert("Abre desde Phantom");

  await provider.connect();
  const msg = new TextEncoder().encode("Reclamo QR ${req.params.id}");
  const sig = await provider.signMessage(msg, "utf8");

  const r = await fetch("/claim/${req.params.id}/sign", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      publicKey: provider.publicKey.toString(),
      signature: Array.from(sig.signature)
    })
  });

  const d = await r.json();
  alert(d.mensaje || d.error);
}
</script>
</body>
</html>
`);
});

/* ===============================
   FIRMA + ENVÍO TOKEN
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  const { publicKey } = req.body;
  const qrs = JSON.parse(fs.readFileSync("qrs.json"));
  const qr = qrs[req.params.id];

  if (!qr) return res.json({ error: "QR no existe" });
  if (qr.usado) return res.json({ error: "QR ya usado" });

  try {
    const user = new PublicKey(publicKey);

    const treasuryATA = await getAssociatedTokenAddress(
      MINT,
      treasury.publicKey
    );

    const userATA = await getAssociatedTokenAddress(
      MINT,
      user
    );

    const tx = new Transaction();

    const userAccountInfo = await connection.getAccountInfo(userATA);
    if (!userAccountInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          treasury.publicKey,
          userATA,
          user,
          MINT
        )
      );
    }

    const rewardTokens =
      Math.floor(qr.valor_usd * 0.01 * 10 ** TOKEN_DECIMALS);

    tx.add(
      createTransferInstruction(
        treasuryATA,
        userATA,
        treasury.publicKey,
        rewardTokens
      )
    );

    const sig = await connection.sendTransaction(tx, [treasury]);
    await connection.confirmTransaction(sig);

    qr.usado = true;
    qrs[req.params.id] = qr;
    fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));

    res.json({
      success: true,
      mensaje: "🎉 Recompensa enviada",
      tx: sig
    });

  } catch (e) {
    res.json({ error: e.message });
  }
});

/* ===============================
   SERVER
================================ */
const server = http.createServer(app);
server.listen(process.env.PORT || 8080, "0.0.0.0");

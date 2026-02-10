import express from "express";
import fs from "fs";
import cors from "cors";
import path from "path";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.resolve();
const BASE_URL = process.env.BASE_URL;

// static
app.use(express.static("public"));
app.use("/qrs", express.static("qrs"));

app.get("/", (_, res) => res.send("Galápagos Backend OK 🌱"));

/* ===== PRECIO REAL DESDE DEXSCREENER ===== */
async function getTokenPriceUSD() {
  const MINT = "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump";
  const url = `https://api.dexscreener.com/latest/dex/tokens/${MINT}`;
  const r = await fetch(url);
  const d = await r.json();

  if (!d.pairs || d.pairs.length === 0) {
    throw new Error("No hay pool activo");
  }

  const best = d.pairs.reduce((a, b) =>
    Number(a.liquidity?.usd || 0) > Number(b.liquidity?.usd || 0) ? a : b
  );

  return Number(best.priceUsd);
}

/* ===== QR → PHANTOM (SIN ERROR DE SINTAXIS) ===== */
app.get("/r/:id", (req, res) => {
  const target = encodeURIComponent(`${BASE_URL}/claim/${req.params.id}`);

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Abrir Phantom</title>
</head>
<body style="background:#000;color:#fff;text-align:center;padding-top:80px;font-family:Arial">
<h3>Abriendo Phantom…</h3>
<a id="open" href="https://phantom.app/ul/browse/${target}"
style="padding:16px 24px;background:#7c5cff;color:#fff;border-radius:12px;text-decoration:none">
Abrir Phantom</a>
<script>
setTimeout(function(){document.getElementById("open").click();},800);
</script>
</body>
</html>`);
});

/* ===== CLAIM ===== */
app.get("/claim/:id", (_, res) => {
  res.sendFile(path.join(__dirname, "public/claim.html"));
});

app.post("/claim/:id/sign", async (req, res) => {
  try {
    const { id } = req.params;
    const { publicKey } = req.body;

    const qrs = JSON.parse(fs.readFileSync("qrs.json"));
    const products = JSON.parse(fs.readFileSync("products.json"));

    const qr = qrs[id];
    if (!qr || qr.used) return res.json({ error: "QR inválido" });

    const product = products[qr.productId];
    const rewardUSD = Number(product.value) * 0.01;
    const priceUSD = await getTokenPriceUSD();
    const tokens = rewardUSD / priceUSD;

    qr.used = true;
    qr.claimedBy = publicKey;
    qr.reward = { rewardUSD, priceUSD, tokens };

    fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));

    res.json({ success: true, rewardUSD, priceUSD, tokens });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ===== ADMIN ===== */
app.post("/admin/create-product", async (req, res) => {
  if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: "No autorizado" });

  const { name, value, units } = req.body;
  const pid = "prod_" + uuidv4();

  const products = JSON.parse(fs.readFileSync("products.json"));
  products[pid] = { name, value, units };
  fs.writeFileSync("products.json", JSON.stringify(products, null, 2));

  const qrs = JSON.parse(fs.readFileSync("qrs.json"));
  const created = [];

  for (let i = 0; i < units; i++) {
    const qid = "qr_" + uuidv4();
    qrs[qid] = { productId: pid, used: false };

    const url = `${BASE_URL}/r/${qid}`;
    const file = `qrs/${qid}.png`;
    await QRCode.toFile(file, url);

    created.push({ qid, qr: `${BASE_URL}/${file}` });
  }

  fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));
  res.json({ pid, created });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Servidor OK en puerto " + PORT));

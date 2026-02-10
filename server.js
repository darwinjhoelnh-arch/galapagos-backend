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

// servir archivos
app.use(express.static("public"));
app.use("/qrs", express.static("qrs"));

// health
app.get("/", (_, res) => res.send("Galápagos Backend OK 🌱"));

/* ===============================
   PRECIO REAL DESDE DEXSCREENER
================================ */
async function getGalapagosTokenPriceUSD() {
  const MINT = "6Z17TYRxJtPvHSGh7s6wtcERgxHGv37sBq6B9Sd1pump";
  const url = `https://api.dexscreener.com/latest/dex/tokens/${MINT}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.pairs || data.pairs.length === 0) {
    throw new Error("No se encontró pool activo");
  }

  const bestPair = data.pairs.reduce((a, b) =>
    Number(a.liquidity?.usd || 0) > Number(b.liquidity?.usd || 0) ? a : b
  );

  const priceUsd = Number(bestPair.priceUsd);
  if (!priceUsd || priceUsd <= 0) {
    throw new Error("Precio inválido");
  }

  return priceUsd;
}

/* ===============================
   QR → LANDING → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const { id } = req.params;

  res.send(`
<!DOCTYPE html>
<html>
<body style="background:#000;color:#fff;text-align:center;padding-top:80px">
<h3>Abriendo Phantom…</h3>
<a id="open" href="https://phantom.app/ul/browse/${encodeURIComponent(
    BASE_URL + "/claim/" + id
  )}">Abrir Phantom</a>
<script>
setTimeout(()=>document.getElementById("open").click(),800);
</script>
</body>
</html>
  `);
});

/* ===============================
   CLAIM PAGE
================================ */
app.get("/claim/:id", (_, res) => {
  res.sendFile(path.join(__dirname, "public/claim.html"));
});

/* ===============================
   CLAIM + CÁLCULO 1%
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  try {
    const { id } = req.params;
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.json({ error: "Wallet requerida" });
    }

    const qrs = JSON.parse(fs.readFileSync("qrs.json"));
    const products = JSON.parse(fs.readFileSync("products.json"));

    const qr = qrs[id];
    if (!qr || qr.used) {
      return res.json({ error: "QR inválido o usado" });
    }

    const product = products[qr.productId];
    if (!product) {
      return res.json({ error: "Producto no encontrado" });
    }

    const rewardUSD = Number(product.value) * 0.01;
    const tokenPriceUSD = await getGalapagosTokenPriceUSD();
    const tokensToSend = rewardUSD / tokenPriceUSD;

    qr.used = true;
    qr.claimedBy = publicKey;
    qr.claimedAt = new Date().toISOString();
    qr.reward = {
      rewardUSD,
      tokenPriceUSD,
      tokensToSend
    };

    fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));

    res.json({
      success: true,
      product: product.name,
      rewardUSD,
      tokenPriceUSD,
      tokensToSend
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ADMIN: PRODUCTO + QRS
================================ */
app.post("/admin/create-product", async (req, res) => {
  if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const { name, value, units } = req.body;
  const productId = "prod_" + uuidv4();

  const products = JSON.parse(fs.readFileSync("products.json"));
  products[productId] = { name, value, units };
  fs.writeFileSync("products.json", JSON.stringify(products, null, 2));

  const qrs = JSON.parse(fs.readFileSync("qrs.json"));
  const created = [];

  for (let i = 0; i < units; i++) {
    const qrId = "qr_" + uuidv4();
    qrs[qrId] = { productId, used: false };

    const url = `${BASE_URL}/r/${qrId}`;
    const file = `qrs/${qrId}.png`;
    await QRCode.toFile(file, url, { width: 500, margin: 2 });

    create

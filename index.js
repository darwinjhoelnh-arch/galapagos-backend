import express from "express";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import cors from "cors";

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   CONFIG
========================= */

const ADMIN_TOKEN = "galapagos_admin_2026";
const BASE_URL = "https://galapagos-backend.onrender.com";

/* =========================
   DB
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   HEALTH
========================= */

app.get("/", (_, res) => {
  res.send("Galápagos backend OK");
});

/* =========================
   CLAIM PAGE (QR DESTINO)
========================= */

app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT product_name, value_usd, claimed_at FROM qrs WHERE id=$1",
    [id]
  );

  if (!rows.length) {
    return res.send("QR inválido");
  }

  const qr = rows[0];

  if (qr.claimed_at) {
    return res.send("Este QR ya fue reclamado");
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Galápagos Token</title>
  <style>
    body {
      background:#041b14;
      color:#b9ffd6;
      font-family:Arial;
      display:flex;
      justify-content:center;
      align-items:center;
      height:100vh;
    }
    .card {
      background:#063c2b;
      padding:30px;
      border-radius:12px;
      text-align:center;
      width:320px;
    }
    button {
      margin-top:20px;
      padding:12px;
      width:100%;
      background:#1cff9c;
      border:none;
      border-radius:8px;
      font-size:16px;
      cursor:pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>🌱 Galápagos Token</h2>
    <p><b>Producto:</b> ${qr.product_name}</p>
    <p><b>Recompensa:</b> $${qr.value_usd} USD</p>
    <button onclick="alert('Aquí va la firma Phantom después')">
      Reclamar
    </button>
  </div>
</body>
</html>
`);
});

/* =========================
   ADMIN DASH (BÁSICO)
========================= */

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/admin", (req, res, next) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  next();
});

app.use("/admin", express.static(path.join(__dirname, "public")));

/* =========================
   GENERAR QRS (ADMIN)
========================= */

app.post("/admin/generate", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  /* Compatible con TODOS tus admins */
  const {
    product_name,
    value_usd,
    quantity,
    product,
    price,
    count
  } = req.body;

  const finalProduct = product_name || product;
  const finalValue = value_usd || price;
  const finalQty = quantity || count;

  if (!finalProduct || !finalValue || !finalQty) {
    return res.status(400).json({ error: "invalid data" });
  }

  for (let i = 0; i < finalQty; i++) {
    await pool.query(
      "INSERT INTO qrs (product_name, value_usd) VALUES ($1,$2)",
      [finalProduct, finalValue]
    );
  }

  res.json({ ok: true });
});

/* =========================
   DESCARGAR ZIP QRS
========================= */

app.get("/admin/download/:product", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }

  const onlyNew = req.query.onlyNew === "1";
  const product = req.params.product;

  let query = `
    SELECT id FROM qrs
    WHERE product_name=$1
  `;

  if (onlyNew) {
    query += " AND downloaded=false";
  }

  const { rows } = await pool.query(query, [product]);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=${product}.zip`);

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const url = `https://phantom.app/ul/browse/${encodeURIComponent(
      `${BASE_URL}/claim/${qr.id}`
    )}`;

    const img = await QRCode.toBuffer(url);

    archive.append(img, { name: `${product}/${qr.id}.png` });

    await pool.query("UPDATE qrs SET downloaded=true WHERE id=$1", [qr.id]);
  }

  archive.finalize();
});

/* =========================
   START
========================= */

app.listen(10000, () => {
  console.log("Galápagos backend running");
});

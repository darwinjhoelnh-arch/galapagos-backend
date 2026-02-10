import express from "express";
import cors from "cors";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";

const app = express();
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ========= ENSURE QR FOLDER ========= */
if (!fs.existsSync("public/qrs")) {
  fs.mkdirSync("public/qrs", { recursive: true });
}

/* ========= ADMIN: CREATE PRODUCT ========= */
app.post("/admin/create-product", async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const name = String(req.body.name || "");
    const price = Number(req.body.value);
    const units = Number.parseInt(req.body.units, 10);

    if (!name || isNaN(price) || isNaN(units) || units <= 0) {
      return res.status(400).json({
        error: "Invalid input",
        received: req.body
      });
    }

    const productId = uuidv4();

    await pool.query(
      `INSERT INTO products (id, name, price_usd, units)
       VALUES ($1, $2, $3, $4)`,
      [productId, name, price, units]
    );

    const qrs = [];

    for (let i = 0; i < units; i++) {
      const qrId = uuidv4();

      await pool.query(
        `INSERT INTO qrs (id, product_id)
         VALUES ($1, $2)`,
        [qrId, productId]
      );

      await QRCode.toFile(
        `public/qrs/${qrId}.png`,
        `${BASE_URL}/r/${qrId}`
      );

      qrs.push({
        id: qrId,
        url: `${BASE_URL}/qrs/${qrId}.png`
      });
    }

    res.json({
      success: true,
      productId,
      units,
      qrs
    });

  } catch (err) {
    console.error("CREATE PRODUCT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ========= QR → PHANTOM ========= */
app.get("/r/:id", (req, res) => {
  const target = encodeURIComponent(`${BASE_URL}/claim/${req.params.id}`);
  res.send(`
    <html>
      <body style="background:black;color:white;text-align:center;padding-top:80px">
        <h3>Abriendo Phantom…</h3>
        <a id="o" href="https://phantom.app/ul/browse/${target}">Open</a>
        <script>setTimeout(()=>o.click(),800)</script>
      </body>
    </html>
  `);
});

/* ========= CLAIM PAGE ========= */
app.get("/claim/:id", (req, res) => {
  res.sendFile(path.resolve("public/claim.html"));
});

/* ========= START ========= */
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});

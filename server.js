import express from "express";
import cors from "cors";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import archiver from "archiver";
import fs from "fs";
import path from "path";

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

if (!fs.existsSync("public/qrs")) {
  fs.mkdirSync("public/qrs", { recursive: true });
}

/* ========= CREATE PRODUCT ========= */
app.post("/admin/create-product", async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const name = String(req.body.name || "").trim();
    const price = Number(req.body.value);
    const units = Number.parseInt(req.body.units, 10);

    if (!name || isNaN(price) || isNaN(units) || units <= 0) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const productId = uuidv4();

    await pool.query(
      `INSERT INTO products (id, name, price_usd, units)
       VALUES ($1,$2,$3,$4)`,
      [productId, name, price, units]
    );

    const qrs = [];

    for (let i = 0; i < units; i++) {
      const qrId = uuidv4();

      await pool.query(
        `INSERT INTO qrs (id, product_id) VALUES ($1,$2)`,
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

    res.json({ success: true, productId, units, qrs });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/* ========= LIST PRODUCTS ========= */
app.get("/admin/products", async (_, res) => {
  const { rows } = await pool.query(`
    SELECT 
      p.id,
      p.name,
      p.price_usd,
      p.units,
      COUNT(q.id) AS total_qrs,
      COUNT(CASE WHEN q.claimed THEN 1 END) AS claimed_qrs
    FROM products p
    LEFT JOIN qrs q ON q.product_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  res.json(rows);
});

/* ========= LIST QRS ========= */
app.get("/admin/products/:id/qrs", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, claimed FROM qrs WHERE product_id = $1 ORDER BY created_at`,
    [req.params.id]
  );
  res.json(rows);
});

/* ========= DOWNLOAD ZIP ========= */
app.get("/admin/products/:id/qrs.zip", async (req, res) => {
  const onlyNew = req.query.only === "new";

  const { rows } = await pool.query(
    `SELECT id FROM qrs
     WHERE product_id = $1 ${onlyNew ? "AND claimed = false" : ""}`,
    [req.params.id]
  );

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="qrs-${req.params.id}.zip"`
  );

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const file = `public/qrs/${qr.id}.png`;
    if (fs.existsSync(file)) {
      archive.file(file, { name: `${qr.id}.png` });
    }
  }

  await archive.finalize();
});

/* ========= QR → PHANTOM ========= */
app.get("/r/:id", (req, res) => {
  const target = encodeURIComponent(`${BASE_URL}/claim/${req.params.id}`);
  res.send(`
    <html><body>
    <script>
      location.href="https://phantom.app/ul/browse/${target}";
    </script>
    </body></html>
  `);
});

/* ========= CLAIM PAGE ========= */
app.get("/claim/:id", (_, res) => {
  res.sendFile(path.resolve("public/claim.html"));
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});

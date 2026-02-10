import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/qrs", express.static(path.join(__dirname, "public/qrs")));
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const BASE_URL = process.env.BASE_URL;

/* ================= ADMIN: CREAR PRODUCTO ================= */
app.post("/admin/create-product", async (req, res) => {
  try {
    const { name, price_usd, units, admin_token } = req.body;

    if (!name || !price_usd || !units || !admin_token) {
      return res.status(400).json({ error: "Datos incompletos" });
    }
    if (admin_token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: "Token inválido" });
    }

    const productId = uuidv4();

    await pool.query(
      `INSERT INTO products (id, name, price_usd, units)
       VALUES ($1,$2,$3,$4)`,
      [productId, name, price_usd, units]
    );

    // asegúrate que la carpeta existe
    const qrsDir = path.join(__dirname, "public/qrs");
    if (!fs.existsSync(qrsDir)) fs.mkdirSync(qrsDir, { recursive: true });

    for (let i = 0; i < units; i++) {
      const qrId = uuidv4();

      await pool.query(
        `INSERT INTO qrs (id, product_id, claimed)
         VALUES ($1,$2,false)`,
        [qrId, productId]
      );

      await QRCode.toFile(
        path.join(qrsDir, `${qrId}.png`),
        `${BASE_URL}/r/${qrId}`
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ================= ADMIN: LISTAR PRODUCTOS ================= */
app.get("/admin/products", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.price_usd,
      p.units,
      COUNT(q.id) FILTER (WHERE q.claimed = true) AS claimed
    FROM products p
    LEFT JOIN qrs q ON q.product_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  res.json(rows);
});

/* ================= ADMIN: ZIP DE QRs ================= */
app.get("/admin/download-zip/:productId", async (req, res) => {
  const { productId } = req.params;

  const { rows } = await pool.query(
    `SELECT id FROM qrs WHERE product_id = $1`,
    [productId]
  );
  if (!rows.length) return res.status(404).send("Sin QRs");

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="qrs-${productId}.zip"`
  );

  const archive = archiver("zip");
  archive.pipe(res);

  rows.forEach(qr => {
    archive.file(
      path.join(__dirname, "public/qrs", `${qr.id}.png`),
      { name: `${qr.id}.png` }
    );
  });

  archive.finalize();
});

/* ================= CLAIM: ABRIR r.html ================= */
app.get("/r/:id", (_req, res) => {
  res.sendFile(path.join(__dirname, "public/r.html"));
});

/* ================= CLAIM: INFO QR ================= */
app.get("/api/qr/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(`
    SELECT
      q.id,
      q.claimed,
      p.name,
      p.price_usd
    FROM qrs q
    JOIN products p ON p.id = q.product_id
    WHERE q.id = $1
  `, [id]);

  if (!rows.length) return res.status(404).json({ error: "QR inválido" });
  res.json(rows[0]);
});

/* ================= CLAIM: MARCAR USADO ================= */
app.post("/api/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rowCount } = await pool.query(
    `UPDATE qrs
     SET claimed = true, used_at = now()
     WHERE id = $1 AND claimed = false`,
    [id]
  );

  if (!rowCount) return res.status(400).json({ error: "QR ya usado" });
  res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server OK en", PORT));

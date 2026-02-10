import express from "express";
import pkg from "pg";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import QRCode from "qrcode";

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 10000;

const __dirname = new URL(".", import.meta.url).pathname;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static("public"));

/* ================= ADMIN ================= */

app.get("/admin", (_, res) => {
  res.sendFile(path.join(__dirname, "../public/admin.html"));
});

/* Listar productos */
app.get("/products", async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, price_usd, units FROM products ORDER BY created_at DESC`
  );
  res.json(rows);
});

/* Crear producto + QRs */
app.post("/admin/create-product", async (req, res) => {
  try {
    const { name, price_usd, units } = req.body;

    if (!name || !price_usd || !units) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const productId = uuidv4();

    await pool.query(
      `INSERT INTO products (id, name, price_usd, units, created_at)
       VALUES ($1,$2,$3,$4,NOW())`,
      [productId, name, price_usd, units]
    );

    if (!fs.existsSync("public/qrs")) {
      fs.mkdirSync("public/qrs");
    }

    const qrs = [];

    for (let i = 0; i < units; i++) {
      const qrId = uuidv4();

      await pool.query(
        `INSERT INTO qrs (id, product_id, claimed, created_at)
         VALUES ($1,$2,false,NOW())`,
        [qrId, productId]
      );

      const url = `${process.env.BASE_URL}/r/${qrId}`;

      await QRCode.toFile(`public/qrs/${qrId}.png`, url);

      qrs.push({ id: qrId, url });
    }

    res.json({ success: true, productId, qrs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creando producto" });
  }
});

/* ================= RECLAMAR ================= */

/* Página móvil */
app.get("/r/:id", (_, res) => {
  res.sendFile(path.join(__dirname, "../public/r.html"));
});

/* Datos del QR */
app.get("/api/qr/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    `
    SELECT 
      q.id,
      q.claimed,
      p.name,
      p.price_usd
    FROM qrs q
    JOIN products p ON p.id = q.product_id
    WHERE q.id = $1
    `,
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: "QR no válido" });
  }

  res.json(rows[0]);
});

/* Marcar QR como reclamado */
app.post("/api/qr/:id/claim", async (req, res) => {
  const { id } = req.params;

  const { rowCount } = await pool.query(
    `
    UPDATE qrs
    SET claimed = true, used_at = NOW()
    WHERE id = $1 AND claimed = false
    `,
    [id]
  );

  if (rowCount === 0) {
    return res.status(400).json({ error: "QR ya reclamado" });
  }

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("Servidor activo en puerto", PORT);
});

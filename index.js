import express from "express";
import cors from "cors";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import { v4 as uuidv4 } from "uuid";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   DATABASE
================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ===============================
   ADMIN TOKEN
================================ */
const ADMIN_TOKEN = "galapagos_admin_2026";

/* ===============================
   ADMIN UI
================================ */
app.get("/admin", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send("Acceso denegado");
  }

  const { rows } = await pool.query(`
    SELECT
      id,
      product_name,
      value_usd,
      batch_id,
      claimed_at,
      created_at
    FROM qrs
    ORDER BY created_at DESC
  `);

  const rowsHtml = rows.map(q => `
    <tr>
      <td>${q.id}</td>
      <td>${q.product_name}</td>
      <td>$${q.value_usd}</td>
      <td>${q.batch_id}</td>
      <td>${q.claimed_at ? "Reclamado" : "Activo"}</td>
    </tr>
  `).join("");

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Galápagos Token Admin</title>
<style>
body {
  background: radial-gradient(circle at top, #063c2d, #021a14);
  font-family: Arial;
  color: #b6ffe3;
}
.container {
  max-width: 1100px;
  margin: auto;
  padding: 40px;
}
.card {
  background: rgba(0,0,0,.55);
  border-radius: 14px;
  padding: 25px;
  margin-bottom: 30px;
  box-shadow: 0 0 40px rgba(0,255,180,.15);
}
button {
  background: #00ffb0;
  border: none;
  padding: 12px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
}
table {
  width: 100%;
  border-collapse: collapse;
}
td, th {
  border-bottom: 1px solid #0b5;
  padding: 8px;
}
th {
  text-align: left;
  color: #00ffb0;
}
</style>
</head>

<body>
<div class="container">

<h1>🌱 Galápagos Token Admin</h1>
<p>Gestión de QRs y recompensas</p>

<div class="card">
<h2>Generar QRs</h2>
<form method="POST" action="/admin/generate">
<input name="product" placeholder="Producto" required>
<input name="value" type="number" step="0.01" placeholder="Valor USD" required>
<input name="amount" type="number" placeholder="Cantidad" required>
<button>Generar</button>
</form>
</div>

<div class="card">
<h2>Códigos existentes</h2>
<table>
<tr>
<th>ID</th>
<th>Producto</th>
<th>USD</th>
<th>Batch</th>
<th>Estado</th>
</tr>
${rowsHtml}
</table>
</div>

<div class="card">
<h2>Descargar QRs</h2>
<form method="GET" action="/admin/download">
<input name="batch" placeholder="Batch ID">
<button>Descargar ZIP</button>
</form>
</div>

</div>
</body>
</html>
`);
});

/* ===============================
   GENERAR QRs
================================ */
app.post("/admin/generate", express.urlencoded({ extended: true }), async (req, res) => {
  const { product, value, amount } = req.body;
  const batchId = uuidv4();

  for (let i = 0; i < amount; i++) {
    const qrId = uuidv4();
    const url = `https://galapagos-backend.onrender.com/claim/${qrId}`;

    await pool.query(`
      INSERT INTO qrs (id, product_name, value_usd, batch_id)
      VALUES ($1,$2,$3,$4)
    `, [qrId, product, value, batchId]);
  }

  res.redirect(`/admin?token=${ADMIN_TOKEN}`);
});

/* ===============================
   DESCARGAR ZIP POR BATCH
================================ */
app.get("/admin/download", async (req, res) => {
  const { batch } = req.query;

  const { rows } = await pool.query(`
    SELECT id FROM qrs WHERE batch_id = $1
  `, [batch]);

  if (!rows.length) {
    return res.send("Batch vacío");
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="qrs_${batch}.zip"`);

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const url = `https://galapagos-backend.onrender.com/claim/${qr.id}`;
    const png = await QRCode.toBuffer(url);
    archive.append(png, { name: `${qr.id}.png` });
  }

  archive.finalize();
});

/* ===============================
   CLAIM ENDPOINT
================================ */
app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [id]
  );

  if (!rows.length) {
    return res.send("QR inválido");
  }

  if (rows[0].claimed_at) {
    return res.send("Este QR ya fue reclamado");
  }

  await pool.query(
    "UPDATE qrs SET claimed_at=NOW() WHERE id=$1",
    [id]
  );

  res.send("🎉 Felicidades por ser parte de Galápagos Token");
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Galápagos backend activo");
});

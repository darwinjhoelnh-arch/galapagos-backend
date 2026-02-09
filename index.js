import express from "express";
import pkg from "pg";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 10000;

// --------------------
// PATH FIX (ESM)
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------
// MIDDLEWARE
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --------------------
// DATABASE
// --------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --------------------
// HOME (NO USAR)
// --------------------
app.get("/", (req, res) => {
  res.status(200).send("Galápagos backend OK");
});

// --------------------
// ADMIN (HTML REAL)
// --------------------
app.get("/admin", (req, res) => {
  const token = req.query.token;
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).send("Forbidden");
  }
  res.sendFile(path.join(__dirname, "admin.html"));
});

// --------------------
// ADMIN STATS (JSON)
// --------------------
app.get("/admin/stats", async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM qrs");
    const claimed = await pool.query(
      "SELECT COUNT(*) FROM qrs WHERE claimed_at IS NOT NULL"
    );

    res.json({
      total: Number(total.rows[0].count),
      claimed: Number(claimed.rows[0].count)
    });
  } catch (e) {
    res.status(500).json({ error: "stats error" });
  }
});

// --------------------
// GENERATE QRS (NO DISEÑO)
// --------------------
app.post("/admin/generate", async (req, res) => {
  const { product_name, value_usd, quantity } = req.body;

  if (!product_name || !value_usd || !quantity) {
    return res.status(400).json({ error: "invalid data" });
  }

  try {
    const inserted = [];

    for (let i = 0; i < quantity; i++) {
      const r = await pool.query(
        `INSERT INTO qrs (product_name, value_usd)
         VALUES ($1,$2) RETURNING id`,
        [product_name, value_usd]
      );
      inserted.push(r.rows[0].id);
    }

    res.json({ ok: true, created: inserted.length });
  } catch (e) {
    res.status(500).json({ error: "generate failed" });
  }
});

// --------------------
// QR REDIRECT (NO TOCAR)
// --------------------
app.get("/r/:id", async (req, res) => {
  const { id } = req.params;

  const qr = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [id]
  );

  if (qr.rows.length === 0) {
    return res.status(404).send("QR not found");
  }

  // 🔥 ESTE LINK ES EL QUE ABRE PHANTOM
  const claimUrl = `${process.env.BASE_URL}/claim/${id}`;

  res.redirect(
    `https://phantom.app/ul/browse/${encodeURIComponent(claimUrl)}`
  );
});

// --------------------
// CLAIM PAGE (PHANTOM)
// --------------------
app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const qr = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [id]
  );

  if (qr.rows.length === 0) {
    return res.status(404).send("Invalid QR");
  }

  const data = qr.rows[0];

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galápagos Token</title>
<style>
body{
  background:#062f23;
  font-family:Arial;
  color:#eafff4;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
}
.card{
  background:#0b3f30;
  padding:24px;
  border-radius:14px;
  text-align:center;
  width:90%;
  max-width:360px;
}
button{
  margin-top:20px;
  padding:14px;
  width:100%;
  background:#00ffb3;
  border:none;
  border-radius:10px;
  font-size:16px;
}
</style>
</head>
<body>
<div class="card">
<h2>🌱 Galápagos Token</h2>
<p>Producto: <b>${data.product_name}</b></p>
<p>Recompensa: <b>$${data.value_usd} USD</b></p>
<button onclick="alert('Firma Phantom aquí')">
Reclamar recompensa
</button>
</div>
</body>
</html>
  `);
});

// --------------------
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});

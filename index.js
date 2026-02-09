import express from "express";
import cors from "cors";
import http from "http";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";
import crypto from "crypto";

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const BASE_URL = "https://galapagos-backend.onrender.com";
const ADMIN_TOKEN = "galapagos_admin_2026";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ===============================
   HEALTH
================================ */
app.get("/", (req, res) => res.send("OK"));

/* ===============================
   QR → PHANTOM (NO TOCAR)
================================ */
app.get("/r/:id", (req, res) => {
  const phantom =
    "https://phantom.app/ul/browse/" +
    encodeURIComponent(`${BASE_URL}/claim/${req.params.id}`);

  res.redirect(302, phantom);
});

/* ===============================
   CLAIM PAGE (NO TOCAR DISEÑO)
================================ */
app.get("/claim/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id=$1",
    [req.params.id]
  );

  if (!rows.length) return res.send("QR inválido");
  if (rows[0].claimed_at) return res.send("QR ya reclamado");

  const reward = (rows[0].value_usd * 0.01).toFixed(2);

  res.send(`
<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width">
</head>
<body style="background:#042b20;color:#bfffe5;font-family:sans-serif;text-align:center">
<h2>Galápagos Token</h2>
<p>Producto: ${rows[0].product_name}</p>
<p>Recompensa: $${reward} USD</p>
<button onclick="claim()">Firmar y reclamar</button>

<script>
async function claim(){
 if(!window.solana){alert("Abrir en Phantom");return;}
 await window.solana.connect();
 const msg=new TextEncoder().encode("Reclamo Galápagos ${req.params.id}");
 const sig=await window.solana.signMessage(msg,"utf8");

 await fetch("/claim/${req.params.id}/sign",{method:"POST",
 headers:{"Content-Type":"application/json"},
 body:JSON.stringify({wallet:window.solana.publicKey.toString()})
 });

 alert("Reclamo enviado");
}
</script>
</body></html>
`);
});

/* ===============================
   CLAIM SIGN
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  await pool.query(
    "UPDATE qrs SET claimed_at=NOW() WHERE id=$1 AND claimed_at IS NULL",
    [req.params.id]
  );
  res.json({ ok: true });
});

/* ===============================
   ADMIN AUTH
================================ */
function admin(req, res, next) {
  if (req.query.token !== ADMIN_TOKEN)
    return res.status(403).send("No autorizado");
  next();
}

/* ===============================
   ADMIN DASHBOARD (SIMPLE)
================================ */
app.get("/admin", admin, async (req, res) => {
  const total = await pool.query("SELECT COUNT(*) FROM qrs");
  const claimed = await pool.query("SELECT COUNT(*) FROM qrs WHERE claimed_at IS NOT NULL");

  res.send(`
<h2>Admin OK</h2>
<p>Total QRs: ${total.rows[0].count}</p>
<p>Reclamados: ${claimed.rows[0].count}</p>
`);
});

/* ===============================
   GENERAR QRS
================================ */
app.post("/admin/generate", admin, async (req, res) => {
  const { product, value, qty } = req.body;
  const ids = [];

  for (let i = 0; i < qty; i++) {
    const id = crypto.randomUUID();
    await pool.query(
      "INSERT INTO qrs(id,product_name,value_usd) VALUES($1,$2,$3)",
      [id, product, value]
    );
    ids.push(id);
  }

  res.json({ ok: true, ids });
});

/* ===============================
   DOWNLOAD ZIP
================================ */
app.get("/admin/download/:product", admin, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id FROM qrs WHERE product_name=$1 AND claimed_at IS NULL",
    [req.params.product]
  );

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=qrs.zip");

  const archive = archiver("zip");
  archive.pipe(res);

  for (const qr of rows) {
    const png = await QRCode.toBuffer(`${BASE_URL}/r/${qr.id}`);
    archive.append(png, { name: `${qr.id}.png` });
  }

  archive.finalize();
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
http.createServer(app).listen(PORT, "0.0.0.0");
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});


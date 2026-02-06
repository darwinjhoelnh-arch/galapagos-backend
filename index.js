import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import http from "http";
import archiver from "archiver";
import QRCode from "qrcode";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const ADMIN_TOKEN = "galapagos_admin_2026";
const PORT = process.env.PORT || 8080;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("OK");
});

/* ===============================
   ADMIN UI
================================ */
app.get("/admin", (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(403).send("Forbidden");
  }
  res.send(fs.readFileSync("./admin.html", "utf8"));
});

/* ===============================
   ADMIN DATA
================================ */
app.get("/admin/data", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, product_name, value_usd, claimed
      FROM qrs
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
});

/* ===============================
   GENERAR QRs
   body: { product, value_usd, quantity }
================================ */
app.post("/admin/generate", async (req, res) => {
  const { product, value_usd, quantity } = req.body;

  if (!product || !value_usd || !quantity) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  const dir = `./qrs/${product}`;
  fs.mkdirSync(dir, { recursive: true });

  const created = [];

  for (let i = 0; i < quantity; i++) {
    const code = crypto.randomUUID();

    await pool.query(
      `INSERT INTO qrs (id, product_name, value_usd)
       VALUES ($1,$2,$3)`,
      [code, product, value_usd]
    );

    const url = `https://galapagos-backend.onrender.com/r/${code}`;
    const file = `${dir}/${code}.png`;

    await QRCode.toFile(file, url, {
      color: {
        dark: "#0b3d2e",
        light: "#ffffff",
      },
    });

    created.push(code);
  }

  res.json({ success: true, created });
});

/* ===============================
   DESCARGAR ZIP (solo nuevos)
================================ */
app.get("/admin/download", async (req, res) => {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=qrs.zip");

  const archive = archiver("zip");
  archive.pipe(res);

  if (fs.existsSync("./qrs")) {
    archive.directory("./qrs", false);
  }

  archive.finalize();
});

/* ===============================
   QR REDIRECT → PHANTOM
================================ */
app.get("/r/:id", (req, res) => {
  const url = `https://galapagos-backend.onrender.com/claim/${req.params.id}`;
  const phantom = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
  res.redirect(302, phantom);
});

/* ===============================
   CLAIM PAGE
================================ */
app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    `SELECT * FROM qrs WHERE id=$1`,
    [id]
  );

  if (!rows.length) return res.send("QR no existe");
  if (rows[0].claimed) return res.send("QR ya usado");

  const usd = rows[0].value_usd * 0.01;

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Reclamar Galápagos Token</title>
<style>
body{
  background:#000;
  color:#eafff4;
  font-family:Arial;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
}
.card{
  background:#0b3d2e;
  padding:30px;
  border-radius:16px;
  text-align:center;
  width:320px;
}
button{
  margin-top:20px;
  background:#1cff9a;
  border:none;
  padding:12px;
  border-radius:10px;
  font-weight:bold;
}
</style>
</head>
<body>
<div class="card">
<img src="https://xtradeacademy.net/wp-content/uploads/2026/01/Black-White-Minimalist-Modern-Hiring-Designer-Information-Instagram-Media-Post-.png" width="120"/>
<h2>Galápagos Token</h2>
<p>Valor QR: $${rows[0].value_usd}</p>
<p>Reclamo: $${usd} en tokens</p>
<button onclick="firmar()">Firmar y reclamar</button>
</div>

<script>
async function firmar(){
  if(!window.solana){ alert("Usa Phantom"); return; }
  const msg = new TextEncoder().encode("Galapagos QR ${id}");
  const sig = await solana.signMessage(msg,"utf8");

  const r = await fetch("/claim/${id}/sign",{
    method:"POST",
    headers:{ "Content-Type":"application/json"},
    body:JSON.stringify({
      publicKey: solana.publicKey.toString(),
      signature: Array.from(sig.signature)
    })
  });
  const d = await r.json();
  alert(d.mensaje);
}
</script>
</body>
</html>
`);
});

/* ===============================
   CLAIM CONFIRM
================================ */
app.post("/claim/:id/sign", async (req, res) => {
  const { id } = req.params;

  await pool.query(
    `UPDATE qrs SET claimed=true, claimed_at=NOW() WHERE id=$1`,
    [id]
  );

  res.json({
    success: true,
    mensaje: "🎉 Felicidades por ser parte de Galápagos Token 🌱",
  });
});

/* ===============================
   SERVER
================================ */
const server = http.createServer(app);
server.listen(PORT, "0.0.0.0", () => {
  console.log("Backend corriendo en puerto " + PORT);
});

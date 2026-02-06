import express from "express";
import cors from "cors";
import crypto from "crypto";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";

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
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("OK");
});

/* ===============================
   ADMIN AUTH
================================ */
function adminAuth(req, res, next) {
  if (req.query.token !== "galapagos_admin_2026") {
    return res.status(403).send("Unauthorized");
  }
  next();
}

/* ===============================
   ADMIN DASHBOARD
================================ */
app.get("/admin", adminAuth, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Galápagos Admin</title>
  <style>
    body{
      background: radial-gradient(circle at top,#003b2f,#000);
      font-family: Arial;
      color:#eafff6;
      padding:40px;
    }
    h1{color:#00ffb3}
    .card{
      background:#031f18;
      border:1px solid #0a4;
      border-radius:16px;
      padding:20px;
      margin-bottom:20px;
      box-shadow:0 0 40px #00ffb322;
    }
    input,button{
      width:100%;
      padding:12px;
      margin-top:10px;
      border-radius:8px;
      border:none;
    }
    button{
      background:#00ffb3;
      font-weight:bold;
      cursor:pointer;
    }
  </style>
</head>
<body>

<h1>🌱 Galápagos Token Admin</h1>

<div class="card">
  <h3>Generar QRs</h3>
  <input id="product" placeholder="Producto"/>
  <input id="price" type="number" placeholder="Valor USD"/>
  <input id="qty" type="number" placeholder="Cantidad"/>
  <button onclick="gen()">Generar</button>
</div>

<div class="card">
  <h3>Descargar ZIP por producto</h3>
  <input id="prodZip" placeholder="Nombre del producto"/>
  <button onclick="zip()">Descargar ZIP</button>
</div>

<script>
function gen(){
  fetch('/admin/generate?token=galapagos_admin_2026',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      product_name:product.value,
      value_usd:Number(price.value),
      quantity:Number(qty.value)
    })
  })
  .then(r=>r.json())
  .then(d=>alert(d.success?'QRs generados':'Error'));
}

function zip(){
  window.location='/admin/download/'+prodZip.value+'?token=galapagos_admin_2026';
}
</script>

</body>
</html>
`);
});

/* ===============================
   GENERAR QRS
================================ */
app.post("/admin/generate", adminAuth, async (req, res) => {
  try {
    const { product_name, value_usd, quantity } = req.body;

    if (!product_name || !value_usd || !quantity) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const batch = crypto.randomUUID();

    for (let i = 0; i < quantity; i++) {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO qrs (id, product_name, value_usd, batch_id)
         VALUES ($1,$2,$3,$4)`,
        [id, product_name, value_usd, batch]
      );
    }

    res.json({ success: true, batch });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error generando QRs" });
  }
});

/* ===============================
   DESCARGAR ZIP
================================ */
app.get("/admin/download/:product", adminAuth, async (req, res) => {
  try {
    const { product } = req.params;

    const { rows } = await pool.query(
      `SELECT id FROM qrs WHERE product_name=$1`,
      [product]
    );

    if (rows.length === 0) {
      return res.status(404).send("Producto sin QRs");
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${product}_qrs.zip`
    );

    const archive = archiver("zip");
    archive.pipe(res);

    for (const qr of rows) {
      const url = `https://galapagos-backend.onrender.com/claim/${qr.id}`;
      const img = await QRCode.toBuffer(url);
      archive.append(img, { name: `${product}/${qr.id}.png` });
    }

    await archive.finalize();

  } catch (e) {
    console.error(e);
    res.status(500).send("Error ZIP");
  }
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log("Backend OK en puerto", PORT)
);

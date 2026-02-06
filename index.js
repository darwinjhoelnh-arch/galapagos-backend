import express from "express";
import cors from "cors";
import pkg from "pg";
import QRCode from "qrcode";
import archiver from "archiver";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* ================= CONFIG ================= */

const BASE_URL = "https://galapagos-backend.onrender.com";
const ADMIN_TOKEN = "galapagos_admin_2026";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ================= HELPERS ================= */

function adminAuth(req, res, next) {
  if (req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

/* ================= CLAIM PAGE ================= */

app.get("/r/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id = $1",
    [id]
  );

  if (!rows.length) {
    return res.status(404).send("QR inválido");
  }

  const qr = rows[0];

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Galápagos Token</title>
<style>
body{
  background:#061f18;
  color:#caffea;
  font-family:sans-serif;
  display:flex;
  justify-content:center;
  align-items:center;
  height:100vh;
}
.card{
  background:#0b3d2e;
  padding:24px;
  border-radius:14px;
  text-align:center;
  box-shadow:0 0 20px #00ffb0;
}
button{
  margin-top:16px;
  padding:12px 20px;
  border:none;
  border-radius:10px;
  background:#00ffb0;
  font-size:16px;
}
</style>
</head>
<body>
<div class="card">
<h2>🌱 Galápagos Token</h2>
<p>Producto: <b>${qr.product_name}</b></p>
<p>Recompensa: <b>$${qr.value_usd} USD</b></p>
<button onclick="openPhantom()">Reclamar en Phantom</button>
</div>

<script>
function openPhantom(){
  const url = "https://phantom.app/ul/browse/${BASE_URL}/claim/${qr.id}";
  window.location.href = url;
}
</script>
</body>
</html>
`);
});

/* ================= CLAIM ENDPOINT ================= */

app.get("/claim/:id", async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    "SELECT * FROM qrs WHERE id = $1",
    [id]
  );

  if (!rows.length) {
    return res.status(404).send("QR inválido");
  }

  const qr = rows[0];

  if (qr.claimed_at) {
    return res.send("Este QR ya fue reclamado");
  }

  await pool.query(
    "UPDATE qrs SET claimed_at = NOW() WHERE id = $1",
    [id]
  );

  res.send("QR reclamado correctamente");
});

/* ================= ADMIN UI ================= */

app.get("/admin", adminAuth, async (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Galápagos Admin</title>
<style>
body{
  background:#061f18;
  color:#bfffe8;
  font-family:sans-serif;
}
section{
  background:#0b3d2e;
  padding:20px;
  margin:20px;
  border-radius:14px;
}
button,input{
  padding:10px;
  margin-top:10px;
}
</style>
</head>
<body>

<section>
<h2>Generar QRs</h2>
<input id="product" placeholder="Producto"/><br>
<input id="value" placeholder="Valor USD"/><br>
<input id="qty" placeholder="Cantidad"/><br>
<button onclick="generate()">Generar</button>
</section>

<section>
<h2>Descargar</h2>
<input id="dproduct" placeholder="Producto"/><br>
<button onclick="download(false)">Descargar TODOS</button>
<button onclick="download(true)">Solo nuevos</button>
</section>

<script>
async function generate(){
  const res = await fetch("/api/admin/generate?token=${ADMIN_TOKEN}",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      product:product.value,
      value:value.value,
      qty:qty.value
    })
  });
  alert(await res.text());
}

function download(onlyNew){
  const p = dproduct.value;
  window.location =
    "/admin/download/"+p+
    "?onlyNew="+(onlyNew?1:0)+
    "&token=${ADMIN_TOKEN}";
}
</script>

</body>
</html>
`);
});

/* ================= GENERATE ================= */

app.post("/api/admin/generate", adminAuth, async (req, res) => {
  try {
    const { product, value, qty } = req.body;

    const amount = Number(qty);
    const usd = Number(value);

    if (!product || isNaN(amount) || isNaN(usd)) {
      return res.status(400).send("Datos inválidos");
    }

    for (let i = 0; i < amount; i++) {
      await pool.query(
        "INSERT INTO qrs (product_name,value_usd) VALUES ($1,$2)",
        [product, usd]
      );
    }

    res.send("QRs creados correctamente");
  } catch (e) {
    console.error(e);
    res.status(500).send("Error generando QRs");
  }
});

/* ================= DOWNLOAD ZIP ================= */

app.get("/admin/download/:product", adminAuth, async (req, res) => {
  try {
    const onlyNew = req.query.onlyNew === "1";
    const product = req.params.product;

    const { rows } = await pool.query(
      `
      SELECT * FROM qrs
      WHERE product_name=$1
      ${onlyNew ? "AND downloaded_at IS NULL" : ""}
      `,
      [product]
    );

    if (!rows.length) {
      return res.status(404).send("No hay QRs");
    }

    res.setHeader("Content-Type","application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${product}.zip`
    );

    const archive = archiver("zip",{zlib:{level:9}});
    archive.pipe(res);

    for (const qr of rows) {
      const url = BASE_URL + "/r/" + qr.id;
      const img = await QRCode.toBuffer(url);
      archive.append(img,{
        name:`${product}/${qr.id}.png`
      });
    }

    await archive.finalize();

    if (onlyNew) {
      await pool.query(
        "UPDATE qrs SET downloaded_at=NOW() WHERE product_name=$1 AND downloaded_at IS NULL",
        [product]
      );
    }
  } catch (e) {
    console.error(e);
    res.status(500).send("Error ZIP");
  }
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("Running on",PORT));

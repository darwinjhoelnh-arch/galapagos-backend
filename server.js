import express from "express";
import fs from "fs";
import cors from "cors";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.resolve();

/* ===============================
   CONFIG
================================ */
const BASE_URL =
  process.env.BASE_URL || "http://localhost:8080";

/* ===============================
   QR → PHANTOM
   /r/:id
================================ */
app.get("/r/:id", (req, res) => {
  const { id } = req.params;
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Abrir Phantom</title>
</head>
<body style="background:#000;color:#fff;text-align:center;padding-top:80px;font-family:sans-serif">

<h2>🌱 Galápagos Token</h2>
<p>Abriendo Phantom Wallet…</p>

<a id="open" href="https://phantom.app/ul/browse/${encodeURIComponent(
    BASE_URL + "/claim/" + id
  )}"
   style="display:inline-block;margin-top:30px;padding:16px 24px;background:#7c5cff;color:#fff;border-radius:12px;text-decoration:none;font-size:18px">
   Abrir en Phantom Wallet
</a>

<script>
setTimeout(() => {
  document.getElementById("open").click();
}, 800);
</script>

</body>
</html>
  `);
});


/* ===============================
   PÁGINA DE RECLAMO
   /claim/:id
================================ */
app.get("/claim/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "claim.html"));
});

/* ===============================
   RECIBE FIRMA
   POST /claim/:id/sign
================================ */
app.post("/claim/:id/sign", (req, res) => {
  const { id } = req.params;
  const { publicKey, signature } = req.body;

  if (!publicKey || !signature) {
    return res.status(400).json({ error: "Firma inválida" });
  }

  let qrs;
  try {
    qrs = JSON.parse(fs.readFileSync("qrs.json"));
  } catch {
    return res.status(500).json({ error: "Error interno" });
  }

  if (!qrs[id]) {
    return res.status(400).json({ error: "QR no existe" });
  }

  if (qrs[id].used) {
    return res.status(400).json({ error: "QR ya usado" });
  }

  qrs[id].used = true;
  qrs[id].wallet = publicKey;
  qrs[id].claimedAt = new Date().toISOString();

  fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));

  res.json({
    success: true,
    message: "QR reclamado correctamente 🌱"
  });
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});

import express from "express";
import fs from "fs";
import cors from "cors";
import http from "http";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const LOGO_BASE64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAYGBgYHBgcICAcKCwoLCg8ODAwODxYQERAREBYiFRkVFRkVIh4kHhweJB42KiYmKjY+NDI0PkxERExfWl98fKcB"; 
// ⬆️ logo embebido (no depende de archivos externos)

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("OK");
});

/* ===============================
   REDIRECT QR → PHANTOM
   /r/:id
================================ */
app.get("/r/:id", (req, res) => {
  const { id } = req.params;

  const phantomLink =
    "https://phantom.app/ul/browse/" +
    encodeURIComponent(`https://galapagos-backend.onrender.com/claim/${id}`);

  res.redirect(302, phantomLink);
});

/* ===============================
   PÁGINA DE RECLAMO
   GET /claim/:id
================================ */
app.get("/claim/:id", (req, res) => {
  const { id } = req.params;

  let qrs;
  try {
    qrs = JSON.parse(fs.readFileSync("qrs.json"));
  } catch {
    return res.send("Error interno");
  }

  if (!qrs[id]) return res.send("QR no válido");
  if (qrs[id].usado) return res.send("Este QR ya fue reclamado");

  const valorUSD = qrs[id].valor_usd;
  const recompensaUSD = (valorUSD * 0.01).toFixed(2);

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reclamar Galápagos Token</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>
body {
  margin:0;
  background: radial-gradient(circle at top, #0f3d2e, #000);
  font-family: 'Segoe UI', sans-serif;
  color:#e8fff3;
}

.container {
  max-width:420px;
  margin:40px auto;
  padding:30px;
  border-radius:20px;
  background: rgba(0,40,30,0.85);
  box-shadow: 0 0 40px rgba(0,255,170,0.25);
  text-align:center;
}

.logo {
  width:120px;
  margin-bottom:20px;
}

h1 {
  color:#00ffb3;
  font-size:22px;
  margin-bottom:5px;
}

.subtitle {
  font-size:13px;
  opacity:.8;
  margin-bottom:25px;
}

.value {
  font-size:28px;
  color:#00ff9c;
  margin:20px 0;
}

button {
  width:100%;
  padding:15px;
  font-size:16px;
  background: linear-gradient(135deg,#00ff9c,#00c977);
  border:none;
  border-radius:12px;
  color:#002;
  font-weight:bold;
  cursor:pointer;
}

button:hover {
  opacity:.9;
}

.success-box {
  margin-top:20px;
  padding:15px;
  background: rgba(0,255,160,.15);
  border-radius:12px;
  color:#9cffda;
  display:none;
}
</style>
</head>

<body>
<div class="container">

<img src="${LOGO_BASE64}" class="logo" />

<h1>GALÁPAGOS TOKEN</h1>
<div class="subtitle">Tecnología para preservar la vida</div>

<div class="value">$${recompensaUSD} USD en tokens</div>

<button onclick="firmar()">Firmar y reclamar</button>

<div id="success" class="success-box"></div>

</div>

<script>
async function firmar() {
  if (!window.solana) {
    alert("Abre este enlace dentro de Phantom Wallet");
    return;
  }

  const msg = new TextEncoder().encode("Reclamo Galápagos Token QR ${id}");
  await window.solana.connect();
  const signed = await window.solana.signMessage(msg, "utf8");

  const res = await fetch("/claim/${id}/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: window.solana.publicKey.toString(),
      signature: Array.from(signed.signature)
    })
  });

  const data = await res.json();
  const box = document.getElementById("success");
  box.style.display = "block";
  box.innerHTML = "🌱 <strong>Felicidades por ser parte de Galápagos Token</strong><br/>Tu recompensa ha sido validada correctamente.";
}
</script>

</body>
</html>
`);
});

/* ===============================
   RECIBE FIRMA
   POST /claim/:id/sign
================================ */
app.post("/claim/:id/sign", (req, res) => {
  const { id } = req.params;
  const { publicKey } = req.body;

  if (!publicKey) {
    return res.json({ error: "Firma inválida" });
  }

  let qrs = JSON.parse(fs.readFileSync("qrs.json"));
  if (!qrs[id] || qrs[id].usado) {
    return res.json({ error: "QR inválido" });
  }

  // (aquí luego va el envío real del token SPL)
  qrs[id].usado = true;
  fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));

  res.json({
    success: true,
    mensaje: "Felicidades por ser parte de Galápagos Token 🌱"
  });
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Galápagos Backend corriendo en puerto " + PORT);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

import express from "express";
import fs from "fs";
import cors from "cors";
import http from "http";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/* ===============================
   QR → PHANTOM DEEP LINK
================================ */
app.get("/r/:id", (req, res) => {
  const { id } = req.params;

  const phantomDeepLink =
    "https://phantom.app/ul/browse/" +
    encodeURIComponent(
      `https://galapagos-backend.onrender.com/claim/${id}`
    );

  res.redirect(302, phantomDeepLink);
});

/* ===============================
   CLAIM PAGE (DISEÑO GALÁPAGOS)
================================ */
app.get("/claim/:id", (req, res) => {
  const { id } = req.params;

  let qrs;
  try {
    qrs = JSON.parse(fs.readFileSync("qrs.json"));
  } catch {
    return res.status(500).send("Error leyendo qrs.json");
  }

  if (!qrs[id]) {
    return res.status(404).send("QR no existe");
  }

  if (qrs[id].usado) {
    return res.send("Este QR ya fue usado");
  }

  const valorUsd = Number(qrs[id].valor_usd);
  const recompensaUsd = (valorUsd * 0.01).toFixed(2); // 1%

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Reclamar Galápagos Token</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body {
    margin: 0;
    background: radial-gradient(circle at top, #0f2a1f, #050b08);
    font-family: Arial, sans-serif;
    color: #e8ffe8;
  }
  .container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .card {
    background: rgba(10, 30, 22, 0.95);
    border: 1px solid rgba(0, 255, 150, 0.25);
    border-radius: 16px;
    max-width: 420px;
    width: 100%;
    padding: 28px;
    box-shadow: 0 0 40px rgba(0,255,150,0.15);
  }
  .logo {
    text-align: center;
    font-size: 22px;
    font-weight: bold;
    color: #00e38c;
    margin-bottom: 6px;
  }
  .subtitle {
    text-align: center;
    font-size: 13px;
    color: #9ddfc2;
    margin-bottom: 24px;
  }
  .label {
    font-size: 12px;
    color: #8fd9b8;
  }
  .value {
    font-size: 18px;
    margin-top: 4px;
  }
  .block {
    margin-bottom: 18px;
  }
  .reward {
    margin: 22px 0;
    padding: 16px;
    background: rgba(0,255,150,0.08);
    border-radius: 12px;
    text-align: center;
  }
  .reward span {
    display: block;
    font-size: 26px;
    color: #00ff9c;
    margin-top: 6px;
  }
  button {
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, #00ff9c, #00c777);
    color: #003322;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
  }
  button:active {
    transform: scale(0.98);
  }
  .footer {
    margin-top: 16px;
    text-align: center;
    font-size: 11px;
    color: #7bbfa3;
  }
  .success-box {
    margin-top: 18px;
    padding: 16px;
    border-radius: 12px;
    background: rgba(0,255,150,0.15);
    border: 1px solid #00ff9c;
    color: #dfffee;
    text-align: center;
    font-size: 15px;
  }
</style>
</head>

<body>
<div class="container">
  <div class="card">
    <div class="logo">GALÁPAGOS TOKEN</div>
    <div class="subtitle">Tecnología para preservar la vida</div>

    <div class="block">
      <div class="label">QR ID</div>
      <div class="value">${id}</div>
    </div>

    <div class="block">
      <div class="label">Valor del QR</div>
      <div class="value">$${valorUsd} USD</div>
    </div>

    <div class="reward">
      Recompensa (1%)
      <span>$${recompensaUsd} USD en tokens</span>
    </div>

    <button onclick="firmar()">Firmar y reclamar</button>

    <div id="resultado"></div>

    <div class="footer">
      Reclamo seguro vía Phantom Wallet
    </div>
  </div>
</div>

<script>
async function firmar() {
  const provider = window.solana;
  if (!provider) {
    document.getElementById("resultado").innerHTML =
      "<div class='success-box'>Phantom no disponible</div>";
    return;
  }

  const mensaje = new TextEncoder().encode("Reclamo Galápagos QR ${id}");
  const firmado = await provider.signMessage(mensaje, "utf8");

  const res = await fetch("/claim/${id}/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: provider.publicKey.toString(),
      signature: Array.from(firmado.signature)
    })
  });

  const data = await res.json();

  document.getElementById("resultado").innerHTML = `
    <div class="success-box">
      🌱 <strong>¡Felicidades!</strong><br><br>
      Ya eres parte de <b>Galápagos Token</b>.<br>
      Gracias por apoyar la vida y el planeta 🌍
    </div>
  `;
}
</script>
</body>
</html>
`);
});

/* ===============================
   RECIBE FIRMA
================================ */
app.post("/claim/:id/sign", (req, res) => {
  const { id } = req.params;
  const { publicKey } = req.body;

  if (!publicKey) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  let qrs = JSON.parse(fs.readFileSync("qrs.json"));

  if (!qrs[id]) {
    return res.status(404).json({ error: "QR no existe" });
  }

  if (qrs[id].usado) {
    return res.status(400).json({ error: "QR ya usado" });
  }

  res.json({
    success: true,
    mensaje: "OK",
    wallet: publicKey
  });
});

/* ===============================
   SERVER
================================ */
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Backend corriendo en puerto " + PORT);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

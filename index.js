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
   QR FÍSICO → REDIRECT A PHANTOM
   /r/:id
================================ */
app.get("/r/:id", (req, res) => {
  const { id } = req.params;

  const targetUrl = `https://galapagos-backend.onrender.com/claim/${id}`;
  const phantomLink =
    "https://phantom.app/ul/browse/" + encodeURIComponent(targetUrl);

  res.redirect(302, phantomLink);
});

/* ===============================
   UI PHANTOM (BONITA)
   GET /claim/:id
================================ */
app.get("/claim/:id", (req, res) => {
  const { id } = req.params;

  let qrs;
  try {
    qrs = JSON.parse(fs.readFileSync("qrs.json"));
  } catch {
    return res.status(500).send("Error leyendo qrs.json");
  }

  if (!qrs[id]) return res.status(404).send("QR no existe");
  if (qrs[id].usado) return res.send("Este QR ya fue usado");

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Galápagos Token</title>

  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial;
      background: linear-gradient(180deg, #0f2027, #203a43, #2c5364);
      color: #ffffff;
    }

    .container {
      max-width: 420px;
      margin: 0 auto;
      padding: 24px;
    }

    .card {
      background: rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      backdrop-filter: blur(12px);
    }

    h1 {
      text-align: center;
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }

    .subtitle {
      text-align: center;
      font-size: 14px;
      opacity: 0.85;
      margin: 12px 0 24px;
    }

    .info {
      margin-bottom: 20px;
    }

    .info div {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      margin-bottom: 10px;
    }

    .info span {
      font-weight: 600;
    }

    button {
      width: 100%;
      padding: 14px;
      border-radius: 14px;
      border: none;
      background: linear-gradient(135deg, #00f5a0, #00d9f5);
      color: #002b36;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }

    button:active {
      transform: scale(0.97);
    }

    .footer {
      text-align: center;
      font-size: 12px;
      opacity: 0.6;
      margin-top: 18px;
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="card">
      <h1>🌱 Galápagos Token</h1>

      <div class="subtitle">
        Reclama tu recompensa sostenible
      </div>

      <div class="info">
        <div>
          <span>QR</span>
          <span>${id}</span>
        </div>
        <div>
          <span>Valor</span>
          <span>$${qrs[id].valor_usd} USD</span>
        </div>
        <div>
          <span>Recompensa</span>
          <span>1% en GALA</span>
        </div>
      </div>

      <button onclick="firmar()">
        Firmar y reclamar
      </button>
    </div>

    <div class="footer">
      Powered by Solana · Phantom Wallet
    </div>
  </div>

<script>
async function firmar() {
  try {
    if (!window.solana || !window.solana.isPhantom) {
      alert("Abre este enlace desde Phantom Wallet");
      return;
    }

    const provider = window.solana;
    await provider.connect();

    const mensaje = new TextEncoder().encode("Reclamo QR ${id}");
    const firmado = await provider.signMessage(mensaje, "utf8");

    const res = await fetch(
      "https://galapagos-backend.onrender.com/claim/${id}/sign",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: provider.publicKey.toString(),
          signature: Array.from(firmado.signature)
        })
      }
    );

    const data = await res.json();
    alert(data.mensaje || "Proceso completado");

  } catch (err) {
    alert("Error: " + err.message);
  }
}
</script>

</body>
</html>
`);
});

/* ===============================
   RECIBE FIRMA (SIN TOKEN AÚN)
   POST /claim/:id/sign
================================ */
app.post("/claim/:id/sign", (req, res) => {
  const { id } = req.params;
  const { publicKey, signature } = req.body;

  if (!publicKey || !signature) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  let qrs;
  try {
    qrs = JSON.parse(fs.readFileSync("qrs.json"));
  } catch {
    return res.status(500).json({ error: "Error leyendo qrs.json" });
  }

  if (!qrs[id]) return res.status(404).json({ error: "QR no existe" });
  if (qrs[id].usado)
    return res.status(400).json({ error: "QR ya usado" });

  res.json({
    success: true,
    mensaje: "Firma recibida correctamente ✅ Backend listo",
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

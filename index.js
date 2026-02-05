import express from "express";
import fs from "fs";
import cors from "cors";
import http from "http";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   HEALTH CHECK (Render)
================================ */
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/* ===============================
   REDIRECT PARA QR FÍSICO
   /r/:id  → Phantom deep link
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
   ENDPOINT NUEVO
   QR → Phantom → Backend
   GET /claim/:id
================================ */
app.get("/claim/:id", (req, res) => {
  const { id } = req.params;

  let qrs;
  try {
    qrs = JSON.parse(fs.readFileSync("qrs.json"));
  } catch (err) {
    return res.status(500).send("Error leyendo qrs.json");
  }

  if (!qrs[id]) {
    return res.status(404).send("QR no existe");
  }

  if (qrs[id].usado) {
    return res.send("Este QR ya fue usado");
  }

  // HTML mínimo que SOLO se abre dentro de Phantom
  res.send(`
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Reclamar recompensa</title>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 20px;">
    <h2>Reclamar Galápagos Token</h2>
    <p><strong>QR:</strong> ${id}</p>
    <p><strong>Valor:</strong> $${qrs[id].valor_usd} USD</p>

    <button onclick="firmar()" style="font-size:16px;padding:10px;">
      Firmar y continuar
    </button>

    <script>
      async function firmar() {
        const provider = window.solana;
        if (!provider) {
          alert("Phantom no disponible");
          return;
        }

        const mensaje = new TextEncoder().encode("Reclamo QR ${id}");
        const firmado = await provider.signMessage(mensaje, "utf8");

        fetch("/claim/${id}/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: provider.publicKey.toString(),
            signature: Array.from(firmado.signature)
          })
        })
        .then(r => r.json())
        .then(d => {
          alert(d.mensaje || "Proceso completado");
        });
      }
    </script>
  </body>
</html>
  `);
});

/* ===============================
   ENDPOINT NUEVO
   Recibe firma (SIN TOKEN AÚN)
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
  } catch (err) {
    return res.status(500).json({ error: "Error leyendo qrs.json" });
  }

  if (!qrs[id]) {
    return res.status(404).json({ error: "QR no existe" });
  }

  if (qrs[id].usado) {
    return res.status(400).json({ error: "QR ya usado" });
  }

  // ⚠️ AÚN NO enviamos tokens
  // Solo confirmamos que Phantom → backend funciona

  res.json({
    success: true,
    mensaje: "Firma recibida correctamente. Backend listo ✅",
    wallet: publicKey
  });
});

/* ===============================
   SERVIDOR
================================ */
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Backend corriendo en puerto " + PORT);
});

// Evita cierre prematuro
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;


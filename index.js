import express from "express";
import fs from "fs";
import cors from "cors";
import http from "http";

const app = express();
app.use(cors());
app.use(express.json());

// RUTA ROOT (health check)
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// ENDPOINT QR
app.post("/claim", (req, res) => {
  const { qr_id, wallet } = req.body;

  if (!qr_id || !wallet) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  const data = JSON.parse(fs.readFileSync("qrs.json"));

  if (!data[qr_id]) {
    return res.status(404).json({ error: "QR no existe" });
  }

  if (data[qr_id].usado) {
    return res.status(400).json({ error: "QR ya usado" });
  }

  res.json({
    success: true,
    mensaje: "QR válido, listo para enviar tokens",
    valor_usd: data[qr_id].valor_usd
  });
});

const PORT = process.env.PORT || 8080;

// 🔥 SERVIDOR HTTP EXPLÍCITO (CLAVE PARA RAILWAY)
const server = http.createServer(app);
server.listen(PORT, "0.0.0.0", () => {
  console.log("Backend corriendo en puerto " + PORT);
});

// Evita cierre prematuro
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

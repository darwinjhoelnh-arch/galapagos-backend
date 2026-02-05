import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

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

app.listen(3000, () => {
  console.log("Backend corriendo en puerto 3000");
});

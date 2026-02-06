import fs from "fs";
import QRCode from "qrcode";

const BASE_URL = "https://galapagos-backend.onrender.com/r";
const PREFIJO = "GAL-BOT";
const OUTPUT_DIR = "qrs-imagenes/producto-botella-50usd";

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const qrs = JSON.parse(fs.readFileSync("qrs.json"));

for (const id of Object.keys(qrs)) {
  if (!id.startsWith(PREFIJO)) continue;

  const url = `${BASE_URL}/${id}`;
  const file = `${OUTPUT_DIR}/${id}.png`;

  await QRCode.toFile(file, url, {
    width: 600,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff"
    }
  });
}

console.log("🖨 QRs en imágenes listos para imprimir");

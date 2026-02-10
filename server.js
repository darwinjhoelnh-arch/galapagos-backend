import express from "express";
import fs from "fs";
import cors from "cors";
import path from "path";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.resolve();
const BASE_URL = process.env.BASE_URL;

/* servir archivos */
app.use(express.static("public"));
app.use("/qrs", express.static("qrs"));

/* root */
app.get("/", (_, res) => res.send("Galápagos Backend OK 🌱"));

/* QR → landing → Phantom */
app.get("/r/:id", (req, res) => {
  const { id } = req.params;

  res.send(`
<html>
<body style="background:#000;color:#fff;text-align:center;padding-top:80px">
<h3>Abriendo Phantom…</h3>
<a id="open" href="https://phantom.app/ul/browse/${encodeURIComponent(
    BASE_URL + "/claim/" + id
  )}">Abrir Phantom</a>
<script>
setTimeout(()=>document.getElementById("open").click(),800);
</script>
</body>
</html>
`);
});

/* claim */
app.get("/claim/:id", (_, res) => {
  res.sendFile(path.join(__dirname, "public/claim.html"));
});

/* firma */
app.post("/claim/:id/sign", (req, res) => {
  const { id } = req.params;
  const { publicKey } = req.body;

  const qrs = JSON.parse(fs.readFileSync("qrs.json"));
  if (!qrs[id] || qrs[id].used)
    return res.json({ error: "QR inválido" });

  qrs[id].used = true;
  qrs[id].wallet = publicKey;
  fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));

  res.json({ success: true });
});

/* ADMIN: crear producto + QRs */
app.post("/admin/create-product", async (req, res) => {
  if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN)
    return res.status(401).json({ error: "No autorizado" });

  const { name, value, units } = req.body;
  const productId = "prod_" + uuidv4();

  const products = JSON.parse(fs.readFileSync("products.json"));
  products[productId] = { name, value, units };
  fs.writeFileSync("products.json", JSON.stringify(products, null, 2));

  const qrs = JSON.parse(fs.readFileSync("qrs.json"));
  const created = [];

  for (let i = 0; i < units; i++) {
    const qrId = "qr_" + uuidv4();
    qrs[qrId] = { productId, used: false };

    const url = `${BASE_URL}/r/${qrId}`;
    const file = `qrs/${qrId}.png`;
    await QRCode.toFile(file, url);

    created.push({ qrId, qr: `${BASE_URL}/${file}` });
  }

  fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));
  res.json({ productId, created });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log("Servidor corriendo en puerto " + PORT)
);

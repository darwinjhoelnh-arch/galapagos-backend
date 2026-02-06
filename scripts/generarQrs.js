import fs from "fs";

const CANTIDAD = 500;
const VALOR_USD = 50;          // 👈 precio del producto
const PREFIJO = "GAL-BOT";     // 👈 identificador del producto

let qrs = {};
if (fs.existsSync("qrs.json")) {
  qrs = JSON.parse(fs.readFileSync("qrs.json"));
}

for (let i = 1; i <= CANTIDAD; i++) {
  const id = `${PREFIJO}-${String(i).padStart(5, "0")}`;
  qrs[id] = {
    valor_usd: VALOR_USD,
    usado: false
  };
}

fs.writeFileSync("qrs.json", JSON.stringify(qrs, null, 2));
console.log("✅ 500 QRs creados");

const TOKEN = "galapagos_admin_2026";

async function generate() {
  const product = document.getElementById("product").value;
  const value = document.getElementById("value").value;
  const qty = document.getElementById("qty").value;

  const res = await fetch(`/admin/generate?token=${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product, value, qty })
  });

  if (res.ok) {
    alert("QRs generados");
    loadStats();
  } else {
    alert("Error generando QRs");
  }
}

function downloadZip() {
  const product = document.getElementById("downloadProduct").value;
  const onlyNew = document.getElementById("onlyNew").checked ? 1 : 0;

  window.location =
    `/admin/download/${product}?onlyNew=${onlyNew}&token=${TOKEN}`;
}

async function loadStats() {
  const res = await fetch(`/admin/stats?token=${TOKEN}`);
  const data = await res.json();

  document.getElementById("stats").innerHTML = `
    Total QRs: <b>${data.total}</b><br>
    Activos: <b>${data.active}</b><br>
    Reclamados: <b>${data.claimed}</b>
  `;
}

loadStats();

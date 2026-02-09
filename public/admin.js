async function generate(){
  await fetch("/admin/generate",{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      product:product.value,
      value_usd:value.value,
      amount:amount.value
    })
  });
  alert("Generado");
}

function download(){
  const p=prod2.value;
  const o=onlyNew.checked?"1":"0";
  location.href=`/admin/download/${p}?onlyNew=${o}`;
}

async function stats(){
  const s=await fetch("/admin/stats").then(r=>r.json());
  statsDiv.innerHTML=`Total: ${s.total}<br>Reclamados: ${s.claimed}`;
}
stats();

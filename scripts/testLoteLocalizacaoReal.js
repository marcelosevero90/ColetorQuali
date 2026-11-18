const url = 'http://10.15.1.20:8180/api/promob/v1';
const auth = 'Basic ' + Buffer.from('matheus.st:qwe8451').toString('base64');
const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Authorization': auth,
  'companyId': '001'
};

async function testar() {
  console.log('=== TESTE 1: fcGetLote PARA d352-221/1 ===');
  for (const it of ['d352-221/1', 'D352-221/1']) {
    try {
      const payload = { codEstabel: '101', itCodigo: it, payload: [{ codEstabel: '101', itCodigo: it }] };
      const res = await fetch(`${url}/fcGetLote`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
      console.log(`Status (${it}):`, res.status);
      const text = await res.text();
      console.log(`Retorno (${it}):`, text.slice(0, 1500));
    } catch (e) {
      console.error(`Erro ${it}:`, e.message);
    }
  }

  console.log('\n=== TESTE 2: fcGetLocalizacao PARA 101 ===');
  for (const dep of ['AST', 'ast', '']) {
    try {
      const payloadLoc = { codEstabel: '101', codDepos: dep, payload: [{ codEstabel: '101', codDepos: dep }] };
      const resLoc = await fetch(`${url}/fcGetLocalizacao`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payloadLoc)
      });
      console.log(`Status (dep: "${dep}"):`, resLoc.status);
      const textLoc = await resLoc.text();
      console.log(`Retorno (dep: "${dep}"):`, textLoc.slice(0, 1500));
    } catch (e) {
      console.error(`Erro dep ${dep}:`, e.message);
    }
  }
}

testar();

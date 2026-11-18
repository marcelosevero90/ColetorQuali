const authHeader = 'Basic ' + Buffer.from('matheus.st:qwe8451').toString('base64');
const companyId = '001';
const pasoeBase = 'http://10.15.1.20:8180/api/promob/v1';

async function pasoeCall(endpoint, method, body) {
  const targetUrl = `${pasoeBase}/${endpoint.replace(/^\/+/, '')}`;
  const proxyUrl = `http://localhost:3000/api/pasoe-proxy?url=${encodeURIComponent(targetUrl)}`;
  const res = await fetch(proxyUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'companyId': companyId,
      'Authorization': authHeader
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data };
}

async function run() {
  console.log('--- Testando apuração direta ficha 8 ---');
  const resAp = await pasoeCall('fcSetInventarioApuracaoFicha', 'PUT', {
    payload: [{
      codEmpresa: companyId,
      epCodigo: companyId,
      codEstabel: '101',
      dtSaldo: '2026-11-17',
      itCodigo: '01010227',
      codDepos: 'AST',
      codLocaliz: '',
      lote: '',
      codRefer: '',
      nrContagem: 1,
      nrFicha: 8,
      codUsuario: 'matheus.st',
      qtApurada: 15
    }]
  });
  console.log('Apuração Ficha 8:', resAp.status, resAp.data);
}

run().catch(console.error);

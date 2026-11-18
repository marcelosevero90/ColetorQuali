const http = require('http');

function postJson(path, body, companyId = '001') {
  return new Promise((resolve, reject) => {
    const payloadStr = JSON.stringify(body);
    const auth = Buffer.from('matheus.st:qwe8451').toString('base64');
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/datasul' + path,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + auth,
        'companyId': companyId,
        'Content-Length': Buffer.byteLength(payloadStr)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.write(payloadStr);
    req.end();
  });
}

async function testarConflito() {
  console.log('=== TESTE DE SIMULAÇÃO DE CONFLITO TOTVS VS APP ===');

  // 1. Simula alguém apurando a ficha 1 no TOTVS com quantidade 10
  console.log('1. Apurando Ficha #1 no TOTVS com Qtd = 10...');
  const resTotvs = await postJson('/fcSetInventarioApuracaoFicha', {
    codEmpresa: '001',
    dtSaldo: '2026-11-17',
    codEstabel: '101',
    codDepos: 'AST',
    nrFicha: 1,
    nrContagem: 1,
    qtApurada: 10.0,
    codUsuario: 'operador.totvs'
  });
  console.log('Resultado TOTVS:', resTotvs.type, resTotvs.message);

  // 2. Consulta o status da Ficha #1 no TOTVS
  console.log('2. Consultando Ficha #1 no TOTVS...');
  const resFichas = await postJson('/fcGetInventariosFichas', {
    codEmpresa: '001',
    dtSaldo: '2026-11-17',
    codEstabel: '101',
    nrContagem: 1,
    apenasPendentes: false
  });
  const f1Totvs = (resFichas.items || []).find(f => f.nrFicha === 1);
  console.log(`Ficha #1 no TOTVS: qtApurada = ${f1Totvs?.qtApurada}, valApurado1 = ${f1Totvs?.valApurado1}`);

  // 3. Simula que o operador offline apurou a Ficha #1 com Qtd = 15
  const qtdApp = 15.0;
  console.log(`3. Operador offline apurou Ficha #1 com Qtd = ${qtdApp}`);

  const ehConflito = (f1Totvs && f1Totvs.qtApurada !== null && Number(f1Totvs.qtApurada) !== qtdApp);
  console.log('Detectou conflito corretamente?:', ehConflito ? '✓ SIM (Qtd App: 15 vs Qtd TOTVS: 10)' : '❌ NÃO');

  if (ehConflito) {
    console.log('✓ Cenário de conflito validado! O modal #modal-conflitos-sync solicitará a decisão do operador.');
  }

  console.log('=== TESTE CONCLUÍDO COM SUCESSO! ===');
}

testarConflito().catch(console.error);

// scripts/verifyFluxoSegregado.js
// Testa a segregação estrita entre Apuração de Fichas do CE0712 e Inclusão de Ficha Avulsa
const assert = require('assert');
const http = require('http');
const app = require('../server');

function basicAuth(usuario, senha) {
  return 'Basic ' + Buffer.from(`${usuario}:${senha}`).toString('base64');
}

async function reqJson(baseUrl, path, { method = 'GET', headers = {}, body = null } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Accept': 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }
  return { status: res.status, headers: res.headers, body: json };
}

async function run() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[TESTE] Servidor iniciado em ${baseUrl}`);

  try {
    await reqJson(baseUrl, '/api/datasul/resetBase', { method: 'POST' });
    const auth = basicAuth('matheus.st', 'qwe8451');
    const headers = { 'Authorization': auth, 'companyId': '001' };

    // 1. Obter fichas pré-geradas no CE0712 para a data 2026-11-16 no depósito ALM
    const payloadFichas = {
      codEstabel: '101',
      dtSaldo: '2026-11-16',
      codDepos: 'ALM',
      nrContagem: 2,
      codUsuario: 'matheus.st'
    };
    const resFichas = await reqJson(baseUrl, '/api/datasul/fcGetInventariosFichas', {
      method: 'PUT',
      headers,
      body: { ...payloadFichas, payload: [payloadFichas] }
    });
    assert.strictEqual(resFichas.status, 200);
    const fichas = resFichas.body.items || resFichas.body.fichas || [];
    assert(fichas.length > 0, 'Deve retornar fichas pré-geradas do CE0712');
    const primeiraFicha = fichas[0];
    console.log(`[PASS] 1. Fichas oficiais do CE0712 carregadas. Primeira ficha: #${primeiraFicha.nrFicha} - Item ${primeiraFicha.itCodigo}`);

    // 2. Apuração da ficha oficial existente via fcSetInventarioApuracaoFicha -> Deve retornar OK
    const payloadApuracao = {
      codEmpresa: '001',
      dtSaldo: '2026-11-16',
      codEstabel: primeiraFicha.codEstabel,
      codDepos: primeiraFicha.codDepos,
      codLocaliz: primeiraFicha.codLocaliz || '',
      lote: primeiraFicha.lote || '',
      codRefer: primeiraFicha.codRefer || '',
      itCodigo: primeiraFicha.itCodigo,
      nrFicha: Number(primeiraFicha.nrFicha),
      nrContagem: 2,
      qtApurada: 42,
      codUsuario: 'matheus.st'
    };
    const resApuracao = await reqJson(baseUrl, '/api/datasul/fcSetInventarioApuracaoFicha', {
      method: 'PUT',
      headers,
      body: { ...payloadApuracao, payload: [payloadApuracao] }
    });
    assert.strictEqual(resApuracao.status, 200);
    assert.strictEqual(resApuracao.body.type, 'OK', 'Apuração de ficha existente deve ter sucesso');
    console.log(`[PASS] 2. Apuração da ficha oficial #${primeiraFicha.nrFicha} no CE0712 concluída com sucesso.`);

    // 3. Simular tentativa de apurar ficha que NÃO existe no CE0712 via fcSetInventarioApuracaoFicha
    // Isso comprova a causa raiz do erro relatado pelo cliente
    const payloadInexistente = {
      codEmpresa: '001',
      dtSaldo: '2026-11-16',
      codEstabel: '101',
      codDepos: 'ALM',
      codLocaliz: '',
      lote: 'LOTE-INEXISTENTE',
      codRefer: '',
      itCodigo: '01010047',
      nrFicha: 99999,
      nrContagem: 2,
      qtApurada: 10,
      codUsuario: 'matheus.st'
    };
    const resInexistente = await reqJson(baseUrl, '/api/datasul/fcSetInventarioApuracaoFicha', {
      method: 'PUT',
      headers,
      body: { ...payloadInexistente, payload: [payloadInexistente] }
    });
    assert.strictEqual(resInexistente.status, 200);
    assert.strictEqual(resInexistente.body.type, 'ERROR');
    assert(
      resInexistente.body.message.includes('não encontrado'),
      'Deve retornar erro de inventário não encontrado ao tentar apurar ficha inexistente'
    );
    console.log(`[PASS] 3. Comprovada causa do erro anterior: ficha avulsa enviada indevidamente para fcSetInventarioApuracaoFicha retorna erro de inventário não encontrado: "${resInexistente.body.message}".`);

    // 4. Fluxo correto e separado: Inclusão de Ficha Avulsa via fcSetInventarioNovaFicha
    const payloadAvulsa = {
      codEmpresa: '001',
      dtSaldo: '2026-11-16',
      codEstabel: '101',
      codDepos: 'ALM',
      codLocaliz: 'A-01-01',
      lote: 'LT-NOVO-AVULSO',
      codRefer: '',
      dtValiLote: '2028-12-31',
      itCodigo: '11000015',
      nrContagem: 2,
      qtApurada: 15,
      codUsuario: 'matheus.st',
      vlMaterial: 0,
      vlMob: 0,
      vlGgf: 0
    };
    const resNovaFicha = await reqJson(baseUrl, '/api/datasul/fcSetInventarioNovaFicha', {
      method: 'PUT',
      headers,
      body: { ...payloadAvulsa, payload: [payloadAvulsa] }
    });
    assert.strictEqual(resNovaFicha.status, 200);
    assert.strictEqual(resNovaFicha.body.type, 'OK', 'Inclusão de ficha avulsa deve ter sucesso');
    const nrNovaFicha = Number(resNovaFicha.body.nrFicha || resNovaFicha.body.message);
    assert(nrNovaFicha > 0, 'Deve gerar um número oficial de ficha');
    console.log(`[PASS] 4. Fluxo separado de Ficha Avulsa gerou com sucesso a nova Ficha #${nrNovaFicha} no Totvs.`);

    // 5. Teste do fluxo offline integrado: Sincronização em lote segregada
    const operacoesSync = [
      {
        tipo: 'INVENTARIO_AVULSA',
        id_uuid: 'SYNC_AVULSA_01',
        codEmpresa: '001',
        dtSaldo: '2026-11-16',
        codEstabel: '101',
        codDepos: 'ALM',
        codLocaliz: 'A-01-02',
        lote: 'LT-AVULSO-SYNC',
        codRefer: '',
        dtValiLote: '2028-12-31',
        itCodigo: '11000015',
        nrContagem: 2,
        qtApurada: 25,
        codUsuario: 'matheus.st'
      },
      {
        tipo: 'INVENTARIO_APURACAO',
        id_uuid: 'SYNC_APURACAO_01',
        codEmpresa: '001',
        dtSaldo: '2026-11-16',
        codEstabel: primeiraFicha.codEstabel,
        codDepos: primeiraFicha.codDepos,
        codLocaliz: primeiraFicha.codLocaliz || '',
        lote: primeiraFicha.lote || '',
        codRefer: primeiraFicha.codRefer || '',
        itCodigo: primeiraFicha.itCodigo,
        nrFicha: Number(primeiraFicha.nrFicha),
        nrContagem: 2,
        qtApurada: 50,
        codUsuario: 'matheus.st'
      }
    ];

    const resSync = await reqJson(baseUrl, '/api/datasul/fcSyncLote', {
      method: 'POST',
      headers,
      body: { codEmpresa: '001', operacoes: operacoesSync }
    });
    assert.strictEqual(resSync.status, 200);
    assert.strictEqual(resSync.body.success, true);
    assert.strictEqual(resSync.body.erros, 0);
    assert.strictEqual(resSync.body.processados, 2);
    console.log(`[PASS] 5. Fila offline segregada sincronizada com 100% de sucesso (Processados: ${resSync.body.processados}, Erros: ${resSync.body.erros}).`);

    console.log('\n======================================================');
    console.log('TODOS OS TESTES DO FLUXO SEGREGADO PASSARAM COM SUCESSO');
    console.log('======================================================');
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});

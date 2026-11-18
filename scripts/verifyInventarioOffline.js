// scripts/verifyInventarioOffline.js - Teste automatizado ponta a ponta do Coletor Datasul (Inventário Offline-First)
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

function logPass(nome) {
  console.log(`[PASS] ${nome}`);
}

async function run() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Servidor de verificação iniciado em ${baseUrl}`);

  try {
    // Restaurar base antes de iniciar
    const resetStart = await reqJson(baseUrl, '/api/datasul/resetBase', { method: 'POST' });
    assert.strictEqual(resetStart.status, 200);
    assert.strictEqual(resetStart.body.success, true);

    // 1. Discovery ALIAS
    const discTeste = await reqJson(baseUrl, '/api/discovery/resolve?alias=teste');
    assert.strictEqual(discTeste.status, 200);
    assert.strictEqual(discTeste.body.success, true);
    assert.strictEqual(discTeste.body.alias, 'teste');
    assert.strictEqual(discTeste.body.pasoeUrl, 'http://10.15.1.20:8180/api/promob/v1');
    assert.strictEqual(discTeste.body.empresaPrincipal, '001');

    const discDemo = await reqJson(baseUrl, '/api/discovery/resolve?alias=demo');
    assert.strictEqual(discDemo.status, 200);
    assert.strictEqual(discDemo.body.success, true);
    assert.strictEqual(discDemo.body.empresaPrincipal, '001');
    logPass('1. Discovery ALIAS (teste e demo)');

    // 2. Autenticação fcLogin + Basic Auth
    const loginMatheus = await reqJson(baseUrl, '/api/datasul/fcLogin', {
      method: 'POST',
      headers: {
        'Authorization': basicAuth('matheus.st', 'qwe8451'),
        'companyId': '001'
      },
      body: { payload: [{ usuario: 'matheus.st', senha: 'qwe8451' }] }
    });
    assert.strictEqual(loginMatheus.status, 200);
    assert.strictEqual(loginMatheus.body.type, 'OK');
    assert.strictEqual(loginMatheus.body.code, '0');
    assert.strictEqual(loginMatheus.body.success, true);
    assert.strictEqual(loginMatheus.body.codEstabPad, '101');

    const loginEmp2 = await reqJson(baseUrl, '/api/datasul/fcLogin', {
      method: 'POST',
      headers: {
        'Authorization': basicAuth('aamaral', '123'),
        'companyId': '002'
      },
      body: { payload: [{ usuario: 'aamaral', senha: '123' }] }
    });
    assert.strictEqual(loginEmp2.status, 200);
    assert.strictEqual(loginEmp2.body.success, true);
    assert.strictEqual(loginEmp2.body.codEstabPad, '2100');

    const loginInvalido = await reqJson(baseUrl, '/api/datasul/fcLogin', {
      method: 'POST',
      headers: {
        'Authorization': basicAuth('matheus.st', 'senha_errada'),
        'companyId': '001'
      },
      body: { payload: [{ usuario: 'matheus.st', senha: 'senha_errada' }] }
    });
    assert.strictEqual(loginInvalido.status, 401);
    assert.strictEqual(loginInvalido.body.type, 'ERROR');
    assert.strictEqual(loginInvalido.body.success, false);

    const semAuth = await reqJson(baseUrl, '/api/datasul/fcGetEstabelecimentos');
    assert.strictEqual(semAuth.status, 401);
    logPass('2. Autenticação fcLogin (Basic Auth válida, multi-empresa e erro 401)');

    // 3. Proxy PASOE repassando Authorization e companyId
    const targetDepos = `${baseUrl}/api/datasul/fcGetDeposito`;
    const proxyRes = await reqJson(baseUrl, `/api/pasoe-proxy?url=${encodeURIComponent(targetDepos)}`, {
      method: 'GET',
      headers: {
        'Authorization': basicAuth('aamaral', '123'),
        'companyId': '002'
      }
    });
    assert.strictEqual(proxyRes.status, 200);
    assert.strictEqual(proxyRes.body.codEmpresa, '002');
    assert.ok(proxyRes.body.items.some(d => d.codDepos === '102'));
    assert.ok(!proxyRes.body.items.some(d => d.codDepos === 'ALM'));
    logPass('3. Proxy PASOE preserva Authorization Basic e header companyId');

    // 4. Tabela Estabelecimento Global (Multi-empresa)
    const estabRes = await reqJson(baseUrl, '/api/datasul/fcGetEstabelecimentos', {
      headers: { 'Authorization': basicAuth('aamaral', '123') }
    });
    assert.strictEqual(estabRes.status, 200);
    const estList = estabRes.body.items || [];
    assert.ok(estList.some(e => e.codEstabel === '101' && e.codEmpresa === '001'));
    assert.ok(estList.some(e => e.codEstabel === '2100' && e.codEmpresa === '002'));
    logPass('4. fcGetEstabelecimentos retorna tabela global com estabelecimentos das empresas 001 e 002');

    // 5. Isolamento Mono-Empresa via companyId (001 vs 002)
    const headers001 = { 'Authorization': basicAuth('aamaral', '123'), 'companyId': '001' };
    const headers002 = { 'Authorization': basicAuth('aamaral', '123'), 'companyId': '002' };

    const perm001 = await reqJson(baseUrl, '/api/datasul/fcGetParamUsuario', {
      method: 'PUT', headers: headers001, body: { payload: [{ usuario: 'aamaral' }] }
    });
    const perm002 = await reqJson(baseUrl, '/api/datasul/fcGetParamUsuario', {
      method: 'PUT', headers: headers002, body: { payload: [{ usuario: 'aamaral' }] }
    });
    assert.strictEqual(perm001.body.items[0].codEmpresa, '001');
    assert.strictEqual(perm001.body.items[0].codEstabPad, '101');
    assert.strictEqual(perm002.body.items[0].codEmpresa, '002');
    assert.strictEqual(perm002.body.items[0].codEstabPad, '2100');

    const permSemInv = await reqJson(baseUrl, '/api/datasul/fcGetParamUsuario', {
      method: 'PUT',
      headers: { 'Authorization': basicAuth('sem_inv', '123'), 'companyId': '001' },
      body: { payload: [{ usuario: 'sem_inv' }] }
    });
    assert.strictEqual(permSemInv.body.items[0].permEstoque, true);
    assert.strictEqual(permSemInv.body.items[0].permEstoqReqInv, false);

    const invParam001 = await reqJson(baseUrl, '/api/datasul/fcGetInventarioParam', {
      method: 'PUT', headers: headers001, body: { payload: [{ dtSaldo: '' }] }
    });
    const invParam002 = await reqJson(baseUrl, '/api/datasul/fcGetInventarioParam', {
      method: 'PUT', headers: headers002, body: { payload: [{ dtSaldo: '' }] }
    });
    assert.ok(invParam001.body.items.some(i => i.dtSaldo === '2026-11-16' && i.indSitInv === 1 && i.permContgUsFc === false));
    assert.ok(invParam001.body.items.some(i => i.dtSaldo === '2026-11-10' && i.indSitInv === 2));
    assert.ok(invParam002.body.items.some(i => i.dtSaldo === '2026-11-15' && i.indSitInv === 1 && i.permContgUsFc === true));

    const dep001 = await reqJson(baseUrl, '/api/datasul/fcGetDeposito', { headers: headers001 });
    const dep002 = await reqJson(baseUrl, '/api/datasul/fcGetDeposito', { headers: headers002 });
    assert.ok(dep001.body.items.some(d => d.codDepos === 'ALM') && !dep001.body.items.some(d => d.codDepos === '102'));
    assert.ok(dep002.body.items.some(d => d.codDepos === '102') && !dep002.body.items.some(d => d.codDepos === 'ALM'));

    const loc001 = await reqJson(baseUrl, '/api/datasul/fcGetLocalizacao', {
      method: 'PUT', headers: headers001, body: { payload: [{ codEstabel: '101' }] }
    });
    const loc002 = await reqJson(baseUrl, '/api/datasul/fcGetLocalizacao', {
      method: 'PUT', headers: headers002, body: { payload: [{ codEstabel: '2100' }] }
    });
    assert.ok(loc001.body.items.some(l => l.codLocaliz === 'A-01-01'));
    assert.ok(loc001.body.items.some(l => l.codDepos === 'AST' && l.codLocaliz === '' && l.descricao === 'BRANCO'), 'Localização em branco no AST deve existir');
    assert.ok(loc001.body.items.some(l => l.codDepos === 'AST' && l.codLocaliz === 'TESTE'), 'Localização TESTE no AST deve existir');
    assert.ok(loc002.body.items.some(l => l.codLocaliz === '4-2-2'));

    const lote001 = await reqJson(baseUrl, '/api/datasul/fcGetLote', {
      method: 'PUT', headers: headers001, body: { payload: [{ codEstabel: '101', itCodigo: '' }] }
    });
    const loteD352 = await reqJson(baseUrl, '/api/datasul/fcGetLote', {
      method: 'PUT', headers: headers001, body: { payload: [{ codEstabel: '101', itCodigo: 'd352-221/1' }] }
    });
    assert.ok(loteD352.body.items.some(l => l.lote === '5992945-10' && l.codDepos === 'SRO'), 'Lote 5992945-10 em SRO deve ser retornado para d352-221/1');
    assert.ok(loteD352.body.items.some(l => l.lote === '6000765-2290' && l.codDepos === 'ACA'), 'Lote 6000765-2290 em ACA deve ser retornado para d352-221/1');
    assert.ok(loteD352.body.items.some(l => l.lote === '6044671-50'), 'Lote 6044671-50 deve ser retornado para d352-221/1');
    const lote002 = await reqJson(baseUrl, '/api/datasul/fcGetLote', {
      method: 'PUT', headers: headers002, body: { payload: [{ codEstabel: '2100', itCodigo: '' }] }
    });
    assert.ok(lote001.body.items.every(l => l.codEmpresa === '001'));
    assert.ok(lote002.body.items.every(l => l.codEmpresa === '002'));

    const ref001 = await reqJson(baseUrl, '/api/datasul/fcGetReferencia', { headers: headers001 });
    const ref002 = await reqJson(baseUrl, '/api/datasul/fcGetReferencia', { headers: headers002 });
    assert.ok(ref001.body.items.some(r => r.codRefer === 'PAD'));
    assert.ok(ref002.body.items.some(r => r.codRefer === 'SAF26'));

    const mestres001 = await reqJson(baseUrl, '/api/datasul/fcGetDadosMestres?codEstabel=101', { headers: headers001 });
    const mestres002 = await reqJson(baseUrl, '/api/datasul/fcGetDadosMestres?codEstabel=2100', { headers: headers002 });
    assert.strictEqual(mestres001.body.codEmpresa, '001');
    assert.strictEqual(mestres002.body.codEmpresa, '002');
    logPass('5. Isolamento completo mono-empresa via companyId (001 vs 002) em parâmetros, depósitos, localizações, lotes e referências');

    // 6. Carga Progressiva em Chunks (Keyset Pagination)
    let lastItCodigo = '';
    let chunkNum = 1;
    let totalColetados001 = [];
    let hasMore = true;
    let totalEsperado = 0;
    while (hasMore) {
      const ch = await reqJson(baseUrl, '/api/datasul/fcGetItensChunk', {
        method: 'PUT',
        headers: headers001,
        body: { chunk: chunkNum, pageSize: 20, lastItCodigo }
      });
      assert.strictEqual(ch.status, 200);
      assert.strictEqual(ch.body.success, true);
      totalEsperado = ch.body.totalRecords;
      assert.ok(totalEsperado >= 50, 'Deve ter pelo menos 50 itens cadastrados');
      totalColetados001.push(...ch.body.itens);
      hasMore = ch.body.hasMore;
      lastItCodigo = ch.body.lastItCodigo || '';
      chunkNum++;
      assert.ok(chunkNum <= 10, 'Loop infinito na paginação em chunks');
    }
    const codigosUnicos = new Set(totalColetados001.map(i => i.itCodigo));
    assert.strictEqual(totalColetados001.length, totalEsperado);
    assert.strictEqual(codigosUnicos.size, totalEsperado);

    const chunkEmp2 = await reqJson(baseUrl, '/api/datasul/fcGetItensChunk', {
      method: 'PUT',
      headers: headers002,
      body: { chunk: 1, pageSize: 20 }
    });
    assert.strictEqual(chunkEmp2.body.totalRecords, 4);
    assert.strictEqual(chunkEmp2.body.hasMore, false);
    assert.ok(chunkEmp2.body.itens.some(i => i.itCodigo === '052900017'));
    logPass('6. Carga em chunks fcGetItensChunk paginou todos os 50 itens da empresa 001 sem duplicidade e 4 da empresa 002');

    // 7. Validações de Parâmetros do Inventário (fmsc-inventario / FMSC0102)
    // 7a. Bloqueado (indSitInv = 2)
    const apurarBloq = await reqJson(baseUrl, '/api/datasul/fcSetInventarioApuracaoFicha', {
      method: 'PUT',
      headers: headers001,
      body: {
        payload: [{
          dtSaldo: '2026-11-10',
          nrFicha: 101,
          itCodigo: '11000015',
          codEstabel: '101',
          codDepos: 'ALM',
          codLocaliz: 'A-01-01',
          lote: 'LT-2026-01',
          codRefer: '',
          nrContagem: 1,
          qtApurada: 90,
          codUsuario: 'aamaral'
        }]
      }
    });
    assert.strictEqual(apurarBloq.body.type, 'ERROR');
    assert.strictEqual(apurarBloq.body.code, 'INV_BLOQUEADO');
    assert.strictEqual(apurarBloq.body.success, false);

    // 7b. Segregação estrita (permContgUsFc = false) na Empresa 001 (Ficha #3 contada por conferente1)
    const headersConf1 = { 'Authorization': basicAuth('conferente1', '123'), 'companyId': '001' };
    const headersConf2 = { 'Authorization': basicAuth('conferente2', '123'), 'companyId': '001' };

    const fichasConf1R2 = await reqJson(baseUrl, '/api/datasul/fcGetInventariosFichas', {
      method: 'PUT',
      headers: headersConf1,
      body: { payload: [{ codEstabel: '101', dtSaldo: '2026-11-16', nrContagem: 2, codUsuario: 'conferente1' }] }
    });
    assert.ok(!fichasConf1R2.body.items.some(f => f.nrFicha === 3), 'conferente1 não deveria visualizar Ficha #3 na 2ª rodada');

    const apurarSegregado = await reqJson(baseUrl, '/api/datasul/fcSetInventarioApuracaoFicha', {
      method: 'PUT',
      headers: headersConf1,
      body: {
        payload: [{
          dtSaldo: '2026-11-16',
          nrFicha: 3,
          itCodigo: '11500028',
          codEstabel: '101',
          codDepos: 'ALM',
          codLocaliz: 'B-02-01',
          lote: '211000049',
          codRefer: '',
          nrContagem: 2,
          qtApurada: 4480,
          codUsuario: 'conferente1'
        }]
      }
    });
    assert.strictEqual(apurarSegregado.body.type, 'ERROR');
    assert.strictEqual(apurarSegregado.body.code, 'SEGREGACAO_USUARIO');
    assert.strictEqual(apurarSegregado.body.success, false);

    const fichasConf2R2 = await reqJson(baseUrl, '/api/datasul/fcGetInventariosFichas', {
      method: 'PUT',
      headers: headersConf2,
      body: { payload: [{ codEstabel: '101', dtSaldo: '2026-11-16', nrContagem: 2, codUsuario: 'conferente2' }] }
    });
    assert.ok(fichasConf2R2.body.items.some(f => f.nrFicha === 3), 'conferente2 deve visualizar Ficha #3 na 2ª rodada');

    const apurarConf2 = await reqJson(baseUrl, '/api/datasul/fcSetInventarioApuracaoFicha', {
      method: 'PUT',
      headers: headersConf2,
      body: {
        payload: [{
          dtSaldo: '2026-11-16',
          nrFicha: 3,
          itCodigo: '11500028',
          codEstabel: '101',
          codDepos: 'ALM',
          codLocaliz: 'B-02-01',
          lote: '211000049',
          codRefer: '',
          nrContagem: 2,
          qtApurada: 4480,
          codUsuario: 'conferente2'
        }]
      }
    });
    assert.strictEqual(apurarConf2.body.type, 'OK');
    assert.strictEqual(apurarConf2.body.success, true);

    // 7c. Mesmo usuário permitido (permContgUsFc = true) na Empresa 002 (Ficha #1 contada por aamaral)
    const fichasEmp2R2 = await reqJson(baseUrl, '/api/datasul/fcGetInventariosFichas', {
      method: 'PUT',
      headers: headers002,
      body: { payload: [{ codEstabel: '2100', dtSaldo: '2026-11-15', nrContagem: 2, codUsuario: 'aamaral' }] }
    });
    assert.ok(fichasEmp2R2.body.items.some(f => f.nrFicha === 1), 'Na empresa 002 aamaral pode contar a 2ª rodada da Ficha #1');

    const apurarEmp2R2 = await reqJson(baseUrl, '/api/datasul/fcSetInventarioApuracaoFicha', {
      method: 'PUT',
      headers: headers002,
      body: {
        payload: [{
          dtSaldo: '2026-11-15',
          nrFicha: 1,
          itCodigo: '052900017',
          codEstabel: '2100',
          codDepos: '102',
          codLocaliz: '4-2-2',
          lote: 'LT-AGRO-90',
          codRefer: 'SAF26',
          nrContagem: 2,
          qtApurada: 345,
          codUsuario: 'aamaral'
        }]
      }
    });
    assert.strictEqual(apurarEmp2R2.body.type, 'OK');
    assert.strictEqual(apurarEmp2R2.body.success, true);
    logPass('7. Parâmetros fmsc-inventario: bloqueio (indSitInv=2) e segregação (permContgUsFc false vs true) validados');

    // 8. Verificação de Valores (fcGetInventariosVerifValores) + Ficha Avulsa (fcSetInventarioNovaFicha) + Fila Offline Lote (fcSyncLote)
    const verifSim = await reqJson(baseUrl, '/api/datasul/fcGetInventariosVerifValores', {
      method: 'PUT',
      headers: headers001,
      body: { payload: [{ dtSaldo: '2026-11-16', itCodigo: '11500028' }] }
    });
    assert.strictEqual(verifSim.body.success, true);
    assert.strictEqual(verifSim.body.message, 'YES');

    const verifNao = await reqJson(baseUrl, '/api/datasul/fcGetInventariosVerifValores', {
      method: 'PUT',
      headers: headers001,
      body: { payload: [{ dtSaldo: '2026-11-16', itCodigo: '11000015' }] }
    });
    assert.strictEqual(verifNao.body.success, true);
    assert.strictEqual(verifNao.body.message, 'NO');

    const novaFicha = await reqJson(baseUrl, '/api/datasul/fcSetInventarioNovaFicha', {
      method: 'PUT',
      headers: headers001,
      body: {
        payload: [{
          dtSaldo: '2026-11-16',
          codEstabel: '101',
          codDepos: 'ALM',
          codLocaliz: 'A-01-01',
          lote: '',
          codRefer: '',
          itCodigo: 'PI0020',
          qtApurada: 7,
          vlMaterial: 12.5,
          codUsuario: 'aamaral'
        }]
      }
    });
    assert.strictEqual(novaFicha.body.type, 'OK');
    assert.strictEqual(novaFicha.body.success, true);
    assert.ok(Number(novaFicha.body.nrFicha) > 0);

    const syncLote = await reqJson(baseUrl, '/api/datasul/fcSyncLote', {
      method: 'POST',
      headers: headers001,
      body: {
        operacoes: [
          {
            id_uuid: 'test-uuid-1',
            codEmpresa: '001',
            tipo: 'INVENTARIO_APURACAO',
            dtSaldo: '2026-11-16',
            nrFicha: 1,
            itCodigo: '11000015',
            codEstabel: '101',
            codDepos: 'ALM',
            codLocaliz: 'A-01-01',
            lote: 'LT-2026-01',
            codRefer: '',
            nrContagem: 2,
            qtApurada: 120,
            codUsuario: 'aamaral'
          },
          {
            id_uuid: 'test-uuid-2',
            codEmpresa: '001',
            tipo: 'INVENTARIO_AVULSA',
            dtSaldo: '2026-11-16',
            codEstabel: '101',
            codDepos: 'ALM',
            codLocaliz: 'A-01-02',
            lote: '',
            codRefer: '',
            itCodigo: 'PI0041',
            qtApurada: 10,
            codUsuario: 'aamaral'
          }
        ]
      }
    });
    assert.strictEqual(syncLote.status, 200);
    if (!syncLote.body.success) {
      console.log('DEBUG syncLote.body:', JSON.stringify(syncLote.body, null, 2));
    }
    assert.strictEqual(syncLote.body.success, true);
    assert.strictEqual(syncLote.body.processados, 2);
    assert.strictEqual(syncLote.body.erros, 0);
    logPass('8. Ficha avulsa (fcGetInventariosVerifValores + fcSetInventarioNovaFicha) e lote offline (fcSyncLote) validados');

    // 8b. Nova Regra nr-contag-ativa: bloqueio de contagens inativas e ocultação de inventário concluído (nr-contag-ativa = 4)
    const resumoInv = await reqJson(baseUrl, '/api/datasul/fcGetInventariosResumo', {
      headers: headers001
    });
    assert.strictEqual(resumoInv.status, 200);
    assert.ok(!resumoInv.body.items.some(i => i.dtSaldo === '2026-11-01'), 'Inventário de 2026-11-01 (nrContagAtiva=4) NÃO deve listar no App');
    const invAtivo = resumoInv.body.items.find(i => i.dtSaldo === '2026-11-16');
    assert.ok(invAtivo, 'Inventário de 2026-11-16 deve estar listado');
    assert.strictEqual(invAtivo.nrContagAtiva, 2, 'Inventário de 2026-11-16 deve ter nrContagAtiva = 2');

    // Tentar apurar na 1ª contagem quando a ativa é 2 -> deve rejeitar
    const apuracaoInativa = await reqJson(baseUrl, '/api/datasul/fcSetInventarioApuracaoFicha', {
      method: 'PUT',
      headers: headers001,
      body: {
        payload: [{
          dtSaldo: '2026-11-16',
          nrFicha: 1,
          itCodigo: '11000015',
          codEstabel: '101',
          codDepos: 'ALM',
          codLocaliz: 'A-01-01',
          lote: 'LT-2026-01',
          codRefer: '',
          nrContagem: 1, // Inativa (ativa é 2)
          qtApurada: 50,
          codUsuario: 'aamaral'
        }]
      }
    });
    assert.strictEqual(apuracaoInativa.body.type, 'ERROR');
    assert.strictEqual(apuracaoInativa.body.code, '17006');
    assert.ok(apuracaoInativa.body.message.includes('divergente da contagem ativa'));

    // Tentar criar ficha avulsa com contagem 1 quando a ativa é 2 -> deve rejeitar
    const avulsaInativa = await reqJson(baseUrl, '/api/datasul/fcSetInventarioNovaFicha', {
      method: 'PUT',
      headers: headers001,
      body: {
        payload: [{
          dtSaldo: '2026-11-16',
          codEstabel: '101',
          codDepos: 'ALM',
          codLocaliz: 'A-01-01',
          itCodigo: 'PI0020',
          nrContagem: 1, // Inativa
          qtApurada: 10,
          codUsuario: 'aamaral'
        }]
      }
    });
    assert.strictEqual(avulsaInativa.body.type, 'ERROR');
    assert.strictEqual(avulsaInativa.body.code, '17006');
    assert.ok(avulsaInativa.body.message.includes('divergente da contagem ativa'));
    logPass('8b. Regra nr-contag-ativa: inventário concluído (valor 4) ocultado e contagens inativas rigorosamente bloqueadas');

    // 9. Frontend estático PWA
    for (const staticPath of ['/', '/app.js', '/db.js', '/datasul.js', '/fastLoader.js', '/scanner.js', '/styles.css', '/manifest.json', '/sw.js']) {
      const r = await fetch(`${baseUrl}${staticPath}`);
      assert.strictEqual(r.status, 200, `Recurso estático ${staticPath} retornou ${r.status}`);
    }
    logPass('9. Servimento estático Web/PWA (HTML, JS, CSS, manifest.json, sw.js) retornando HTTP 200');

    // Restaurar base ao final dos testes
    const resetEnd = await reqJson(baseUrl, '/api/datasul/resetBase', { method: 'POST' });
    assert.strictEqual(resetEnd.status, 200);
    assert.strictEqual(resetEnd.body.success, true);
    logPass('10. Base restaurada para estado limpo após testes');

    console.log('\nTODOS OS 10 BLOCOS DE VERIFICAÇÃO PASSARAM COM SUCESSO.');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});

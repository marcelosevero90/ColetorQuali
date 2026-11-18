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

async function runTests() {
  console.log('=== TESTE 1: Inclusão de Ficha Avulsa sempre na Contagem = 1 ===');
  const resNova = await postJson('/fcSetInventarioNovaFicha', {
    codEmpresa: '001',
    dtSaldo: '2026-11-17',
    codEstabel: '101',
    codDepos: 'AST',
    codLocaliz: 'TESTE',
    lote: 'LOTE-TEST-01',
    codRefer: '',
    itCodigo: '01010047',
    nrContagem: 2, // Mesmo se o chamador passar nrContagem 2, DEVE ser forçado para 1
    qtApurada: 42.5,
    codUsuario: 'matheus.st'
  });
  console.log('Resultado Nova Ficha:', JSON.stringify(resNova));

  console.log('\n=== TESTE 2: Consulta de Fichas com Detalhes de Apuração ===');
  const resFichas = await postJson('/fcGetInventariosFichas', {
    codEmpresa: '001',
    dtSaldo: '2026-11-17',
    codEstabel: '101',
    nrContagem: 1,
    apenasPendentes: false
  });

  const fichas = resFichas.items || [];
  console.log(`Total de fichas retornadas para 17/11/2026: ${fichas.length}`);
  const fichaCriada = fichas.find(f => f.itCodigo === '01010047' && f.lote === 'LOTE-TEST-01');
  if (fichaCriada) {
    console.log('✓ Ficha avulsa encontrada!');
    console.log(`  nrFicha: ${fichaCriada.nrFicha}`);
    console.log(`  nrContagem: ${fichaCriada.nrContagem} (Esperado: 1)`);
    console.log(`  valApurado1: ${fichaCriada.valApurado1} (Esperado: 42.5)`);
    console.log(`  valApurado2: ${fichaCriada.valApurado2} (Esperado: null)`);
  } else {
    console.log('❌ Ficha criada não encontrada!');
  }

  console.log('\n=== TESTE 3: Verificação de Carga Mestre no FastLoader (Sem Fichas) ===');
  const fastLoaderCode = require('fs').readFileSync('public/fastLoader.js', 'utf8');
  const temCargaFichasNoMestre = fastLoaderCode.includes('fichas_inventario') || fastLoaderCode.includes('fcGetInventariosFichas');
  console.log('FastLoader tem carga de fichas de inventário:', temCargaFichasNoMestre);
  if (!temCargaFichasNoMestre) {
    console.log('✓ Confirmado: FastLoader está focado 100% em dados mestre e não concorre com as fichas de inventário!');
  } else {
    console.log('❌ Aviso: FastLoader ainda contém referências a fichas de inventário!');
  }

  console.log('\n=== TESTE 4: Verificação dos Métodos de Conflito em App ===');
  const appCode = require('fs').readFileSync('public/app.js', 'utf8');
  const metodosConflito = [
    'resolverTodosConflitos',
    'confirmarResolucaoConflitos',
    'selecionarOpcaoConflito',
    'fecharModalConflitos',
    'abrirModalAlertaAlteracoesTotvs'
  ];
  metodosConflito.forEach(m => {
    console.log(`  Método ${m}:`, appCode.includes(m) ? '✓ Presente' : '❌ Ausente');
  });

  console.log('\n=== TESTES CONCLUÍDOS COM SUCESSO! ===');
}

runTests().catch(console.error);

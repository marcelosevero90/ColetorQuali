const http = require('http');

async function runTestUsabilidade() {
  console.log('================================================================');
  console.log(' TESTE DE USABILIDADE - INVENTÁRIO 17/11/2026 (OFFLINE-FIRST)');
  console.log('================================================================\n');

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

  // 1. CARGA INICIAL (ONLINE -> DISPOSITIVO)
  console.log('Passo 1: Autenticação e Carga de Parâmetros...');
  const resLogin = await pasoeCall('fcLogin', 'POST', {
    usuario: 'matheus.st',
    senha: 'qwe8451',
    payload: [{ usuario: 'matheus.st', senha: 'qwe8451' }]
  });
  console.log(' -> fcLogin:', resLogin.status, resLogin.data?.detailedMessage || resLogin.data);

  const resParamUsr = await pasoeCall('fcGetParamUsuario', 'PUT', {
    codEmpresa: companyId,
    epCodigo: companyId,
    usuario: 'matheus.st',
    payload: [{ codEmpresa: companyId, epCodigo: companyId, usuario: 'matheus.st' }]
  });
  const usrItem = resParamUsr.data?.items?.[0] || {};
  console.log(` -> Usuário '${usrItem.codUsuario}': Perm. Estoque=${usrItem.permEstoque}, Perm. Inventário=${usrItem.permEstoqReqInv}, Filial Padrão=${usrItem.codEstabPad}`);

  console.log('\nPasso 2: Baixando Parâmetros do Inventário (fmsc-inventario)...');
  const resParamInv = await pasoeCall('fcGetInventarioParam', 'PUT', {
    codEmpresa: companyId,
    epCodigo: companyId,
    dtSaldo: '',
    payload: [{ codEmpresa: companyId, epCodigo: companyId, dtSaldo: '' }]
  });
  const invAtivo = resParamInv.data?.items?.[0] || {};
  console.log(` -> Inventário Ativo no TOTVS: Data=${invAtivo.dtSaldo}, Situação=${invAtivo.indSitInv === 1 ? 'Liberado (1)' : invAtivo.indSitInv}, Tipo=${invAtivo.indTipoInv}, Permite Apuração Mesma Ficha=${invAtivo.permContgUsFc}`);

  console.log('\nPasso 3: Baixando Fichas do CE0712 para a Data 17/11/2026 (1ª Contagem)...');
  const resFichas = await pasoeCall('fcGetInventariosFichas', 'PUT', {
    codEmpresa: companyId,
    epCodigo: companyId,
    codEstabel: '101',
    dtSaldo: invAtivo.dtSaldo || '2026-11-17',
    itCodigo: '',
    codDepos: '',
    codLocaliz: '',
    lote: '',
    codRefer: '',
    nrContagem: 1,
    codUsuario: 'matheus.st',
    payload: [{
      codEmpresa: companyId,
      epCodigo: companyId,
      codEstabel: '101',
      dtSaldo: invAtivo.dtSaldo || '2026-11-17',
      itCodigo: '',
      codDepos: '',
      codLocaliz: '',
      lote: '',
      codRefer: '',
      nrContagem: 1,
      codUsuario: 'matheus.st'
    }]
  });

  const fichas = resFichas.data?.items || [];
  console.log(` -> Total de Fichas Baixadas para o Dispositivo: ${fichas.length} fichas`);
  fichas.forEach(f => {
    console.log(`    • Ficha #${String(f.nrFicha).padStart(2, ' ')} | Item: ${f.itCodigo} (${(f.descItem || '').substring(0, 28)}) | Dep: ${f.codDepos} | Sit: ${f.dscSituacao || 'Nao Atualiza'}`);
  });

  // SIMULAÇÃO DO BANCO LOCAL DO COLETOR (INDEXEDDB)
  console.log('\n================================================================');
  console.log(' SIMULAÇÃO OPERAÇÃO OFFLINE (DISPOSITIVO SEM INTERNET NO CHÃO DE FÁBRICA)');
  console.log('================================================================');

  const bancoLocal = {
    fichas: JSON.parse(JSON.stringify(fichas)),
    filaSync: [],
    historico: []
  };

  function registrarContagemOffline(nrFicha, qtdApurada) {
    const f = bancoLocal.fichas.find(x => x.nrFicha === nrFicha);
    if (!f) throw new Error(`Ficha #${nrFicha} não encontrada localmente.`);
    f.qtApurada = qtdApurada;
    f.pendenteSync = true;
    f.dtContagem = new Date().toISOString();

    const payload = {
      codEmpresa: companyId,
      epCodigo: companyId,
      codEstabel: f.codEstabel || '101',
      dtSaldo: f.dtSaldo || '2026-11-17',
      itCodigo: f.itCodigo,
      codDepos: f.codDepos,
      codLocaliz: f.codLocaliz || '',
      lote: f.lote || '',
      codRefer: f.codRefer || '',
      nrContagem: 1,
      codUsuario: 'matheus.st',
      qtApurada: qtdApurada,
      nrFicha: f.nrFicha
    };

    bancoLocal.filaSync.push({
      id: Date.now() + Math.random(),
      tipo: 'INVENTARIO_APURACAO',
      payload,
      timestamp: new Date().toISOString()
    });

    bancoLocal.historico.push({
      nrFicha: f.nrFicha,
      itCodigo: f.itCodigo,
      descItem: f.descItem,
      codDepos: f.codDepos,
      qtApurada: qtdApurada,
      status: 'GRAVADO_OFFLINE'
    });

    console.log(` [OFFLINE] Ficha #${nrFicha} apurada com sucesso: ${qtdApurada} un (Item ${f.itCodigo}) -> Fila de Sincronização Enfileirada`);
  }

  function registrarFichaAvulsaOffline(itCodigo, codDepos, qtdApurada) {
    const maxFicha = bancoLocal.fichas.reduce((m, x) => Math.max(m, Number(x.nrFicha || 0)), 0);
    const novaNrFicha = maxFicha + 1;
    const novaFicha = {
      codEmpresa: companyId,
      codEstabel: '101',
      dtSaldo: invAtivo.dtSaldo || '2026-11-17',
      nrFicha: novaNrFicha,
      itCodigo,
      descItem: 'Ficha Avulsa Chão de Fábrica',
      codDepos,
      codLocaliz: '',
      lote: '',
      codRefer: '',
      nrContagem: 1,
      qtApurada: qtdApurada,
      pendenteSync: true,
      fichaAvulsa: true
    };
    bancoLocal.fichas.push(novaFicha);

    const payload = {
      codEmpresa: companyId,
      epCodigo: companyId,
      codEstabel: '101',
      dtSaldo: invAtivo.dtSaldo || '2026-11-17',
      itCodigo,
      codDepos,
      codLocaliz: '',
      lote: '',
      codRefer: '',
      nrContagem: 1,
      codUsuario: 'matheus.st',
      qtApurada: qtdApurada,
      vlMaterial: 0,
      vlMob: 0,
      vlGgf: 0
    };

    bancoLocal.filaSync.push({
      id: Date.now() + Math.random(),
      tipo: 'INVENTARIO_AVULSA',
      payload,
      timestamp: new Date().toISOString()
    });

    console.log(` [OFFLINE] Nova Ficha Avulsa #${novaNrFicha} criada: Item ${itCodigo}, Dep ${codDepos}, Qtd ${qtdApurada} un -> Fila Enfileirada`);
  }

  // Operador contando fichas no armazém sem sinal:
  registrarContagemOffline(1, 10);
  registrarContagemOffline(2, 25);
  registrarContagemOffline(5, 42);
  registrarFichaAvulsaOffline('01010167', 'AST', 15);

  const contadasLocal = bancoLocal.fichas.filter(f => f.qtApurada !== null && f.qtApurada !== undefined).length;
  const pendentesLocal = bancoLocal.fichas.length - contadasLocal;
  console.log(`\nResumo Local no Coletor: ${contadasLocal} contadas, ${pendentesLocal} pendentes.`);
  console.log(`Total de pendências na Fila de Sincronização offline: ${bancoLocal.filaSync.length} itens.`);

  // 4. RECONEXÃO COM A REDE E TRANSMISSÃO PARA O TOTVS PASOE
  console.log('\n================================================================');
  console.log(' RECONECTADO À REDE: TRANSMISSÃO DA FILA OFFLINE AO TOTVS PASOE');
  console.log('================================================================');

  let transmitidosSucesso = 0;
  for (const item of bancoLocal.filaSync) {
    if (item.tipo === 'INVENTARIO_APURACAO') {
      console.log(`\nTransmitindo Apuração Ficha #${item.payload.nrFicha} (Qtd: ${item.payload.qtApurada})...`);
      const res = await pasoeCall('fcSetInventarioApuracaoFicha', 'PUT', {
        ...item.payload,
        payload: [item.payload]
      });
      console.log(` -> Resposta PASOE fcSetInventarioApuracaoFicha: HTTP ${res.status}`, res.data?.detailedMessage || res.data);
      if (res.status === 200 && (res.data?.type === 'OK' || res.data?.code === '0')) {
        transmitidosSucesso++;
      }
    } else if (item.tipo === 'INVENTARIO_AVULSA') {
      console.log(`\nTransmitindo Ficha Avulsa Item ${item.payload.itCodigo} (Qtd: ${item.payload.qtApurada})...`);
      const res = await pasoeCall('fcSetInventarioNovaFicha', 'PUT', {
        ...item.payload,
        payload: [item.payload]
      });
      console.log(` -> Resposta PASOE fcSetInventarioNovaFicha: HTTP ${res.status}`, res.data?.detailedMessage || res.data);
      if (res.status === 200 && (res.data?.type === 'OK' || res.data?.code === '0')) {
        transmitidosSucesso++;
      }
    }
  }

  console.log('\n================================================================');
  console.log(` RESULTADO FINAL DO TESTE DE USABILIDADE:`);
  console.log(` - Fichas Baixadas do ERP: ${fichas.length}`);
  console.log(` - Contagens Executadas Offline: ${bancoLocal.filaSync.length}`);
  console.log(` - Contagens Transmitidas ao TOTVS com Sucesso: ${transmitidosSucesso} de ${bancoLocal.filaSync.length}`);
  console.log('================================================================\n');
}

runTestUsabilidade().catch(console.error);

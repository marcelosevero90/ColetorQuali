// public/fastLoader.js - Orquestrador de Carga Offline-First em Chunks Progressivos
// Sincroniza todas as tabelas dos programas Progress (collect/app/fc*.p) para o IndexedDB
// enviando usuário/senha via Basic Auth e companyId no Header HTTP.

const FastLoader = (() => {
  let isCarregando = false;

  function precisaCargaDiaria(codEmpresa) {
    const emp = DB.normalizarEmpresa(codEmpresa || localStorage.getItem('datasul_company_id') || '001');
    const ultima = localStorage.getItem(`datasul_ultima_carga_${emp}`);
    if (!ultima) return true;
    const diffHoras = (Date.now() - new Date(ultima).getTime()) / (1000 * 60 * 60);
    return diffHoras >= 24;
  }

  function marcarCargaCompleta(codEmpresa) {
    const emp = DB.normalizarEmpresa(codEmpresa || '001');
    const now = new Date().toISOString();
    localStorage.setItem(`datasul_ultima_carga_${emp}`, now);
    localStorage.setItem(`datasul_last_sync_timestamp_${emp}`, now);
  }

  function normalizarDataIso(dt) {
    if (!dt) return '';
    const s = String(dt).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (s.includes('/')) {
      const p = s.split('/');
      if (p.length === 3) {
        if (p[2].length === 4) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        if (p[0].length === 4) return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
      }
    }
    return s;
  }

  // Normaliza respostas no padrão TOTVS JsonAPIResponseBuilder ({ items: [...] }) ou formato direto
  function extrairLista(resJson, ...chavesAlternativas) {
    if (!resJson) return [];
    if (Array.isArray(resJson)) return resJson;
    if (Array.isArray(resJson.items)) return resJson.items;
    for (const k of chavesAlternativas) {
      if (Array.isArray(resJson[k])) return resJson[k];
    }
    return [];
  }

  async function executarCarga({
    pasoeUrl,
    companyId,
    codEstabel,
    codUsuario,
    authHeader,
    onProgress,
    onComplete,
    onError,
    forcarCompleta = false
  }) {
    if (isCarregando) return;
    isCarregando = true;

    try {
      const emp = DB.normalizarEmpresa(companyId || localStorage.getItem('datasul_company_id') || '001');
      const baseUrl = (pasoeUrl || '/api/datasul').replace(/\/+$/, '');
      const lastSync = forcarCompleta ? null : localStorage.getItem(`datasul_last_sync_timestamp_${emp}`);

      if (forcarCompleta) {
        await DB.clearEmpresa('item', emp);
        await DB.clearEmpresa('deposito', emp);
        await DB.clearEmpresa('localizacao', emp);
        await DB.clearEmpresa('referencia', emp);
        await DB.clearEmpresa('lote', emp);
        await DB.clearEmpresa('saldo_estoq', emp);
        await DB.clearEmpresa('agrup_invent', emp);
        await DB.clearEmpresa('fmsc_inventario', emp);
      }

      const safeFetch = async (endpointPath, options = {}) => {
        const fullUrl = endpointPath.startsWith('http')
          ? endpointPath
          : `${baseUrl}/${endpointPath.replace(/^\/+/, '')}`;

        let requestUrl = fullUrl;
        if ((fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) && !fullUrl.includes(window.location.host)) {
          requestUrl = `/api/pasoe-proxy?url=${encodeURIComponent(fullUrl)}`;
        }

        const headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'companyId': emp,
          ...(options.headers || {})
        };
        if (authHeader) headers['Authorization'] = authHeader;

        const fetchOpts = {
          method: options.method || 'GET',
          headers
        };
        if (options.body) fetchOpts.body = options.body;

        const res = await fetch(requestUrl, fetchOpts);
        if (res.status === 401) {
          let msg = 'Credenciais TOTVS inválidas ou expiradas (401).';
          try {
            const err = await res.json();
            msg = err.message || err.mensagem || err.error_description || msg;
          } catch (e) {}
          throw new Error(msg);
        }

        const text = await res.text();
        if (!res.ok) {
          throw new Error(`Erro PASOE (HTTP ${res.status}): ${text.slice(0, 180)}`);
        }
        if (text.trim().startsWith('<')) {
          throw new Error('PASOE retornou HTML inesperado. Verifique usuário/senha TOTVS e URL do ALIAS.');
        }
        return JSON.parse(text);
      };

      const progress = (pct, msg, det) => {
        if (onProgress) onProgress(pct, msg, det || `Empresa ${emp} • Filial ${codEstabel || '-'}`);
      };

      // 1. Estabelecimentos (Global multi-empresa)
      progress(8, 'Sincronizando estabelecimentos (global)...');
      try {
        const resEst = await safeFetch('fcGetEstabelecimentos');
        const ests = extrairLista(resEst, 'estabelecimentos');
        if (ests.length > 0) {
          await DB.bulkPut('estabelec', ests);
        }
      } catch (e) {
        console.warn('Aviso fcGetEstabelecimentos:', e.message);
      }

      // 2. Parâmetros do Usuário (fmsc-usuar-mestre)
      progress(14, 'Carregando parâmetros e permissões do usuário...');
      if (codUsuario) {
        try {
          const resUsr = await safeFetch('fcGetParamUsuario', {
            method: 'PUT',
            body: JSON.stringify({
              codEmpresa: emp,
              epCodigo: emp,
              usuario: codUsuario,
              payload: [{ codEmpresa: emp, epCodigo: emp, usuario: codUsuario }]
            })
          });
          const usrs = extrairLista(resUsr);
          if (usrs.length > 0) {
            await DB.bulkPut('fmsc_usuar_mestre', usrs, emp);
          }
        } catch (e) {
          console.warn('Aviso fcGetParamUsuario:', e.message);
        }
      }

      // 3. Depósitos, Localizações, Referências e Agrupamentos
      progress(22, 'Baixando depósitos, localizações e referências...');
      try {
        const resDep = await safeFetch('fcGetDeposito');
        const deps = extrairLista(resDep, 'depositos');
        if (deps.length > 0) await DB.bulkPut('deposito', deps, emp);
      } catch (e) {
        console.warn('Aviso fcGetDeposito:', e.message);
      }

      try {
        const resLoc = await safeFetch('fcGetLocalizacao', {
          method: 'PUT',
          body: JSON.stringify({ codEstabel: codEstabel || '', payload: [{ codEstabel: codEstabel || '' }] })
        });
        const locs = extrairLista(resLoc, 'localizacoes');
        if (locs.length > 0) await DB.bulkPut('localizacao', locs, emp);
      } catch (e) {
        console.warn('Aviso fcGetLocalizacao:', e.message);
      }

      try {
        const resRef = await safeFetch('fcGetReferencia');
        const refs = extrairLista(resRef, 'referencias');
        if (refs.length > 0) await DB.bulkPut('referencia', refs, emp);
      } catch (e) {
        console.warn('Aviso fcGetReferencia:', e.message);
      }

      try {
        const resAgr = await safeFetch('fcGetAgrupInvent');
        const agrs = extrairLista(resAgr, 'agrupamentos');
        if (agrs.length > 0) await DB.bulkPut('agrup_invent', agrs, emp);
      } catch (e) {
        console.warn('Aviso fcGetAgrupInvent:', e.message);
      }

      // 4. Catálogo de Itens em Chunks Progressivos (Alto Volume)
      progress(32, 'Baixando catálogo de itens em chunks...');
      const PAGE_SIZE = 1000;
      let chunk = 1;
      let lastItCodigo = '';
      let hasMore = true;
      let totalItensBaixados = 0;
      let totalEstimado = 0;

      try {
        while (hasMore) {
          const payloadChunk = {
            chunk,
            pageSize: PAGE_SIZE,
            companyId: emp,
            codEstabel: codEstabel || '',
            lastItCodigo,
            lastSyncTimestamp: lastSync || '',
            payload: [{
              chunk,
              pageSize: PAGE_SIZE,
              companyId: emp,
              codEstabel: codEstabel || '',
              lastItCodigo,
              lastSyncTimestamp: lastSync || ''
            }]
          };

          const dataChunk = await safeFetch('fcGetItensChunk', {
            method: 'PUT',
            body: JSON.stringify(payloadChunk)
          });

          const listaItens = extrairLista(dataChunk, 'itens');
          if (listaItens.length > 0) {
            await DB.bulkPut('item', listaItens, emp, 500);
            totalItensBaixados += listaItens.length;
            const ultimo = listaItens[listaItens.length - 1];
            lastItCodigo = dataChunk.lastItCodigo || ultimo.itCodigo || ultimo.it_codigo || '';
          } else {
            hasMore = false;
            break;
          }

          totalEstimado = dataChunk.totalRecords || totalEstimado || totalItensBaixados;
          const perc = Math.min(68, 32 + Math.round((totalItensBaixados / Math.max(1, totalEstimado)) * 36));
          progress(
            perc,
            `Carregando catálogo de itens... (${totalItensBaixados.toLocaleString('pt-BR')} de ${totalEstimado.toLocaleString('pt-BR')})`,
            `Pacote ${chunk} • Último item: ${lastItCodigo}`
          );

          hasMore = Boolean(dataChunk.hasMore) && listaItens.length >= (dataChunk.pageSize || PAGE_SIZE);
          chunk = dataChunk.nextChunk || (chunk + 1);
        }
      } catch (errChunk) {
        console.warn('fcGetItensChunk indisponível, realizando fallback para fcGetItem:', errChunk.message);
        try {
          const pItem = { codEstabel: codEstabel || '', itCodigo: '', descItem: '' };
          const resItem = await safeFetch('fcGetItem', {
            method: 'PUT',
            body: JSON.stringify({ ...pItem, payload: [pItem] })
          });
          const listaFallback = extrairLista(resItem, 'itens');
          if (listaFallback.length > 0) {
            await DB.bulkPut('item', listaFallback, emp, 500);
            totalItensBaixados = listaFallback.length;
          }
        } catch (eFallback) {
          console.warn('Aviso fcGetItem fallback:', eFallback.message);
        }
      }

      // 5. Saldos e Lotes
      progress(72, 'Sincronizando saldos de estoque e lotes...');
      try {
        const resSaldo = await safeFetch('fcGetSaldoEstoq', {
          method: 'PUT',
          body: JSON.stringify({
            payload: [{
              cEstabIni: codEstabel || '',
              cEstabFim: codEstabel || 'ZZZZZ',
              cItemIni: '',
              cItemFim: 'ZZZZZZZZZZZZZZZZ',
              cDepIni: '',
              cDepFim: 'ZZZZZ',
              cLocalIni: '',
              cLocalFim: 'ZZZZZZZZZZ',
              cLoteIni: '',
              cLoteFim: 'ZZZZZZZZZZ',
              cReferIni: '',
              cReferFim: 'ZZZZZ'
            }]
          })
        });
        const saldos = extrairLista(resSaldo, 'saldos');
        if (saldos.length > 0) {
          await DB.bulkPut('saldo_estoq', saldos, emp, 500);
        }
      } catch (e) {
        console.warn('Aviso fcGetSaldoEstoq:', e.message);
      }

      try {
        const pLote = { codEstabel: codEstabel || '', itCodigo: '' };
        const resLote = await safeFetch('fcGetLote', {
          method: 'PUT',
          body: JSON.stringify({ ...pLote, payload: [pLote] })
        });
        const lotes = extrairLista(resLote, 'lotes');
        if (lotes.length > 0) {
          await DB.bulkPut('lote', lotes, emp, 500);
        }
      } catch (e) {
        console.warn('Aviso fcGetLote:', e.message);
      }

      // 6. Parâmetros do Inventário (fmsc-inventario - fms002.df)
      progress(82, 'Baixando parâmetros de inventário (FMSC0102)...');
      try {
        let resParamInv = null;
        try {
          resParamInv = await safeFetch('fcGetInventarioParam', {
            method: 'PUT',
            body: JSON.stringify({
              codEmpresa: emp,
              epCodigo: emp,
              dtSaldo: '',
              payload: [{ codEmpresa: emp, epCodigo: emp, dtSaldo: '' }]
            })
          });
        } catch (e1) {
          resParamInv = await safeFetch('old_fcGetInventarioParam');
        }
        const paramsInv = extrairLista(resParamInv);
        if (paramsInv.length > 0) {
          await DB.bulkPut('fmsc_inventario', paramsInv, emp);
        }
      } catch (e) {
        console.warn('Aviso fcGetInventarioParam:', e.message);
      }

      marcarCargaCompleta(emp);
      progress(100, 'Carga de cadastros mestres concluída com sucesso!', `${totalItensBaixados.toLocaleString('pt-BR')} itens sincronizados para operação offline.`);

      if (onComplete) {
        onComplete({
          codEmpresa: emp,
          totalItens: totalItensBaixados
        });
      }
    } catch (err) {
      console.error('Erro na Carga Rápida:', err);
      if (onError) onError(err);
    } finally {
      isCarregando = false;
    }
  }

  return {
    precisaCargaDiaria,
    marcarCargaCompleta,
    executarCarga
  };
})();

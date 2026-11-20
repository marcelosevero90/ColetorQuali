// public/db.js - Camada de Persistência Local Offline-First via IndexedDB
// Modelagem baseada nos programas Progress (collect/app/fc*.p e DFs fms001.df / fms002.df).
// REGRA DE MULTI-EMPRESA:
// - 'estabelec' é GLOBAL (multi-empresa) e não recebe chave estrangeira externa na PK; cada registro possui 'codEmpresa'.
// - TODAS as demais stores possuem 'codEmpresa' vinculado na chave primária composta e índice dedicado.

const DB = (() => {
  const DB_NAME = 'ColetorDatasul_Offline_v1';
  const DB_VERSION = 2;
  let dbInstance = null;

  function normalizarEmpresa(ep) {
    const s = String(ep || '001').trim();
    if (/^\d+$/.test(s) && s.length < 3) {
      return s.padStart(3, '0');
    }
    return s;
  }

  function matchEmpresa(a, b) {
    if (!a || !b) return false;
    const sa = String(a).trim();
    const sb = String(b).trim();
    if (sa === sb) return true;
    if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
      return Number(sa) === Number(sb);
    }
    return false;
  }

  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. estabelec (GLOBAL multi-empresa - Exceção única sem codEmpresa na PK)
        if (!db.objectStoreNames.contains('estabelec')) {
          const stEst = db.createObjectStore('estabelec', { keyPath: 'codEstabel' });
          stEst.createIndex('codEmpresa', 'codEmpresa', { unique: false });
        }

        // 2. fmsc_usuar_mestre (fms001.df + codEmpresa)
        if (!db.objectStoreNames.contains('fmsc_usuar_mestre')) {
          const stUsr = db.createObjectStore('fmsc_usuar_mestre', { keyPath: ['codEmpresa', 'codUsuario'] });
          stUsr.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stUsr.createIndex('codUsuario', 'codUsuario', { unique: false });
        }

        // 3. fmsc_inventario (fms002.df + codEmpresa)
        if (!db.objectStoreNames.contains('fmsc_inventario')) {
          const stInvP = db.createObjectStore('fmsc_inventario', { keyPath: ['codEmpresa', 'dtSaldo'] });
          stInvP.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stInvP.createIndex('dtSaldo', 'dtSaldo', { unique: false });
        }

        // 4. agrup_invent (fcGetAgrupInvent.p + codEmpresa)
        if (!db.objectStoreNames.contains('agrup_invent')) {
          const stAgr = db.createObjectStore('agrup_invent', { keyPath: ['codEmpresa', 'cdnAgrup'] });
          stAgr.createIndex('codEmpresa', 'codEmpresa', { unique: false });
        }

        // 5. deposito (fcGetDeposito.p + codEmpresa)
        if (!db.objectStoreNames.contains('deposito')) {
          const stDep = db.createObjectStore('deposito', { keyPath: ['codEmpresa', 'codDepos'] });
          stDep.createIndex('codEmpresa', 'codEmpresa', { unique: false });
        }

        // 6. item (fcGetItem.p / fcGetItensChunk + codEmpresa)
        if (!db.objectStoreNames.contains('item')) {
          const stIt = db.createObjectStore('item', { keyPath: ['codEmpresa', 'itCodigo'] });
          stIt.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stIt.createIndex('itCodigo', 'itCodigo', { unique: false });
          stIt.createIndex('descItem', 'descItem', { unique: false });
          stIt.createIndex('codBarras', 'codBarras', { unique: false });
        }

        // 7. localizacao (fcGetLocalizacao.p + codEmpresa)
        if (!db.objectStoreNames.contains('localizacao')) {
          const stLoc = db.createObjectStore('localizacao', { keyPath: ['codEmpresa', 'codEstabel', 'codDepos', 'codLocaliz'] });
          stLoc.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stLoc.createIndex('codDepos', 'codDepos', { unique: false });
        }

        // 8. referencia (fcGetReferencia.p + codEmpresa)
        if (!db.objectStoreNames.contains('referencia')) {
          const stRef = db.createObjectStore('referencia', { keyPath: ['codEmpresa', 'codRefer'] });
          stRef.createIndex('codEmpresa', 'codEmpresa', { unique: false });
        }

        // 9. lote (fcGetLote.p + codEmpresa)
        if (!db.objectStoreNames.contains('lote')) {
          const stLote = db.createObjectStore('lote', {
            keyPath: ['codEmpresa', 'codEstabel', 'itCodigo', 'codDepos', 'codLocaliz', 'lote', 'codRefer']
          });
          stLote.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stLote.createIndex('itCodigo', 'itCodigo', { unique: false });
          stLote.createIndex('lote', 'lote', { unique: false });
        }

        // 10. saldo_estoq (fcGetSaldoEstoq.p + codEmpresa)
        if (!db.objectStoreNames.contains('saldo_estoq')) {
          const stSal = db.createObjectStore('saldo_estoq', {
            keyPath: ['codEmpresa', 'codEstab', 'codDep', 'codLocal', 'itCodigo', 'lote', 'codRefer']
          });
          stSal.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stSal.createIndex('itCodigo', 'itCodigo', { unique: false });
        }

        // 11. fichas_inventario (fcGetInventariosFichas.p + codEmpresa)
        if (!db.objectStoreNames.contains('fichas_inventario')) {
          const stFichas = db.createObjectStore('fichas_inventario', {
            keyPath: ['codEmpresa', 'dtSaldo', 'codEstabel', 'codDepos', 'nrContagem', 'nrFicha']
          });
          stFichas.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stFichas.createIndex('dtSaldo', 'dtSaldo', { unique: false });
          stFichas.createIndex('itCodigo', 'itCodigo', { unique: false });
          stFichas.createIndex('codDepos', 'codDepos', { unique: false });
        }

        // 12. fila_sync (Fila de sincronização offline + codEmpresa)
        if (!db.objectStoreNames.contains('fila_sync')) {
          const stSync = db.createObjectStore('fila_sync', { keyPath: 'id_uuid' });
          stSync.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stSync.createIndex('status', 'status', { unique: false });
          stSync.createIndex('dt_criacao', 'dt_criacao', { unique: false });
        }

        // 13. historico_contagens (Auditoria local + codEmpresa)
        if (!db.objectStoreNames.contains('historico_contagens')) {
          const stHist = db.createObjectStore('historico_contagens', { keyPath: 'id_local', autoIncrement: true });
          stHist.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stHist.createIndex('dtSaldo', 'dtSaldo', { unique: false });
          stHist.createIndex('codEstabel', 'codEstabel', { unique: false });
          stHist.createIndex('codDepos', 'codDepos', { unique: false });
          stHist.createIndex('nrFicha', 'nrFicha', { unique: false });
          stHist.createIndex('itCodigo', 'itCodigo', { unique: false });
        }

        // 14. transferencia_material (fcSetTransfMaterial.p / CE0206 - Offline First)
        if (!db.objectStoreNames.contains('transferencia_material')) {
          const stTransf = db.createObjectStore('transferencia_material', { keyPath: 'id_uuid' });
          stTransf.createIndex('codEmpresa', 'codEmpresa', { unique: false });
          stTransf.createIndex('codUsuario', 'codUsuario', { unique: false });
          stTransf.createIndex('empresa_usuario', ['codEmpresa', 'codUsuario'], { unique: false });
          stTransf.createIndex('status', 'status', { unique: false });
          stTransf.createIndex('pendenteSync', 'pendenteSync', { unique: false });
          stTransf.createIndex('dtTransf', 'dtTransf', { unique: false });
          stTransf.createIndex('criadoEm', 'criadoEm', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        dbInstance.onversionchange = () => {
          console.warn('Nova versão do IndexedDB detectada, fechando conexão antiga.');
          dbInstance.close();
          dbInstance = null;
        };
        resolve(dbInstance);
      };

      request.onblocked = (event) => {
        console.warn('Abertura do IndexedDB bloqueada por outra aba/conexão aberta. Fechando instâncias antigas...');
        if (dbInstance) {
          dbInstance.close();
          dbInstance = null;
        }
      };

      request.onerror = (event) => {
        console.error('Erro ao abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  function prepararRegistro(storeName, raw, codEmpresa) {
    const item = { ...raw };
    const emp = normalizarEmpresa(item.codEmpresa || item.ep_codigo || codEmpresa || '001');

    if (storeName === 'estabelec') {
      item.codEstabel = String(item.codEstabel ?? item.cod_estabel ?? '').trim();
      item.codEmpresa = normalizarEmpresa(item.codEmpresa || item.ep_codigo || emp);
      return item;
    }

    // Todas as demais stores exigem codEmpresa vinculado
    item.codEmpresa = emp;

    if (storeName === 'fmsc_usuar_mestre') {
      item.codUsuario = String(item.codUsuario ?? item.cod_usuario ?? '').trim();
    } else if (storeName === 'fmsc_inventario') {
      item.dtSaldo = normalizarDataIso(item.dtSaldo ?? item.dt_saldo ?? '');
    } else if (storeName === 'agrup_invent') {
      item.cdnAgrup = Number(item.cdnAgrup ?? item.cdn_agrup ?? 0);
    } else if (storeName === 'deposito') {
      item.codDepos = String(item.codDepos ?? item.cod_depos ?? '').trim();
      item.nome = item.nome ?? item.nome_depos ?? item.codDepos;
    } else if (storeName === 'item') {
      item.itCodigo = String(item.itCodigo ?? item.it_codigo ?? '').trim();
      item.descItem = String(item.descItem ?? item.desc_item ?? item.itCodigo);
      item.codBarras = String(item.codBarras ?? item.cod_barras ?? '').trim();
    } else if (storeName === 'localizacao') {
      item.codEstabel = String(item.codEstabel ?? item.cod_estabel ?? '').trim();
      item.codDepos = String(item.codDepos ?? item.cod_depos ?? '').trim();
      item.codLocaliz = String(item.codLocaliz ?? item.cod_localiz ?? '').trim();
    } else if (storeName === 'referencia') {
      item.codRefer = String(item.codRefer ?? item.cod_refer ?? '');
    } else if (storeName === 'lote') {
      item.codEstabel = String(item.codEstabel ?? item.cod_estabel ?? '').trim();
      item.itCodigo = String(item.itCodigo ?? item.it_codigo ?? '').trim();
      item.codDepos = String(item.codDepos ?? item.cod_depos ?? '').trim();
      item.codLocaliz = String(item.codLocaliz ?? item.cod_localiz ?? '').trim();
      item.lote = String(item.lote ?? '').trim();
      item.codRefer = String(item.codRefer ?? item.cod_refer ?? '').trim();
    } else if (storeName === 'saldo_estoq') {
      item.codEstab = String(item.codEstab ?? item.cod_estabel ?? item.codEstabel ?? '').trim();
      item.codDep = String(item.codDep ?? item.cod_depos ?? item.codDepos ?? '').trim();
      item.codLocal = String(item.codLocal ?? item.cod_localiz ?? item.codLocaliz ?? '').trim();
      item.itCodigo = String(item.itCodigo ?? item.it_codigo ?? '').trim();
      item.lote = String(item.lote ?? '').trim();
      item.codRefer = String(item.codRefer ?? item.cod_refer ?? '').trim();
    } else if (storeName === 'fichas_inventario') {
      item.dtSaldo = normalizarDataIso(item.dtSaldo ?? item.dt_saldo ?? '');
      item.codEstabel = String(item.codEstabel ?? item.cod_estabel ?? '').trim();
      item.codDepos = String(item.codDepos ?? item.cod_depos ?? '').trim();
      item.nrContagem = Number(item.nrContagem ?? item.nr_contagem ?? 1);
      item.nrFicha = Number(item.nrFicha ?? item.nr_ficha ?? 0);
      item.codLocaliz = String(item.codLocaliz ?? item.cod_localiz ?? '').trim();
      item.lote = String(item.lote ?? '').trim();
      item.codRefer = String(item.codRefer ?? item.cod_refer ?? '').trim();
    } else if (storeName === 'transferencia_material') {
      if (!item.id_uuid) {
        item.id_uuid = 'tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      }
      item.codUsuario = String(item.codUsuario ?? '').trim();
      item.codEstabel = String(item.codEstabel ?? '').trim();
      item.itCodigo = String(item.itCodigo ?? '').trim();
      item.status = item.status || 'PENDENTE_ENTRADA';
      item.dtTransf = normalizarDataIso(item.dtTransf || new Date().toISOString().slice(0, 10));
      item.criadoEm = item.criadoEm || new Date().toISOString();
      item.atualizadoEm = new Date().toISOString();
    }

    return item;
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

  // Inserção em massa otimizada por chunks internos de 500 registros (evita travamento da UI em grandes volumes)
  async function bulkPut(storeName, items, codEmpresa = null, batchSize = 500) {
    if (!items || items.length === 0) return 0;
    const db = await openDB();

    let inseridos = 0;
    for (let offset = 0; offset < items.length; offset += batchSize) {
      const slice = items.slice(offset, offset + batchSize);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        for (let i = 0; i < slice.length; i++) {
          const preparado = prepararRegistro(storeName, slice[i], codEmpresa);
          store.put(preparado);
        }

        tx.oncomplete = () => {
          inseridos += slice.length;
          resolve();
        };
        tx.onerror = (e) => reject(e.target.error);
      });

      if (offset + batchSize < items.length) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return inseridos;
  }

  async function put(storeName, rawItem, codEmpresa = null) {
    const db = await openDB();
    const item = prepararRegistro(storeName, rawItem, codEmpresa);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function get(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllByEmpresa(storeName, codEmpresa) {
    if (storeName === 'estabelec') return getAll('estabelec');
    const emp = normalizarEmpresa(codEmpresa);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      if (store.indexNames.contains('codEmpresa')) {
        const req = store.index('codEmpresa').getAll(emp);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e.target.error);
      } else {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result || []).filter(r => matchEmpresa(r.codEmpresa, emp)));
        req.onerror = (e) => reject(e.target.error);
      }
    });
  }

  async function remove(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function clear(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function clearEmpresa(storeName, codEmpresa) {
    if (storeName === 'estabelec') return clear('estabelec');
    const emp = normalizarEmpresa(codEmpresa);
    try {
      const db = await openDB();
      const registros = await getAllByEmpresa(storeName, emp);
      if (!registros.length) return 0;

      return new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const kp = store.keyPath;
        let count = 0;
        for (const r of registros) {
          try {
            const key = Array.isArray(kp) ? kp.map(k => r[k]) : r[kp];
            if (key !== undefined && (Array.isArray(key) ? key.every(k => k !== undefined) : true)) {
              store.delete(key);
              count++;
            }
          } catch (e) {}
        }
        tx.oncomplete = () => resolve(count);
        tx.onerror = () => resolve(0);
      });
    } catch (e) {
      return 0;
    }
  }

  // Busca Exata O(1) por itCodigo ou codBarras dentro da empresa selecionada
  async function obterItemExato(arg1, arg2) {
    if (!arg1 && !arg2) return null;
    let termo = arg1;
    let codEmpresa = arg2;

    // Tolerância para inversão acidental de parâmetros (ex: obterItemExato(emp, cod))
    if (typeof arg1 === 'string' && /^\d{1,3}$/.test(arg1.trim()) && typeof arg2 === 'string' && arg2.trim().length > 3) {
      termo = arg2;
      codEmpresa = arg1;
    }

    if (!termo || !String(termo).trim()) return null;
    const db = await openDB();
    const emp = normalizarEmpresa(codEmpresa);
    const t = String(termo).trim();
    const tUpper = t.toUpperCase();

    function wrapResult(itemObj, matchedBy) {
      if (!itemObj) return null;
      return Object.assign({ item: itemObj, matchedBy }, itemObj);
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('item', 'readonly');
        const store = tx.objectStore('item');

        // 1. Chave primária exata [codEmpresa, itCodigo]
        const reqPk = store.get([emp, t]);
        reqPk.onsuccess = () => {
          if (reqPk.result) return resolve(wrapResult(reqPk.result, 'CODIGO'));
          if (t !== tUpper) {
            const reqUpper = store.get([emp, tUpper]);
            reqUpper.onsuccess = () => {
              if (reqUpper.result) return resolve(wrapResult(reqUpper.result, 'CODIGO'));
              tentarBarras();
            };
            reqUpper.onerror = () => tentarBarras();
          } else {
            tentarBarras();
          }
        };
        reqPk.onerror = () => tentarBarras();

        function tentarBarras() {
          const reqBar = store.index('codBarras').getAll(t);
          reqBar.onsuccess = () => {
            const matches = (reqBar.result || []).filter(i => matchEmpresa(i.codEmpresa, emp));
            if (matches.length > 0) return resolve(wrapResult(matches[0], 'BARRAS'));
            // 3. Fallback: varredura por busca local para itens case-insensitive ou com formatação
            buscarItensLocal(t, emp, 10).then(lista => {
              const exato = (lista || []).find(it =>
                String(it.itCodigo).trim().toUpperCase() === tUpper ||
                String(it.codBarras || '').trim() === t
              );
              resolve(exato ? wrapResult(exato, 'BUSCA') : null);
            }).catch(() => resolve(null));
          };
          reqBar.onerror = () => resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Busca Rápida Otimizada de Itens no IndexedDB por codEmpresa
  async function buscarItensLocal(termo, codEmpresa, limite = 50) {
    const db = await openDB();
    const emp = normalizarEmpresa(codEmpresa);
    const t = (termo || '').trim().toLowerCase();
    const tUpper = (termo || '').trim().toUpperCase();

    const resultados = [];
    const vistos = new Set();

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('item', 'readonly');
        const store = tx.objectStore('item');

        if (!t) {
          const reqCursor = store.index('codEmpresa').openCursor(IDBKeyRange.only(emp));
          reqCursor.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor && resultados.length < limite) {
              resultados.push(cursor.value);
              cursor.continue();
            } else {
              resolve(resultados);
            }
          };
          reqCursor.onerror = () => resolve(resultados);
          return;
        }

        // 1. Range por prefixo na PK composta [emp, tUpper] -> [emp, tUpper + '\uffff']
        const range = IDBKeyRange.bound([emp, tUpper], [emp, tUpper + '\uffff']);
        const reqPrefix = store.openCursor(range);

        reqPrefix.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && resultados.length < limite) {
            const it = cursor.value;
            if (!vistos.has(it.itCodigo)) {
              vistos.add(it.itCodigo);
              resultados.push(it);
            }
            cursor.continue();
          } else {
            if (resultados.length >= limite) return resolve(resultados);

            // 2. Código de barras exato
            const reqBar = store.index('codBarras').getAll(termo.trim());
            reqBar.onsuccess = () => {
              (reqBar.result || []).forEach(it => {
                if (matchEmpresa(it.codEmpresa, emp) && !vistos.has(it.itCodigo) && resultados.length < limite) {
                  vistos.add(it.itCodigo);
                  resultados.push(it);
                }
              });

              if (resultados.length >= limite) return resolve(resultados);

              // 3. Busca na descrição dentro da empresa (scan limitado no índice codEmpresa)
              let scans = 0;
              const reqDesc = store.index('codEmpresa').openCursor(IDBKeyRange.only(emp));
              reqDesc.onsuccess = (ev) => {
                const c = ev.target.result;
                scans++;
                if (c && resultados.length < limite && scans < 5000) {
                  const it = c.value;
                  if (!vistos.has(it.itCodigo)) {
                    const codLow = (it.itCodigo || '').toLowerCase();
                    const descLow = (it.descItem || '').toLowerCase();
                    if (codLow.includes(t) || descLow.includes(t)) {
                      vistos.add(it.itCodigo);
                      resultados.push(it);
                    }
                  }
                  c.continue();
                } else {
                  resolve(resultados);
                }
              };
              reqDesc.onerror = () => resolve(resultados);
            };
            reqBar.onerror = () => resolve(resultados);
          }
        };
        reqPrefix.onerror = () => resolve(resultados);
      } catch (err) {
        resolve([]);
      }
    });
  }

  async function buscarLocalizacoesLocal(codEmpresa, codEstabel = null, codDepos = null, termo = '') {
    const emp = normalizarEmpresa(codEmpresa);
    const t = (termo || '').trim().toLowerCase();
    const map = new Map();

    const locs = await getAllByEmpresa('localizacao', emp);
    locs.forEach(l => {
      if (codEstabel && l.codEstabel && l.codEstabel !== codEstabel) return;
      if (codDepos && l.codDepos && String(l.codDepos).toUpperCase() !== String(codDepos).toUpperCase()) return;
      const codLoc = (l.codLocaliz ?? '').trim();
      const descLoc = (l.descricao ?? '').trim() || (codLoc ? `Localização ${codLoc}` : 'BRANCO');
      const key = `${(l.codDepos || '').toUpperCase()}__${codLoc ? codLoc.toUpperCase() : '__BRANCO__'}`;
      map.set(key, {
        codLocaliz: codLoc,
        descricao: descLoc,
        codDepos: l.codDepos,
        codEstabel: l.codEstabel,
        origem: 'Cadastro Mestre'
      });
    });

    // Complementar com fichas já carregadas
    const fichas = await getAllByEmpresa('fichas_inventario', emp);
    fichas.forEach(f => {
      if (codEstabel && f.codEstabel !== codEstabel) return;
      if (codDepos && String(f.codDepos).toUpperCase() !== String(codDepos).toUpperCase()) return;
      const c = (f.codLocaliz ?? '').trim();
      const key = `${(f.codDepos || '').toUpperCase()}__${c ? c.toUpperCase() : '__BRANCO__'}`;
      if (!map.has(key)) {
        map.set(key, {
          codLocaliz: c,
          descricao: (f.descLocaliz ?? '').trim() || (c ? `Localização ${c}` : 'BRANCO'),
          codDepos: f.codDepos,
          codEstabel: f.codEstabel,
          origem: 'Ficha Inventário'
        });
      }
    });

    let lista = Array.from(map.values());
    if (t) {
      lista = lista.filter(l =>
        (l.codLocaliz && l.codLocaliz.toLowerCase().includes(t)) ||
        (l.descricao && l.descricao.toLowerCase().includes(t)) ||
        (!l.codLocaliz && ('branco'.includes(t) || 'padrao'.includes(t)))
      );
    }
    return lista.sort((a, b) => {
      if (!a.codLocaliz && b.codLocaliz) return -1;
      if (a.codLocaliz && !b.codLocaliz) return 1;
      return a.codLocaliz.localeCompare(b.codLocaliz);
    });
  }

  async function buscarLotesLocal(codEmpresa, codEstabel = null, itCodigo = null, codDepos = null, termo = '') {
    const emp = normalizarEmpresa(codEmpresa);
    const t = (termo || '').trim().toLowerCase();
    const itUp = (itCodigo || '').trim().toUpperCase();
    const depUp = (codDepos || '').trim().toUpperCase();
    const map = new Map();

    const lotes = await getAllByEmpresa('lote', emp);
    lotes.forEach(l => {
      if (codEstabel && l.codEstabel && l.codEstabel !== codEstabel) return;
      if (itUp && String(l.itCodigo || '').toUpperCase() !== itUp) return;
      // Se não filtrou por item específico, restringe ao depósito. Se filtrou por itCodigo, exibe todos os lotes do item
      if (!itUp && depUp && l.codDepos && String(l.codDepos).toUpperCase() !== depUp) return;
      if (!l.lote) return;
      const key = `${(l.itCodigo || '').toUpperCase()}__${(l.codDepos || '').toUpperCase()}__${l.lote.toUpperCase()}__${(l.codLocaliz || '').toUpperCase()}`;
      map.set(key, {
        lote: l.lote,
        itCodigo: l.itCodigo,
        codDepos: l.codDepos,
        codLocaliz: l.codLocaliz || '',
        dtValiLote: l.dtValiLote || '',
        codRefer: l.codRefer || '',
        qtDisponivel: l.qtDisponivel ?? null,
        origem: 'Lotes / Saldo'
      });
    });

    const saldos = await getAllByEmpresa('saldo_estoq', emp);
    saldos.forEach(s => {
      if (codEstabel && s.codEstab && s.codEstab !== codEstabel) return;
      if (itUp && String(s.itCodigo || '').toUpperCase() !== itUp) return;
      if (!itUp && depUp && s.codDep && String(s.codDep).toUpperCase() !== depUp) return;
      const l = (s.lote || '').trim();
      if (!l) return;
      const key = `${(s.itCodigo || '').toUpperCase()}__${(s.codDep || '').toUpperCase()}__${l.toUpperCase()}__${(s.codLocal || '').toUpperCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          lote: l,
          itCodigo: s.itCodigo,
          codDepos: s.codDep,
          codLocaliz: s.codLocal || '',
          dtValiLote: s.dtValiLote || '',
          codRefer: s.codRefer || '',
          qtDisponivel: s.qtDisponivelCalc ?? s.qtidadeAtu ?? null,
          origem: 'Saldo Estoque'
        });
      }
    });

    let lista = Array.from(map.values());
    if (t) {
      lista = lista.filter(l =>
        l.lote.toLowerCase().includes(t) ||
        (l.itCodigo && l.itCodigo.toLowerCase().includes(t)) ||
        (l.codDepos && l.codDepos.toLowerCase().includes(t)) ||
        (l.codLocaliz && l.codLocaliz.toLowerCase().includes(t))
      );
    }
    return lista.sort((a, b) => {
      const aMesmoDep = depUp && a.codDepos && a.codDepos.toUpperCase() === depUp ? 0 : 1;
      const bMesmoDep = depUp && b.codDepos && b.codDepos.toUpperCase() === depUp ? 0 : 1;
      if (aMesmoDep !== bMesmoDep) return aMesmoDep - bMesmoDep;
      return a.lote.localeCompare(b.lote);
    });
  }

  async function buscarReferenciasLocal(codEmpresa, termo = '') {
    const emp = normalizarEmpresa(codEmpresa);
    const t = (termo || '').trim().toLowerCase();
    let refs = await getAllByEmpresa('referencia', emp);
    if (t) {
      refs = refs.filter(r =>
        (r.codRefer && r.codRefer.toLowerCase().includes(t)) ||
        (r.descRefer && r.descRefer.toLowerCase().includes(t))
      );
    }
    return refs.sort((a, b) => String(a.codRefer || '').localeCompare(String(b.codRefer || '')));
  }

  async function obterParamUsuarioLocal(codEmpresa, codUsuario) {
    const emp = normalizarEmpresa(codEmpresa);
    const lista = await getAllByEmpresa('fmsc_usuar_mestre', emp);
    return lista.find(u => String(u.codUsuario || '').toLowerCase() === String(codUsuario || '').toLowerCase()) || null;
  }

  async function obterParamInventarioLocal(codEmpresa, dtSaldo) {
    const emp = normalizarEmpresa(codEmpresa);
    const dt = normalizarDataIso(dtSaldo);
    return await get('fmsc_inventario', [emp, dt]);
  }

  // Fila de Sincronização Offline (com codEmpresa)
  async function adicionarFilaSync(tipo, payload, codEmpresa) {
    const emp = normalizarEmpresa(codEmpresa || payload.codEmpresa || '001');
    const registro = {
      id_uuid: 'SYNC_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      codEmpresa: emp,
      tipo,
      payload: { ...payload, codEmpresa: emp },
      status: 'Pendente',
      dt_criacao: new Date().toISOString()
    };
    await put('fila_sync', registro, emp);
    return registro;
  }

  async function getFilaSyncEmpresa(codEmpresa = null) {
    const fila = codEmpresa
      ? await getAllByEmpresa('fila_sync', codEmpresa)
      : await getAll('fila_sync');
    return fila.sort((a, b) => String(b.dt_criacao || '').localeCompare(String(a.dt_criacao || '')));
  }

  async function getQtdPendenciasSync(codEmpresa = null) {
    const fila = await getFilaSyncEmpresa(codEmpresa);
    return fila.filter(r => r.status === 'Pendente').length;
  }

  async function gravarHistoricoContagem(dados, codEmpresa) {
    const emp = normalizarEmpresa(codEmpresa || dados.codEmpresa || '001');
    const hist = {
      ...dados,
      codEmpresa: emp,
      dtLeitura: dados.dtLeitura || new Date().toISOString().replace('T', ' ').slice(0, 19)
    };
    return await put('historico_contagens', hist, emp);
  }

  async function getHistoricoLocal(codEmpresa, filtros = {}) {
    let list = await getAllByEmpresa('historico_contagens', codEmpresa);
    if (filtros.codEstabel) list = list.filter(h => h.codEstabel === filtros.codEstabel);
    if (filtros.codDepos) list = list.filter(h => h.codDepos === filtros.codDepos);
    if (filtros.itCodigo) list = list.filter(h => String(h.itCodigo || '').toLowerCase().includes(filtros.itCodigo.toLowerCase()));
    if (filtros.nrFicha) list = list.filter(h => String(h.nrFicha) === String(filtros.nrFicha));
    return list.sort((a, b) => (b.id_local || 0) - (a.id_local || 0));
  }

  // Envia fila de pendências offline para os endpoints oficiais do PASOE (fcSetInventarioNovaFicha, fcSetInventarioApuracaoFicha, fcSetRequisicao, fcSetRequisDevol)
  async function integrarFilaOffline(opcoesOuEmpresa, pasoeUrlParam, authHeaderParam) {
    let pasoeUrl = '';
    let codEmpresa = '001';
    let authHeader = '';

    if (opcoesOuEmpresa && typeof opcoesOuEmpresa === 'object') {
      pasoeUrl = opcoesOuEmpresa.pasoeUrl || '';
      codEmpresa = opcoesOuEmpresa.codEmpresa || '001';
      authHeader = opcoesOuEmpresa.authHeader || '';
    } else {
      codEmpresa = opcoesOuEmpresa || '001';
      pasoeUrl = pasoeUrlParam || '';
      authHeader = authHeaderParam || '';
    }

    const estaOnline = typeof window !== 'undefined' && window.App?.isOnline ? window.App.isOnline() : navigator.onLine;
    if (!estaOnline) return { success: false, motivo: 'OFFLINE', mensagem: 'Dispositivo offline ou com simulação offline ativa.' };

    const emp = normalizarEmpresa(codEmpresa || '001');
    const fila = await getFilaSyncEmpresa(emp);
    const pendentes = fila.filter(r => r.status === 'Pendente');
    if (pendentes.length === 0) return { success: true, processados: 0, erros: 0, relatorio: [] };

    const baseUrl = (pasoeUrl || '/api/datasul').replace(/\/+$/, '');

    async function dispararApi(endpoint, body) {
      const rawUrl = `${baseUrl}${endpoint}`;
      const gatewayBase = window.ColetorGateway ? window.ColetorGateway.getBaseUrl() : '';
      const finalUrl = (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) &&
        (!gatewayBase || !rawUrl.startsWith(gatewayBase)) &&
        (!window.location.host || !rawUrl.includes(window.location.host))
        ? `/api/pasoe-proxy?url=${encodeURIComponent(rawUrl)}`
        : rawUrl;
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'companyId': emp
      };
      if (authHeader) headers['Authorization'] = authHeader;

      // Se body já contém 'payload' como array, preserva intacto sem re-empacotar
      let jsonBody;
      if (body && Array.isArray(body.payload)) {
        jsonBody = { ...body };
      } else {
        jsonBody = { ...body, payload: [body] };
      }

      const res = await fetch(finalUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(jsonBody)
      });
      return await res.json();
    }

    const relatorio = [];
    let processados = 0;
    let erros = 0;

    // FASE 1: Processa Inclusões de Fichas Avulsas primeiro (para garantir que a ficha passe a existir no Datasul)
    const pendentesAvulsas = pendentes.filter(p => p.tipo === 'INVENTARIO_AVULSA');
    for (const p of pendentesAvulsas) {
      try {
        const payloadEnvio = { ...p.payload, codEmpresa: emp };
        const data = await dispararApi('/fcSetInventarioNovaFicha', payloadEnvio);

        if (data.type === 'OK' || data.code === '0' || (data.detailedMessage && !data.detailedMessage.toLowerCase().includes('erro'))) {
          // Sucesso na criação da ficha avulsa no Datasul
          const nrFichaOficial = Number(data.nrFicha || data.message) || null;

          // Atualizar o registro da ficha no IndexedDB
          const fichasEmp = await getAllByEmpresa('fichas_inventario', emp);
          const fichaLocal = fichasEmp.find(f =>
            f.avulsa &&
            f.dtSaldo === payloadEnvio.dtSaldo &&
            f.itCodigo === payloadEnvio.itCodigo &&
            (f.lote || '') === (payloadEnvio.lote || '') &&
            (f.codDepos || '').toUpperCase() === (payloadEnvio.codDepos || '').toUpperCase()
          );

          if (fichaLocal) {
            fichaLocal.pendenteSync = false;
            fichaLocal.sincronizado = true;
            if (nrFichaOficial) fichaLocal.nrFicha = nrFichaOficial;
            await put('fichas_inventario', fichaLocal, emp);
          }

          await remove('fila_sync', p.id_uuid);
          processados++;
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'OK',
            mensagem: `Ficha Avulsa criada com sucesso no ERP! (Ficha #${nrFichaOficial || p.payload.nrFicha || ''})`
          });
        } else {
          erros++;
          const msgErro = data.detailedMessage || data.message || 'Erro desconhecido ao incluir ficha avulsa';
          p.ultimoErro = msgErro;
          await put('fila_sync', p, emp);
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'ERROR',
            mensagem: msgErro
          });
        }
      } catch (err) {
        erros++;
        p.ultimoErro = err.message;
        await put('fila_sync', p, emp);
        relatorio.push({
          id_uuid: p.id_uuid,
          tipo: p.tipo,
          status: 'ERROR',
          mensagem: err.message
        });
      }
    }

    // FASE 2: Processa Apurações de Fichas do CE0712
    const pendentesApuracao = pendentes.filter(p => p.tipo === 'INVENTARIO_APURACAO' || (!p.tipo && p.payload && p.payload.nrFicha));
    for (const p of pendentesApuracao) {
      try {
        const payloadEnvio = { ...p.payload, codEmpresa: emp };
        const data = await dispararApi('/fcSetInventarioApuracaoFicha', payloadEnvio);

        if (data.type === 'OK' || data.code === '0' || (data.detailedMessage && !data.detailedMessage.toLowerCase().includes('erro'))) {
          // Atualiza a ficha local
          const fichasEmp = await getAllByEmpresa('fichas_inventario', emp);
          const fOrig = fichasEmp.find(f =>
            Number(f.nrFicha) === Number(payloadEnvio.nrFicha) &&
            f.dtSaldo === payloadEnvio.dtSaldo
          );
          if (fOrig) {
            fOrig.pendenteSync = false;
            fOrig.sincronizado = true;
            fOrig.qtApurada = payloadEnvio.qtApurada;
            fOrig.qtdTotvs = payloadEnvio.qtApurada;
            await put('fichas_inventario', fOrig, emp);
          }

          await remove('fila_sync', p.id_uuid);
          processados++;
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'OK',
            mensagem: `Ficha #${payloadEnvio.nrFicha} apurada com sucesso no ERP!`
          });
        } else {
          erros++;
          const msgErro = data.detailedMessage || data.message || 'Erro ao apurar ficha';
          p.ultimoErro = msgErro;
          await put('fila_sync', p, emp);
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'ERROR',
            mensagem: msgErro
          });
        }
      } catch (err) {
        erros++;
        p.ultimoErro = err.message;
        await put('fila_sync', p, emp);
        relatorio.push({
          id_uuid: p.id_uuid,
          tipo: p.tipo,
          status: 'ERROR',
          mensagem: err.message
        });
      }
    }

    // FASE 3: Processa Atendimentos de Requisição (CD1409)
    const pendentesAtend = pendentes.filter(p => p.tipo === 'ATENDIMENTO_REQUISICAO');
    for (const p of pendentesAtend) {
      try {
        let itensAtendimento = [];
        if (p.payload && Array.isArray(p.payload.payload)) {
          const primeiro = p.payload.payload[0];
          if (primeiro && Array.isArray(primeiro.payload)) {
            itensAtendimento = primeiro.payload;
          } else {
            itensAtendimento = p.payload.payload;
          }
        } else if (p.payload && Array.isArray(p.payload)) {
          itensAtendimento = p.payload;
        } else if (p.payload && (p.payload.nrRequisicao || p.payload.itCodigo)) {
          itensAtendimento = [p.payload];
        }

        const payloadEnvio = {
          payload: itensAtendimento,
          codEmpresa: emp
        };

        // Espelha campos na raiz para compatibilidade com Progress ABL
        if (itensAtendimento.length > 0 && typeof itensAtendimento[0] === 'object') {
          Object.keys(itensAtendimento[0]).forEach(k => {
            if (payloadEnvio[k] === undefined) {
              payloadEnvio[k] = itensAtendimento[0][k];
            }
          });
        }

        const data = await dispararApi('/fcSetRequisicao', payloadEnvio);
        const nrReqLog = payloadEnvio.nrRequisicao || payloadEnvio.payload?.[0]?.nrRequisicao || '';
        const isOk = (data.type === 'OK' || data.code === '0' || String(data.code) === '0') &&
                     (!data.type || data.type.toUpperCase() !== 'ERROR');

        if (isOk) {
          await remove('fila_sync', p.id_uuid);
          processados++;
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'OK',
            mensagem: `Atendimento Req #${nrReqLog} sincronizado com sucesso no ERP!`
          });
        } else {
          erros++;
          const msgErro = data.detailedMessage || data.message || 'Erro ao efetivar atendimento no Datasul';
          p.ultimoErro = msgErro;
          await put('fila_sync', p, emp);
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'ERROR',
            mensagem: msgErro
          });
        }
      } catch (err) {
        erros++;
        p.ultimoErro = err.message;
        await put('fila_sync', p, emp);
        relatorio.push({
          id_uuid: p.id_uuid,
          tipo: p.tipo,
          status: 'ERROR',
          mensagem: err.message
        });
      }
    }

    // FASE 4: Processa Devoluções de Requisição (CD1410)
    const pendentesDevol = pendentes.filter(p => p.tipo === 'DEVOLUCAO_REQUISICAO');
    for (const p of pendentesDevol) {
      try {
        let itensDevolucao = [];
        if (p.payload && Array.isArray(p.payload.payload)) {
          const primeiro = p.payload.payload[0];
          if (primeiro && Array.isArray(primeiro.payload)) {
            itensDevolucao = primeiro.payload;
          } else {
            itensDevolucao = p.payload.payload;
          }
        } else if (p.payload && Array.isArray(p.payload)) {
          itensDevolucao = p.payload;
        } else if (p.payload && (p.payload.nrRequisicao || p.payload.itCodigo)) {
          itensDevolucao = [p.payload];
        }

        const payloadEnvio = {
          payload: itensDevolucao,
          codEmpresa: emp
        };

        if (itensDevolucao.length > 0 && typeof itensDevolucao[0] === 'object') {
          Object.keys(itensDevolucao[0]).forEach(k => {
            if (payloadEnvio[k] === undefined) {
              payloadEnvio[k] = itensDevolucao[0][k];
            }
          });
        }

        const data = await dispararApi('/fcSetRequisDevol', payloadEnvio);
        const nrReqLog = payloadEnvio.nrRequisicao || payloadEnvio.payload?.[0]?.nrRequisicao || '';
        const isOk = (data.type === 'OK' || data.code === '0' || String(data.code) === '0') &&
                     (!data.type || data.type.toUpperCase() !== 'ERROR');

        if (isOk) {
          await remove('fila_sync', p.id_uuid);
          processados++;
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'OK',
            mensagem: `Devolução Req #${nrReqLog} sincronizada com sucesso no ERP!`
          });
        } else {
          erros++;
          const msgErro = data.detailedMessage || data.message || 'Erro ao efetivar devolução no Datasul';
          p.ultimoErro = msgErro;
          await put('fila_sync', p, emp);
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'ERROR',
            mensagem: msgErro
          });
        }
      } catch (err) {
        erros++;
        p.ultimoErro = err.message;
        await put('fila_sync', p, emp);
        relatorio.push({
          id_uuid: p.id_uuid,
          tipo: p.tipo,
          status: 'ERROR',
          mensagem: err.message
        });
      }
    }

    // FASE 5: Processa Reportes de Ordem de Produção (CP0311)
    const pendentesProd = pendentes.filter(p => p.tipo === 'REPORTE_ORDEM_PRODUCAO');
    for (const p of pendentesProd) {
      try {
        let itensReporte = [];
        if (p.payload && Array.isArray(p.payload.payload)) {
          const primeiro = p.payload.payload[0];
          if (primeiro && Array.isArray(primeiro.payload)) {
            itensReporte = primeiro.payload;
          } else {
            itensReporte = p.payload.payload;
          }
        } else if (p.payload && Array.isArray(p.payload)) {
          itensReporte = p.payload;
        } else if (p.payload && (p.payload.nrOrdProdu || p.payload.itCodigo)) {
          itensReporte = [p.payload];
        }

        const payloadEnvio = {
          payload: itensReporte,
          codEmpresa: emp
        };

        if (itensReporte.length > 0 && typeof itensReporte[0] === 'object') {
          Object.keys(itensReporte[0]).forEach(k => {
            if (payloadEnvio[k] === undefined) {
              payloadEnvio[k] = itensReporte[0][k];
            }
          });
        }

        const data = await dispararApi('/fcSetReporteOrdProd', payloadEnvio);
        const nrOpLog = payloadEnvio.nrOrdProdu || payloadEnvio.payload?.[0]?.nrOrdProdu || '';
        const isOk = (data.type === 'OK' || data.code === '0' || String(data.code) === '0') &&
                     (!data.type || data.type.toUpperCase() !== 'ERROR');

        if (isOk) {
          await remove('fila_sync', p.id_uuid);
          processados++;
          try {
            if (typeof window !== 'undefined' && window.App?.limparErroOrdem) {
              window.App.limparErroOrdem(nrOpLog);
            }
          } catch (eErr) {}
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'OK',
            mensagem: `Reporte OP #${nrOpLog} sincronizado com sucesso no ERP!`
          });
        } else {
          erros++;
          const msgErro = data.detailedMessage || data.message || 'Erro ao efetivar reporte no Datasul';
          p.ultimoErro = msgErro;
          await put('fila_sync', p, emp);
          try {
            if (typeof window !== 'undefined' && window.App?.salvarErroOrdem) {
              window.App.salvarErroOrdem(nrOpLog, msgErro);
            }
          } catch (eErr) {}
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'ERROR',
            mensagem: msgErro
          });
        }
      } catch (err) {
        erros++;
        p.ultimoErro = err.message;
        await put('fila_sync', p, emp);
        try {
          const nrOpLog = p.payload?.nrOrdProdu || p.payload?.payload?.[0]?.nrOrdProdu || '';
          if (nrOpLog && typeof window !== 'undefined' && window.App?.salvarErroOrdem) {
            window.App.salvarErroOrdem(nrOpLog, err.message);
          }
        } catch (eErr) {}
        relatorio.push({
          id_uuid: p.id_uuid,
          tipo: p.tipo,
          status: 'ERROR',
          mensagem: err.message
        });
      }
    }

        // FASE 6: Processa Transferências de Material (fcSetTransfMaterial.p / CE0206)
    const pendentesTransf = pendentes.filter(p => p.tipo === 'TRANSFERENCIA_MATERIAL' || p.tipo === 'TRANSFERENCIA');
    for (const p of pendentesTransf) {
      try {
        let itemTransf = p.payload;
        if (itemTransf && Array.isArray(itemTransf.payload) && itemTransf.payload.length > 0) {
          itemTransf = itemTransf.payload[0];
        } else if (Array.isArray(itemTransf) && itemTransf.length > 0) {
          itemTransf = itemTransf[0];
        }

        const codEstabelFinal = (itemTransf.codEstabel || '101').trim() || '101';
        const usrFinal = (itemTransf.codUsuario || 'matheus.st').trim() || 'matheus.st';
        const dtIso = normalizarDataIso(itemTransf.dtTransf || new Date());

        const payloadEnvio = {
          payload: [{
            codEmpresa: emp,
            itCodigo: String(itemTransf.itCodigo || '').trim(),
            codEstabel: codEstabelFinal,
            codUsuario: usrFinal,
            dtTransf: dtIso,
            nroDocto: String(itemTransf.nroDocto || '').trim(),
            serie: String(itemTransf.serie || '').trim(),
            quantidade: Number(itemTransf.quantidade || 0),
            codDeposSai: String(itemTransf.codDeposSai || '').trim(),
            codLocalizSai: String(itemTransf.codLocalizSai || '').trim(),
            loteSai: String(itemTransf.loteSai || '').trim(),
            dtValiLote: itemTransf.dtValiLote ? normalizarDataIso(itemTransf.dtValiLote) : '',
            codReferSai: String(itemTransf.codReferSai || '').trim(),
            codDeposEnt: String(itemTransf.codDeposEnt || '').trim(),
            codLocalizEnt: String(itemTransf.codLocalizEnt || '').trim(),
            loteEnt: String(itemTransf.loteEnt || '').trim(),
            dtValiLoteEnt: itemTransf.dtValiLoteEnt ? normalizarDataIso(itemTransf.dtValiLoteEnt) : '',
            codReferEnt: String(itemTransf.codReferEnt || '').trim()
          }]
        };

        const data = await dispararApi('/fcSetTransfMaterial', payloadEnvio);
        const isOk = (data.type === 'OK' || data.code === '0' || String(data.code) === '0') &&
                     (!data.type || data.type.toUpperCase() !== 'ERROR');

        if (isOk) {
          await remove('fila_sync', p.id_uuid);
          processados++;
          try {
            const idOrig = p.transfId || itemTransf.id_uuid;
            if (idOrig) {
              const tr = await get('transferencia_material', idOrig);
              if (tr) {
                tr.status = 'EFETIVADO';
                tr.pendenteSync = false;
                tr.mensagemRetorno = data.message || 'Transferência efetuada com sucesso!';
                tr.efetivadoEm = new Date().toISOString();
                tr.atualizadoEm = new Date().toISOString();
                await put('transferencia_material', tr, emp);
              }
            }
          } catch (eTr) {}

          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'OK',
            mensagem: `Transferência Item ${itemTransf.itCodigo} efetivada com sucesso no ERP!`
          });
        } else {
          erros++;
          const msgErro = data.detailedMessage || data.message || 'Erro ao efetivar transferência no Datasul';
          p.ultimoErro = msgErro;
          await put('fila_sync', p, emp);
          relatorio.push({
            id_uuid: p.id_uuid,
            tipo: p.tipo,
            status: 'ERROR',
            mensagem: msgErro
          });
        }
      } catch (err) {
        erros++;
        p.ultimoErro = err.message;
        await put('fila_sync', p, emp);
        relatorio.push({
          id_uuid: p.id_uuid,
          tipo: p.tipo,
          status: 'ERROR',
          mensagem: err.message
        });
      }
    }

    return {
      success: erros === 0,
      processados,
      erros,
      relatorio
    };
  }

  async function putConfig(chave, valor) {
    try {
      localStorage.setItem(`datasul_cfg_${chave}`, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  }

  async function getConfig(chave) {
    try {
      const item = localStorage.getItem(`datasul_cfg_${chave}`);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      return null;
    }
  }

  async function countEmpresa(storeName, codEmpresa) {
    const emp = normalizarEmpresa(codEmpresa);
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        if (store.indexNames.contains('codEmpresa')) {
          const keyRange = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.only(emp) : emp;
          const req = store.index('codEmpresa').count(keyRange);
          req.onsuccess = () => {
            if (req.result > 0) return resolve(req.result);
            const req2 = store.index('codEmpresa').count(String(Number(emp)));
            req2.onsuccess = () => resolve(req2.result || 0);
            req2.onerror = () => resolve(0);
          };
          req.onerror = () => resolve(0);
        } else {
          const req = store.count();
          req.onsuccess = () => resolve(req.result || 0);
          req.onerror = () => resolve(0);
        }
      } catch (e) {
        resolve(0);
      }
    });
  }

  async function salvarTransferencia(transf) {
    const dados = prepararRegistro('transferencia_material', transf, transf.codEmpresa);
    await put('transferencia_material', dados);
    return dados;
  }

  async function obterTransferencia(id_uuid) {
    return await get('transferencia_material', id_uuid);
  }

  async function excluirTransferencia(id_uuid) {
    const atual = await get('transferencia_material', id_uuid);
    if (!atual) return { success: false, mensagem: 'Transferência não encontrada.' };
    if (atual.status === 'EFETIVADO') {
      return { success: false, mensagem: 'Não é permitido excluir transferências já efetivadas no Datasul.' };
    }
    await remove('transferencia_material', id_uuid);
    return { success: true };
  }

  async function listarTransferencias(codEmpresa, codUsuario) {
    const emp = normalizarEmpresa(codEmpresa);
    const todas = await getAllByEmpresa('transferencia_material', emp);
    const usrNormalizado = String(codUsuario || '').trim().toLowerCase();

    // Filtrar pelo usuário logado no app (requisito explícito)
    const filtradas = usrNormalizado
      ? todas.filter(t => String(t.codUsuario || '').trim().toLowerCase() === usrNormalizado)
      : todas;

    // Ordenar: mais recentes primeiro
    return filtradas.sort((a, b) => {
      const da = new Date(a.criadoEm || 0).getTime();
      const db = new Date(b.criadoEm || 0).getTime();
      return db - da;
    });
  }

  async function obterDataValidadeLote(codEmpresa, itCodigo, lote) {
    const emp = normalizarEmpresa(codEmpresa);
    const itUp = String(itCodigo || '').trim().toUpperCase();
    const loteNorm = String(lote || '').trim().toUpperCase();
    if (!itUp || !loteNorm) return { existe: false, dtValiLote: '' };

    // 1. Procurar na store 'lote'
    const lotes = await getAllByEmpresa('lote', emp);
    const loteEnc = lotes.find(l =>
      String(l.itCodigo || '').trim().toUpperCase() === itUp &&
      String(l.lote || '').trim().toUpperCase() === loteNorm
    );
    if (loteEnc) {
      return {
        existe: true,
        dtValiLote: loteEnc.dtValiLote ? normalizarDataIso(loteEnc.dtValiLote) : ''
      };
    }

    // 2. Procurar em 'saldo_estoq'
    const saldos = await getAllByEmpresa('saldo_estoq', emp);
    const saldoEnc = saldos.find(s =>
      String(s.itCodigo || '').trim().toUpperCase() === itUp &&
      String(s.lote || '').trim().toUpperCase() === loteNorm
    );
    if (saldoEnc) {
      return {
        existe: true,
        dtValiLote: saldoEnc.dtValiLote ? normalizarDataIso(saldoEnc.dtValiLote) : ''
      };
    }

    return { existe: false, dtValiLote: '' };
  }

  async function consultarSaldoEstoqueItem(codEmpresa, codEstabel, itCodigo) {
    const emp = normalizarEmpresa(codEmpresa);
    const itNorm = String(itCodigo || '').trim().toUpperCase();
    const estNorm = String(codEstabel || '').trim();

    const todos = await getAllByEmpresa('saldo_estoq', emp);
    const filtrados = todos.filter(s => {
      const matchIt = String(s.itCodigo || '').trim().toUpperCase() === itNorm;
      const matchEst = !estNorm || String(s.codEstab || s.codEstabel || '').trim() === estNorm;
      return matchIt && matchEst;
    });

    return filtrados.map(s => ({
      codEstabel: s.codEstab || s.codEstabel || estNorm,
      codDepos: s.codDep || s.codDepos || '',
      codLocaliz: s.codLocal || s.codLocaliz || '',
      lote: s.lote || '',
      codRefer: s.codRefer || '',
      itCodigo: s.itCodigo,
      qtDisponivel: Number(s.qtdeDisponivel ?? s.qtDisponivel ?? s.quantidade ?? 0),
      dtValiLote: s.dtValiLote || ''
    })).filter(s => s.qtDisponivel > 0);
  }

  async function abaterSaldoEstoqueLocal(codEmpresa, { codEstabel, codDepos, codLocaliz, lote, codRefer, itCodigo, quantidade }) {
    const emp = normalizarEmpresa(codEmpresa);
    const est = String(codEstabel || '').trim();
    const dep = String(codDepos || '').trim();
    const loc = String(codLocaliz || '').trim();
    const lot = String(lote || '').trim();
    const ref = String(codRefer || '').trim();
    const it = String(itCodigo || '').trim();
    const qtdAbater = Number(quantidade || 0);

    const reg = await get('saldo_estoq', [emp, est, dep, loc, it, lot, ref]);
    if (reg) {
      const atual = Number(reg.qtdeDisponivel ?? reg.qtDisponivel ?? reg.quantidade ?? 0);
      const novo = Math.max(0, atual - qtdAbater);
      reg.qtdeDisponivel = novo;
      reg.qtDisponivel = novo;
      reg.quantidade = novo;
      await put('saldo_estoq', reg, emp);
    }
  }

  async function restaurarSaldoEstoqueLocal(codEmpresa, { codEstabel, codDepos, codLocaliz, lote, codRefer, itCodigo, quantidade }) {
    const emp = normalizarEmpresa(codEmpresa);
    const est = String(codEstabel || '').trim();
    const dep = String(codDepos || '').trim();
    const loc = String(codLocaliz || '').trim();
    const lot = String(lote || '').trim();
    const ref = String(codRefer || '').trim();
    const it = String(itCodigo || '').trim();
    const qtdRestaurar = Number(quantidade || 0);

    let reg = await get('saldo_estoq', [emp, est, dep, loc, it, lot, ref]);
    if (reg) {
      const atual = Number(reg.qtdeDisponivel ?? reg.qtDisponivel ?? reg.quantidade ?? 0);
      const novo = atual + qtdRestaurar;
      reg.qtdeDisponivel = novo;
      reg.qtDisponivel = novo;
      reg.quantidade = novo;
      await put('saldo_estoq', reg, emp);
    } else {
      reg = {
        codEmpresa: emp,
        codEstab: est,
        codDep: dep,
        codLocal: loc,
        itCodigo: it,
        lote: lot,
        codRefer: ref,
        qtdeDisponivel: qtdRestaurar,
        qtDisponivel: qtdRestaurar,
        quantidade: qtdRestaurar
      };
      await put('saldo_estoq', reg, emp);
    }
  }

  return {
    normalizarEmpresa,
    normalizarDataIso,
    matchEmpresa,
    openDB,
    put,
    get,
    getAll,
    getAllByEmpresa,
    countEmpresa,
    bulkPut,
    remove,
    clear,
    clearEmpresa,
    obterItemExato,
    buscarItensLocal,
    buscarLocalizacoesLocal,
    buscarLotesLocal,
    buscarReferenciasLocal,
    obterParamUsuarioLocal,
    obterParamInventarioLocal,
    adicionarFilaSync,
    getFilaSyncEmpresa,
    getQtdPendenciasSync,
    gravarHistoricoContagem,
    getHistoricoLocal,
    integrarFilaOffline,
    putConfig,
    getConfig,
    salvarTransferencia,
    obterTransferencia,
    excluirTransferencia,
    listarTransferencias,
    obterDataValidadeLote,
    consultarSaldoEstoqueItem,
    abaterSaldoEstoqueLocal,
    restaurarSaldoEstoqueLocal
  };
})();

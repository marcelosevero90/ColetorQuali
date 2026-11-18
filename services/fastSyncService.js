// services/fastSyncService.js - Serviço de Carga Rápida por Chunks Otimizados (Mono-Empresa)
// Filtra rigorosamente pelo codEmpresa enviado via Header HTTP companyId.

const db = require('./totvsDataStore');

class FastSyncService {
  getItensChunk({
    codEmpresa = '001',
    chunk = 1,
    pageSize = 500,
    lastItCodigo = '',
    lastSyncTimestamp = null,
    busca = '',
    codEstabel = ''
  }) {
    let itens = (db.data.item || []).filter(it => db.matchEmpresa(it.codEmpresa, codEmpresa));

    if (lastSyncTimestamp) {
      const dtCorte = new Date(lastSyncTimestamp).getTime();
      if (!isNaN(dtCorte)) {
        itens = itens.filter(it => !it.dataAtualiz || new Date(it.dataAtualiz).getTime() > dtCorte);
      }
    }

    if (busca) {
      const termo = String(busca).trim().toLowerCase();
      itens = itens.filter(it =>
        (it.itCodigo && it.itCodigo.toLowerCase().includes(termo)) ||
        (it.descItem && it.descItem.toLowerCase().includes(termo)) ||
        (it.codBarras && it.codBarras.toLowerCase().includes(termo))
      );
    }

    // Ordenação por itCodigo para suportar keyset pagination determinística
    itens = [...itens].sort((a, b) => String(a.itCodigo).localeCompare(String(b.itCodigo)));

    const totalRecords = itens.length;
    const size = Math.max(1, parseInt(pageSize, 10) || 500);
    const totalChunks = Math.ceil(totalRecords / size) || 1;
    const chunkNum = Math.max(1, parseInt(chunk, 10) || 1);

    let slice = [];
    if (lastItCodigo) {
      const idxAfter = itens.findIndex(it => String(it.itCodigo) > String(lastItCodigo));
      if (idxAfter !== -1) {
        slice = itens.slice(idxAfter, idxAfter + size);
      }
    } else {
      const startIndex = (chunkNum - 1) * size;
      slice = itens.slice(startIndex, startIndex + size);
    }

    const nextLastIt = slice.length > 0 ? slice[slice.length - 1].itCodigo : null;
    const hasMore = slice.length >= size && (lastItCodigo
      ? itens.some(it => String(it.itCodigo) > String(nextLastIt))
      : (chunkNum * size) < totalRecords);

    // Enriquecer localização com estabelecimento caso informado
    const locs = (db.data.localizacao || []).filter(l => db.matchEmpresa(l.codEmpresa, codEmpresa));
    const enriquecidos = slice.map(it => {
      if (codEstabel) {
        const locEst = locs.find(l => l.codEstabel === codEstabel && l.codDepos === it.depositoPad && l.codLocaliz === it.codLocaliz);
        if (locEst) {
          return { ...it, descricaoLocaliz: locEst.descricao };
        }
      }
      return it;
    });

    return {
      success: true,
      codEmpresa: db.normalizarEmpresa(codEmpresa),
      chunk: chunkNum,
      pageSize: size,
      totalChunks,
      totalRecords,
      hasMore,
      nextChunk: hasMore ? chunkNum + 1 : null,
      lastItCodigo: nextLastIt,
      timestamp: new Date().toISOString(),
      itens: enriquecidos
    };
  }

  getSaldosChunk({ codEmpresa = '001', codEstabel = '', chunk = 1, pageSize = 500 }) {
    let saldos = (db.data.saldo_estoq || []).filter(s => db.matchEmpresa(s.codEmpresa, codEmpresa));
    if (codEstabel) {
      saldos = saldos.filter(s => s.codEstab === codEstabel);
    }

    const totalRecords = saldos.length;
    const size = Math.max(1, parseInt(pageSize, 10) || 500);
    const totalChunks = Math.ceil(totalRecords / size) || 1;
    const chunkNum = Math.max(1, parseInt(chunk, 10) || 1);
    const startIndex = (chunkNum - 1) * size;
    const slice = saldos.slice(startIndex, startIndex + size);

    return {
      success: true,
      codEmpresa: db.normalizarEmpresa(codEmpresa),
      chunk: chunkNum,
      pageSize: size,
      totalChunks,
      totalRecords,
      hasMore: chunkNum < totalChunks,
      nextChunk: chunkNum < totalChunks ? chunkNum + 1 : null,
      saldos: slice
    };
  }

  getDadosMestres({ codEmpresa = '001', codEstabel = '' }) {
    const estabelecimentos = db.data.estabelec || [];
    const depositos = (db.data.deposito || []).filter(d => db.matchEmpresa(d.codEmpresa, codEmpresa));
    let localizacoes = (db.data.localizacao || []).filter(l => db.matchEmpresa(l.codEmpresa, codEmpresa));
    if (codEstabel) {
      localizacoes = localizacoes.filter(l => l.codEstabel === codEstabel);
    }
    const referencias = (db.data.referencia || []).filter(r => db.matchEmpresa(r.codEmpresa, codEmpresa));
    const agrupamentos = (db.data.agrup_invent || []).filter(a => db.matchEmpresa(a.codEmpresa, codEmpresa));
    let lotes = (db.data.lote || []).filter(l => db.matchEmpresa(l.codEmpresa, codEmpresa));
    if (codEstabel) {
      lotes = lotes.filter(l => !l.codEstabel || l.codEstabel === codEstabel);
    }
    const totalItens = (db.data.item || []).filter(i => db.matchEmpresa(i.codEmpresa, codEmpresa)).length;

    return {
      success: true,
      codEmpresa: db.normalizarEmpresa(codEmpresa),
      timestamp: new Date().toISOString(),
      estabelecimentos,
      depositos,
      localizacoes,
      referencias,
      agrupamentos,
      lotes,
      totalItens
    };
  }
}

module.exports = new FastSyncService();

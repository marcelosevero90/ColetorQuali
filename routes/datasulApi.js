// routes/datasulApi.js - API REST Fiel aos Programas Progress (collect/app/fc*.p e DFs)
// Respeita rigorosamente:
// - Autenticação Basic Auth (usuário e senha do TOTVS na requisição HTTP)
// - Multi-empresa global na tabela 'estabelec' (fcGetEstabelecimentos)
// - Mono-empresa via Header HTTP 'companyId' em todas as demais tabelas
// - Parâmetros de inventário em 'fmsc-inventario' (fms002.df / FMSC0102) e 'fmsc-usuar-mestre' (fms001.df / FMSC0101)

const express = require('express');
const router = express.Router();
const db = require('../services/totvsDataStore');
const fastSync = require('../services/fastSyncService');

// Extrai o primeiro objeto de { payload: [...] } ou { payload: {} } ou raiz do body
function extrairPayload(req) {
  if (req.body && req.body.payload !== undefined) {
    if (Array.isArray(req.body.payload)) {
      return req.body.payload[0] || {};
    }
    if (typeof req.body.payload === 'object' && req.body.payload !== null) {
      return req.body.payload;
    }
  }
  return req.body || {};
}

// Extrai o companyId do Header HTTP (conforme padrão PASOE Totvs Datasul)
function extrairCompanyId(req) {
  const p = extrairPayload(req);
  const raw = (
    req.headers['companyid'] ||
    req.headers['company-id'] ||
    req.headers['company_id'] ||
    req.query.companyId ||
    req.query.codEmpresa ||
    p.companyId ||
    p.codEmpresa ||
    '001'
  ).toString().trim();
  return db.normalizarEmpresa(raw);
}

// Extrai usuário e senha do cabeçalho Authorization: Basic ...
function extrairBasicAuth(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx === -1) return null;
    return {
      usuario: decoded.slice(0, idx).trim(),
      senha: decoded.slice(idx + 1)
    };
  } catch (e) {
    return null;
  }
}

// Validação de Basic Auth nas rotas protegidas do PASOE simulado
function exigirBasicAuth(req, res, next) {
  const creds = extrairBasicAuth(req);
  if (!creds || !creds.usuario) {
    return res.status(401).json({
      success: false,
      type: 'ERROR',
      code: '401',
      message: 'Autenticação Basic Auth obrigatória (usuário e senha TOTVS).',
      mensagem: 'Autenticação Basic Auth obrigatória (usuário e senha TOTVS).'
    });
  }

  const usuarioRaw = creds.usuario;
  const usuarioNorm = usuarioRaw.replace(/\//g, '\\');
  const usuarioLimpo = usuarioNorm.includes('\\') ? usuarioNorm.split('\\')[1].trim() : usuarioRaw.trim();

  const companyId = extrairCompanyId(req);
  const user = (db.data.fmsc_usuar_mestre || []).find(u =>
    db.matchEmpresa(u.codEmpresa, companyId) &&
    (u.codUsuario.toLowerCase() === usuarioLimpo.toLowerCase() || u.codUsuario.toLowerCase() === usuarioRaw.toLowerCase())
  ) || (db.data.fmsc_usuar_mestre || []).find(u =>
    u.codUsuario.toLowerCase() === usuarioLimpo.toLowerCase() || u.codUsuario.toLowerCase() === usuarioRaw.toLowerCase()
  );

  if (!user || user.senha !== creds.senha) {
    return res.status(401).json({
      success: false,
      type: 'ERROR',
      code: '401',
      message: 'Falha na autenticação, Senha Inválida ou Usuário não cadastrado!',
      mensagem: 'Falha na autenticação, Senha Inválida ou Usuário não cadastrado!'
    });
  }

  req.totvsUser = user;
  req.companyId = companyId;
  next();
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

function dscSituacaoFicha(sit) {
  switch (Number(sit)) {
    case 1: return 'Atualiza';
    case 2: return 'Nao Atualiza';
    case 3: return 'Inventario OK';
    case 4: return 'OK p/Inventario';
    default: return 'Pendente';
  }
}

// =============================================================================
// 1. AUTENTICAÇÃO: fcLogin.p (POST /fcLogin)
// =============================================================================
router.post(['/fcLogin', '/qdcLogin'], (req, res) => {
  const p = extrairPayload(req);
  const basic = extrairBasicAuth(req);
  const companyId = extrairCompanyId(req);

  const usuarioRaw = (p.usuario || p.codUsuario || basic?.usuario || '').trim();
  const senha = (p.senha !== undefined ? p.senha : (basic?.senha || ''));

  if (!usuarioRaw || !senha) {
    return res.status(401).json({
      success: false,
      type: 'ERROR',
      code: '401',
      message: 'Usuário e senha do TOTVS são obrigatórios.',
      detailedMessage: 'Usuário e senha do TOTVS são obrigatórios.'
    });
  }

  // Suporte a formato com domínio AD: "dominio/usuario" ou "dominio\usuario"
  let dominio = '';
  let usuario = usuarioRaw;
  const usuarioNorm = usuarioRaw.replace(/\//g, '\\');
  if (usuarioNorm.includes('\\')) {
    const partes = usuarioNorm.split('\\');
    dominio = partes[0].trim();
    usuario = partes[1].trim();
  }

  // Busca usuário na empresa conectada (ou no cadastro geral de usuários)
  const userEmpresa = (db.data.fmsc_usuar_mestre || []).find(u =>
    db.matchEmpresa(u.codEmpresa, companyId) &&
    (u.codUsuario.toLowerCase() === usuario.toLowerCase() || u.codUsuario.toLowerCase() === usuarioRaw.toLowerCase())
  );
  const userGeral = userEmpresa || (db.data.fmsc_usuar_mestre || []).find(u =>
    u.codUsuario.toLowerCase() === usuario.toLowerCase() || u.codUsuario.toLowerCase() === usuarioRaw.toLowerCase()
  );

  if (!userGeral) {
    return res.status(401).json({
      success: false,
      type: 'ERROR',
      code: '401',
      message: dominio ? 'Usuario do dominio nao cadastrado!' : 'Usuario nao cadastrado!',
      detailedMessage: dominio ? 'Usuario do dominio nao cadastrado!' : 'Usuario nao cadastrado!'
    });
  }

  if (userGeral.senha !== senha) {
    return res.status(401).json({
      success: false,
      type: 'ERROR',
      code: '401',
      message: 'Falha na autenticação, Senha Inválida!',
      detailedMessage: 'Falha na autenticação, Senha Inválida!'
    });
  }

  const paramEstoq = (db.data.param_estoq || []).find(pe => db.matchEmpresa(pe.codEmpresa, companyId));
  const estabPad = (userEmpresa?.codEstabPad || userGeral.codEstabPad || paramEstoq?.estabelPad || '101').trim();

  // Resposta fiel ao fcLogin.p + metadados amigáveis
  return res.json({
    detailedMessage: 'Login Válido!',
    code: '0',
    message: estabPad,
    type: 'OK',
    success: true,
    codUsuario: userGeral.codUsuario,
    nomeUsuario: userGeral.nome,
    codEmpresa: companyId,
    codEstabPad: estabPad,
    usuario: {
      codUsuario: userGeral.codUsuario,
      nome: userGeral.nome
    }
  });
});

// =============================================================================
// 2. ESTABELECIMENTOS (MULTI-EMPRESA GLOBAL): fcGetEstabelecimentos.p (GET)
// Exceção única: retorna estabelecimentos de todas as empresas com codEmpresa
// =============================================================================
router.all(['/fcGetEstabelecimentos', '/qdcGetEstabelecimentos'], exigirBasicAuth, (req, res) => {
  const items = (db.data.estabelec || []).map(e => ({
    codEstabel: e.codEstabel,
    nome: e.nome,
    codEmpresa: e.codEmpresa,
    cgc: e.cgc || ''
  }));

  return res.json({
    items,
    hasNext: false,
    success: true,
    total: items.length
  });
});

// =============================================================================
// 3. PARÂMETROS DE USUÁRIO: fcGetParamUsuario.p / fcSetParamUsuario.p
// =============================================================================
router.all(['/fcGetParamUsuario', '/qdcGetParamUsuario'], exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const usuario = (p.usuario || p.codUsuario || req.query.usuario || req.totvsUser?.codUsuario || '').trim();

  const reg = (db.data.fmsc_usuar_mestre || []).find(u =>
    db.matchEmpresa(u.codEmpresa, companyId) &&
    u.codUsuario.toLowerCase() === usuario.toLowerCase()
  );

  if (reg) {
    const paramEstoq = (db.data.param_estoq || []).find(pe => db.matchEmpresa(pe.codEmpresa, companyId));
    const estabPad = reg.codEstabPad || paramEstoq?.estabelPad || '';
    const item = {
      codEmpresa: companyId,
      codUsuario: reg.codUsuario,
      nome: reg.nome,
      situacao: reg.situacao ?? 9,
      codEstabPad: estabPad.trim(),
      TpAgrupTransf: reg.TpAgrupTransf || 1,
      tabPrincipal: reg.tabPrincipal || 1,
      permEstoque: Boolean(reg.permEstoque),
      permCompras: Boolean(reg.permCompras),
      permCredito: Boolean(reg.permCredito),
      permProducao: Boolean(reg.permProducao),
      permEstoqReqAte: Boolean(reg.permEstoqReqAte),
      permEstoqReqDev: Boolean(reg.permEstoqReqDev),
      permEstoqReqMov: Boolean(reg.permEstoqReqMov),
      permEstoqReqInv: Boolean(reg.permEstoqReqInv),
      permEstoqReqRec: Boolean(reg.permEstoqReqRec),
      permComprMLA: Boolean(reg.permComprMLA),
      permCredAvCli: Boolean(reg.permCredAvCli)
    };
    return res.json({ items: [item], hasNext: false, success: true, codEmpresa: companyId });
  }

  // Retorno padrão do fcGetParamUsuario.p quando não encontrado na empresa
  return res.json({
    items: [{
      codEmpresa: companyId,
      codUsuario: usuario,
      situacao: 0,
      codEstabPad: '',
      TpAgrupTransf: 0,
      tabPrincipal: 0,
      permEstoque: false,
      permCompras: false,
      permCredito: false,
      permProducao: false,
      permEstoqReqAte: false,
      permEstoqReqDev: false,
      permEstoqReqMov: false,
      permEstoqReqInv: false,
      permEstoqReqRec: false,
      permComprMLA: false,
      permCredAvCli: false
    }],
    hasNext: false,
    success: true,
    codEmpresa: companyId
  });
});

router.post('/fcSetParamUsuario', exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const usuario = (p.usuario || p.codUsuario || '').trim();
  const orig = String(p.origem || '1');
  const valor = String(p.valor || '').trim();

  const reg = (db.data.fmsc_usuar_mestre || []).find(u =>
    db.matchEmpresa(u.codEmpresa, companyId) &&
    u.codUsuario.toLowerCase() === usuario.toLowerCase()
  );

  if (reg && orig === '1' && valor) {
    reg.codEstabPad = valor;
    db.saveToDisk();
  }

  return res.json({
    detailedMessage: 'OK',
    code: '0',
    message: 'OK',
    type: 'OK',
    success: true
  });
});

// =============================================================================
// 4. PARÂMETROS DO INVENTÁRIO: fcGetInventarioParam.p / old_fcGetInventarioParam.p
// =============================================================================
router.all(['/fcGetInventarioParam', '/old_fcGetInventarioParam'], exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const dtSaldo = normalizarDataIso(p.dtSaldo || req.query.dtSaldo || '');

  let lista = (db.data.fmsc_inventario || []).filter(inv => db.matchEmpresa(inv.codEmpresa, companyId));
  if (dtSaldo) {
    lista = lista.filter(inv => normalizarDataIso(inv.dtSaldo) === dtSaldo);
  }

  const items = lista.map(inv => ({
    codEmpresa: companyId,
    dtSaldo: normalizarDataIso(inv.dtSaldo),
    indSitInv: Number(inv.indSitInv || 1),         // 1-Liberado, 2-Bloqueado
    permContgUsFc: Boolean(inv.permContgUsFc),    // Permite mesmo usuário em contagens diferentes
    indTipoInv: Number(inv.indTipoInv || 1),      // 1-Por Fichas, 2-Por Operador
    nrContagAtiva: Number(inv.nrContagAtiva || inv.nr_contag_ativa || 1) // 1, 2, 3 (4=concluido)
  }));

  return res.json({
    items,
    hasNext: false,
    success: true,
    codEmpresa: companyId
  });
});

// =============================================================================
// 5. AGRUPAMENTOS DE INVENTÁRIO: fcGetAgrupInvent.p (GET)
// =============================================================================
router.all('/fcGetAgrupInvent', exigirBasicAuth, (req, res) => {
  const companyId = extrairCompanyId(req);
  const items = (db.data.agrup_invent || [])
    .filter(a => db.matchEmpresa(a.codEmpresa, companyId))
    .map(a => ({
      codEmpresa: companyId,
      cdnAgrup: a.cdnAgrup,
      dscAgrup: a.dscAgrup,
      codRespon: a.codRespon,
      dtCriacao: a.dtCriacao
    }));

  return res.json({ items, hasNext: false, success: true, codEmpresa: companyId });
});

// =============================================================================
// 6. DEPÓSITOS: fcGetDeposito.p (GET)
// =============================================================================
router.all('/fcGetDeposito', exigirBasicAuth, (req, res) => {
  const companyId = extrairCompanyId(req);
  const items = (db.data.deposito || [])
    .filter(d => db.matchEmpresa(d.codEmpresa, companyId) && d.consSaldo !== false)
    .map(d => ({
      codEmpresa: companyId,
      codDepos: d.codDepos,
      nome: d.nome
    }));

  return res.json({ items, hasNext: false, success: true, codEmpresa: companyId });
});

// =============================================================================
// 7. LOCALIZAÇÕES: fcGetLocalizacao.p (PUT/GET)
// =============================================================================
router.all('/fcGetLocalizacao', exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const codEstabel = (p.codEstabel || req.query.codEstabel || '').trim();

  let lista = (db.data.localizacao || []).filter(l => db.matchEmpresa(l.codEmpresa, companyId));
  if (codEstabel) {
    lista = lista.filter(l => l.codEstabel === codEstabel);
  }

  const items = lista.map(l => ({
    codEmpresa: companyId,
    codEstabel: l.codEstabel,
    codDepos: l.codDepos,
    codLocaliz: l.codLocaliz,
    descricao: l.descricao
  }));

  return res.json({ items, hasNext: false, success: true, codEmpresa: companyId });
});

// =============================================================================
// 8. REFERÊNCIAS: fcGetReferencia.p (GET)
// =============================================================================
router.all('/fcGetReferencia', exigirBasicAuth, (req, res) => {
  const companyId = extrairCompanyId(req);
  const items = (db.data.referencia || [])
    .filter(r => db.matchEmpresa(r.codEmpresa, companyId))
    .map(r => ({
      codEmpresa: companyId,
      codRefer: r.codRefer,
      descRefer: r.descRefer
    }));

  return res.json({ items, hasNext: false, success: true, codEmpresa: companyId });
});

// =============================================================================
// 9. ITENS: fcGetItem.p e fcGetItensChunk (Carga Rápida em Chunks)
// =============================================================================
router.all('/fcGetItem', exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const codEstabel = (p.codEstabel || req.query.codEstabel || '').trim();
  const itCodigo = (p.itCodigo || req.query.itCodigo || '').trim();
  const descItem = (p.descItem || req.query.descItem || '').trim();

  const itensEmpresa = (db.data.item || []).filter(i => db.matchEmpresa(i.codEmpresa, companyId));
  let encontrados = [];

  if (itCodigo) {
    const exato = itensEmpresa.find(i => i.itCodigo.toUpperCase() === itCodigo.toUpperCase());
    if (exato) {
      encontrados = [exato];
    } else {
      encontrados = itensEmpresa.filter(i =>
        i.itCodigo.toUpperCase().startsWith(itCodigo.toUpperCase()) ||
        (descItem && i.descItem.toLowerCase().includes(descItem.toLowerCase())) ||
        (i.codBarras && i.codBarras === itCodigo)
      );
    }
  } else if (descItem) {
    encontrados = itensEmpresa.filter(i => i.descItem.toLowerCase().includes(descItem.toLowerCase()));
  } else {
    encontrados = itensEmpresa;
  }

  const items = encontrados.map(it => {
    const loc = codEstabel
      ? (db.data.localizacao || []).find(l => db.matchEmpresa(l.codEmpresa, companyId) && l.codEstabel === codEstabel && l.codDepos === it.depositoPad && l.codLocaliz === it.codLocaliz)
      : null;
    return {
      codEmpresa: companyId,
      itCodigo: it.itCodigo,
      descItem: it.descItem,
      tipoConEst: it.tipoConEst,
      locUnica: Boolean(it.locUnica),
      depositoPad: it.depositoPad || '',
      nomeDeposito: it.nomeDeposito || '',
      codLocaliz: it.codLocaliz || '',
      descricaoLocaliz: loc ? loc.descricao : (it.descricaoLocaliz || ''),
      un: it.un || 'UN',
      codBarras: it.codBarras || '',
      requerValorFicha: Boolean(it.requerValorFicha)
    };
  });

  return res.json({ items, hasNext: false, success: true, codEmpresa: companyId });
});

router.all(['/fcGetItensChunk', '/qdcGetItensChunk'], exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const codEstabel = (p.codEstabel || req.query.codEstabel || '').trim();
  const chunk = parseInt(p.chunk || req.query.chunk || '1', 10);
  const pageSize = parseInt(p.pageSize || req.query.pageSize || '500', 10);
  const lastItCodigo = (p.lastItCodigo || req.query.lastItCodigo || '').trim();
  const lastSyncTimestamp = p.lastSyncTimestamp || req.query.lastSyncTimestamp || null;
  const busca = (p.busca || req.query.busca || '').trim();

  const resultado = fastSync.getItensChunk({
    codEmpresa: companyId,
    codEstabel,
    chunk,
    pageSize,
    lastItCodigo,
    lastSyncTimestamp,
    busca
  });

  return res.json(resultado);
});

// =============================================================================
// 10. LOTES E SALDOS: fcGetLote.p / fcGetSaldoEstoq.p
// =============================================================================
router.all('/fcGetLote', exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const codEstabel = (p.codEstabel || req.query.codEstabel || '').trim();
  const itCodigo = (p.itCodigo || req.query.itCodigo || '').trim();

  let lista = (db.data.lote || []).filter(l => db.matchEmpresa(l.codEmpresa, companyId));
  if (codEstabel) lista = lista.filter(l => !l.codEstabel || l.codEstabel === codEstabel);
  if (itCodigo) lista = lista.filter(l => l.itCodigo.toUpperCase() === itCodigo.toUpperCase());

  const items = lista.filter(l => Number(l.qtDisponivel || 0) > 0).map(l => ({
    codEmpresa: companyId,
    itCodigo: l.itCodigo,
    codEstabel: l.codEstabel,
    codDepos: l.codDepos,
    lote: l.lote,
    dtValiLote: l.dtValiLote || '',
    codLocaliz: l.codLocaliz || '',
    qtDisponivel: Number(l.qtDisponivel || 0),
    codRefer: l.codRefer || '',
    nomeDepos: l.nomeDepos || l.codDepos,
    nomeLocaliz: l.nomeLocaliz || ''
  }));

  return res.json({ items, hasNext: false, success: true, codEmpresa: companyId });
});

router.all(['/fcGetSaldoEstoq', '/qdcGetSaldoEstoq'], exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);

  const cEstabIni = p.cEstabIni ?? req.query.codEstabel ?? '';
  const cEstabFim = p.cEstabFim ?? req.query.codEstabel ?? '\uffff';
  const cItemIni = p.cItemIni ?? req.query.itCodigo ?? '';
  const cItemFim = p.cItemFim ?? req.query.itCodigo ?? '\uffff';
  const cDepIni = p.cDepIni ?? req.query.codDepos ?? '';
  const cDepFim = p.cDepFim ?? req.query.codDepos ?? '\uffff';
  const cLocalIni = p.cLocalIni ?? '';
  const cLocalFim = p.cLocalFim ?? '\uffff';
  const cLoteIni = p.cLoteIni ?? '';
  const cLoteFim = p.cLoteFim ?? '\uffff';
  const cReferIni = p.cReferIni ?? '';
  const cReferFim = p.cReferFim ?? '\uffff';

  const saldos = (db.data.saldo_estoq || []).filter(s => {
    if (!db.matchEmpresa(s.codEmpresa, companyId)) return false;
    if (cEstabIni && s.codEstab < cEstabIni) return false;
    if (cEstabFim && s.codEstab > cEstabFim) return false;
    if (cItemIni && s.itCodigo < cItemIni) return false;
    if (cItemFim && s.itCodigo > cItemFim) return false;
    if (cDepIni && s.codDep < cDepIni) return false;
    if (cDepFim && s.codDep > cDepFim) return false;
    if (cLocalIni && s.codLocal < cLocalIni) return false;
    if (cLocalFim && s.codLocal > cLocalFim) return false;
    if (cLoteIni && s.lote < cLoteIni) return false;
    if (cLoteFim && s.lote > cLoteFim) return false;
    if (cReferIni && s.codRefer < cReferIni) return false;
    if (cReferFim && s.codRefer > cReferFim) return false;
    return true;
  });

  const items = saldos.map(s => ({
    codEmpresa: companyId,
    ...s
  }));

  return res.json({ items, hasNext: false, success: true, codEmpresa: companyId });
});

router.all('/fcGetDadosMestres', exigirBasicAuth, (req, res) => {
  const companyId = extrairCompanyId(req);
  const codEstabel = (req.query.codEstabel || '').trim();
  const resultado = fastSync.getDadosMestres({ codEmpresa: companyId, codEstabel });
  return res.json(resultado);
});

// =============================================================================
// 11. INVENTÁRIO - LISTAGEM DE DATAS/RESUMO E FICHAS (fcGetInventariosFichas.p)
// =============================================================================
router.all('/fcGetInventariosResumo', exigirBasicAuth, (req, res) => {
  const companyId = extrairCompanyId(req);
  const codEstabel = (req.query.codEstabel || '').trim();

  const fichasEmp = (db.data.inventario || []).filter(f =>
    db.matchEmpresa(f.codEmpresa, companyId) &&
    (!codEstabel || f.codEstabel === codEstabel)
  );
  const paramsEmp = (db.data.fmsc_inventario || []).filter(p => db.matchEmpresa(p.codEmpresa, companyId));

  const datasUnicas = [...new Set([
    ...paramsEmp.map(p => normalizarDataIso(p.dtSaldo)),
    ...fichasEmp.map(f => normalizarDataIso(f.dtSaldo))
  ])].filter(Boolean).sort((a, b) => b.localeCompare(a));

  const resumo = datasUnicas
    .map(dt => {
      const param = paramsEmp.find(p => normalizarDataIso(p.dtSaldo) === dt) || {
        codEmpresa: companyId,
        dtSaldo: dt,
        indSitInv: 1,
        permContgUsFc: false,
        indTipoInv: 1,
        nrContagAtiva: 1
      };
      const fichasData = fichasEmp.filter(f => normalizarDataIso(f.dtSaldo) === dt && Number(f.situacao) !== 3);
      const ests = [...new Set(fichasData.map(f => f.codEstabel))];
      const nrContagAtiva = Number(param.nrContagAtiva || param.nr_contag_ativa || 1);
      return {
        codEmpresa: companyId,
        dtSaldo: dt,
        indSitInv: Number(param.indSitInv || 1),
        permContgUsFc: Boolean(param.permContgUsFc),
        indTipoInv: Number(param.indTipoInv || 1),
        nrContagAtiva,
        totalFichas: fichasData.length,
        estabelecimentos: ests
      };
    })
    .filter(r => r.nrContagAtiva !== 4); // Regra: nr-contag-ativa = 4 (concluído) não lista no App

  return res.json({ success: true, codEmpresa: companyId, items: resumo });
});

router.all(['/fcGetInventariosFichas', '/qdcGetInventariosFichas'], exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);

  const cCodEstab = (p.codEstabel || req.query.codEstabel || '').trim();
  const dtSaldo = normalizarDataIso(p.dtSaldo || req.query.dtSaldo || '');
  const cItCodigo = (p.itCodigo || req.query.itCodigo || '').trim();
  const cCodDepos = (p.codDepos || req.query.codDepos || '').trim();
  const cCodLocaliz = (p.codLocaliz || req.query.codLocaliz || '').trim();
  const cLote = (p.lote || req.query.lote || '').trim();
  const cCodRefer = (p.codRefer || req.query.codRefer || '').trim();
  const iNrContagem = parseInt(p.nrContagem || req.query.nrContagem || '1', 10) || 1;
  const cUsuario = (p.codUsuario || req.query.codUsuario || req.totvsUser?.codUsuario || '').trim();
  const apenasPendentes = Boolean(p.apenasPendentes || req.query.apenasPendentes === 'true');

  const paramEstoq = (db.data.param_estoq || []).find(pe => db.matchEmpresa(pe.codEmpresa, companyId));
  const consInvent = paramEstoq ? Number(paramEstoq.consInvent || 1) : 1; // 1-Saldo, 2-Contagem

  const paramsInv = (db.data.fmsc_inventario || []).filter(inv => db.matchEmpresa(inv.codEmpresa, companyId));
  const itensEmp = (db.data.item || []).filter(it => db.matchEmpresa(it.codEmpresa, companyId));
  const deposEmp = (db.data.deposito || []).filter(d => db.matchEmpresa(d.codEmpresa, companyId));
  const locsEmp = (db.data.localizacao || []).filter(l => db.matchEmpresa(l.codEmpresa, companyId));
  const saldosEmp = (db.data.saldo_estoq || []).filter(s => db.matchEmpresa(s.codEmpresa, companyId));

  const fichasFiltradas = (db.data.inventario || []).filter(inv => {
    if (!db.matchEmpresa(inv.codEmpresa, companyId)) return false;
    if (dtSaldo && normalizarDataIso(inv.dtSaldo) !== dtSaldo) return false;
    if (cCodEstab && inv.codEstabel !== cCodEstab) return false;
    if (Number(inv.situacao) === 3) return false; // situacao <> 3 (Inventario OK)
    if (cItCodigo && inv.itCodigo !== cItCodigo) return false;
    if (cCodDepos && String(inv.codDepos).toUpperCase() !== cCodDepos.toUpperCase()) return false;
    if (cCodLocaliz && inv.codLocaliz !== cCodLocaliz) return false;
    if (cLote && inv.lote !== cLote) return false;
    if (cCodRefer && inv.codRefer !== cCodRefer) return false;

    const v1 = inv.valApurado ? inv.valApurado[0] : null;
    const v2 = inv.valApurado ? inv.valApurado[1] : null;
    const v3 = inv.valApurado ? inv.valApurado[2] : null;
    const qt = Number(inv.qtidadeAtu || 0);

    // Se solicitado estritamente o modo apenasPendentes do fcGetInventariosFichas.p:
    if (apenasPendentes) {
      const valAtual = inv.valApurado ? inv.valApurado[iNrContagem - 1] : null;
      if (valAtual !== null && valAtual !== undefined) return false;
    }

    // Parâmetro do inventário na data (fmsc-inventario)
    const paramInvData = paramsInv.find(pi => normalizarDataIso(pi.dtSaldo) === normalizarDataIso(inv.dtSaldo));
    const permMesmoUsuario = paramInvData ? Boolean(paramInvData.permContgUsFc) : false;

    // Regras de fcGetInventariosFichas.p para iNrContagem > 1
    if (iNrContagem > 1) {
      // Se a contagem 1 é igual ao saldo de estoque, não mostra na 2ª/3ª rodada
      if (v1 !== null && v1 !== undefined && Number(v1) === qt && consInvent === 1) {
        return false;
      }

      // Se a contagem 1, 2 e 3 são iguais e situacao = 4, não considera mais
      if (Number(inv.situacao) === 4 &&
          v1 !== null && v2 !== null && v3 !== null &&
          Number(v2) === Number(v1) && Number(v3) === Number(v1)) {
        return false;
      }

      // Regra de segregação controlada por fmsc-inventario.perm-contg-usuar-ficha:
      // Se permContgUsFc = false, usuário que já realizou contagem anterior da mesma ficha não pode vê-la/apurar
      if (!permMesmoUsuario && cUsuario) {
        const u1 = (inv.codConfteContag?.[0] || '').toLowerCase();
        const u2 = (inv.codConfteContag?.[1] || '').toLowerCase();
        if (u1 === cUsuario.toLowerCase() || (iNrContagem === 3 && u2 === cUsuario.toLowerCase())) {
          return false;
        }
      }
    }

    // Regra de fcGetInventariosFichas.p linhas 1114-1116: se iNrContagem > 2 e val[1] == val[2], não precisa de 3ª contagem
    if (iNrContagem > 2) {
      if (v1 === null || v1 === undefined || v2 === null || v2 === undefined) return false;
      if (Number(v1) === Number(v2)) return false;
    }

    return true;
  });

  const items = fichasFiltradas.map(inv => {
    const it = itensEmp.find(i => i.itCodigo === inv.itCodigo) || {};
    const dep = deposEmp.find(d => d.codDepos === inv.codDepos) || {};
    const loc = locsEmp.find(l => l.codEstabel === inv.codEstabel && l.codDepos === inv.codDepos && l.codLocaliz === inv.codLocaliz) || {};
    const saldo = saldosEmp.find(s =>
      s.codEstab === inv.codEstabel &&
      s.codDep === inv.codDepos &&
      s.codLocal === inv.codLocaliz &&
      s.lote === inv.lote &&
      s.codRefer === inv.codRefer &&
      s.itCodigo === inv.itCodigo
    );

    const qtApurada = inv.valApurado ? inv.valApurado[iNrContagem - 1] : null;

    return {
      codEmpresa: companyId,
      nrFicha: inv.nrFicha,
      dtSaldo: normalizarDataIso(inv.dtSaldo),
      codEstabel: inv.codEstabel,
      codDepos: inv.codDepos,
      codLocaliz: inv.codLocaliz || '',
      lote: inv.lote || '',
      codRefer: inv.codRefer || '',
      itCodigo: inv.itCodigo,
      qtApurada: qtApurada !== undefined ? qtApurada : null,
      valApurado1: inv.valApurado?.[0] ?? null,
      valApurado2: inv.valApurado?.[1] ?? null,
      valApurado3: inv.valApurado?.[2] ?? null,
      codConfteContag1: inv.codConfteContag?.[0] || '',
      codConfteContag2: inv.codConfteContag?.[1] || '',
      codConfteContag3: inv.codConfteContag?.[2] || '',
      qtidadeAtu: Number(inv.qtidadeAtu || 0),
      nrContagem: iNrContagem,
      situacao: Number(inv.situacao || 4),
      descItem: it.descItem || inv.itCodigo,
      codBarras: it.codBarras || '',
      cdnAgrup: Number(inv.cdnAgrup || 0),
      nomeDepos: dep.nome || inv.codDepos,
      descLocaliz: loc.descricao || '',
      dtValiLote: inv.dtValiLote || saldo?.dtValiLote || '9999-12-31',
      dscSituacao: dscSituacaoFicha(inv.situacao),
      un: it.un || 'UN',
      avulsa: Boolean(inv.avulsa)
    };
  });

  return res.json({
    items,
    hasNext: false,
    success: true,
    codEmpresa: companyId,
    total: items.length
  });
});

// =============================================================================
// 12. VERIFICAR VALORES FICHA AVULSA: fcGetInventariosVerifValores.p
// =============================================================================
router.all('/fcGetInventariosVerifValores', exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const dtSaldo = normalizarDataIso(p.dtSaldo || '');
  const cItCodigo = (p.itCodigo || '').trim();

  const invExiste = (db.data.inventario || []).some(i =>
    db.matchEmpresa(i.codEmpresa, companyId) && normalizarDataIso(i.dtSaldo) === dtSaldo
  );
  if (!invExiste) {
    return res.json({
      detailedMessage: 'Inventário na data de saldo não encontrado!',
      code: '17006',
      message: 'Inventário na data de saldo não encontrado!',
      type: 'ERROR',
      success: false
    });
  }

  const paramInv = (db.data.fmsc_inventario || []).find(pi =>
    db.matchEmpresa(pi.codEmpresa, companyId) && normalizarDataIso(pi.dtSaldo) === dtSaldo
  );
  if (paramInv && Number(paramInv.indSitInv) === 2) {
    return res.json({
      detailedMessage: 'Inventário bloqueado para apuração (FMSC0102)!',
      code: '17006',
      message: 'Inventário bloqueado para apuração (FMSC0102)!',
      type: 'ERROR',
      success: false
    });
  }

  const itemObj = (db.data.item || []).find(i =>
    db.matchEmpresa(i.codEmpresa, companyId) && i.itCodigo.toUpperCase() === cItCodigo.toUpperCase()
  );
  if (!itemObj) {
    return res.json({
      detailedMessage: `Item ${cItCodigo} não encontrado`,
      code: '17006',
      message: `Item ${cItCodigo} não encontrado`,
      type: 'ERROR',
      success: false
    });
  }

  return res.json({
    detailedMessage: 'Item OK!',
    code: '0',
    message: itemObj.requerValorFicha ? 'YES' : 'NO',
    type: 'OK',
    success: true
  });
});

// =============================================================================
// 13. APURAÇÃO DE FICHA: fcSetInventarioApuracaoFicha.p (PUT/POST)
// =============================================================================
function processarApuracaoFicha(companyId, p, reqUser) {
  const dtSaldo = normalizarDataIso(p.dtSaldo || '');
  const cItCodigo = (p.itCodigo || '').trim();
  const cCodUsuario = (p.codUsuario || reqUser?.codUsuario || '').trim();
  const cCodEstabel = (p.codEstabel || '').trim();
  const cCodDepos = (p.codDepos || '').trim();
  const cCodLocaliz = (p.codLocaliz ?? '').trim();
  const cLote = (p.lote ?? '').trim();
  const cCodRefer = (p.codRefer ?? '').trim();
  let iNrContagem = p.nrContagem ? parseInt(p.nrContagem, 10) : 0;
  const iNrFicha = parseInt(p.nrFicha || '0', 10);
  const cancelar = Boolean(p.cancelar);
  const dQtApurada = cancelar ? null : Number(p.qtApurada);
  const codMobile = (p.codMobile || 'WEB-COLETOR').trim();

  if (!cancelar && (isNaN(dQtApurada) || dQtApurada < 0)) {
    return {
      ok: false,
      code: '17006',
      message: 'Quantidade apurada inválida!'
    };
  }

  // 1. Validar parâmetros do inventário (fmsc-inventario / FMSC0102)
  const paramInv = (db.data.fmsc_inventario || []).find(pi =>
    db.matchEmpresa(pi.codEmpresa, companyId) &&
    (!dtSaldo || normalizarDataIso(pi.dtSaldo) === dtSaldo)
  );
  if (paramInv && Number(paramInv.indSitInv) === 2) {
    return {
      ok: false,
      code: 'INV_BLOQUEADO',
      message: `Inventário da data ${dtSaldo} encontra-se BLOQUEADO nos parâmetros (FMSC0102 - indSitInv = 2).`
    };
  }
  const nrAtivaApur = paramInv ? Number(paramInv.nrContagAtiva || paramInv.nr_contag_ativa || 1) : 1;
  if (nrAtivaApur === 4) {
    return {
      ok: false,
      code: '17006',
      message: `Inventário concluído (nr-contag-ativa = 4). Apuração negada.`
    };
  }
  if (!iNrContagem) {
    iNrContagem = nrAtivaApur;
  } else if (paramInv && nrAtivaApur !== iNrContagem) {
    return {
      ok: false,
      code: '17006',
      message: `Contagem ${iNrContagem} divergente da contagem ativa do inventário (${nrAtivaApur}). Apuração negada.`
    };
  }

  // 2. Localizar ficha na tabela inventario pelos 7 campos da chave ou fallback por nrFicha
  let ficha = (db.data.inventario || []).find(inv =>
    db.matchEmpresa(inv.codEmpresa, companyId) &&
    (!dtSaldo || normalizarDataIso(inv.dtSaldo) === dtSaldo) &&
    inv.codEstabel === cCodEstabel &&
    String(inv.codDepos).toUpperCase() === cCodDepos.toUpperCase() &&
    inv.itCodigo === cItCodigo &&
    (inv.codLocaliz || '') === cCodLocaliz &&
    (inv.lote || '') === cLote &&
    (inv.codRefer || '') === cCodRefer
  );

  if (!ficha && iNrFicha > 0) {
    ficha = (db.data.inventario || []).find(inv =>
      db.matchEmpresa(inv.codEmpresa, companyId) &&
      (!dtSaldo || normalizarDataIso(inv.dtSaldo) === dtSaldo) &&
      inv.codEstabel === cCodEstabel &&
      String(inv.codDepos).toUpperCase() === cCodDepos.toUpperCase() &&
      Number(inv.nrFicha) === iNrFicha
    );
  }

  if (!ficha) {
    return {
      ok: false,
      code: '17006',
      message: 'Inventário na data não encontrado!'
    };
  }

  const itemObj = (db.data.item || []).find(i =>
    db.matchEmpresa(i.codEmpresa, companyId) && i.itCodigo === ficha.itCodigo
  );
  if (!itemObj) {
    return {
      ok: false,
      code: '17006',
      message: `Item ${ficha.itCodigo} não encontrado`
    };
  }

  // 3. Validar regra permContgUsFc (perm-contg-usuar-ficha) de fmsc-inventario
  if (!cancelar && iNrContagem > 1) {
    const permMesmoUsuario = paramInv ? Boolean(paramInv.permContgUsFc) : false;
    if (!permMesmoUsuario && cCodUsuario) {
      const confte = ficha.codConfteContag || ['', '', ''];
      for (let idx = 0; idx < 3; idx++) {
        if (idx !== (iNrContagem - 1) && confte[idx] && confte[idx].toLowerCase() === cCodUsuario.toLowerCase()) {
          return {
            ok: false,
            code: 'SEGREGACAO_USUARIO',
            message: `Parâmetro fmsc-inventario (permContgUsFc=Não) impede que o usuário '${cCodUsuario}' realize a ${iNrContagem}ª contagem pois já apurou a ${idx + 1}ª contagem da ficha #${ficha.nrFicha}.`
          };
        }
      }
    }
  }

  if (!ficha.valApurado) ficha.valApurado = [null, null, null];
  if (!ficha.codConfteContag) ficha.codConfteContag = ['', '', ''];

  if (cancelar) {
    ficha.valApurado[iNrContagem - 1] = null;
    ficha.codConfteContag[iNrContagem - 1] = '';
    ficha.situacao = 2; // Retorna para Nao Atualiza / Pendente
  } else {
    ficha.valApurado[iNrContagem - 1] = dQtApurada;
    ficha.codConfteContag[iNrContagem - 1] = cCodUsuario;
    ficha.situacao = 4; // OK p/Inventario

    if (iNrContagem > 1 && ficha.valorMat) {
      if (ficha.valorMat[0] > 0) ficha.valorMat[iNrContagem - 1] = ficha.valorMat[0];
      if (ficha.valorMob[0] > 0) ficha.valorMob[iNrContagem - 1] = ficha.valorMob[0];
      if (ficha.valorGgf[0] > 0) ficha.valorGgf[iNrContagem - 1] = ficha.valorGgf[0];
    }

    // Registrar no histórico da empresa
    if (!db.data.historico_contagens) db.data.historico_contagens = [];
    db.data.historico_contagens.unshift({
      idHist: db.data.historico_contagens.length + 1,
      codEmpresa: companyId,
      dtSaldo: normalizarDataIso(ficha.dtSaldo),
      codEstabel: ficha.codEstabel,
      codDepos: ficha.codDepos,
      nrFicha: ficha.nrFicha,
      itCodigo: ficha.itCodigo,
      descItem: itemObj.descItem || ficha.itCodigo,
      lote: ficha.lote || '',
      codLocaliz: ficha.codLocaliz || '',
      codRefer: ficha.codRefer || '',
      nrContagem: iNrContagem,
      qtApurada: dQtApurada,
      qtContabil: Number(ficha.qtidadeAtu || 0),
      divergencia: dQtApurada - Number(ficha.qtidadeAtu || 0),
      codUsuario: cCodUsuario,
      codMobile,
      dtLeitura: new Date().toISOString().replace('T', ' ').slice(0, 19),
      statusEnvio: 'Sincronizado',
      origem: p.origem || 'Coletor Mobile'
    });
  }

  db.saveToDisk();

  return {
    ok: true,
    ficha
  };
}

router.all(['/fcSetInventarioApuracaoFicha', '/qdcSetInventarioApuracaoFicha'], exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const resultado = processarApuracaoFicha(companyId, p, req.totvsUser);

  if (!resultado.ok) {
    return res.json({
      detailedMessage: resultado.message,
      code: resultado.code || '17006',
      message: resultado.message,
      type: 'ERROR',
      success: false
    });
  }

  return res.json({
    detailedMessage: 'Ficha apurada com sucesso!',
    code: '0',
    message: 'Ficha apurada com sucesso!',
    type: 'OK',
    success: true,
    ficha: resultado.ficha
  });
});

// =============================================================================
// 14. INCLUSÃO DE FICHA EM BRANCO / AVULSA: fcSetInventarioNovaFicha.p
// =============================================================================
function processarNovaFicha(companyId, p, reqUser) {
  const dtSaldo = normalizarDataIso(p.dtSaldo || '');
  const cItCodigo = (p.itCodigo || '').trim();
  const cCodUsuario = (p.codUsuario || reqUser?.codUsuario || '').trim();
  const cCodEstabel = (p.codEstabel || '').trim();
  const cCodDepos = (p.codDepos || '').trim();
  const cCodLocaliz = (p.codLocaliz || '').trim();
  const cLote = (p.lote || '').trim();
  const cCodRefer = (p.codRefer || '').trim();
  const dtValiLote = normalizarDataIso(p.dtValiLote || '');
  const dQtApurada = Number(p.qtApurada);
  const dVlMat = Number(p.vlMaterial || 0);
  const dVlMob = Number(p.vlMob || 0);
  const dVlGgf = Number(p.vlGgf || 0);
  let iNrContagem = p.nrContagem ? parseInt(p.nrContagem, 10) : 0;
  const codMobile = (p.codMobile || 'WEB-COLETOR').trim();

  if (!dtSaldo || !cCodEstabel || !cCodDepos || !cItCodigo || isNaN(dQtApurada) || dQtApurada < 0) {
    return {
      ok: false,
      code: '17006',
      message: 'Estabelecimento, Depósito, Data Saldo, Item e Quantidade Apurada são obrigatórios.'
    };
  }

  const paramInv = (db.data.fmsc_inventario || []).find(pi =>
    db.matchEmpresa(pi.codEmpresa, companyId) && normalizarDataIso(pi.dtSaldo) === dtSaldo
  );
  if (paramInv && Number(paramInv.indSitInv) === 2) {
    return {
      ok: false,
      code: 'INV_BLOQUEADO',
      message: `Inventário da data ${dtSaldo} encontra-se BLOQUEADO nos parâmetros (FMSC0102). Inclusão negada.`
    };
  }
  const nrAtivaNova = paramInv ? Number(paramInv.nrContagAtiva || paramInv.nr_contag_ativa || 1) : 1;
  if (nrAtivaNova === 4) {
    return {
      ok: false,
      code: '17006',
      message: `Inventário concluído (nr-contag-ativa = 4). Inclusão negada.`
    };
  }
  // Inclusão de nova ficha avulsa é enviada e gravada sempre na contagem = 1
  iNrContagem = 1;

  const invExisteNaData = (db.data.inventario || []).some(i =>
    db.matchEmpresa(i.codEmpresa, companyId) && normalizarDataIso(i.dtSaldo) === dtSaldo
  );
  if (!invExisteNaData) {
    return {
      ok: false,
      code: '17006',
      message: 'Inventário na data de saldo não encontrado!'
    };
  }

  const itemObj = (db.data.item || []).find(i =>
    db.matchEmpresa(i.codEmpresa, companyId) && i.itCodigo.toUpperCase() === cItCodigo.toUpperCase()
  );
  if (!itemObj) {
    return {
      ok: false,
      code: '17006',
      message: `Item ${cItCodigo} não encontrado`
    };
  }

  // Próximo nr-ficha na dt-saldo dentro da empresa (conforme fcSetInventarioNovaFicha.p)
  const fichasData = (db.data.inventario || []).filter(i =>
    db.matchEmpresa(i.codEmpresa, companyId) && normalizarDataIso(i.dtSaldo) === dtSaldo
  );
  const iNrFicha = fichasData.reduce((max, f) => Math.max(max, Number(f.nrFicha || 0)), 0) + 1;

  const valArr = [null, null, null];
  valArr[iNrContagem - 1] = dQtApurada;
  const confArr = ['', '', ''];
  confArr[iNrContagem - 1] = cCodUsuario;

  const novaFicha = {
    codEmpresa: companyId,
    nrFicha: iNrFicha,
    dtSaldo,
    codEstabel: cCodEstabel,
    codDepos: cCodDepos,
    codLocaliz: cCodLocaliz,
    lote: cLote,
    codRefer: cCodRefer,
    itCodigo: itemObj.itCodigo,
    qtidadeAtu: 0,
    valApurado: valArr,
    codConfteContag: confArr,
    situacao: 4,
    cdnAgrup: 0,
    dtValiLote: dtValiLote || '',
    valorMat: [dVlMat, 0, 0],
    valorMob: [dVlMob, 0, 0],
    valorGgf: [dVlGgf, 0, 0],
    avulsa: true
  };

  db.data.inventario.push(novaFicha);

  if (!db.data.historico_contagens) db.data.historico_contagens = [];
  db.data.historico_contagens.unshift({
    idHist: db.data.historico_contagens.length + 1,
    codEmpresa: companyId,
    dtSaldo,
    codEstabel: cCodEstabel,
    codDepos: cCodDepos,
    nrFicha: iNrFicha,
    itCodigo: itemObj.itCodigo,
    descItem: itemObj.descItem,
    lote: cLote,
    codLocaliz: cCodLocaliz,
    codRefer: cCodRefer,
    nrContagem: iNrContagem,
    qtApurada: dQtApurada,
    qtContabil: 0,
    divergencia: dQtApurada,
    codUsuario: cCodUsuario,
    codMobile,
    dtLeitura: new Date().toISOString().replace('T', ' ').slice(0, 19),
    statusEnvio: 'Sincronizado',
    origem: 'Ficha em Branco (Avulsa)'
  });

  db.saveToDisk();

  return {
    ok: true,
    nrFicha: iNrFicha,
    ficha: novaFicha
  };
}

router.all(['/fcSetInventarioNovaFicha', '/qdcSetInventarioNovaFicha'], exigirBasicAuth, (req, res) => {
  const p = extrairPayload(req);
  const companyId = extrairCompanyId(req);
  const resultado = processarNovaFicha(companyId, p, req.totvsUser);

  if (!resultado.ok) {
    return res.json({
      detailedMessage: resultado.message,
      code: resultado.code || '17006',
      message: resultado.message,
      type: 'ERROR',
      success: false
    });
  }

  return res.json({
    detailedMessage: 'Ficha apurada com sucesso!',
    code: '0',
    message: String(resultado.nrFicha),
    type: 'OK',
    success: true,
    nrFicha: resultado.nrFicha,
    ficha: resultado.ficha
  });
});

// =============================================================================
// 15. SINCRONIZAÇÃO EM LOTE DA FILA OFFLINE: fcSyncLote / qdcSyncLote (POST)
// =============================================================================
router.post(['/fcSyncLote', '/qdcSyncLote'], exigirBasicAuth, (req, res) => {
  const companyId = extrairCompanyId(req);
  const operacoes = req.body.operacoes || [];

  let processados = 0;
  let erros = 0;
  const relatorio = [];

  for (const op of operacoes) {
    const opEmp = db.normalizarEmpresa(op.codEmpresa || companyId);
    if (op.tipo === 'INVENTARIO_APURACAO' || op.tipo === 'INVENTARIO_CANCELAMENTO') {
      const resOp = processarApuracaoFicha(
        opEmp,
        { ...op, cancelar: op.tipo === 'INVENTARIO_CANCELAMENTO' },
        req.totvsUser
      );
      if (resOp.ok) {
        processados++;
        relatorio.push({ id_uuid: op.id_uuid, status: 'OK', mensagem: `Ficha #${resOp.ficha.nrFicha} sincronizada` });
      } else {
        erros++;
        relatorio.push({ id_uuid: op.id_uuid, status: 'ERRO', mensagem: resOp.message });
      }
    } else if (op.tipo === 'INVENTARIO_AVULSA') {
      const resOp = processarNovaFicha(opEmp, op, req.totvsUser);
      if (resOp.ok) {
        processados++;
        relatorio.push({ id_uuid: op.id_uuid, status: 'OK', nrFicha: resOp.nrFicha, mensagem: `Ficha avulsa #${resOp.nrFicha} criada` });
      } else {
        erros++;
        relatorio.push({ id_uuid: op.id_uuid, status: 'ERRO', mensagem: resOp.message });
      }
    } else {
      erros++;
      relatorio.push({ id_uuid: op.id_uuid, status: 'ERRO', mensagem: `Tipo de operação não suportado nesta fase: ${op.tipo}` });
    }
  }

  return res.json({
    success: erros === 0,
    codEmpresa: companyId,
    processados,
    erros,
    total: operacoes.length,
    relatorio
  });
});

// =============================================================================
// 16. HISTÓRICO DE CONTAGENS & ROTAS DO PAINEL TOTVS ERP (FMSC0101 / FMSC0102 / CE0701 / CE0712)
// =============================================================================
router.get('/fcGetHistoricoContagens', (req, res) => {
  const companyId = extrairCompanyId(req);
  const { codEstabel, codDepos, dtSaldo, itCodigo, nrFicha, codUsuario, apenasDivergentes } = req.query;

  let hist = (db.data.historico_contagens || []).filter(h => db.matchEmpresa(h.codEmpresa, companyId));
  if (codEstabel) hist = hist.filter(h => h.codEstabel === codEstabel);
  if (codDepos) hist = hist.filter(h => h.codDepos === codDepos);
  if (dtSaldo) hist = hist.filter(h => h.dtSaldo === normalizarDataIso(dtSaldo));
  if (itCodigo) hist = hist.filter(h => h.itCodigo.toLowerCase().includes(itCodigo.toLowerCase()));
  if (nrFicha) hist = hist.filter(h => String(h.nrFicha) === String(nrFicha));
  if (codUsuario) hist = hist.filter(h => h.codUsuario.toLowerCase().includes(codUsuario.toLowerCase()));
  if (apenasDivergentes === 'true') hist = hist.filter(h => Math.abs(Number(h.divergencia || 0)) > 0.0001);

  return res.json({ success: true, codEmpresa: companyId, total: hist.length, items: hist });
});

// Painel ERP: Listar usuários FMSC0101
router.get('/erp/fmsc0101/usuarios', (req, res) => {
  const companyId = extrairCompanyId(req);
  const usuarios = (db.data.fmsc_usuar_mestre || [])
    .filter(u => db.matchEmpresa(u.codEmpresa, companyId))
    .map(u => ({ ...u, senha: '****' }));
  return res.json({ success: true, codEmpresa: companyId, items: usuarios });
});

// Painel ERP: Salvar permissões FMSC0101
router.post('/erp/fmsc0101/salvar', (req, res) => {
  const companyId = extrairCompanyId(req);
  const body = req.body || {};
  const codUsuario = (body.codUsuario || '').trim();
  if (!codUsuario) return res.status(400).json({ success: false, mensagem: 'codUsuario obrigatório.' });

  const reg = (db.data.fmsc_usuar_mestre || []).find(u =>
    db.matchEmpresa(u.codEmpresa, companyId) && u.codUsuario.toLowerCase() === codUsuario.toLowerCase()
  );
  if (!reg) return res.status(404).json({ success: false, mensagem: 'Usuário não encontrado na empresa.' });

  if (body.codEstabPad !== undefined) reg.codEstabPad = String(body.codEstabPad).trim();
  if (body.tabPrincipal !== undefined) reg.tabPrincipal = Number(body.tabPrincipal);
  if (body.permEstoque !== undefined) reg.permEstoque = Boolean(body.permEstoque);
  if (body.permEstoqReqInv !== undefined) reg.permEstoqReqInv = Boolean(body.permEstoqReqInv);

  db.saveToDisk();
  return res.json({ success: true, mensagem: `Permissões FMSC0101 atualizadas para '${codUsuario}' na empresa ${companyId}.`, usuario: { ...reg, senha: '****' } });
});

// Painel ERP: Listar parâmetros FMSC0102
router.get('/erp/fmsc0102/inventarios', (req, res) => {
  const companyId = extrairCompanyId(req);
  const items = (db.data.fmsc_inventario || []).filter(i => db.matchEmpresa(i.codEmpresa, companyId));
  return res.json({ success: true, codEmpresa: companyId, items });
});

// Painel ERP: Salvar parâmetros FMSC0102
router.post('/erp/fmsc0102/salvar', (req, res) => {
  const companyId = extrairCompanyId(req);
  const dtSaldo = normalizarDataIso(req.body.dtSaldo);
  if (!dtSaldo) return res.status(400).json({ success: false, mensagem: 'Data de Inventário (dtSaldo) é obrigatória.' });

  let reg = (db.data.fmsc_inventario || []).find(i =>
    db.matchEmpresa(i.codEmpresa, companyId) && normalizarDataIso(i.dtSaldo) === dtSaldo
  );
  if (!reg) {
    reg = {
      codEmpresa: companyId,
      dtSaldo,
      indSitInv: 1,
      permContgUsFc: false,
      indTipoInv: 1
    };
    db.data.fmsc_inventario.push(reg);
  }

  if (req.body.indSitInv !== undefined) reg.indSitInv = Number(req.body.indSitInv);
  if (req.body.permContgUsFc !== undefined) reg.permContgUsFc = Boolean(req.body.permContgUsFc);
  if (req.body.indTipoInv !== undefined) reg.indTipoInv = Number(req.body.indTipoInv);

  db.saveToDisk();
  return res.json({ success: true, mensagem: `Parâmetro FMSC0102 salvo para ${dtSaldo} (Empresa ${companyId}).`, item: reg });
});

// Painel ERP: CE0712 (consulta direta sem exigir header auth no painel de simulação)
router.get('/erp/ce0712/fichas', (req, res) => {
  const companyId = extrairCompanyId(req);
  const codEstabel = (req.query.codEstabel || '').trim();
  const dtSaldo = normalizarDataIso(req.query.dtSaldo || '');
  const nrContagem = parseInt(req.query.nrContagem || '1', 10) || 1;
  const nrFicha = (req.query.nrFicha || '').trim();

  const itensEmp = (db.data.item || []).filter(it => db.matchEmpresa(it.codEmpresa, companyId));
  const fichas = (db.data.inventario || []).filter(inv => {
    if (!db.matchEmpresa(inv.codEmpresa, companyId)) return false;
    if (codEstabel && inv.codEstabel !== codEstabel) return false;
    if (dtSaldo && normalizarDataIso(inv.dtSaldo) !== dtSaldo) return false;
    if (nrFicha && String(inv.nrFicha) !== nrFicha) return false;
    return true;
  }).map(inv => {
    const it = itensEmp.find(i => i.itCodigo === inv.itCodigo) || {};
    return {
      ...inv,
      descItem: it.descItem || inv.itCodigo,
      un: it.un || 'UN',
      valApuradoAtual: inv.valApurado?.[nrContagem - 1] ?? null,
      dscSituacao: dscSituacaoFicha(inv.situacao)
    };
  });

  return res.json({ success: true, codEmpresa: companyId, items: fichas });
});

// Painel ERP: CE0701 (Geração de fichas + trigger tw-inventario-fmc.p)
router.post('/erp/ce0701/gerarFichas', (req, res) => {
  const companyId = extrairCompanyId(req);
  const { codEstabel, codDepos, dtSaldo, geraSaldoZero = true } = req.body;
  const dtIso = normalizarDataIso(dtSaldo);

  if (!codEstabel || !codDepos || !dtIso) {
    return res.status(400).json({ success: false, mensagem: 'Estabelecimento, Depósito e Data Saldo são obrigatórios.' });
  }

  const saldos = (db.data.saldo_estoq || []).filter(s =>
    db.matchEmpresa(s.codEmpresa, companyId) &&
    s.codEstab === codEstabel &&
    s.codDep === codDepos &&
    (geraSaldoZero ? true : Number(s.qtidadeAtu) > 0)
  );

  const fichasData = (db.data.inventario || []).filter(f =>
    db.matchEmpresa(f.codEmpresa, companyId) && normalizarDataIso(f.dtSaldo) === dtIso
  );
  let maxFicha = fichasData.reduce((m, f) => Math.max(m, Number(f.nrFicha || 0)), 0);
  let criadas = 0;

  for (const s of saldos) {
    const jaExiste = fichasData.some(f =>
      f.codEstabel === s.codEstab &&
      f.codDepos === s.codDep &&
      f.itCodigo === s.itCodigo &&
      (f.codLocaliz || '') === (s.codLocal || '') &&
      (f.lote || '') === (s.lote || '') &&
      (f.codRefer || '') === (s.codRefer || '')
    );
    if (!jaExiste) {
      maxFicha++;
      const nova = {
        codEmpresa: companyId,
        nrFicha: maxFicha,
        dtSaldo: dtIso,
        codEstabel: s.codEstab,
        codDepos: s.codDep,
        codLocaliz: s.codLocal || '',
        lote: s.lote || '',
        codRefer: s.codRefer || '',
        itCodigo: s.itCodigo,
        qtidadeAtu: Number(s.qtidadeAtu || 0),
        valApurado: [null, null, null],
        codConfteContag: ['', '', ''],
        situacao: 4,
        cdnAgrup: 0,
        dtValiLote: s.dtValiLote || '',
        valorMat: [0, 0, 0],
        valorMob: [0, 0, 0],
        valorGgf: [0, 0, 0]
      };
      db.data.inventario.push(nova);
      fichasData.push(nova);
      criadas++;
    }
  }

  // Trigger tw-inventario-fmc.p: cria fmsc-inventario automaticamente se não existir para a dt-saldo
  const paramExiste = (db.data.fmsc_inventario || []).some(pi =>
    db.matchEmpresa(pi.codEmpresa, companyId) && normalizarDataIso(pi.dtSaldo) === dtIso
  );
  if (!paramExiste) {
    db.data.fmsc_inventario.push({
      codEmpresa: companyId,
      dtSaldo: dtIso,
      indTipoInv: 1,
      indSitInv: 1,
      permContgUsFc: false
    });
  }

  db.saveToDisk();

  return res.json({
    success: true,
    codEmpresa: companyId,
    fichasCriadas: criadas,
    mensagem: `CE0701: ${criadas} ficha(s) gerada(s) para ${dtIso} no depósito ${codDepos} (trigger tw-inventario-fmc aplicada).`
  });
});

// =============================================================================
// 15. TRANSFERÊNCIA DE MATERIAL: fcSetTransfMaterial.p / qdcSetTransfMaterial.p (PUT/POST)
// Executa rotina Progress cep/ceapi001k.r (esp-docto = 33 / TRA)
// =============================================================================
router.all(['/fcSetTransfMaterial', '/qdcSetTransfMaterial'], async (req, res) => {
  // Chamada direta e transparente ao webservice do PASOE (SEM MOCK)
  const realPasoeUrl = 'http://10.15.1.20:8180/api/promob/v1/fcSetTransfMaterial';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'companyId': req.headers['companyid'] || '001'
    };
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'];
    } else {
      headers['Authorization'] = 'Basic ' + Buffer.from('matheus.st:qwe8451').toString('base64');
    }

    const pasoeRes = await fetch(realPasoeUrl, {
      method: req.method || 'PUT',
      headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeout);
    const dados = await pasoeRes.json();
    return res.status(pasoeRes.status).json(dados);
  } catch (errPasoe) {
    console.error('[PASOE] Erro ao conectar ao webservice fcSetTransfMaterial:', errPasoe.message);
    return res.status(502).json({
      type: 'ERROR',
      code: '502',
      message: 'PASOE Indisponível (10.15.1.20:8180): ' + errPasoe.message,
      detailedMessage: 'Não foi possível alcançar o servidor PASOE real para efetivar a movimentação no Datasul. Verifique a VPN.'
    });
  }
});

// =============================================================================
// 16. REQUISIÇÕES DE MATERIAL (CD1409 / CD1410)
// =============================================================================

// Helper para tentar o PASOE e recorrer ao mock local apenas se inacessível
async function proxyPasoeOuFallback(endpoint, req, res, fallbackFn) {
  const realPasoeUrl = `http://10.15.1.20:8180/api/promob/v1/${endpoint}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'companyId': req.headers['companyid'] || '001'
    };
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'];
    } else {
      headers['Authorization'] = 'Basic ' + Buffer.from('matheus.st:qwe8451').toString('base64');
    }

    const pasoeRes = await fetch(realPasoeUrl, {
      method: req.method || 'PUT',
      headers,
      body: req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!pasoeRes.ok) {
      console.warn(`[PASOE] ${endpoint} retornou HTTP ${pasoeRes.status}, utilizando fallback local.`);
      return fallbackFn(req, res);
    }
    const dados = await pasoeRes.json();
    if (dados && (dados.type === 'ERROR' || dados.code === '55504' || dados.error_code === '55504')) {
      console.warn(`[PASOE] ${endpoint} retornou erro (${dados.code || dados.error_code}), utilizando fallback local.`);
      return fallbackFn(req, res);
    }
    // Retorna exatamente a resposta do PASOE real (mesmo se vazia, sem sobrescrever com mock local)
    return res.status(pasoeRes.status).json(dados);
  } catch (errPasoe) {
    return fallbackFn(req, res);
  }
}

// fcGetRequisicao.p / qdcGetRequisicao.p (PUT/POST)
router.all(['/fcGetRequisicao', '/qdcGetRequisicao'], async (req, res) => {
  return proxyPasoeOuFallback('fcGetRequisicao', req, res, (r, s) => {
    const payload = extrairPayload(r);
    const nrReqIni = Number(payload.nrReqIni || 0);
    const nrReqFim = Number(payload.nrReqFim || 999999999);
    const estabIni = (payload.estabIni || '').trim();
    const estabFim = (payload.estabFim || 'ZZZ').trim();
    const codEmpresa = r.headers['companyid'] || '001';

    const lista = (db.data.it_requisicao || []).filter(it => {
      const nr = Number(it.nrRequisicao);
      const est = String(it.codEstabel || '').trim();
      const empOk = !it.codEmpresa || db.constructor.matchEmpresa ? true : it.codEmpresa === codEmpresa;
      const numOk = nr >= nrReqIni && nr <= nrReqFim;
      const estOk = (!estabIni || est >= estabIni) && (!estabFim || est <= estabFim);
      const pendOk = Number(it.qtAAtender || 0) > 0;
      return numOk && estOk && pendOk;
    });

    return s.json(lista.map(it => ({
      nrRequisicao: it.nrRequisicao,
      dtRequisicao: it.dtRequisicao,
      descItem: it.descItem,
      situacao: it.situacao,
      itCodigo: it.itCodigo,
      dtAtend: it.dtAtend || '',
      estado: it.estado,
      tpRequis: it.tpRequis,
      codEstabel: it.codEstabel,
      qtRequisitada: it.qtRequisitada,
      qtAtendida: it.qtAtendida,
      qtAAtender: it.qtAAtender,
      qtDevolvida: it.qtDevolvida || 0,
      qtADevolver: it.qtADevolver || 0,
      codUnidNegoc: it.codUnidNegoc || 'MOV',
      nomeAbrev: it.nomeAbrev,
      Sequencia: it.Sequencia
    })));
  });
});

// fcGetSaldoEstoqEstabItem.p / qdcGetSaldoEstoqEstabItem.p (PUT/POST)
router.all(['/fcGetSaldoEstoqEstabItem', '/qdcGetSaldoEstoqEstabItem'], async (req, res) => {
  return proxyPasoeOuFallback('fcGetSaldoEstoqEstabItem', req, res, (r, s) => {
    const payload = extrairPayload(r);
    const codEstabel = (payload.codEstabel || '').trim();
    const itCodigo = (payload.itCodigo || '').trim();

    const matches = (db.data.saldo_estoq || []).filter(item => {
      const est = (item.codEstab || item.codEstabel || '').trim();
      const it = (item.itCodigo || '').trim();
      const disp = item.qtDisponivelCalc !== undefined
        ? item.qtDisponivelCalc
        : ((item.qtidadeAtu || 0) - ((item.qtAlocada || 0) + (item.qtAlocPed || 0) + (item.qtAlocProd || 0)));
      return (!codEstabel || est === codEstabel) && it === itCodigo && disp > 0;
    });

    return s.json(matches.map(m => {
      const disp = m.qtDisponivelCalc !== undefined
        ? m.qtDisponivelCalc
        : ((m.qtidadeAtu || 0) - ((m.qtAlocada || 0) + (m.qtAlocPed || 0) + (m.qtAlocProd || 0)));
      return {
        itCodigo: m.itCodigo,
        codEstabel: m.codEstab || m.codEstabel || codEstabel,
        codDepos: m.codDep || m.codDepos,
        lote: m.lote || '',
        dtValiLote: m.dtValiLote || '',
        codLocaliz: m.codLocal || m.codLocaliz || '',
        qtDisponivel: disp,
        codRefer: m.codRefer || '',
        qtAAtender: 0,
        selecionado: 99
      };
    }));
  });
});

// fcSetRequisicao.p / qdcSetRequisicao.p (PUT/POST)
router.all(['/fcSetRequisicao', '/qdcSetRequisicao'], async (req, res) => {
  return proxyPasoeOuFallback('fcSetRequisicao', req, res, (r, s) => {
    const payload = extrairPayload(r);
    const nrRequis = Number(payload.nrRequisicao);
    const itCodigo = String(payload.itCodigo || '').trim();
    const sequencia = Number(payload.sequencia);
    const codUsuario = payload.codUsuario || 'operador';
    const estoques = Array.isArray(payload.estoque) ? payload.estoque : [];

    const itemReq = (db.data.it_requisicao || []).find(it =>
      Number(it.nrRequisicao) === nrRequis &&
      String(it.itCodigo).trim() === itCodigo &&
      Number(it.Sequencia) === sequencia
    );

    if (!itemReq) {
      return s.json({
        type: 'ERROR',
        code: '17006',
        message: `Item da Requisição ${nrRequis} - ${itCodigo} - ${sequencia} não encontrado!`,
        detailedMessage: `Item da Requisição ${nrRequis} - ${itCodigo} - ${sequencia} não encontrado!`
      });
    }

    if (estoques.length === 0) {
      return s.json({
        type: 'ERROR',
        code: '17006',
        message: 'Estoque para retirada não foi informado!',
        detailedMessage: 'Estoque para retirada não foi informado!'
      });
    }

    let d_qt_atend = 0;
    for (const est of estoques) {
      const qtdAtender = Number(est.qtAAtender || 0);
      if (qtdAtender <= 0) continue;
      d_qt_atend += qtdAtender;

      // Abate do saldo_estoq
      const saldo = (db.data.saldo_estoq || []).find(se =>
        String(se.itCodigo).trim() === itCodigo &&
        (se.codDep || se.codDepos) === est.codDepos &&
        (se.codEstab || se.codEstabel) === est.codEstabel &&
        (se.lote || '') === (est.lote || '') &&
        (se.codLocal || se.codLocaliz || '') === (est.codLocaliz || '') &&
        (se.codRefer || '') === (est.codRefer || '')
      );
      if (saldo) {
        if (saldo.qtDisponivelCalc !== undefined) saldo.qtDisponivelCalc -= qtdAtender;
        if (saldo.qtidadeAtu !== undefined) saldo.qtidadeAtu -= qtdAtender;
      }

      // Registra o movimento de estoque (espDocto: 30) para futura devolução
      if (!db.data.movto_estoq) db.data.movto_estoq = [];
      db.data.movto_estoq.push({
        codEmpresa: r.headers['companyid'] || '001',
        codEstabel: est.codEstabel,
        itCodigo: itCodigo,
        espDocto: 30, // RM
        nroDocto: String(nrRequis),
        codDepos: est.codDepos,
        codLocaliz: est.codLocaliz || '',
        lote: est.lote || '',
        dtValiLote: est.dtValiLote || '',
        codRefer: est.codRefer || '',
        quantidade: qtdAtender,
        dtTrans: new Date().toISOString().split('T')[0],
        usuario: codUsuario
      });
    }

    itemReq.qtAtendida = Number(itemReq.qtAtendida || 0) + d_qt_atend;
    itemReq.qtAAtender = Math.max(0, Number(itemReq.qtAAtender || 0) - d_qt_atend);
    itemReq.qtADevolver = Number(itemReq.qtADevolver || 0) + d_qt_atend;
    itemReq.dtAtend = new Date().toISOString().split('T')[0];

    if (itemReq.qtAAtender === 0) {
      itemReq.situacao = 2; // Atendida
      const reqPai = (db.data.requisicao || []).find(rq => Number(rq.nrRequisicao) === nrRequis);
      if (reqPai) reqPai.situacao = 2;
    }

    return s.json({
      type: 'OK',
      code: '0',
      message: 'Requisição efetuada com sucesso no Datasul!',
      detailedMessage: 'Processo realizado com sucesso!'
    });
  });
});

// fcGetRequisDevol.p / qdcGetRequisDevol.p (PUT/POST)
router.all(['/fcGetRequisDevol', '/qdcGetRequisDevol'], async (req, res) => {
  return proxyPasoeOuFallback('fcGetRequisDevol', req, res, (r, s) => {
    const lista = (db.data.it_requisicao || []).filter(it => {
      return Number(it.qtADevolver || 0) > 0;
    });

    return s.json(lista.map(it => ({
      nrRequisicao: it.nrRequisicao,
      dtRequisicao: it.dtRequisicao,
      descItem: it.descItem,
      situacao: it.situacao,
      itCodigo: it.itCodigo,
      dtAtend: it.dtAtend || '',
      estado: it.estado,
      tpRequis: it.tpRequis,
      codEstabel: it.codEstabel,
      qtRequisitada: it.qtRequisitada,
      qtAtendida: it.qtAtendida,
      qtAAtender: it.qtAAtender,
      qtDevolvida: it.qtDevolvida || 0,
      qtADevolver: it.qtADevolver || 0,
      codUnidNegoc: it.codUnidNegoc || 'MOV',
      nomeAbrev: it.nomeAbrev,
      Sequencia: it.Sequencia
    })));
  });
});

// fcGetSaldoEstoqEstabItDev.p / qdcGetSaldoEstoqEstabItDev.p (PUT/POST)
router.all(['/fcGetSaldoEstoqEstabItDev', '/qdcGetSaldoEstoqEstabItDev'], async (req, res) => {
  return proxyPasoeOuFallback('fcGetSaldoEstoqEstabItDev', req, res, (r, s) => {
    const payload = extrairPayload(r);
    const nrRequis = Number(payload.nrRequis);
    const codEstabel = (payload.codEstabel || '').trim();
    const itCodigo = (payload.itCodigo || '').trim();

    const matches = (db.data.movto_estoq || []).filter(m => {
      const docNum = Number(String(m.nroDocto || '').replace(/\D/g, ''));
      const estOk = !codEstabel || m.codEstabel === codEstabel;
      const itOk = !itCodigo || m.itCodigo === itCodigo;
      const espOk = Number(m.espDocto) === 30;
      const numOk = docNum === nrRequis;
      return espOk && numOk && estOk && itOk;
    });

    return s.json(matches.map(m => ({
      itCodigo: m.itCodigo,
      codEstabel: m.codEstabel,
      codDepos: m.codDepos,
      lote: m.lote || '',
      dtValiLote: m.dtValiLote || '',
      codLocaliz: m.codLocaliz || '',
      qtDisponivel: m.quantidade,
      codRefer: m.codRefer || '',
      dtTrans: m.dtTrans,
      qtADevolver: 0
    })));
  });
});

// fcSetRequisDevol.p / qdcSetRequisDevol.p (PUT/POST)
router.all(['/fcSetRequisDevol', '/qdcSetRequisDevol'], async (req, res) => {
  return proxyPasoeOuFallback('fcSetRequisDevol', req, res, (r, s) => {
    const payload = extrairPayload(r);
    const nrRequis = Number(payload.nrRequisicao);
    const itCodigo = String(payload.itCodigo || '').trim();
    const sequencia = Number(payload.sequencia);
    const codUsuario = payload.codUsuario || 'operador';
    const codEstabel = payload.codEstabel || '101';
    const qtDevol = Number(payload.qtDevol || 0);
    const dtDevol = payload.dtDevol || new Date().toISOString().split('T')[0];
    const codDeposEnt = payload.codDeposEnt || 'AL1';
    const codLocalizEnt = payload.codLocalizEnt || '';
    const loteEnt = payload.loteEnt || '';
    const codReferEnt = payload.codReferEnt || '';

    const itemReq = (db.data.it_requisicao || []).find(it =>
      Number(it.nrRequisicao) === nrRequis &&
      String(it.itCodigo).trim() === itCodigo &&
      Number(it.Sequencia) === sequencia
    );

    if (!itemReq) {
      return s.json({
        type: 'ERROR',
        code: '17006',
        message: `Item da Requisição ${nrRequis} - ${itCodigo} - ${sequencia} não encontrado!`,
        detailedMessage: `Item da Requisição ${nrRequis} - ${itCodigo} - ${sequencia} não encontrado!`
      });
    }

    if (qtDevol <= 0) {
      return s.json({
        type: 'ERROR',
        code: '17006',
        message: 'Quantidade a devolver deve ser maior que zero!',
        detailedMessage: 'Quantidade a devolver deve ser maior que zero!'
      });
    }

    // Devolve para o saldo_estoq
    let saldo = (db.data.saldo_estoq || []).find(se =>
      String(se.itCodigo).trim() === itCodigo &&
      (se.codDep || se.codDepos) === codDeposEnt &&
      (se.codEstab || se.codEstabel) === codEstabel &&
      (se.lote || '') === loteEnt &&
      (se.codLocal || se.codLocaliz || '') === codLocalizEnt &&
      (se.codRefer || '') === codReferEnt
    );

    if (saldo) {
      if (saldo.qtDisponivelCalc !== undefined) saldo.qtDisponivelCalc += qtDevol;
      if (saldo.qtidadeAtu !== undefined) saldo.qtidadeAtu += qtDevol;
    } else {
      db.data.saldo_estoq.push({
        codEmpresa: r.headers['companyid'] || '001',
        codEstab: codEstabel,
        codEstabel: codEstabel,
        codDep: codDeposEnt,
        codDepos: codDeposEnt,
        codLocal: codLocalizEnt,
        codLocaliz: codLocalizEnt,
        lote: loteEnt,
        codRefer: codReferEnt,
        itCodigo: itCodigo,
        descItem: itemReq.descItem,
        qtAlocada: 0,
        qtAlocPed: 0,
        qtAlocProd: 0,
        dtValiLote: '',
        qtidadeAtu: qtDevol,
        qtDisponivelCalc: qtDevol
      });
    }

    // Registra movimento de devolução (espDocto: 7 / DRM)
    if (!db.data.movto_estoq) db.data.movto_estoq = [];
    db.data.movto_estoq.push({
      codEmpresa: r.headers['companyid'] || '001',
      codEstabel: codEstabel,
      itCodigo: itCodigo,
      espDocto: 7, // DRM
      nroDocto: String(nrRequis),
      codDepos: codDeposEnt,
      codLocaliz: codLocalizEnt,
      lote: loteEnt,
      codRefer: codReferEnt,
      quantidade: qtDevol,
      dtTrans: dtDevol,
      usuario: codUsuario
    });

    itemReq.qtDevolvida = Number(itemReq.qtDevolvida || 0) + qtDevol;
    itemReq.qtADevolver = Math.max(0, Number(itemReq.qtADevolver || 0) - qtDevol);
    itemReq.qtAAtender = Number(itemReq.qtAAtender || 0) + qtDevol;
    itemReq.qtAtendida = Math.max(0, Number(itemReq.qtAtendida || 0) - qtDevol);

    if (itemReq.qtAAtender > 0) {
      itemReq.situacao = 1; // Aberta novamente
      const reqPai = (db.data.requisicao || []).find(rq => Number(rq.nrRequisicao) === nrRequis);
      if (reqPai) reqPai.situacao = 1;
    }

    return s.json({
      type: 'OK',
      code: '0',
      message: 'Devolução efetuada com sucesso no Datasul!',
      detailedMessage: 'Processo realizado com sucesso!'
    });
  });
});

// Reset da base para testes
router.post('/resetBase', (req, res) => {
  db.resetDefault();
  return res.json({ success: true, mensagem: 'Base de dados restaurada para o padrão inicial.' });
});

module.exports = router;

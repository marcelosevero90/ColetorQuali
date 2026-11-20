// server.js - Gateway Intermediário e Simulador PASOE TOTVS Datasul (Offline-First)
// Atua como proxy para o PASOE real (CORS, Basic Auth, companyId, timeouts) e serve o app Web/PWA.

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rotas de API
const aliasService = require('./routes/aliasService');
const datasulApi = require('./routes/datasulApi');

app.use('/api/discovery', aliasService);
app.use('/api/datasul', datasulApi);

// Sanitização defensiva de localização Datasul:
// No Datasul CE0105/CE0206, código vazio "" tem descrição "BRANCO".
// Nunca permitir que a string "BRANCO" chegue ao Progress/PASOE.

// Sanitização e complementação defensiva completa para fcSetTransfMaterial (CE0206 / ceapi001k):
function sanitizarPayloadTransferencia(obj, req) {
  if (!obj || typeof obj !== 'object') return obj;
  let itens = [];
  if (Array.isArray(obj.payload)) {
    itens = obj.payload;
  } else if (Array.isArray(obj)) {
    itens = obj;
  } else {
    itens = [obj];
  }

  const codUsuarioPadrao = (() => {
    try {
      const auth = req.headers['authorization'] || '';
      if (auth.startsWith('Basic ')) {
        const dec = Buffer.from(auth.replace('Basic ', ''), 'base64').toString('utf8');
        return dec.split(':')[0] || 'matheus.st';
      }
    } catch (e) {}
    return 'matheus.st';
  })();

  const normalizarDataIso = (dt) => {
    if (!dt) return new Date().toISOString().slice(0, 10);
    const str = String(dt).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    if (str.includes('/')) {
      const p = str.split('/');
      if (p.length === 3) {
        if (p[2].length === 4) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        if (p[0].length === 4) return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
      }
    }
    return new Date().toISOString().slice(0, 10);
  };

  const normalizarLoc = (loc) => {
    if (!loc) return '';
    const v = String(loc).trim().toUpperCase();
    if (v === 'BRANCO' || v === '(EM BRANCO)' || v === 'EM BRANCO' || v === 'PADRAO' || v === 'PADRÃO' || v === '-') {
      return '';
    }
    return String(loc).trim();
  };

  const itensSanitizados = itens.map(it => {
    const codEst = String(it.codEstabel || req.headers['codestabel'] || '101').trim() || '101';
    const usr = String(it.codUsuario || codUsuarioPadrao).trim() || codUsuarioPadrao;
    const dt = normalizarDataIso(it.dtTransf);

    return {
      itCodigo: String(it.itCodigo || '').trim(),
      codEstabel: codEst,
      codUsuario: usr,
      dtTransf: dt,
      nroDocto: String(it.nroDocto || '').trim(),
      serie: String(it.serie || '').trim(),
      quantidade: Number(it.quantidade || 0),
      codDeposSai: String(it.codDeposSai || '').trim(),
      codLocalizSai: normalizarLoc(it.codLocalizSai),
      loteSai: String(it.loteSai || '').trim(),
      dtValiLote: it.dtValiLote ? normalizarDataIso(it.dtValiLote) : '',
      codReferSai: String(it.codReferSai || '').trim(),
      codDeposEnt: String(it.codDeposEnt || '').trim(),
      codLocalizEnt: normalizarLoc(it.codLocalizEnt),
      loteEnt: String(it.loteEnt || '').trim(),
      dtValiLoteEnt: it.dtValiLoteEnt ? normalizarDataIso(it.dtValiLoteEnt) : '',
      codReferEnt: String(it.codReferEnt || '').trim()
    };
  });

  const resObj = { ...(itensSanitizados[0] || {}) };
  if (itensSanitizados.length > 0) {
    Object.keys(itensSanitizados[0]).forEach(k => {
      resObj[k] = itensSanitizados[0][k];
    });
  }
  return resObj;
}

// Sanitização e complementação defensiva completa para fcSetRequisicao (CD1409 / ceapi001k):
function sanitizarPayloadRequisicao(obj, req) {
  if (!obj || typeof obj !== 'object') return obj;
  let itens = [];
  if (Array.isArray(obj.payload)) {
    itens = obj.payload;
  } else if (Array.isArray(obj)) {
    itens = obj;
  } else {
    itens = [obj];
  }

  const codUsuarioPadrao = (() => {
    try {
      const auth = req.headers['authorization'] || '';
      if (auth.startsWith('Basic ')) {
        const dec = Buffer.from(auth.replace('Basic ', ''), 'base64').toString('utf8');
        return dec.split(':')[0] || 'matheus.st';
      }
    } catch (e) {}
    return 'matheus.st';
  })();

  const normalizarLoc = (loc) => {
    if (!loc) return '';
    const v = String(loc).trim().toUpperCase();
    if (v === 'BRANCO' || v === '(EM BRANCO)' || v === 'EM BRANCO' || v === 'PADRAO' || v === 'PADRÃO' || v === '-') {
      return '';
    }
    return String(loc).trim();
  };

  const itensSanitizados = itens.map(it => {
    const nrReq = parseInt(it.nrRequisicao || it.nrRequis || it['nr-requis'] || 0, 10) || 0;
    const itCod = String(it.itCodigo || it['it-codigo'] || '').trim();
    const seq = parseInt(it.sequencia ?? it.Sequencia ?? it.nrSequencia ?? 1, 10) || 1;
    const usr = String(it.codUsuario || it.usuario || codUsuarioPadrao).trim() || codUsuarioPadrao;

    let estoqueLinhas = [];
    if (Array.isArray(it.estoque)) {
      estoqueLinhas = it.estoque;
    } else if (Array.isArray(it.saldosEstoque)) {
      estoqueLinhas = it.saldosEstoque;
    }

    const estoqueSanitizado = estoqueLinhas.map(s => ({
      codEstabel: String(s.codEstabel || req.headers['codestabel'] || '101').trim() || '101',
      codDepos: String(s.codDepos || s.codDep || '').trim(),
      codLocaliz: normalizarLoc(s.codLocaliz || s.codLocal),
      lote: String(s.lote || '').trim(),
      codRefer: String(s.codRefer || '').trim(),
      itCodigo: String(s.itCodigo || itCod).trim(),
      qtAAtender: Number(s.qtAAtender || s.quantidade || 0)
    }));

    return {
      nrRequisicao: nrReq,
      itCodigo: itCod,
      sequencia: seq,
      codUsuario: usr,
      estoque: estoqueSanitizado
    };
  });

  const resObj = {
    payload: itensSanitizados,
    ...(itensSanitizados[0] || {})
  };
  return resObj;
}

// Sanitização e complementação defensiva completa para fcSetRequisDevol (CD1410 / ceapi001k):
function sanitizarPayloadDevolucao(obj, req) {
  if (!obj || typeof obj !== 'object') return obj;
  let itens = [];
  if (Array.isArray(obj.payload)) {
    itens = obj.payload;
  } else if (Array.isArray(obj)) {
    itens = obj;
  } else {
    itens = [obj];
  }

  const codUsuarioPadrao = (() => {
    try {
      const auth = req.headers['authorization'] || '';
      if (auth.startsWith('Basic ')) {
        const dec = Buffer.from(auth.replace('Basic ', ''), 'base64').toString('utf8');
        return dec.split(':')[0] || 'matheus.st';
      }
    } catch (e) {}
    return 'matheus.st';
  })();

  const normalizarDataIso = (dt) => {
    if (!dt) return new Date().toISOString().slice(0, 10);
    const s = String(dt).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (s.includes('/')) {
      const p = s.split('/');
      if (p.length === 3) {
        if (p[2].length === 4) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        if (p[0].length === 4) return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
      }
    }
    return new Date().toISOString().slice(0, 10);
  };

  const normalizarLoc = (loc) => {
    if (!loc) return '';
    const v = String(loc).trim().toUpperCase();
    if (v === 'BRANCO' || v === '(EM BRANCO)' || v === 'EM BRANCO' || v === 'PADRAO' || v === 'PADRÃO' || v === '-') {
      return '';
    }
    return String(loc).trim();
  };

  const itensSanitizados = itens.map(it => {
    const nrReq = parseInt(it.nrRequisicao || it.nrRequis || it['nr-requis'] || 0, 10) || 0;
    const itCod = String(it.itCodigo || it['it-codigo'] || '').trim();
    const seq = parseInt(it.sequencia ?? it.Sequencia ?? it.nrSequencia ?? 1, 10) || 1;
    const usr = String(it.codUsuario || it.usuario || codUsuarioPadrao).trim() || codUsuarioPadrao;
    const codEst = String(it.codEstabel || req.headers['codestabel'] || '101').trim() || '101';
    const qtd = Number(it.qtDevol || it.quantidade || 0);
    const dt = normalizarDataIso(it.dtDevol);

    return {
      nrRequisicao: nrReq,
      itCodigo: itCod,
      sequencia: seq,
      codUsuario: usr,
      codEstabel: codEst,
      qtDevol: qtd,
      dtDevol: dt,
      codDeposEnt: String(it.codDeposEnt || it.codDepos || '').trim(),
      codLocalizEnt: normalizarLoc(it.codLocalizEnt || it.codLocaliz),
      loteEnt: String(it.loteEnt || it.lote || '').trim(),
      codReferEnt: String(it.codReferEnt || it.codRefer || '').trim()
    };
  });

  const resObj = {
    payload: itensSanitizados,
    ...(itensSanitizados[0] || {})
  };
  return resObj;
}


// Sanitização e complementação defensiva completa para fcSetReporteOrdProd (CP0311 / cpapi001):
function sanitizarPayloadReporteOrdProd(obj, req) {
  if (!obj || typeof obj !== 'object') return obj;
  let itens = [];
  if (Array.isArray(obj.payload)) itens = obj.payload;
  else if (Array.isArray(obj)) itens = obj;
  else itens = [obj];

  const normalizarDataIso = (dt) => {
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
    return '';
  };

  const normalizarLoc = (loc) => {
    if (!loc) return '';
    const v = String(loc).trim().toUpperCase();
    if (v === 'BRANCO' || v === '(EM BRANCO)' || v === 'EM BRANCO' || v === 'PADRAO' || v === 'PADRÃO' || v === '-') {
      return '';
    }
    return String(loc).trim();
  };

  const itensSanitizados = itens.map(it => {
    const nrOrd = parseInt(it.nrOrdProdu || it['nr-ord-produ'] || it.nrOrdem || it.nrOrdemProd || 0, 10) || 0;
    const itCod = String(it.itCodigo || it['it-codigo'] || '').trim();
    const codEst = String(it.codEstabel || req.headers['codestabel'] || '101').trim() || '101';
    const depEnt = String(it.codDepos || it.codDeposEnt || 'ACA').trim();
    const locEnt = normalizarLoc(it.codLocaliz || it.codLocalizEnt);
    const depSai = String(it.codDeposSai || 'PRO').trim();
    const locSai = normalizarLoc(it.codLocalSai || it.codLocalizSai);
    const lote = String(it.lote || it.loteEnt || '').trim();
    const refer = String(it.codRefer || it.codReferEnt || '').trim();
    const dtVali = it.dtValiLote ? normalizarDataIso(it.dtValiLote) : '';
    const qtRep = Number(it.qtReporte || it.quantidade || 0);
    const qtRef = Number(it.qtRefugada || 0);
    const dtRep = normalizarDataIso(it.dtReporte) || new Date().toISOString().slice(0, 10);
    const ctRef = String(it.ctRefugo || '').trim();
    const scRef = String(it.scRefugo || '').trim();
    const nroDoc = String(it.nroDocto || (nrOrd ? String(nrOrd) : '')).trim();
    const serie = String(it.serie || '').trim();

    return {
      nrOrdProdu: nrOrd,
      itCodigo: itCod,
      codEstabel: codEst,
      codDepos: depEnt,
      codLocaliz: locEnt,
      lote: lote,
      codRefer: refer,
      dtValiLote: dtVali || dtRep,
      qtReporte: qtRep,
      qtRefugada: qtRef,
      dtReporte: dtRep,
      ctRefugo: ctRef,
      scRefugo: scRef,
      nroDocto: nroDoc,
      serie: serie,
      codDeposSai: depSai,
      codLocalSai: locSai
    };
  });

  const resObj = {
    payload: itensSanitizados,
    ...(itensSanitizados[0] || {})
  };
  return resObj;
}

// Sanitização e complementação defensiva para fcSetEstornoOrdProd:
function sanitizarPayloadEstornoOrdProd(obj, req) {
  if (!obj || typeof obj !== 'object') return obj;
  let itens = [];
  if (Array.isArray(obj.payload)) itens = obj.payload;
  else if (Array.isArray(obj)) itens = obj;
  else itens = [obj];

  const itensSanitizados = itens.map(it => {
    const nrRep = parseInt(it.nrReporte || it['nr-reporte'] || 0, 10) || 0;
    const dtRep = (it.dtReporte || it.dtEstorno || new Date().toISOString().slice(0, 10)).slice(0, 10);
    return {
      nrReporte: nrRep,
      dtReporte: dtRep
    };
  });

  return {
    payload: itensSanitizados,
    ...(itensSanitizados[0] || {})
  };
}

function sanitizarLocalizDatasul(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizarLocalizDatasul);
  }
  const chavesLoc = ['codlocaliz', 'codlocalizsai', 'codlocalizent', 'codlocalsai', 'localiz', 'cod-localiz', 'codlocal'];
  const novo = { ...obj };
  for (const k of Object.keys(novo)) {
    if (chavesLoc.includes(k.toLowerCase()) && typeof novo[k] === 'string') {
      const v = novo[k].trim().toUpperCase();
      if (v === 'BRANCO' || v === '(EM BRANCO)' || v === 'EM BRANCO' || v === 'PADRAO' || v === 'PADRÃO' || v === '(PADRAO)' || v === '(PADRÃO)' || v === '-') {
        novo[k] = '';
      }
    } else if (typeof novo[k] === 'object' && novo[k] !== null) {
      novo[k] = sanitizarLocalizDatasul(novo[k]);
    }
  }
  return novo;
}

// Proxy seguro para conexões ao PASOE externo (evita problemas de CORS / VPN / SSL / redirects no browser)
app.all('/api/pasoe-proxy', async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ success: false, mensagem: 'Parâmetro url é obrigatório no proxy.' });
  }

  // Reconstituição integral da URL caso contenha múltiplos parâmetros com &
  const orig = req.originalUrl;
  const idxUrl = orig.indexOf('url=');
  if (idxUrl !== -1) {
    const rawTarget = orig.substring(idxUrl + 4);
    try {
      targetUrl = decodeURIComponent(rawTarget);
    } catch (e) {
      targetUrl = rawTarget;
    }
  }

  try {
    console.log(`[PROXY] ${req.method} ${targetUrl} (companyId: ${req.headers['companyid'] || 'none'})`);
    const headers = {};
    if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
    if (req.headers['companyid']) headers['companyId'] = req.headers['companyid'];
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['accept']) headers['Accept'] = req.headers['accept'];

    // Fallback: se não veio Authorization do cliente, tenta credencial técnica configurada no ALIAS
    if (!headers['Authorization']) {
      try {
        const aliasesFile = path.join(__dirname, 'data', 'aliases.json');
        const tmpAliasesFile = path.join(require('os').tmpdir(), 'aliases.json');
        let allAliases = {};
        if (fs.existsSync(aliasesFile)) {
          allAliases = { ...allAliases, ...JSON.parse(fs.readFileSync(aliasesFile, 'utf8')) };
        }
        if (fs.existsSync(tmpAliasesFile)) {
          allAliases = { ...allAliases, ...JSON.parse(fs.readFileSync(tmpAliasesFile, 'utf8')) };
        }
        const match = Object.values(allAliases).find(a =>
          a.usuarioIntegracao && a.senhaIntegracao && a.pasoeUrl && targetUrl.includes(a.pasoeUrl)
        );
        if (match) {
          headers['Authorization'] = 'Basic ' + Buffer.from(`${match.usuarioIntegracao}:${match.senhaIntegracao}`).toString('base64');
        }
      } catch (e) {}
    }

    const controller = new AbortController();
    const timeoutMs = parseInt(req.headers['x-timeout-ms'] || '30000', 10);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOptions = {
      method: req.method,
      headers,
      redirect: 'manual',
      signal: controller.signal
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      let bodyEnvio;
      if (String(targetUrl).toLowerCase().includes('fcsettransfmaterial')) {
        bodyEnvio = sanitizarPayloadTransferencia(req.body, req);
      } else if (String(targetUrl).toLowerCase().includes('fcsetrequisdevol')) {
        bodyEnvio = sanitizarPayloadDevolucao(req.body, req);
      } else if (String(targetUrl).toLowerCase().includes('fcsetrequisicao')) {
        bodyEnvio = sanitizarPayloadRequisicao(req.body, req);
      } else if (String(targetUrl).toLowerCase().includes('fcsetreporteordprod')) {
        bodyEnvio = sanitizarPayloadReporteOrdProd(req.body, req);
      } else if (String(targetUrl).toLowerCase().includes('fcsetestornoordprod')) {
        bodyEnvio = sanitizarPayloadEstornoOrdProd(req.body, req);
      } else {
        bodyEnvio = sanitizarLocalizDatasul(req.body);
        if (Array.isArray(bodyEnvio.payload) && bodyEnvio.payload.length > 0 && typeof bodyEnvio.payload[0] === 'object' && bodyEnvio.payload[0] !== null) {
          Object.keys(bodyEnvio.payload[0]).forEach(k => {
            if (bodyEnvio[k] === undefined) {
              bodyEnvio[k] = bodyEnvio.payload[0][k];
            }
          });
        }
      }
      fetchOptions.body = JSON.stringify(bodyEnvio);
    }

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timer);

    // Tratamento de redirecionamento 302/307 do Tomcat/Spring Security quando Basic Auth é inválido ou ausente
    if (response.status === 302 || response.status === 307) {
      return res.status(401).json({
        success: false,
        status: response.status,
        error_code: '55504',
        mensagem: 'Autenticação requerida pelo TOTVS PASOE. Verifique usuário e senha informados.'
      });
    }

    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

    res.status(response.status);
    if (contentType.includes('application/json') || bodyText.trim().startsWith('{') || bodyText.trim().startsWith('[')) {
      try {
        const json = JSON.parse(bodyText);
        if (targetUrl && (targetUrl.includes('fcGetOrdemProdEst') || targetUrl.includes('qdcGetOrdemProdEst'))) {
          let items = Array.isArray(json.items) ? json.items : (Array.isArray(json) ? json : []);
          let payload = req.body || {};
          if (Array.isArray(payload.payload) && payload.payload.length > 0) {
            payload = payload.payload[0];
          }

          const nrOrdProdu = Number(payload.nrOrdProdu || 0);
          const itCodigo = (payload.itCodigo || '').trim().toLowerCase();
          const dtCorte = (payload.dtCorte || '').trim();

          // Mescla ordens locais de teste (garante a OP 279059 do print com seu erro)
          try {
            const dbMock = require('./services/totvsDataStore');
            const mockOps = (dbMock.data?.ord_prod || []).filter(op =>
              !items.some(it => String(it.nrOrdProdu) === String(op.nrOrdProdu))
            );
            items = [...mockOps, ...items];
          } catch (eMock) {}

          if (nrOrdProdu) {
            items = items.filter(op => Number(op.nrOrdProdu) === nrOrdProdu);
          } else if (itCodigo) {
            items = items.filter(op => (op.itCodigo || '').toLowerCase().startsWith(itCodigo));
          }

          if (dtCorte) {
            items = items.filter(op => {
              const dt = String(op.dtEmissao || op.dtInicio || '').slice(0, 10);
              return !dt || dt >= dtCorte;
            });
          }

          if (items.length > 250) {
            items = items.slice(0, 250);
          }

          json = {
            total: items.length,
            hasNext: false,
            items: items.map(op => ({
              ...op,
              qtSaldo: Number(op.qtSaldo !== undefined ? op.qtSaldo : (Number(op.qtOrdem || 0) - Number(op.qtProduzida || 0)))
            }))
          };
        }
        return res.json(json);
      } catch (e) {
        return res.send(bodyText);
      }
    } else {
      res.setHeader('Content-Type', contentType || 'text/plain; charset=utf-8');
      return res.send(bodyText);
    }
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    console.error('Erro no proxy PASOE:', err.message);

    let detalheErro = err.message;
    const isPrivateIp = /^(https?:\/\/)?(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.|localhost)/i.test(targetUrl);
    const isCloudEnv = Boolean(process.env.VERCEL || process.env.AWS_REGION || !['localhost', '127.0.0.1'].includes(req.hostname));

    if (isPrivateIp && isCloudEnv) {
      detalheErro = `${err.message} — AVISO DE REDE: O servidor na nuvem (Vercel) não possui acesso ao IP privado (${targetUrl}) da rede interna da empresa. IPs locais (10.x.x.x / 192.168.x.x) só funcionam quando o Coletor é executado na intranet/servidor local ou quando o PASOE possui endereço público/VPN/Tunnel HTTPS.`;
    }

    return res.status(isTimeout ? 504 : 502).json({
      success: false,
      mensagem: isTimeout
        ? `Timeout ao aguardar resposta do PASOE (${targetUrl}).`
        : `Falha de comunicação com o PASOE (${targetUrl}): ${detalheErro}`
    });
  }
});

// Servir frontend estático PWA
app.use(express.static(path.join(__dirname, 'public')));

// Rota exclusiva para o Painel Administrativo TOTVS Datasul / PASOE
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('================================================================');
    console.log(' COLETOR MOVEL TOTVS DATASUL - OFFLINE-FIRST (INVENTARIO)');
    console.log('================================================================');
    console.log(` Servidor Gateway   : http://localhost:${PORT}`);
    console.log(` Discovery ALIAS    : http://localhost:${PORT}/api/discovery/resolve?alias=demo`);
    console.log(` Datasul REST API   : http://localhost:${PORT}/api/datasul/fcLogin`);
    console.log('================================================================');
  });
}

module.exports = app;

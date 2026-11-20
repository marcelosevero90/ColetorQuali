// ponte-pasoe.js - Serviço de Ponte Local entre Coletor Quali e o PASOE TOTVS Datasul Real
// Executa no notebook com VPN conectada e permite que o celular acerte o PASOE diretamente.

const express = require('express');
const cors = require('cors');
const os = require('os');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3333;
const PASOE_TARGET = (process.env.PASOE_TARGET || 'http://10.15.1.20:8180/api/promob/v1').replace(/\/+$/, '');

// Configuração ampla de CORS para qualquer origem móvel/web
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*'],
  exposedHeaders: ['*']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sanitização defensiva de localização Datasul:
// No Datasul CE0105/CE0206, código vazio "" tem descrição "BRANCO".
// Nunca permitir que a string "BRANCO" chegue ao Progress/PASOE.
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

// Sanitização e complementação defensiva completa para fcSetTransfMaterial (CE0206 / ceapi001k):
// O OpenEdge ABL requer que todas as 16 propriedades existam no JsonObject com tipos estritos
// para não disparar exceção no bloco DO ON ERROR UNDO, LEAVE.
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

// Obter o IP local do notebook na rede Wi-Fi / LAN
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Preferir interfaces comuns de Wi-Fi ou Ethernet local
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.0.') || iface.address.startsWith('172.')) {
          // Ignora faixas de VPN típicas se houver Wi-Fi
          if (!name.toLowerCase().includes('tap') && !name.toLowerCase().includes('openvpn')) {
            return iface.address;
          }
        }
      }
    }
  }
  return '192.168.0.8';
}

const localIp = getLocalIp();

// Middleware de Logs Coloridos no Terminal
app.use((req, res, next) => {
  const inicio = Date.now();
  const metodo = req.method;
  const rota = req.url;
  const company = req.headers['companyid'] || '-';

  res.on('finish', () => {
    const duracao = Date.now() - inicio;
    const status = res.statusCode;
    const hora = new Date().toLocaleTimeString('pt-BR');
    const icone = status >= 200 && status < 300 ? '✓' : (status === 401 ? '🔒' : '✕');
    console.log(`[${hora}] ${icone} [${metodo}] ${rota} | Status: ${status} | Emp: ${company} | Tempo: ${duracao}ms`);
  });

  next();
});

// Endpoint de Diagnóstico e Ping da Ponte
app.get('/ping', (req, res) => {
  res.json({
    success: true,
    servico: 'Ponte PASOE TOTVS Promob -> Coletor Quali',
    status: 'ONLINE',
    localIp,
    porta: PORT,
    pasoeTarget: PASOE_TARGET,
    timestamp: new Date().toISOString()
  });
});

// Proxy Transparente para todos os endpoints do PASOE
app.all('*', async (req, res) => {
  // Ignora preflight OPTIONS se o cors middleware já não finalizou
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const endpointLimpo = req.url.startsWith('/') ? req.url : `/${req.url}`;
  const targetUrl = `${PASOE_TARGET}${endpointLimpo}`;

  try {
    const headers = {};
    if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
    if (req.headers['companyid']) headers['companyId'] = req.headers['companyid'];
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['accept']) headers['Accept'] = req.headers['accept'];

    // Fallback de autenticação técnica caso não tenha vindo no cabeçalho
    if (!headers['Authorization']) {
      headers['Authorization'] = 'Basic ' + Buffer.from('matheus.st:qwe8451').toString('base64');
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 35000);

    const fetchOptions = {
      method: req.method,
      headers,
      redirect: 'manual',
      signal: controller.signal
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      let bodyEnvio;
      const urlBaixa = endpointLimpo.toLowerCase();
      if (urlBaixa.includes('fcsettransfmaterial')) {
        bodyEnvio = sanitizarPayloadTransferencia(req.body, req);

      } else if (urlBaixa.includes('fcsetrequisdevol')) {
        bodyEnvio = sanitizarPayloadDevolucao(req.body, req);
      } else if (urlBaixa.includes('fcsetrequisicao')) {
        bodyEnvio = sanitizarPayloadRequisicao(req.body, req);
      } else if (urlBaixa.includes('fcsetreporteordprod')) {
        bodyEnvio = sanitizarPayloadReporteOrdProd(req.body, req);
      } else if (urlBaixa.includes('fcsetestornoordprod')) {
        bodyEnvio = sanitizarPayloadEstornoOrdProd(req.body, req);


      } else {
        bodyEnvio = sanitizarLocalizDatasul(req.body);
        if (Array.isArray(bodyEnvio.payload) && bodyEnvio.payload.length > 0 && typeof bodyEnvio.payload[0] === 'object') {
          Object.keys(bodyEnvio.payload[0]).forEach(k => {
            if (bodyEnvio[k] === undefined) bodyEnvio[k] = bodyEnvio.payload[0][k];
          });
        }
      }
      fetchOptions.body = JSON.stringify(bodyEnvio);
      console.log('>>> [PROXY BODY ENVIADO]', endpointLimpo, fetchOptions.body);
    }

    const pasoeResponse = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutTimer);

    // Se o Tomcat/PASOE retornar redirecionamento 302/307 (credenciais inválidas ou sessão expirada)
    if (pasoeResponse.status === 302 || pasoeResponse.status === 307) {
      return res.status(401).json({
        success: false,
        status: 401,
        message: 'Autenticação requerida pelo TOTVS PASOE. Verifique usuário e senha.',
        detailedMessage: 'O servidor PASOE retornou redirecionamento 302/307 de login.'
      });
    }

    const contentType = pasoeResponse.headers.get('content-type') || '';
    const bodyText = await pasoeResponse.text();

    res.status(pasoeResponse.status);
    if (contentType) res.setHeader('Content-Type', contentType);

    res.send(bodyText);

  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    console.error(`[ERRO PONTE] Falha ao comunicar com PASOE (${targetUrl}):`, err.message);
    res.status(isTimeout ? 504 : 502).json({
      success: false,
      message: isTimeout
        ? 'Tempo limite de resposta do PASOE excedido (35s).'
        : `Falha na conexão com o PASOE Promob (${PASOE_TARGET}): ${err.message}`,
      detalhe: 'Verifique se a VPN do notebook está conectada ao ambiente Promob (10.15.1.20:8180).'
    });
  }
});

// Inicialização do Servidor
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log('========================================================================');
  console.log('       PONTE PASOE TOTVS DATASUL (PROMOB) -> COLETOR QUALI              ');
  console.log('========================================================================');
  console.log(` Destino PASOE Real  : ${PASOE_TARGET}`);
  console.log(` Porta Local         : ${PORT}`);
  console.log(` IP na Rede Wi-Fi    : http://${localIp}:${PORT}`);
  console.log('------------------------------------------------------------------------');

  // Teste de conectividade com o PASOE Real
  try {
    const pingCheck = await fetch(`${PASOE_TARGET}/fcLogin`, {
      method: 'GET',
      redirect: 'manual'
    });
    console.log(` [VPN CHECK] ✓ Conexão com o PASOE Promob OK! (Status HTTP ${pingCheck.status})`);
  } catch (e) {
    console.warn(` [VPN CHECK] ⚠️ Não foi possível alcançar o PASOE (${PASOE_TARGET}): ${e.message}`);
    console.warn('             Certifique-se de que a VPN do Totvs Promob está ativa no note.');
  }

  console.log('========================================================================');
  console.log(' COMO CONFIGURAR PARA TESTE REAL NO CELULAR:');
  console.log(' 1. Acesse o Painel de Administração na Nuvem:');
  console.log('    👉 https://coletorquali.vercel.app/admin');
  console.log(' 2. Edite o ALIAS "teste" e altere o campo "URL Base do PASOE REST" para:');
  console.log(`    👉 http://${localIp}:${PORT}`);
  console.log(' 3. No celular, digite o ALIAS "teste" e acesse normalmente.');
  console.log('========================================================================\n');

  // Suporte a túnel opcional caso passado argumento --tunnel
  if (process.argv.includes('--tunnel')) {
    try {
      const localtunnel = require('localtunnel');
      console.log(' [TÚNEL] Abrindo túnel público HTTPS via localtunnel...');
      const tunnel = await localtunnel({ port: PORT, subdomain: 'coletor-quali-promob' }).catch(() => localtunnel({ port: PORT }));
      console.log('========================================================================');
      console.log(` [TÚNEL ONLINE] URL Pública HTTPS: ${tunnel.url}`);
      console.log(' (Você também pode usar essa URL pública no ALIAS "teste" da Vercel)');
      console.log('========================================================================\n');
    } catch (eTunnel) {
      console.warn(' [TÚNEL] Aviso: localtunnel não disponível ou falhou:', eTunnel.message);
    }
  }
});

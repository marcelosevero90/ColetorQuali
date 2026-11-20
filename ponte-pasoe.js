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
      let bodyEnvio = sanitizarLocalizDatasul(req.body);
      // Compatibilidade Progress ABL: espelha payload na raiz se necessário
      if (Array.isArray(bodyEnvio.payload) && bodyEnvio.payload.length > 0 && typeof bodyEnvio.payload[0] === 'object') {
        Object.keys(bodyEnvio.payload[0]).forEach(k => {
          if (bodyEnvio[k] === undefined) bodyEnvio[k] = bodyEnvio.payload[0][k];
        });
      }
      fetchOptions.body = JSON.stringify(bodyEnvio);
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

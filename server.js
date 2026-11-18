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
        if (fs.existsSync(aliasesFile)) {
          const allAliases = JSON.parse(fs.readFileSync(aliasesFile, 'utf8'));
          const match = Object.values(allAliases).find(a =>
            a.usuarioIntegracao && a.senhaIntegracao && a.pasoeUrl && targetUrl.includes(a.pasoeUrl)
          );
          if (match) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${match.usuarioIntegracao}:${match.senhaIntegracao}`).toString('base64');
          }
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
      fetchOptions.body = JSON.stringify(req.body);
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
        return res.json(JSON.parse(bodyText));
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

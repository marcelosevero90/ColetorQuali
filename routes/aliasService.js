// routes/aliasService.js - WebService de Descoberta e Gestão de ALIAS PASOE dos Clientes

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ALIASES_FILE = path.join(__dirname, '..', 'data', 'aliases.json');

function carregarAliases() {
  const padrao = {
    teste: {
      alias: 'teste',
      nomeEmpresa: 'AMBIENTE REAL PASOE (PROMOB)',
      empresaPrincipal: '001',
      codEstabelPadrao: '101',
      pasoeUrl: 'http://10.15.1.20:8180/api/promob/v1',
      usuarioIntegracao: 'matheus.st',
      senhaIntegracao: 'qwe8451',
      status: 'ativo',
      descricao: 'Base Real Totvs Datasul PASOE'
    },
    demo: {
      alias: 'demo',
      nomeEmpresa: 'TOTVS DATASUL 12 - AMBIENTE DEMO OFFLINE-FIRST',
      empresaPrincipal: '001',
      codEstabelPadrao: '101',
      pasoeUrl: 'http://localhost:3000/api/datasul',
      status: 'ativo',
      descricao: 'Ambiente Local de Testes e Homologação (Simulador Fiel collect/*.p)'
    }
  };

  try {
    if (fs.existsSync(ALIASES_FILE)) {
      const conteudo = fs.readFileSync(ALIASES_FILE, 'utf8');
      return { ...padrao, ...JSON.parse(conteudo) };
    } else {
      salvarAliases(padrao);
      return padrao;
    }
  } catch (err) {
    console.error('Erro ao ler aliases.json:', err);
    return padrao;
  }
}

function salvarAliases(aliases) {
  try {
    const dir = path.dirname(ALIASES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao gravar aliases.json:', err);
  }
}

// 1. Resolução de ALIAS
// GET /api/discovery/resolve?alias=demo
router.get(['/resolve', '/resolve/:alias'], (req, res) => {
  const chave = (req.params.alias || req.query.alias || '').trim().toLowerCase();

  if (!chave) {
    return res.status(400).json({
      success: false,
      mensagem: 'Parâmetro alias é obrigatório.'
    });
  }

  const aliases = carregarAliases();
  const registro = aliases[chave];

  if (!registro) {
    return res.status(404).json({
      success: false,
      mensagem: `ALIAS '${chave}' não foi encontrado no WebService de Discovery.`
    });
  }

  if (registro.status !== 'ativo') {
    return res.status(403).json({
      success: false,
      inativo: true,
      status: 'inativo',
      mensagem: `O ambiente ALIAS '${chave}' está INATIVO e não está apto para o uso.`
    });
  }

  return res.json({
    success: true,
    alias: registro.alias,
    nomeEmpresa: registro.nomeEmpresa,
    empresaPrincipal: registro.empresaPrincipal || '001',
    codEstabelPadrao: registro.codEstabelPadrao || '101',
    pasoeUrl: registro.pasoeUrl,
    temCredencialTecnica: Boolean(registro.usuarioIntegracao && registro.senhaIntegracao),
    usuarioIntegracao: registro.usuarioIntegracao || '',
    status: registro.status,
    descricao: registro.descricao || '',
    timestamp: new Date().toISOString()
  });
});

// 2. Listagem de ALIAS cadastrados
router.get('/aliases', (req, res) => {
  const aliases = carregarAliases();
  const lista = Object.values(aliases).map(a => ({
    ...a,
    senhaIntegracao: a.senhaIntegracao ? '********' : ''
  }));
  return res.json({
    success: true,
    total: lista.length,
    aliases: lista
  });
});

// 3. Cadastro / Atualização de ALIAS
router.post('/aliases', (req, res) => {
  const {
    alias,
    nomeEmpresa,
    empresaPrincipal,
    codEstabelPadrao,
    pasoeUrl,
    usuarioIntegracao,
    senhaIntegracao,
    descricao,
    status
  } = req.body;

  if (!alias || !pasoeUrl) {
    return res.status(400).json({
      success: false,
      mensagem: 'Os campos alias e pasoeUrl são obrigatórios.'
    });
  }

  const chave = alias.trim().toLowerCase();
  const aliases = carregarAliases();
  const existente = aliases[chave] || {};

  aliases[chave] = {
    alias: chave,
    nomeEmpresa: (nomeEmpresa || chave.toUpperCase()).trim(),
    empresaPrincipal: (empresaPrincipal || '001').trim(),
    codEstabelPadrao: (codEstabelPadrao || '101').trim(),
    pasoeUrl: pasoeUrl.trim().replace(/\/$/, ''),
    usuarioIntegracao: (usuarioIntegracao !== undefined ? usuarioIntegracao : (existente.usuarioIntegracao || '')).trim(),
    senhaIntegracao: (senhaIntegracao !== undefined && senhaIntegracao !== '' && senhaIntegracao !== '********')
      ? senhaIntegracao
      : (existente.senhaIntegracao || ''),
    descricao: (descricao || '').trim(),
    status: (status || 'ativo').trim().toLowerCase(),
    atualizadoEm: new Date().toISOString()
  };

  salvarAliases(aliases);

  return res.json({
    success: true,
    mensagem: `ALIAS '${chave}' salvo com sucesso!`,
    registro: { ...aliases[chave], senhaIntegracao: aliases[chave].senhaIntegracao ? '********' : '' }
  });
});

// 4. Exclusão de ALIAS
router.delete('/aliases/:alias', (req, res) => {
  const chave = (req.params.alias || '').trim().toLowerCase();
  const aliases = carregarAliases();

  if (!aliases[chave]) {
    return res.status(404).json({ success: false, mensagem: 'ALIAS não encontrado.' });
  }

  delete aliases[chave];
  salvarAliases(aliases);

  return res.json({ success: true, mensagem: `ALIAS '${chave}' removido.` });
});

// 5. Teste de Conexão com Endpoint do PASOE
router.post('/test-connection', async (req, res) => {
  const { url, pasoeUrl, endpoint, usuario, senha, companyId } = req.body;

  let targetUrl = url;
  if (!targetUrl && pasoeUrl) {
    const base = pasoeUrl.trim().replace(/\/+$/, '');
    const ep = (endpoint || 'fcGetEstabelecimentos').trim().replace(/^\/+/, '');
    targetUrl = `${base}/${ep}`;
  }

  if (!targetUrl) {
    return res.status(400).json({ success: false, mensagem: 'URL ou pasoeUrl é obrigatória.' });
  }

  let user = usuario;
  let pass = senha;
  if (!user && !pass) {
    const aliases = carregarAliases();
    const match = Object.values(aliases).find(a => targetUrl.includes(a.pasoeUrl) || (pasoeUrl && a.pasoeUrl === pasoeUrl));
    if (match && match.usuarioIntegracao && match.senhaIntegracao) {
      user = match.usuarioIntegracao;
      pass = match.senhaIntegracao;
    }
  }

  const cid = String(companyId || '001');
  const headers = {
    'Content-Type': 'application/json',
    'companyId': cid,
    'Accept': 'application/json, text/plain, */*'
  };

  if (user && pass) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  const inicio = Date.now();
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      redirect: 'manual'
    });
    const tempoMs = Date.now() - inicio;

    const status = response.status;
    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();

    let bodyJson = null;
    if (contentType.includes('application/json')) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch (e) {}
    }

    if (status === 302 || status === 307 || status === 401) {
      return res.json({
        success: false,
        status,
        tempoMs,
        targetUrl,
        mensagem: bodyJson?.mensagem || bodyJson?.error_description || 'Falha de autenticação Basic Auth no PASOE.'
      });
    }

    return res.json({
      success: status >= 200 && status < 300,
      status,
      tempoMs,
      targetUrl,
      mensagem: status >= 200 && status < 300 ? 'Conexão estabelecida com sucesso!' : `Servidor respondeu com HTTP ${status}`,
      body: bodyJson || bodyText.slice(0, 1500)
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      tempoMs: Date.now() - inicio,
      targetUrl,
      mensagem: `Erro de comunicação de rede: ${err.message}`
    });
  }
});

module.exports = router;

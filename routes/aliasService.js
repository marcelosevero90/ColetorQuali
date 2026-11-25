// routes/aliasService.js - WebService de Descoberta e Gestão de ALIAS PASOE dos Clientes

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ALIASES_FILE = path.join(__dirname, '..', 'data', 'aliases.json');
const TMP_ALIASES_FILE = path.join(require('os').tmpdir(), 'aliases.json');
const TMP_DELETED_FILE = path.join(require('os').tmpdir(), 'aliases_deleted.json');
const VERCEL_ORIGIN = 'https://coletorquali.vercel.app';
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.AWS_REGION);
let memoriaDeleted = new Set();

function carregarDeleted() {
  const set = new Set(memoriaDeleted);
  try {
    if (fs.existsSync(TMP_DELETED_FILE)) {
      const lista = JSON.parse(fs.readFileSync(TMP_DELETED_FILE, 'utf8') || '[]');
      lista.forEach(k => set.add(String(k).toLowerCase()));
    }
  } catch (e) {}
  return set;
}

function salvarDeleted(set) {
  memoriaDeleted = new Set(set);
  try {
    fs.writeFileSync(TMP_DELETED_FILE, JSON.stringify(Array.from(set)), 'utf8');
  } catch (e) {}
}

function carregarAliases() {
  const padrao = {
    teste: {
      alias: 'teste',
      nomeEmpresa: 'AMBIENTE REAL PASOE (PROMOB)',
      empresaPrincipal: '001',
      codEstabelPadrao: '101',
      pasoeUrl: 'https://realtors-broadcasting-badge-granny.trycloudflare.com',
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
      pasoeUrl: '/api/datasul',
      status: 'ativo',
      descricao: 'Ambiente Local/Nuvem de Testes e Homologação (Simulador Fiel collect/*.p)'
    }
  };

  let aliases = { ...padrao };

  try {
    if (fs.existsSync(ALIASES_FILE)) {
      const conteudo = fs.readFileSync(ALIASES_FILE, 'utf8');
      aliases = { ...aliases, ...JSON.parse(conteudo) };
    }
  } catch (err) {
    console.error('Erro ao ler aliases.json do projeto:', err);
  }

  // Fallback para persistência em Lambda/Vercel (os.tmpdir)
  try {
    if (fs.existsSync(TMP_ALIASES_FILE)) {
      const conteudoTmp = fs.readFileSync(TMP_ALIASES_FILE, 'utf8');
      aliases = { ...aliases, ...JSON.parse(conteudoTmp) };
    }
  } catch (errTmp) {
    console.error('Erro ao ler /tmp/aliases.json:', errTmp);
  }

  // Remove explicitamente qualquer alias marcado como deletado
  const deleted = carregarDeleted();
  deleted.forEach(k => {
    delete aliases[k];
  });

  return aliases;
}

function salvarAliases(aliases) {
  let gravou = false;

  // 1. Tentar gravar no arquivo oficial do projeto (funciona em localhost / servidores com disco gravável)
  try {
    const dir = path.dirname(ALIASES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf8');
    gravou = true;
  } catch (err) {
    console.warn('Ambiente somente-leitura (Vercel/Serverless): não foi possível gravar em data/aliases.json:', err.message);
  }

  // 2. Gravar em os.tmpdir() (único diretório com permissão de escrita em Lambdas da AWS/Vercel)
  try {
    fs.writeFileSync(TMP_ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf8');
    gravou = true;
  } catch (errTmp) {
    console.error('Erro ao gravar em /tmp/aliases.json:', errTmp.message);
  }

  return gravou;
}

function obterTunnelUrl(aliases) {
  const candidato = (process.env.TUNNEL_URL || aliases?.teste?.pasoeUrl || aliases?.henn?.pasoeUrl || '').trim().replace(/\/+$/, '');
  if (candidato && candidato.includes('trycloudflare.com')) {
    return candidato;
  }
  return '';
}

async function sincronizarRemotoLeitura(aliases, chaveAlvo = '') {
  const deleted = carregarDeleted();
  const alvos = [];

  if (IS_VERCEL) {
    const tunnelUrl = obterTunnelUrl(aliases);
    if (tunnelUrl) alvos.push(`${tunnelUrl}/api/discovery/aliases?raw=1`);
  } else {
    alvos.push(`${VERCEL_ORIGIN}/api/discovery/aliases?raw=1`);
  }

  let alterou = false;
  for (const url of alvos) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'x-alias-sync': '1' },
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const remotos = Array.isArray(data.aliases) ? data.aliases : [];
        remotos.forEach(rem => {
          if (!rem || !rem.alias) return;
          const k = String(rem.alias).trim().toLowerCase();
          if (deleted.has(k)) return;
          if (!aliases[k] || (chaveAlvo && k === chaveAlvo)) {
            aliases[k] = {
              ...(aliases[k] || {}),
              ...rem,
              senhaIntegracao: (rem.senhaIntegracao && rem.senhaIntegracao !== '********')
                ? rem.senhaIntegracao
                : (aliases[k]?.senhaIntegracao || 'qwe8451')
            };
            alterou = true;
          }
        });
      }
    } catch (e) {}
  }

  if (alterou) {
    salvarAliases(aliases);
  }
  return aliases;
}

async function replicarSalvamentoRemoto(registro, aliases) {
  const alvos = [];
  if (IS_VERCEL) {
    const tunnelUrl = obterTunnelUrl(aliases);
    if (tunnelUrl) alvos.push(`${tunnelUrl}/api/discovery/aliases`);
  } else {
    alvos.push(`${VERCEL_ORIGIN}/api/discovery/aliases`);
  }

  for (const url of alvos) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-alias-sync': '1'
        },
        body: JSON.stringify(registro),
        signal: ctrl.signal
      });
      clearTimeout(timer);
    } catch (e) {}
  }
}

async function replicarExclusaoRemota(chave, aliases) {
  const alvos = [];
  if (IS_VERCEL) {
    const tunnelUrl = obterTunnelUrl(aliases);
    if (tunnelUrl) alvos.push(`${tunnelUrl}/api/discovery/aliases/${encodeURIComponent(chave)}`);
  } else {
    alvos.push(`${VERCEL_ORIGIN}/api/discovery/aliases/${encodeURIComponent(chave)}`);
  }

  for (const url of alvos) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      await fetch(url, {
        method: 'DELETE',
        headers: { 'x-alias-sync': '1' },
        signal: ctrl.signal
      });
      clearTimeout(timer);
    } catch (e) {}
  }
}

// 0. Ponte invisível de sincronização de localStorage entre Vercel e Localhost
router.get('/sync-bridge', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
    (function() {
      try {
        var customMap = JSON.parse(localStorage.getItem('coletor_custom_aliases') || '{}');
        var deletedList = JSON.parse(localStorage.getItem('coletor_deleted_aliases') || '[]');
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'COLETOR_ALIAS_SYNC',
            origin: window.location.origin,
            customMap: customMap,
            deletedList: deletedList
          }, '*');
        }
        Object.keys(customMap).forEach(function(k) {
          if (deletedList.indexOf(k.toLowerCase()) === -1 && customMap[k] && customMap[k].alias && customMap[k].pasoeUrl) {
            fetch('/api/discovery/aliases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(customMap[k])
            }).catch(function(){});
          }
        });
        window.addEventListener('message', function(ev) {
          if (!ev.data || typeof ev.data !== 'object') return;
          if (ev.data.type === 'COLETOR_PUSH_ALIAS' && ev.data.aliasObj) {
            var obj = ev.data.aliasObj;
            var key = String(obj.alias || '').toLowerCase();
            if (!key) return;
            var cm = JSON.parse(localStorage.getItem('coletor_custom_aliases') || '{}');
            cm[key] = obj;
            localStorage.setItem('coletor_custom_aliases', JSON.stringify(cm));
            var dl = JSON.parse(localStorage.getItem('coletor_deleted_aliases') || '[]');
            dl = dl.filter(function(x) { return String(x).toLowerCase() !== key; });
            localStorage.setItem('coletor_deleted_aliases', JSON.stringify(dl));
          } else if (ev.data.type === 'COLETOR_DELETE_ALIAS' && ev.data.alias) {
            var keyDel = String(ev.data.alias || '').toLowerCase();
            var cmDel = JSON.parse(localStorage.getItem('coletor_custom_aliases') || '{}');
            delete cmDel[keyDel];
            localStorage.setItem('coletor_custom_aliases', JSON.stringify(cmDel));
            var dlDel = JSON.parse(localStorage.getItem('coletor_deleted_aliases') || '[]');
            if (dlDel.indexOf(keyDel) === -1) dlDel.push(keyDel);
            localStorage.setItem('coletor_deleted_aliases', JSON.stringify(dlDel));
          }
        });
      } catch (e) {}
    })();
  </script></body></html>`);
});

// 1. Resolução de ALIAS
// GET /api/discovery/resolve?alias=demo
router.get(['/resolve', '/resolve/:alias'], async (req, res) => {
  const chave = (req.params.alias || req.query.alias || '').trim().toLowerCase();

  if (!chave) {
    return res.status(400).json({
      success: false,
      mensagem: 'Parâmetro alias é obrigatório.'
    });
  }

  let aliases = carregarAliases();
  let registro = aliases[chave];

  if (!registro && !req.headers['x-alias-sync']) {
    aliases = await sincronizarRemotoLeitura(aliases, chave);
    registro = aliases[chave];
  }

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
router.get('/aliases', async (req, res) => {
  let aliases = carregarAliases();
  if (!req.headers['x-alias-sync']) {
    aliases = await sincronizarRemotoLeitura(aliases);
  }
  const isRaw = req.query.raw === '1' && req.headers['x-alias-sync'] === '1';
  const lista = Object.values(aliases).map(a => ({
    ...a,
    senhaIntegracao: isRaw ? (a.senhaIntegracao || '') : (a.senhaIntegracao ? '********' : '')
  }));
  return res.json({
    success: true,
    total: lista.length,
    aliases: lista
  });
});

// 3. Cadastro / Atualização de ALIAS
router.post('/aliases', async (req, res) => {
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
  const deleted = carregarDeleted();
  if (deleted.has(chave)) {
    deleted.delete(chave);
    salvarDeleted(deleted);
  }

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

  if (!req.headers['x-alias-sync']) {
    await replicarSalvamentoRemoto(aliases[chave], aliases);
  }

  return res.json({
    success: true,
    mensagem: `ALIAS '${chave}' salvo com sucesso!`,
    registro: { ...aliases[chave], senhaIntegracao: aliases[chave].senhaIntegracao ? '********' : '' }
  });
});

// 4. Exclusão de ALIAS
async function excluirAliasHandler(req, res) {
  const chave = (req.params.alias || req.body?.alias || req.query?.alias || '').trim().toLowerCase();
  if (!chave) {
    return res.status(400).json({ success: false, mensagem: 'ALIAS não informado.' });
  }

  // 1. Marca explicitamente no Set de deletados
  const deleted = carregarDeleted();
  deleted.add(chave);
  salvarDeleted(deleted);

  // 2. Remove do mapa de aliases
  const aliases = carregarAliases();
  delete aliases[chave];

  // 3. Persiste no arquivo oficial (se gravável) e no /tmp/
  try {
    const dir = path.dirname(ALIASES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf8');
  } catch (err) {}

  try {
    fs.writeFileSync(TMP_ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf8');
  } catch (errTmp) {}

  if (!req.headers['x-alias-sync']) {
    await replicarExclusaoRemota(chave, aliases);
  }

  return res.json({
    success: true,
    mensagem: `Empresa / ALIAS '${chave}' removida com sucesso.`
  });
}

router.delete(['/aliases/:alias', '/aliases/:alias/delete'], excluirAliasHandler);
router.post(['/aliases/:alias/delete', '/aliases/delete/:alias', '/aliases/delete'], excluirAliasHandler);

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

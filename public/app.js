// public/app.js - Orquestrador do App Coletor Móvel TOTVS Datasul (Offline-First - Módulo Inventário)
// Regras de negócio baseadas em collect/app/fc*.p e DFs fms001.df / fms002.df.

const App = (() => {
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

  function normalizarChaveFicha(dtSaldo, codEstabel, codDepos, nrContagem, nrFicha) {
    const dt = normalizarDataIso(dtSaldo);
    const est = String(codEstabel || '').trim();
    const dep = String(codDepos || '').trim().toUpperCase();
    const cont = Number(nrContagem || 1);
    const ficha = Number(nrFicha || 0);
    return `${dt}_${est}_${dep}_${cont}_${ficha}`;
  }

  function normalizarChaveFichaSemDep(dtSaldo, codEstabel, nrContagem, nrFicha) {
    const dt = normalizarDataIso(dtSaldo);
    const est = String(codEstabel || '').trim();
    const cont = Number(nrContagem || 1);
    const ficha = Number(nrFicha || 0);
    return `${dt}_${est}_${cont}_${ficha}`;
  }
  const container = document.getElementById('screen-container');

  const state = {
    aliasInput: localStorage.getItem('coletor_ultimo_alias') || '',
    usuarioInput: localStorage.getItem('coletor_ultimo_usuario') || '',
    senhaInput: '',
    empresaInput: localStorage.getItem('coletor_ultima_empresa') || localStorage.getItem('datasul_company_id') || '001',
    estabelecInput: '',
    simularOffline: false,
    session: {
      codUsuario: null,
      nome: null,
      alias: null,
      pasoeUrl: null,
      codEmpresa: '001',
      codEstabel: '',
      nomeEstabel: '',
      authHeader: null,
      codMobile: null,
      paramUsuario: null
    },
    estabelecimentosGlobais: [],
    inventariosResumo: [],
    inventarioSelecionado: null,
    depositosInventario: [],
    depositoSelecionado: null,
    contagemAtivaFichas: 1,
    abaInventario: 'APURACAO',
    fichasAvulsas: [],
    fichas: [],
    fichasFiltradas: [],
    filtrosConferencia: {
      item: '',
      desc: '',
      localiz: '',
      lote: '',
      agrup: '',
      status: 'TODAS'
    },
    fichaAtual: null,
    historicoContagens: [],
    pesquisaInterna: {
      tipo: null,
      dados: [],
      filtrados: []
    },
    telaAtual: 'login',
    modoVisualizacao: 'app'
  };

  function isOnline() {
    if (state.simularOffline) return false;
    return navigator.onLine;
  }

  function alternarSimulacaoOffline() {
    state.simularOffline = !state.simularOffline;
    const btn = document.getElementById('btn-simular-offline');
    const lbl = document.getElementById('lbl-simular-offline');
    if (btn && lbl) {
      btn.classList.toggle('is-offline-sim', state.simularOffline);
      lbl.textContent = state.simularOffline ? 'Simulando Offline' : 'Modo Rede: Auto';
    }
    atualizarStatusRede();
  }

  async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    atualizarStatusRede();
    // Sincronização automática de pendências ao restabelecer conectividade
    window.addEventListener('online', () => {
      atualizarStatusRede();
      executarSincronizacaoRecorrenteBackground(true);
    });
    window.addEventListener('offline', atualizarStatusRede);

    // Rotina de Sincronização Recorrente em Segundo Plano (a cada 20 minutos)
    setInterval(() => {
      executarSincronizacaoRecorrenteBackground(false);
    }, 20 * 60 * 1000);

    await DB.openDB();

    let codMobile = localStorage.getItem('datasul_cod_mobile');
    if (!codMobile) {
      codMobile = 'COL-' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('datasul_cod_mobile', codMobile);
    }
    state.session.codMobile = codMobile;

    Scanner.initHardwareListener((codigo, origem) => {
      processarLeituraHardware(codigo, origem);
    });

    // Carregar estabelecimentos já persistidos localmente para suportar login offline
    try {
      const estsLocais = await DB.getAll('estabelec');
      if (estsLocais && estsLocais.length > 0) {
        state.estabelecimentosGlobais = estsLocais;
      }
    } catch (e) {}

    atualizarBarraStatus();
    navegar('login');
  }

  function atualizarRelogio() {
    const el = document.getElementById('status-relogio');
    if (el) el.textContent = new Date().toTimeString().slice(0, 5);
  }

  function atualizarStatusRede() {
    const badge = document.getElementById('status-rede-badge');
    const online = isOnline();
    if (badge) {
      badge.className = `status-badge-network ${online ? 'online' : 'offline'}`;
      badge.textContent = online ? '● Online' : '● Modo Offline';
    }
    atualizarBadgePendencias();
  }

  async function atualizarBadgePendencias() {
    const badge = document.getElementById('header-sync-badge');
    if (!badge) return;
    try {
      const emp = state.session.codEmpresa || null;
      const qtd = emp ? await DB.getQtdPendenciasSync(emp) : 0;
      badge.textContent = qtd;
      badge.style.display = qtd > 0 ? 'flex' : 'none';
    } catch (e) {
      badge.style.display = 'none';
    }
  }

  // Sincronização Recorrente em Segundo Plano (Offline-First)
  async function executarSincronizacaoRecorrenteBackground(imediata = false) {
    if (!isOnline() || !state.session.codUsuario) return;
    const codEmpresa = state.session.codEmpresa || '001';

    try {
      // 1. Enviar pendências da fila offline se houver
      const qtdPend = await DB.getQtdPendenciasSync(codEmpresa);
      if (qtdPend > 0) {
        console.log(`[SYNC RECORRENTE] Transmitindo ${qtdPend} pendência(s) offline da Empresa ${codEmpresa}...`);
        await DB.integrarFilaOffline(
          codEmpresa,
          state.session.pasoeUrl || '/api/datasul',
          state.session.authHeader
        );
        await atualizarBadgePendencias();
      }

      // 2. Atualização periódica de fichas do inventário se conectado
      if (state.telaAtual === 'inventarios_ativos' && !imediata) {
        console.log(`[SYNC RECORRENTE] Atualizando fichas do inventário em background...`);
        await carregarInventariosAtivos(true);
      }
    } catch (e) {
      console.warn('[SYNC RECORRENTE] Erro na sincronização em background:', e.message);
    }
  }

  // Wrapper HTTP obrigatório: sempre envia Authorization Basic (usuário/senha TOTVS) + companyId
  function pasoeFetch(endpoint, options = {}) {
    const pasoeUrl = state.session.pasoeUrl || '/api/datasul';
    const codEmpresa = DB.normalizarEmpresa(options.companyId || state.session.codEmpresa || '001');
    const authHeader = options.authHeader || state.session.authHeader;

    const rawUrl = endpoint.startsWith('http')
      ? endpoint
      : `${pasoeUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

    // Se for aplicativo APK nativo (Capacitor ou Cordova)
    const isNativeApp = !!(window.Capacitor || window.cordova);
    let finalUrl = rawUrl;
    // O proxy no servidor só é usado no navegador Web comum para contornar restrições de Mixed Content (HTTPS -> HTTP) e CORS.
    // No APK nativo no celular, o app comunica-se diretamente com o IP/URL local do PASOE na intranet do cliente.
    if (!isNativeApp && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) && !rawUrl.includes(window.location.host)) {
      finalUrl = `/api/pasoe-proxy?url=${encodeURIComponent(rawUrl)}`;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'companyId': codEmpresa,
      ...(authHeader ? { 'Authorization': authHeader } : {}),
      ...(options.headers || {})
    };

    return fetch(finalUrl, {
      ...options,
      headers
    });
  }

  function extrairLista(resJson, ...chaves) {
    if (!resJson) return [];
    if (Array.isArray(resJson)) return resJson;
    if (Array.isArray(resJson.items)) return resJson.items;
    for (const k of chaves) {
      if (Array.isArray(resJson[k])) return resJson[k];
    }
    return [];
  }

  function atualizarBarraStatus() {
    const label = document.getElementById('status-info-empresa');
    if (label) {
      if (state.session.codUsuario && state.session.codEstabel) {
        label.textContent = `Emp ${state.session.codEmpresa} • Fil ${state.session.codEstabel}`;
      } else {
        label.textContent = 'Aguardando login...';
      }
    }
    atualizarBadgePendencias();
  }

  function mostrarLoading(titulo = 'Processando...', mensagem = 'Aguarde...', progresso = null) {
    const overlay = document.getElementById('global-loading-overlay');
    if (!overlay) return;
    document.getElementById('glo-title').textContent = titulo;
    document.getElementById('glo-msg').textContent = mensagem;
    const pCont = document.getElementById('glo-progress-container');
    const pBar = document.getElementById('glo-progress-bar');
    if (progresso !== null && progresso !== undefined) {
      pCont.style.display = 'block';
      pBar.style.width = `${Math.min(100, Math.max(0, progresso))}%`;
    } else {
      pCont.style.display = 'none';
    }
    overlay.classList.add('active');
  }

  function ocultarLoading() {
    document.getElementById('global-loading-overlay')?.classList.remove('active');
  }

  function navegar(tela, params = {}) {
    state.telaAtual = tela;

    const footer = document.getElementById('app-footer');
    if (footer) {
      footer.style.display = tela === 'login' ? 'none' : 'flex';
      document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        const isInv = btn.dataset.tab === 'inventarios_ativos' && tela.startsWith('inventario');
        const isTransf = btn.dataset.tab === 'transferencias' && tela.startsWith('transferencia');
        btn.classList.toggle('active', btn.dataset.tab === tela || isInv || isTransf);
      });
    }

    container.innerHTML = '';

    switch (tela) {
      case 'login': renderTelaLogin(); break;
      case 'menu': renderTelaMenu(); break;
      case 'estabelecimentos': renderTelaEstabelecimentos(); break;
      case 'inventarios_ativos': renderTelaInventariosAtivos(); break;
      case 'inventario_depositos': renderTelaInventarioDepositos(); break;
      case 'inventario_fichas': renderTelaInventarioFichas(); break;
      case 'inventario_conferencia': renderTelaInventarioConferencia(params.ficha); break;
      case 'inventario_avulsa': renderTelaInventarioAvulsa(); break;
      case 'transferencias': renderTelaTransferencias(params); break;
      case 'transferencia_saida': renderTelaTransferenciaSaida(params ? params.transf : null); break;
      case 'transferencia_entrada': renderTelaTransferenciaEntrada(params ? params.transf : null); break;
      case 'transferencia_consulta': renderTelaTransferenciaConsulta(params ? params.transf : null); break;
      case 'historico_contagens': renderTelaHistoricoContagens(); break;
      case 'sincronizacao': renderTelaSincronizacao(); break;
      default: renderTelaMenu();
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatarDataBr(dtStr) {
    if (!dtStr) return '';
    const s = String(dtStr).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const p = s.slice(0, 10).split('-');
      return `${p[2]}/${p[1]}/${p[0]}`;
    }
    return s;
  }

  function formatarParaInputDate(dtStr) {
    if (!dtStr) return '';
    const s = String(dtStr).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (s.includes('/')) {
      const p = s.split('/');
      if (p.length === 3 && p[2].length === 4) {
        return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
      }
    }
    return '';
  }

  function mostrarAviso(msg, tipo = 'info') {
    let containerAviso = document.getElementById('app-aviso-toast');
    if (!containerAviso) {
      containerAviso = document.createElement('div');
      containerAviso.id = 'app-aviso-toast';
      containerAviso.style.cssText = 'position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:999999; display:flex; flex-direction:column; gap:8px; max-width:92%; width:360px; pointer-events:none;';
      document.body.appendChild(containerAviso);
    }
    const toast = document.createElement('div');
    const corBg = tipo === 'error' ? '#ef4444' : tipo === 'success' ? '#10b981' : tipo === 'warning' ? '#f59e0b' : '#0284c7';
    toast.style.cssText = `background:${corBg}; color:#fff; font-size:12px; font-weight:600; padding:10px 14px; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.25); pointer-events:auto; display:flex; align-items:center; justify-content:space-between;`;
    toast.innerHTML = `<span style="word-break:break-word;">${escapeHtml(msg)}</span><button type="button" style="background:none; border:none; color:#fff; font-size:14px; font-weight:bold; cursor:pointer; margin-left:8px;" onclick="this.parentElement.remove()">✕</button>`;
    containerAviso.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
  }

  // =========================================================================
  // TELA 1: LOGIN COM ALIAS, USUÁRIO/SENHA TOTVS, EMPRESA E ESTABELECIMENTO
  // Segue modern-web-guidance: autofill-sign-in-form
  // =========================================================================
  function renderTelaLogin() {
    if (!state.aliasInput) state.aliasInput = localStorage.getItem('coletor_ultimo_alias') || '';
    if (!state.usuarioInput) state.usuarioInput = localStorage.getItem('coletor_ultimo_usuario') || '';
    if (!state.empresaInput) state.empresaInput = localStorage.getItem('coletor_ultima_empresa') || localStorage.getItem('datasul_company_id') || '001';

    const empresasCache = [...new Set((state.estabelecimentosGlobais || []).map(e => DB.normalizarEmpresa(e.codEmpresa)))].sort();

    container.innerHTML = `
      <div style="text-align: center; padding: 14px 0 6px 0;">
        <div style="width: 52px; height: 52px; background: #e0f2fe; border: 2px solid #bae6fd; border-radius: 14px; margin: 0 auto 10px auto; display: flex; align-items: center; justify-content: center; font-size: 26px;">
          📦
        </div>
        <h2 style="font-size: 19px; font-weight: 800; color: #0f172a;">Coletor Quali</h2>
        <div style="font-size: 11.5px; color: #64748b;">Inventário Físico • Operação Offline-First</div>
      </div>

      <form class="card-modern" id="form-login" onsubmit="event.preventDefault(); App.executarLogin();" novalidate>
        <div class="form-group">
          <label class="form-label" for="login-alias">ALIAS do Ambiente PASOE *</label>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="login-alias" name="alias" class="form-input" placeholder="ex: demo ou teste" value="${escapeHtml(state.aliasInput)}" list="alias-options-list" required spellcheck="false" autocapitalize="none" enterkeyhint="next" onchange="localStorage.setItem('coletor_ultimo_alias', this.value.trim().toLowerCase()); App.resolverAliasLogin()">
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 0 12px;" onclick="App.resolverAliasLogin()" title="Consultar ALIAS">🔍</button>
          </div>
          <datalist id="alias-options-list">
            <option value="demo">demo - Simulador Local Offline-First</option>
            <option value="teste">teste - PASOE Real (10.15.1.20:8180)</option>
            <option value="blanver">blanver - CYG Biotech</option>
            <option value="santacolomba">santacolomba - Santa Colomba (Emp 002)</option>
          </datalist>
          <span id="alias-info-tag" style="font-size: 10.5px; color: #64748b; font-weight: 600; margin-top: 3px; display: block;">
            Informe o ALIAS do servidor (ou opere offline com base já carregada).
          </span>
        </div>

        <div class="form-group">
          <label class="form-label" for="login-usuario">Usuário TOTVS *</label>
          <input type="text" id="login-usuario" name="username" class="form-input" placeholder="Seu login no Datasul" value="${escapeHtml(state.usuarioInput)}" autocomplete="username" spellcheck="false" autocorrect="off" autocapitalize="none" enterkeyhint="next" onchange="localStorage.setItem('coletor_ultimo_usuario', this.value.trim());" required>
        </div>

        <div class="form-group">
          <label class="form-label" for="login-senha">Senha TOTVS *</label>
          <div class="password-wrap">
            <input type="password" id="login-senha" name="password" class="form-input" placeholder="Sua senha" value="${escapeHtml(state.senhaInput)}" autocomplete="current-password" enterkeyhint="done" required>
            <button type="button" class="btn-toggle-pass" onclick="App.alternarVisibilidadeSenha()">Mostrar</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="login-empresa">Empresa (companyId) *</label>
          <select id="login-empresa" name="companyId" class="form-input" onchange="App.onLoginEmpresaChange()">
            ${empresasCache.length > 0
              ? empresasCache.map(emp => `<option value="${emp}" ${emp === state.empresaInput ? 'selected' : ''}>Empresa ${emp}</option>`).join('')
              : '<option value="001">Empresa 001 (Padrão)</option><option value="002">Empresa 002</option>'}
          </select>
        </div>

        <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 8px;">
          <button type="submit" class="btn btn-primary" id="btn-submit-login">
            Acessar Sistema ➔
          </button>
        </div>
      </form>

      <div style="text-align: center; font-size: 10.5px; color: #94a3b8; margin-top: 8px;">
        Autenticação HTTP Basic Auth + Header <code>companyId</code> por empresa
      </div>
    `;

    if (state.aliasInput) {
      resolverAliasLogin();
    }

    setTimeout(() => {
      const aliasEl = document.getElementById('login-alias');
      const usuarioEl = document.getElementById('login-usuario');
      const senhaEl = document.getElementById('login-senha');
      if (aliasEl && !aliasEl.value) {
        aliasEl.focus();
      } else if (usuarioEl && !usuarioEl.value) {
        usuarioEl.focus();
      } else if (senhaEl) {
        senhaEl.focus();
        senhaEl.select();
      }
    }, 150);
  }

  function alternarVisibilidadeSenha() {
    const input = document.getElementById('login-senha');
    const btn = document.querySelector('.btn-toggle-pass');
    if (!input || !btn) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = 'Ocultar';
    } else {
      input.type = 'password';
      btn.textContent = 'Mostrar';
    }
  }

  async function resolverAliasLogin() {
    const aliasEl = document.getElementById('login-alias');
    const infoTag = document.getElementById('alias-info-tag');
    const empresaEl = document.getElementById('login-empresa');
    if (!aliasEl || !infoTag) return;

    const alias = aliasEl.value.trim().toLowerCase();
    state.aliasInput = alias;
    if (!alias) return;

    // 1. Checa se há override salvo no dispositivo (localStorage do navegador/app)
    let overrideAlias = null;
    try {
      const customMap = JSON.parse(localStorage.getItem('coletor_custom_aliases') || '{}');
      if (customMap[alias]) overrideAlias = customMap[alias];
    } catch (e) {}

    if (overrideAlias) {
      if ((overrideAlias.status || 'ativo').toLowerCase() === 'inativo') {
        infoTag.textContent = `✕ O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso.`;
        infoTag.style.color = '#dc2626';
        mostrarAviso(`O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso.`, 'error');
        return;
      }
      state.session.pasoeUrl = overrideAlias.pasoeUrl;
      state.session.alias = overrideAlias.alias;
      await DB.putConfig(`alias_${alias}`, overrideAlias);
      infoTag.textContent = `✓ ${overrideAlias.nomeEmpresa || alias} (${overrideAlias.pasoeUrl})`;
      infoTag.style.color = '#059669';

      const empDefault = DB.normalizarEmpresa(overrideAlias.empresaPrincipal || '001');
      if (empresaEl) {
        const existeOpt = Array.from(empresaEl.options).some(o => o.value === empDefault);
        if (!existeOpt) {
          const opt = document.createElement('option');
          opt.value = empDefault;
          opt.textContent = `Empresa ${empDefault}`;
          empresaEl.appendChild(opt);
        }
        empresaEl.value = empDefault;
        state.empresaInput = empDefault;
      }
      return;
    }

    if (!isOnline()) {
      const aliasSalvo = await DB.getConfig(`alias_${alias}`);
      if (aliasSalvo) {
        state.session.pasoeUrl = aliasSalvo.pasoeUrl;
        infoTag.textContent = `● Offline: usando ALIAS '${alias}' em cache local.`;
        infoTag.style.color = '#d97706';
      } else {
        infoTag.textContent = '● Offline: tente entrar com último login sincronizado.';
        infoTag.style.color = '#dc2626';
      }
      return;
    }

    try {
      infoTag.textContent = `Consultando Discovery '${alias}'...`;
      const res = await fetch(`/api/discovery/resolve?alias=${encodeURIComponent(alias)}`);
      const data = await res.json();
      if (data.success) {
        if (data.status === 'inativo') {
          infoTag.textContent = `✕ O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso.`;
          infoTag.style.color = '#dc2626';
          mostrarAviso(`O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso.`, 'error');
          return;
        }
        state.session.pasoeUrl = data.pasoeUrl;
        state.session.alias = data.alias;
        await DB.putConfig(`alias_${alias}`, data);
        infoTag.textContent = `✓ ${data.nomeEmpresa} (${data.pasoeUrl})`;
        infoTag.style.color = '#059669';

        const empDefault = DB.normalizarEmpresa(data.empresaPrincipal || '001');
        if (empresaEl) {
          const existeOpt = Array.from(empresaEl.options).some(o => o.value === empDefault);
          if (!existeOpt) {
            const opt = document.createElement('option');
            opt.value = empDefault;
            opt.textContent = `Empresa ${empDefault}`;
            empresaEl.appendChild(opt);
          }
          empresaEl.value = empDefault;
          state.empresaInput = empDefault;
        }
      } else {
        infoTag.textContent = `✕ ${data.mensagem}`;
        infoTag.style.color = '#dc2626';
      }
    } catch (e) {
      infoTag.textContent = 'Aviso: Discovery indisponível, operando via cache.';
      infoTag.style.color = '#d97706';
    }
  }

  function onLoginEmpresaChange() {
    const el = document.getElementById('login-empresa');
    if (el) {
      state.empresaInput = DB.normalizarEmpresa(el.value);
      localStorage.setItem('coletor_ultima_empresa', state.empresaInput);
      localStorage.setItem('datasul_company_id', state.empresaInput);
    }
  }

  async function executarLogin() {
    const aliasEl = document.getElementById('login-alias');
    const usuarioEl = document.getElementById('login-usuario');
    const senhaEl = document.getElementById('login-senha');
    const empresaEl = document.getElementById('login-empresa');
    const btn = document.getElementById('btn-submit-login');

    const alias = (aliasEl?.value || state.aliasInput || '').trim().toLowerCase();
    const usuario = (usuarioEl?.value || '').trim();
    const senha = (senhaEl?.value || '');
    const codEmpresa = DB.normalizarEmpresa(empresaEl?.value || state.empresaInput || '001');

    if (alias) localStorage.setItem('coletor_ultimo_alias', alias);
    if (usuario) localStorage.setItem('coletor_ultimo_usuario', usuario);
    if (codEmpresa) {
      localStorage.setItem('coletor_ultima_empresa', codEmpresa);
      localStorage.setItem('datasul_company_id', codEmpresa);
    }

    if (!alias || !usuario || !senha) {
      mostrarAviso('Informe ALIAS, Usuário TOTVS e Senha TOTVS.', 'warning');
      return;
    }

    state.aliasInput = alias;
    state.usuarioInput = usuario;
    state.senhaInput = senha;
    state.empresaInput = codEmpresa;

    const authHeader = 'Basic ' + btoa(`${usuario}:${senha}`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = isOnline() ? 'Autenticando no PASOE...' : 'Validando acesso offline...';
    }

    try {
      // Validação de status do ALIAS no Discovery (se online)
      if (isOnline()) {
        try {
          const resCheck = await fetch(`/api/discovery/resolve?alias=${encodeURIComponent(alias)}`);
          if (resCheck.ok) {
            const dataCheck = await resCheck.json();
            if (dataCheck.status === 'inativo' || dataCheck.inativo) {
              mostrarAviso(`O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso. Contate o administrador.`, 'error');
              if (btn) { btn.disabled = false; btn.textContent = 'Acessar Sistema ➔'; }
              return;
            }
          } else if (resCheck.status === 403) {
            const errCheck = await resCheck.json();
            mostrarAviso(errCheck.mensagem || `O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso.`, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Acessar Sistema ➔'; }
            return;
          }
        } catch (eCheck) {
          console.warn('Discovery offline ou inacessível no momento do login:', eCheck);
        }
      } else {
        const aliasCache = await DB.getConfig(`alias_${alias}`);
        if (aliasCache && aliasCache.status === 'inativo') {
          mostrarAviso(`O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso.`, 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Acessar Sistema ➔'; }
          return;
        }
      }

      // MODO OFFLINE: autentica contra parâmetros/sessão armazenados no dispositivo
      if (!isOnline()) {
        const paramLocal = await DB.obterParamUsuarioLocal(codEmpresa, usuario);
        const sessaoSalva = await DB.getConfig(`credencial_${alias}_${usuario.toLowerCase()}`);

        if (!paramLocal && !sessaoSalva) {
          throw new Error('Sem conexão com o PASOE e este usuário ainda não realizou uma carga offline neste aparelho.');
        }
        if (sessaoSalva && sessaoSalva.authHeader && sessaoSalva.authHeader !== authHeader) {
          throw new Error('Senha incorreta para acesso offline.');
        }

        if (paramLocal && (!paramLocal.permEstoque || !paramLocal.permEstoqReqInv)) {
          throw new Error(`Usuário '${usuario}' não possui permissão de Inventário (FMSC0101) na empresa ${codEmpresa}.`);
        }

        const ests = (await DB.getAll('estabelec')).filter(e => DB.matchEmpresa(e.codEmpresa, codEmpresa));
        state.estabelecimentosGlobais = await DB.getAll('estabelec');
        const estabPad = paramLocal?.codEstabPad || sessaoSalva?.codEstabel || ests[0]?.codEstabel || '101';
        const estabObj = ests.find(e => e.codEstabel === estabPad) || ests[0] || { codEstabel: estabPad, nome: `Filial ${estabPad}`, codEmpresa };

        state.session = {
          ...state.session,
          codUsuario: usuario,
          nome: paramLocal?.nome || usuario.toUpperCase(),
          alias,
          pasoeUrl: sessaoSalva?.pasoeUrl || state.session.pasoeUrl || '/api/datasul',
          codEmpresa,
          codEstabel: estabObj.codEstabel,
          nomeEstabel: estabObj.nome,
          authHeader,
          paramUsuario: paramLocal || { permEstoque: true, permEstoqReqInv: true, codEstabPad: estabObj.codEstabel }
        };

        localStorage.setItem('datasul_company_id', codEmpresa);
        atualizarBarraStatus();
        navegar('menu');
        return;
      }

      // MODO ONLINE:
      // 1. Resolve ALIAS
      const resDisc = await fetch(`/api/discovery/resolve?alias=${encodeURIComponent(alias)}`);
      const dataDisc = await resDisc.json();
      if (!dataDisc.success) {
        throw new Error(dataDisc.mensagem || 'ALIAS inválido.');
      }

      state.session.pasoeUrl = dataDisc.pasoeUrl;
      state.session.alias = dataDisc.alias;
      state.session.codEmpresa = codEmpresa;
      state.session.authHeader = authHeader;
      await DB.putConfig(`alias_${alias}`, dataDisc);

      // 2. Autentica no fcLogin enviando Basic Auth + companyId + payload (compatível com raiz e array)
      const resLogin = await pasoeFetch('/fcLogin', {
        method: 'POST',
        companyId: codEmpresa,
        authHeader,
        body: JSON.stringify({
          usuario,
          senha,
          payload: [{ usuario, senha }]
        })
      });

      const dataLogin = await resLogin.json().catch(() => ({}));
      if (resLogin.status === 401 || dataLogin.type === 'ERROR' || dataLogin.success === false) {
        throw new Error(dataLogin.message || dataLogin.detailedMessage || dataLogin.mensagem || 'Usuário ou senha TOTVS inválidos.');
      }

      const estabLogin = (dataLogin.message || dataLogin.codEstabPad || '').trim();

      // 3. Busca tabela global estabelec (fcGetEstabelecimentos) e salva no IndexedDB
      try {
        const resEst = await pasoeFetch('/fcGetEstabelecimentos', {
          method: 'GET',
          companyId: codEmpresa,
          authHeader
        });
        if (resEst.ok) {
          const dataEst = await resEst.json();
          const ests = extrairLista(dataEst, 'estabelecimentos');
          if (ests.length > 0) {
            state.estabelecimentosGlobais = ests;
            await DB.bulkPut('estabelec', ests);
          }
        }
      } catch (eEst) {
        console.warn('Aviso fcGetEstabelecimentos:', eEst);
      }

      // 4. Consulta parâmetros do usuário na empresa selecionada (fcGetParamUsuario -> fmsc-usuar-mestre)
      let paramUsuario = null;
      try {
        const resParam = await pasoeFetch('/fcGetParamUsuario', {
          method: 'PUT',
          companyId: codEmpresa,
          authHeader,
          body: JSON.stringify({
            usuario,
            payload: [{ usuario }]
          })
        });
        if (resParam.ok) {
          const dataParam = await resParam.json();
          const listaP = extrairLista(dataParam);
          if (listaP.length > 0) {
            paramUsuario = listaP[0];
            await DB.bulkPut('fmsc_usuar_mestre', [paramUsuario], codEmpresa);
          }
        }
      } catch (eParam) {
        console.warn('Aviso fcGetParamUsuario:', eParam);
      }

      if (paramUsuario) {
        if (Number(paramUsuario.situacao) === 0) {
          throw new Error(`Usuário '${usuario}' não habilitado no FMSC0101 para a empresa ${codEmpresa}.`);
        }
        if (!paramUsuario.permEstoque || !paramUsuario.permEstoqReqInv) {
          throw new Error(`Usuário '${usuario}' não possui permissão de Estoque/Inventário (FMSC0101) na empresa ${codEmpresa}.`);
        }
      }

      const estsEmpresa = (state.estabelecimentosGlobais || []).filter(e => DB.matchEmpresa(e.codEmpresa, codEmpresa));
      const codEstabPad = (paramUsuario?.codEstabPad || estabLogin || estsEmpresa[0]?.codEstabel || '101').trim();
      const estabObj = estsEmpresa.find(e => e.codEstabel === codEstabPad) || estsEmpresa[0] || {
        codEstabel: codEstabPad,
        nome: `Filial ${codEstabPad}`,
        codEmpresa
      };

      state.session = {
        ...state.session,
        codUsuario: dataLogin.usuario?.codUsuario || usuario,
        nome: paramUsuario?.nome || dataLogin.usuario?.nome || usuario.toUpperCase(),
        alias,
        pasoeUrl: dataDisc.pasoeUrl,
        codEmpresa,
        codEstabel: estabObj.codEstabel,
        nomeEstabel: estabObj.nome,
        authHeader,
        paramUsuario
      };

      // Salva credencial hash/header localmente para validar login offline futuro
      await DB.putConfig(`credencial_${alias}_${usuario.toLowerCase()}`, {
        codUsuario: state.session.codUsuario,
        codEmpresa,
        codEstabel: estabObj.codEstabel,
        pasoeUrl: dataDisc.pasoeUrl,
        authHeader
      });
      localStorage.setItem('datasul_company_id', codEmpresa);
      atualizarBarraStatus();

      // 5. Se for login real (não demo), expurga qualquer resíduo mock anterior de inventário
      if (alias !== 'demo') {
        const ultAlias = await DB.getConfig(`ultimo_alias_${codEmpresa}`);
        if (ultAlias !== alias) {
          await DB.clearEmpresa('fichas_inventario', codEmpresa);
          await DB.clearEmpresa('fmsc_inventario', codEmpresa);
          await DB.putConfig(`ultimo_alias_${codEmpresa}`, alias);
        }
      }

      // Se primeira carga nesta empresa ou carga vencida (>24h), inicia carga offline em chunks
      if (FastLoader.precisaCargaDiaria(codEmpresa)) {
        abrirModalCargaInicial(`Sincronizando cadastros mestres e fichas da Empresa ${codEmpresa} para operação Offline-First...`, true);
      } else {
        navegar('menu');
      }
    } catch (err) {
      mostrarAviso('Falha no Acesso: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Acessar Sistema ➔';
      }
    }
  }

  function logoff() {
    if (!confirm('Deseja encerrar a sessão atual?')) return;
    state.session = {
      codUsuario: null,
      nome: null,
      alias: null,
      pasoeUrl: null,
      codEmpresa: '001',
      codEstabel: '',
      nomeEstabel: '',
      authHeader: null,
      codMobile: state.session.codMobile,
      paramUsuario: null
    };
    state.senhaInput = '';
    state.aliasInput = localStorage.getItem('coletor_ultimo_alias') || state.aliasInput;
    state.usuarioInput = localStorage.getItem('coletor_ultimo_usuario') || state.usuarioInput;
    state.empresaInput = localStorage.getItem('coletor_ultima_empresa') || localStorage.getItem('datasul_company_id') || state.empresaInput;
    atualizarBarraStatus();
    navegar('login');
  }

  // =========================================================================
  // TELA 2: MENU PRINCIPAL (EXCLUSIVO PARA INVENTÁRIO NESTE MOMENTO)
  // =========================================================================
  async function renderTelaMenu() {
    const codEmpresa = state.session.codEmpresa || '001';
    const usuario = state.session.nome || state.session.codUsuario || 'Operador';
    const filial = state.session.codEstabel || '-';
    const nomeFilial = state.session.nomeEstabel || '';

    const fichasEmp = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    const fichasFilial = fichasEmp.filter(f => f.codEstabel === filial);
    const pendentes = fichasFilial.filter(f => f.qtApurada === null || f.qtApurada === undefined).length;
    const qtdSync = await DB.getQtdPendenciasSync(codEmpresa);
    const transfList = await DB.listarTransferencias(codEmpresa, state.session.codUsuario);
    const transfPendEntrada = transfList.filter(t => t.status === 'PENDENTE_ENTRADA').length;

    container.innerHTML = `
      <div class="home-active-banner">
        <div class="home-banner-left">
          <div class="home-banner-icon">📦</div>
          <div>
            <div class="home-banner-title">Inventário Físico (CE0712)</div>
            <div class="home-banner-sub">${fichasFilial.length > 0 ? `${fichasFilial.length} ficha(s) no aparelho • ${pendentes} pendente(s)` : 'Consultar inventários do ERP TOTVS (Online/Offline)'}</div>
          </div>
        </div>
        <button class="home-banner-btn" onclick="App.navegar('inventarios_ativos')">
          Iniciar ➔
        </button>
      </div>

      <div class="home-section-title">Operações Disponíveis</div>

      <div class="home-service-grid">
        <button type="button" class="home-service-card is-active" onclick="App.navegar('inventarios_ativos')">
          <div class="home-card-icon-wrap icon-wrap-orange">📋</div>
          <div class="home-card-title" style="color: #0284c7;">Contagem Física</div>
          <div class="home-card-desc">Apuração 1ª/2ª/3ª rodada e ficha avulsa 100% offline</div>
        </button>

        <button type="button" class="home-service-card" onclick="App.navegar('transferencias')">
          <div class="home-card-icon-wrap icon-wrap-purple" style="background:#e0e7ff; color:#4338ca;">🔄</div>
          <div class="home-card-title" style="color: #4338ca;">Transf. Material</div>
          <div class="home-card-desc">${transfPendEntrada > 0 ? `<strong style="color:#d97706;">${transfPendEntrada} pendente(s) de entrada</strong>` : 'Movimentação CE0206 (Saída e Entrada)'}</div>
        </button>

        <button type="button" class="home-service-card" onclick="App.abrirModalCargaInicial('Atualizar Dados Offline')">
          <div class="home-card-icon-wrap icon-wrap-blue">📥</div>
          <div class="home-card-title">Carga (Totvs ➔ App)</div>
          <div class="home-card-desc">Baixar itens em chunks, parâmetros e fichas</div>
        </button>

        <button type="button" class="home-service-card" onclick="App.navegar('sincronizacao')">
          <div class="home-card-icon-wrap icon-wrap-green">📤</div>
          <div class="home-card-title">Descarga / Fila Sync</div>
          <div class="home-card-desc">${qtdSync > 0 ? `<strong style="color:#ea580c;">${qtdSync} pendência(s) offline</strong>` : 'Todas as contagens sincronizadas'}</div>
        </button>

        <button type="button" class="home-service-card" onclick="App.navegar('historico_contagens')">
          <div class="home-card-icon-wrap icon-wrap-purple">🔍</div>
          <div class="home-card-title">Histórico & Auditoria</div>
          <div class="home-card-desc">Consultar leituras gravadas no dispositivo</div>
        </button>
      </div>

      <div class="home-user-card">
        <div class="home-user-left">
          <div class="home-user-avatar">👤</div>
          <div style="flex: 1; min-width: 0;">
            <div class="home-user-name">${escapeHtml(usuario)}</div>
            <div class="home-user-estabel">
              Emp <strong>${escapeHtml(codEmpresa)}</strong> • Fil <strong>${escapeHtml(filial)}</strong>
              <div style="font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(nomeFilial)}</div>
            </div>
          </div>
        </div>
        <button class="btn btn-secondary" style="width: auto; padding: 5px 10px; font-size: 11px;" onclick="App.navegar('estabelecimentos')">Trocar ▾</button>
      </div>

      <button class="home-btn-clean" onclick="App.limparBancoESincronizar()">
        🧹 Limpar Cache da Empresa ${escapeHtml(codEmpresa)} e Recarregar
      </button>
    `;
  }

  // =========================================================================
  // TELA 3: SELEÇÃO DE EMPRESA / ESTABELECIMENTO (TABELA GLOBAL estabelec)
  // =========================================================================
  async function renderTelaEstabelecimentos() {
    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <button class="btn-topbar-action" onclick="App.navegar('menu')">‹ Voltar</button>
        <h3 style="font-size: 15px; font-weight: 800;">Empresa & Estabelecimento</h3>
        <span style="width: 50px;"></span>
      </div>
      <p style="font-size: 11.5px; color: #64748b;">
        A tabela <code>estabelec</code> é global. Ao selecionar uma filial, o Header <code>companyId</code> é atualizado automaticamente para sua respectiva empresa:
      </p>
      <div id="lista-estabel-container" style="display: flex; flex-direction: column; gap: 8px;">
        <div style="text-align:center; padding:20px; color:#94a3b8;">Carregando estabelecimentos...</div>
      </div>
    `;

    let lista = await DB.getAll('estabelec');
    if (isOnline()) {
      try {
        const res = await pasoeFetch('/fcGetEstabelecimentos');
        if (res.ok) {
          const data = await res.json();
          const remotos = extrairLista(data, 'estabelecimentos');
          if (remotos.length > 0) {
            lista = remotos;
            await DB.bulkPut('estabelec', remotos);
          }
        }
      } catch (e) {}
    }

    state.estabelecimentosGlobais = lista;
    const div = document.getElementById('lista-estabel-container');
    if (!div) return;
    div.innerHTML = '';

    if (lista.length === 0) {
      div.innerHTML = '<div class="card-modern" style="text-align:center; color:#64748b;">Nenhum estabelecimento carregado.</div>';
      return;
    }

    lista.forEach(est => {
      const empEst = DB.normalizarEmpresa(est.codEmpresa);
      const isAtual = est.codEstabel === state.session.codEstabel && DB.matchEmpresa(empEst, state.session.codEmpresa);

      const card = document.createElement('div');
      card.className = 'card-modern';
      card.style.cursor = 'pointer';
      card.style.border = isAtual ? '2px solid #0284c7' : '1px solid #e2e8f0';
      card.style.background = isAtual ? '#f0f9ff' : '#ffffff';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 13.5px; font-weight: 800; color: #0f172a;">${escapeHtml(est.codEstabel)} - ${escapeHtml(est.nome)}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
              🏢 Empresa (companyId): <strong style="color: #0284c7;">${escapeHtml(empEst)}</strong> ${est.cgc ? `• CNPJ: ${escapeHtml(est.cgc)}` : ''}
            </div>
          </div>
          ${isAtual ? '<span class="badge badge-info">Ativo</span>' : '<span style="font-size: 18px; color: #94a3b8;">›</span>'}
        </div>
      `;

      card.onclick = async () => {
        const mudouEmpresa = !DB.matchEmpresa(empEst, state.session.codEmpresa);
        state.session.codEmpresa = empEst;
        state.session.codEstabel = est.codEstabel;
        state.session.nomeEstabel = est.nome;
        localStorage.setItem('datasul_company_id', empEst);

        if (mudouEmpresa && isOnline()) {
          try {
            const resP = await pasoeFetch('/fcGetParamUsuario', {
              method: 'PUT',
              companyId: empEst,
              body: JSON.stringify({
                usuario: state.session.codUsuario,
                payload: [{ usuario: state.session.codUsuario }]
              })
            });
            if (resP.ok) {
              const dP = await resP.json();
              const arr = extrairLista(dP);
              if (arr.length > 0) {
                state.session.paramUsuario = arr[0];
                await DB.bulkPut('fmsc_usuar_mestre', [arr[0]], empEst);
                if (!arr[0].permEstoque || !arr[0].permEstoqReqInv) {
                  alert(`Atenção: Usuário '${state.session.codUsuario}' não possui permissão de Inventário na empresa ${empEst}.`);
                }
              }
            }
          } catch (e) {}
        }

        atualizarBarraStatus();
        const fichasEmp = await DB.getAllByEmpresa('fichas_inventario', empEst);
        if (mudouEmpresa && fichasEmp.length === 0 && isOnline()) {
          abrirModalCargaInicial(`Sincronizando dados da Empresa ${empEst}...`);
        } else {
          navegar('menu');
        }
      };

      div.appendChild(card);
    });
  }

  // =========================================================================
  // NÍVEL 1 DO INVENTÁRIO: DATAS DE INVENTÁRIO & PARÂMETROS (fmsc-inventario)
  // =========================================================================
  async function renderTelaInventariosAtivos() {
    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <button class="btn-topbar-action" onclick="App.navegar('menu')">‹ Menu</button>
        <div style="font-size: 14.5px; font-weight: 800; color: #0f172a;">Inventários (${escapeHtml(state.session.codEstabel)})</div>
        <div style="display: flex; gap: 6px;">
          <button class="btn-topbar-action" onclick="App.limparCacheInventario()" title="Limpar Cache Local">🧹</button>
          <button class="btn-topbar-action" onclick="App.carregarInventariosAtivos(true)" title="Sincronizar com TOTVS">🔄</button>
        </div>
      </div>

      <div style="display: flex; gap: 6px; margin-top: 4px;">
        <button class="btn btn-secondary" style="flex: 1; padding: 9px; font-size: 12px; border: 1.5px solid #bae6fd; background: #f0f9ff; color: #0284c7;" onclick="App.sincronizarInventariosOnline()">
          🔄 Atualizar do TOTVS
        </button>
        <button class="btn btn-secondary" style="width: auto; padding: 9px 12px; font-size: 12px; border: 1.5px solid #fed7aa; background: #fff7ed; color: #c2410c;" onclick="App.limparCacheInventario()" title="Limpar dados locais desta empresa">
          🧹 Limpar
        </button>
      </div>

      <div id="lista-inventarios-ativos" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 12px;">Consultando inventários...</div>
      </div>
    `;

    await carregarInventariosAtivos(isOnline());
  }

  async function sincronizarInventariosOnline() {
    if (!isOnline()) {
      alert('Dispositivo sem conexão. Exibindo dados já salvos localmente (Offline-First).');
      await carregarInventariosAtivos(false);
      return;
    }
    await carregarInventariosAtivos(true);
  }

  async function limparCacheInventario() {
    const codEmpresa = state.session.codEmpresa || '001';
    const qtdPend = await DB.getQtdPendenciasSync(codEmpresa);
    if (qtdPend > 0) {
      if (!confirm(`Atenção: Existem ${qtdPend} contagem(ns) pendente(s) de envio offline no aparelho. Se limpar o cache agora, elas serão perdidas. Deseja realmente limpar?`)) {
        return;
      }
    }
    await DB.clearEmpresa('fichas_inventario', codEmpresa);
    await DB.clearEmpresa('fmsc_inventario', codEmpresa);
    state.inventariosResumo = [];
    mostrarAviso(`Cache de inventário da Empresa ${codEmpresa} foi limpo com sucesso!`, 'success');
    await carregarInventariosAtivos(isOnline());
  }

  async function carregarInventariosAtivos(forcarOnline = false) {
    const codEmpresa = state.session.codEmpresa || '001';
    const codEstabel = state.session.codEstabel || '';
    const listDiv = document.getElementById('lista-inventarios-ativos');
    if (!listDiv) return;

    const deveBuscarOnline = (forcarOnline || state.session.alias !== 'demo') && isOnline();

    if (deveBuscarOnline) {
      mostrarLoading('Consultando TOTVS', `Buscando parâmetros e fichas de inventário da Empresa ${codEmpresa}...`);
      let houveRespostaWebservice = false;
      let totalFichasRecebidas = 0;
      let qtdParamRecebidos = 0;
      let params = [];
      let datasAtivas = [];

      try {
        // 1. Parâmetros fmsc-inventario no PASOE
        const payloadParam = {
          codEmpresa,
          epCodigo: codEmpresa,
          dtSaldo: ''
        };
        const resP = await pasoeFetch('/fcGetInventarioParam', {
          method: 'PUT',
          companyId: codEmpresa,
          body: JSON.stringify({ ...payloadParam, payload: [payloadParam] })
        });
        if (resP.ok) {
          const dP = await resP.json();
          params = extrairLista(dP);
          houveRespostaWebservice = true;
          qtdParamRecebidos = params.length;
        }

        // Se params veio vazio da API, tenta obter do banco local
        if (params.length === 0) {
          params = await DB.getAllByEmpresa('fmsc_inventario', codEmpresa);
        }

        // Consulta específica por data ativa para trazer o nrContagAtiva e parâmetros mais frescos do ERP
        for (let idx = 0; idx < params.length; idx++) {
          const dtIso = normalizarDataIso(params[idx].dtSaldo);
          if (dtIso) {
            try {
              const pData = { codEmpresa, epCodigo: codEmpresa, dtSaldo: dtIso };
              const rData = await pasoeFetch('/fcGetInventarioParam', {
                method: 'PUT',
                companyId: codEmpresa,
                body: JSON.stringify({ ...pData, payload: [pData] })
              });
              if (rData.ok) {
                const dData = await rData.json();
                const lData = extrairLista(dData);
                if (lData.length > 0 && lData[0]) {
                  params[idx] = { ...params[idx], ...lData[0] };
                  if (lData[0].nrContagAtiva) {
                    params[idx].nrContagAtiva = Number(lData[0].nrContagAtiva);
                  }
                }
              }
            } catch (errPData) {
              console.warn(`Erro ao consultar parâmetro específico para data ${dtIso}:`, errPData);
            }
          }
        }

        if (params.length > 0) {
          await DB.bulkPut('fmsc_inventario', params, codEmpresa);
        } else if (houveRespostaWebservice) {
          await DB.clearEmpresa('fmsc_inventario', codEmpresa);
        }

        datasAtivas = [...new Set(params.map(p => normalizarDataIso(p.dtSaldo)).filter(Boolean))];

        // 2. Fichas de inventário (1ª, 2ª e 3ª contagens) com Detecção de Atualizações Externas no TOTVS
        const qtdPend = await DB.getQtdPendenciasSync(codEmpresa);
        const fichasLocaisAntes = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
        const filaSyncLocal = await DB.getFilaSyncEmpresa(codEmpresa);
        const setFilaApuracao = new Set(
          filaSyncLocal.filter(p => p.status === 'Pendente' && p.tipo === 'INVENTARIO_APURACAO')
            .map(p => normalizarChaveFicha(p.payload?.dtSaldo, p.payload?.codEstabel, p.payload?.codDepos, p.payload?.nrContagem, p.payload?.nrFicha))
        );
        const setFilaApuracaoSemDep = new Set(
          filaSyncLocal.filter(p => p.status === 'Pendente' && p.tipo === 'INVENTARIO_APURACAO')
            .map(p => normalizarChaveFichaSemDep(p.payload?.dtSaldo, p.payload?.codEstabel, p.payload?.nrContagem, p.payload?.nrFicha))
        );
        const mapaLocais = new Map();
        fichasLocaisAntes.forEach(f => {
          mapaLocais.set(normalizarChaveFicha(f.dtSaldo, f.codEstabel, f.codDepos, f.nrContagem, f.nrFicha), f);
          mapaLocais.set(normalizarChaveFichaSemDep(f.dtSaldo, f.codEstabel, f.nrContagem, f.nrFicha), f);
        });

        const alertasAlteracaoExterna = [];
        const datasParaBuscar = datasAtivas.length > 0 ? datasAtivas : [''];

        for (const dtBusca of datasParaBuscar) {
          for (const nrCont of [1, 2, 3]) {
            const payloadF = {
              codEmpresa,
              epCodigo: codEmpresa,
              codEstabel,
              dtSaldo: dtBusca,
              itCodigo: '',
              codDepos: '',
              codLocaliz: '',
              lote: '',
              codRefer: '',
              nrContagem: nrCont,
              codUsuario: state.session.codUsuario || '',
              apenasPendentes: false // Busca todas para atualizar o status e detectar divergências
            };
            console.log(`[CARGA FICHAS] Consultando fcGetInventariosFichas: Data=${dtBusca}, Contagem=${nrCont}, Est=${codEstabel}`);
            const resF = await pasoeFetch('/fcGetInventariosFichas', {
              method: 'PUT',
              companyId: codEmpresa,
              body: JSON.stringify({ ...payloadF, payload: [payloadF] })
            });
            if (resF.ok) {
              const dF = await resF.json();
              const listaTotvs = extrairLista(dF, 'fichas');
              const fichasR = listaTotvs.map(f => {
                const dtIso = normalizarDataIso(f.dtSaldo) || dtBusca;
                const codDepNorm = String(f.codDepos || '').trim().toUpperCase();
                const codEstNorm = String(f.codEstabel || codEstabel).trim();
                const nrFichaNum = Number(f.nrFicha);
                const nrContNum = Number(f.nrContagem || nrCont);
                const chave = normalizarChaveFicha(dtIso, codEstNorm, codDepNorm, nrContNum, nrFichaNum);
                const chaveSemDep = normalizarChaveFichaSemDep(dtIso, codEstNorm, nrContNum, nrFichaNum);
                const loc = mapaLocais.get(chave) || mapaLocais.get(chaveSemDep);
                const temLeituraApp = Boolean(loc && (loc.pendenteSync || setFilaApuracao.has(chave) || setFilaApuracaoSemDep.has(chaveSemDep)));
                const qtdTotvs = (f.qtApurada !== null && f.qtApurada !== undefined && f.qtApurada !== '') ? Number(f.qtApurada) : null;

                if (loc && temLeituraApp) {
                  const qtdApp = Number(loc.qtApurada);
                  if (qtdTotvs !== null && qtdTotvs !== qtdApp) {
                    alertasAlteracaoExterna.push({
                      nrFicha: nrFichaNum,
                      itCodigo: f.itCodigo,
                      descItem: f.descItem || loc.descItem || f.itCodigo,
                      codDepos: codDepNorm,
                      codLocaliz: f.codLocaliz || loc.codLocaliz || '',
                      lote: f.lote || loc.lote || '',
                      nrContagem: nrContNum,
                      qtdApp,
                      qtdTotvs,
                      usuarioTotvs: f.codConfteContag || 'ERP TOTVS'
                    });
                    loc.alteradaNoTotvs = true;
                    loc.qtdTotvs = qtdTotvs;
                    loc.usuarioTotvs = f.codConfteContag || 'ERP TOTVS';
                  }
                  return loc;
                }
                return {
                  ...f,
                  codEmpresa,
                  dtSaldo: dtIso,
                  codEstabel: codEstNorm,
                  codDepos: codDepNorm,
                  nrContagem: nrContNum,
                  nrFicha: nrFichaNum,
                  qtApurada: qtdTotvs
                };
              });

              houveRespostaWebservice = true;
              if (fichasR.length > 0) {
                if (nrCont === 1 && dtBusca === datasParaBuscar[0] && qtdPend === 0) {
                  await DB.clearEmpresa('fichas_inventario', codEmpresa);
                }
                await DB.bulkPut('fichas_inventario', fichasR, codEmpresa, 500);
                totalFichasRecebidas += fichasR.length;

                // Se recebeu contagem 1, garante que as rodadas 2 e 3 tenham registros base no IndexedDB
                // caso o PASOE ainda não retorne a 2ª/3ª contagem
                if (nrCont === 1) {
                  const fichasR2 = fichasR.map(f => {
                    const q2 = (f.valApurado2 !== null && f.valApurado2 !== undefined && f.valApurado2 !== '') ? Number(f.valApurado2) : null;
                    return { ...f, nrContagem: 2, qtApurada: q2, codConfteContag: f.codConfteContag2 || '' };
                  });
                  const fichasR3 = fichasR.map(f => {
                    const q3 = (f.valApurado3 !== null && f.valApurado3 !== undefined && f.valApurado3 !== '') ? Number(f.valApurado3) : null;
                    return { ...f, nrContagem: 3, qtApurada: q3, codConfteContag: f.codConfteContag3 || '' };
                  });
                  await DB.bulkPut('fichas_inventario', fichasR2, codEmpresa, 500);
                  await DB.bulkPut('fichas_inventario', fichasR3, codEmpresa, 500);
                }
              }
            }
          }
        }

        if (alertasAlteracaoExterna.length > 0) {
          mostrarAviso(`⚠️ ATENÇÃO: ${alertasAlteracaoExterna.length} ficha(s) foram atualizadas no TOTVS enquanto você estava offline! Suas contagens foram preservadas e serão validadas ao descarregar.`, 'warning');
          setTimeout(() => abrirModalAlertaAlteracoesTotvs(alertasAlteracaoExterna), 500);
        } else if (forcarOnline && totalFichasRecebidas > 0) {
          mostrarAviso(`✓ Carga concluída! ${totalFichasRecebidas} fichas de inventário sincronizadas do TOTVS.`, 'success');
        }

        // Se o Webservice respondeu normalmente e não há fichas nem parâmetros no TOTVS,
        // limpa o cache local dessa empresa para refletir fielmente o TOTVS sem dados fake
        if (houveRespostaWebservice && totalFichasRecebidas === 0 && qtdParamRecebidos === 0 && qtdPend === 0) {
          await DB.clearEmpresa('fichas_inventario', codEmpresa);
          await DB.clearEmpresa('fmsc_inventario', codEmpresa);
        }
      } catch (e) {
        console.error('Falha ao atualizar inventários online:', e);
        mostrarAviso(`Falha na sincronização: ${e.message}`, 'error');
      } finally {
        ocultarLoading();
      }
    }

    // Monta resumo 100% a partir do IndexedDB da empresa e filial selecionada
    const paramsInv = await DB.getAllByEmpresa('fmsc_inventario', codEmpresa);
    const fichasRaw = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    console.log(`[RESUMO INVENTARIO] Fichas totais encontradas no IndexedDB da Empresa ${codEmpresa}: ${fichasRaw.length}`);
    const todasFichas = fichasRaw.filter(f =>
      (!codEstabel || String(f.codEstabel).trim() === String(codEstabel).trim()) &&
      Number(f.situacao) !== 3
    );

    // Considera a contagem ativa (ou menor contagem existente por data) para resumo principal da data
    const datasSet = new Set([
      ...todasFichas.map(f => normalizarDataIso(f.dtSaldo)),
      ...paramsInv.map(p => normalizarDataIso(p.dtSaldo))
    ].filter(Boolean));

    const resumo = Array.from(datasSet).sort((a, b) => b.localeCompare(a)).map(dt => {
      const param = paramsInv.find(p => normalizarDataIso(p.dtSaldo) === dt) || {
        codEmpresa,
        dtSaldo: dt,
        indSitInv: 1,
        permContgUsFc: false,
        indTipoInv: 1,
        nrContagAtiva: 1
      };
      const nrContagAtiva = Number(param.nrContagAtiva || param.nr_contag_ativa || 1);
      const rodadaFiltro = (nrContagAtiva >= 1 && nrContagAtiva <= 3) ? nrContagAtiva : 1;
      const fichasData = todasFichas.filter(f => normalizarDataIso(f.dtSaldo) === dt && Number(f.nrContagem) === rodadaFiltro);
      const baseResumo = fichasData.length > 0 ? fichasData : todasFichas.filter(f => normalizarDataIso(f.dtSaldo) === dt);

      const total = baseResumo.length;
      const contadas = baseResumo.filter(f => f.qtApurada !== null && f.qtApurada !== undefined).length;

      return {
        dtSaldo: dt,
        indSitInv: Number(param.indSitInv || 1),
        permContgUsFc: Boolean(param.permContgUsFc),
        indTipoInv: Number(param.indTipoInv || 1),
        nrContagAtiva,
        totalFichas: total,
        contadas,
        pendentes: total - contadas
      };
    })
    .filter(r => r.nrContagAtiva !== 4) // REGRA: nr-contag-ativa = 4 (concluído) NÃO lista no App!
    .filter(r => r.totalFichas > 0 || paramsInv.some(p => p.dtSaldo === r.dtSaldo));

    state.inventariosResumo = resumo;
    renderCardsInventariosAtivos(resumo);
  }

  function renderCardsInventariosAtivos(lista) {
    const listDiv = document.getElementById('lista-inventarios-ativos');
    if (!listDiv) return;

    if (!lista || lista.length === 0) {
      const codEmp = escapeHtml(state.session.codEmpresa || '001');
      const codEst = escapeHtml(state.session.codEstabel || '');
      listDiv.innerHTML = `
        <div class="card-modern" style="text-align: center; padding: 28px 16px; color: #475569;">
          <div style="font-size: 34px; margin-bottom: 8px;">📦</div>
          <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 6px;">
            Nenhum Inventário Ativo no TOTVS
          </div>
          <div style="font-size: 12px; line-height: 1.5; color: #64748b; margin-bottom: 14px;">
            Não há inventários abertos nem fichas ativas para a <strong>Empresa ${codEmp}</strong> e <strong>Estabelecimento ${codEst}</strong>.<br><br>
            • Verifique se há contagens geradas no <strong>CE0701</strong> do Datasul.<br>
            • Verifique se os parâmetros estão configurados no <strong>FMSC0102</strong>.<br>
            • Assegure que as procedures de API (<code>fcGetInventarioParam.r</code> e <code>fcGetInventariosFichas.r</code>) estejam compiladas no PASOE.
          </div>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="App.carregarInventariosAtivos(true)" style="width: auto; padding: 8px 16px; font-size: 12px;">
              🔄 Consultar Novamente
            </button>
            <button class="btn btn-secondary" onclick="App.limparCacheInventario()" style="width: auto; padding: 8px 16px; font-size: 12px;">
              🧹 Limpar Cache Local
            </button>
          </div>
        </div>
      `;
      return;
    }

    listDiv.innerHTML = '';
    lista.forEach(inv => {
      const isBloqueado = Number(inv.indSitInv) === 2;
      const nrAtiva = Number(inv.nrContagAtiva || 1);
      const card = document.createElement('div');
      card.className = 'inv-card';
      card.innerHTML = `
        <div class="inv-header">
          <div class="inv-title">📦 Inventário ${formatarDataBr(inv.dtSaldo)}</div>
          <div style="display: flex; gap: 5px; align-items: center;">
            <span class="badge" style="background: #e0f2fe; color: #0369a1; font-weight: 800; border: 1px solid #bae6fd; font-size: 11px;">
              📍 ${nrAtiva}ª Contagem Ativa
            </span>
            <span class="inv-badge-situacao ${isBloqueado ? 'badge-sit-bloqueado' : 'badge-sit-andamento'}">
              ${isBloqueado ? '🔒 Bloqueado' : '✓ Liberado'}
            </span>
          </div>
        </div>

        <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
          • Rodada ativa para contagem: <strong>${nrAtiva}ª Contagem</strong> (demais bloqueadas)<br>
          • Tipo: <strong>${inv.indTipoInv === 2 ? 'Por Operador' : 'Por Fichas'}</strong> • Mesmo usuário: <strong>${inv.permContgUsFc ? 'Permitido' : 'Segregado'}</strong>
        </div>

        <div class="inv-stats-boxed">
          <div class="inv-stat-col">
            <div class="lbl">Fichas (${nrAtiva}ª)</div>
            <div class="val">${inv.totalFichas}</div>
          </div>
          <div class="inv-stat-col contadas">
            <div class="lbl">Contadas</div>
            <div class="val">${inv.contadas}</div>
          </div>
          <div class="inv-stat-col pendentes">
            <div class="lbl">Pendentes</div>
            <div class="val">${inv.pendentes}</div>
          </div>
        </div>

        <button class="btn btn-primary" onclick="App.entrarNoInventario('${inv.dtSaldo}')">
          Selecionar Depósitos ➔
        </button>
      `;
      listDiv.appendChild(card);
    });
  }

  async function entrarNoInventario(dtSaldo) {
    const codEmpresa = state.session.codEmpresa || '001';
    const paramAtual = await DB.obterParamInventarioLocal(codEmpresa, dtSaldo);
    const inv = state.inventariosResumo.find(i => i.dtSaldo === dtSaldo) || paramAtual;
    if (!inv) return;
    if (paramAtual) {
      inv.nrContagAtiva = Number(paramAtual.nrContagAtiva || paramAtual.nr_contag_ativa || inv.nrContagAtiva || 1);
      inv.indSitInv = Number(paramAtual.indSitInv || inv.indSitInv || 1);
      inv.permContgUsFc = Boolean(paramAtual.permContgUsFc);
    }
    state.inventarioSelecionado = inv;

    const codEstabel = state.session.codEstabel || '';
    const deposMestres = await DB.getAllByEmpresa('deposito', codEmpresa);
    const nrAtiva = Number(inv.nrContagAtiva || 1);
    const rodadaFichas = (nrAtiva >= 1 && nrAtiva <= 3) ? nrAtiva : 1;

    state.contagemAtivaFichas = rodadaFichas;
    const todasFichasEmpresa = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    const fichasDataGeral = todasFichasEmpresa.filter(f =>
      f.dtSaldo === dtSaldo &&
      (!codEstabel || f.codEstabel === codEstabel) &&
      Number(f.situacao) !== 3
    );

    let fichasData = fichasDataGeral.filter(f => Number(f.nrContagem) === rodadaFichas);
    if (fichasData.length === 0 && fichasDataGeral.length > 0) {
      const mapaUnicas = new Map();
      fichasDataGeral.forEach(f => {
        if (!mapaUnicas.has(f.nrFicha)) {
          const valRodada = rodadaFichas === 1 ? f.valApurado1 : (rodadaFichas === 2 ? f.valApurado2 : f.valApurado3);
          const confRodada = rodadaFichas === 1 ? f.codConfteContag1 : (rodadaFichas === 2 ? f.codConfteContag2 : f.codConfteContag3);
          mapaUnicas.set(f.nrFicha, {
            ...f,
            nrContagem: rodadaFichas,
            qtApurada: (valRodada !== null && valRodada !== undefined && valRodada !== '') ? Number(valRodada) : null,
            codConfteContag: confRodada || ''
          });
        }
      });
      const novasInstancias = Array.from(mapaUnicas.values());
      await DB.bulkPut('fichas_inventario', novasInstancias, codEmpresa);
      fichasData = novasInstancias;
    }

    const deposUnicos = [...new Set(fichasData.map(f => String(f.codDepos || '').trim().toUpperCase()))].filter(Boolean);
    state.depositosInventario = deposUnicos.map(codDep => {
      const fDep = fichasData.filter(f => f.codDepos === codDep);
      const contadas = fDep.filter(f => f.qtApurada !== null && f.qtApurada !== undefined).length;
      const mDep = deposMestres.find(d => d.codDepos === codDep);
      return {
        codDepos: codDep,
        nome: mDep?.nome || fDep[0]?.nomeDepos || `Depósito ${codDep}`,
        total: fDep.length,
        contadas,
        pendentes: fDep.length - contadas
      };
    }).sort((a, b) => a.codDepos.localeCompare(b.codDepos));

    navegar('inventario_depositos');
  }

  // =========================================================================
  // NÍVEL 2: SELEÇÃO DE DEPÓSITO
  // =========================================================================
  async function renderTelaInventarioDepositos() {
    const inv = state.inventarioSelecionado;
    if (!inv) {
      navegar('inventarios_ativos');
      return;
    }

    const isBloqueado = Number(inv.indSitInv) === 2;
    const nrAtiva = Number(inv.nrContagAtiva || 1);
    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <button class="btn-topbar-action" onclick="App.navegar('inventarios_ativos')">‹ Datas</button>
        <div style="font-size: 14px; font-weight: 800;">Depósitos (${nrAtiva}ª Contagem)</div>
        <button class="btn-topbar-action" onclick="App.navegar('menu')">Menu</button>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; margin-bottom: 8px;">
        <div style="font-size: 11px; color: #64748b;">
          Filial: <strong>${escapeHtml(state.session.codEstabel)}</strong> • Corte: <strong>${formatarDataBr(inv.dtSaldo)}</strong> • <strong>${nrAtiva}ª Contagem Ativa</strong>
          ${isBloqueado ? ' • <strong style="color:#dc2626;">BLOQUEADO</strong>' : ''}
        </div>
        <button class="btn btn-secondary" style="width: auto; font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; background: #f8fafc; border: 1px solid #cbd5e1;" onclick="App.abrirModalContingencia('${inv.dtSaldo}')">
          📥 Contingência do Inventário
        </button>
      </div>
      <div id="lista-depositos-inventario" style="display: flex; flex-direction: column; gap: 10px;"></div>
    `;

    const div = document.getElementById('lista-depositos-inventario');
    const deps = state.depositosInventario || [];
    if (deps.length === 0) {
      div.innerHTML = '<div class="card-modern" style="text-align:center; color:#64748b;">Nenhum depósito com fichas nesta data/filial.</div>';
      return;
    }

    deps.forEach(dep => {
      const card = document.createElement('div');
      card.className = 'card-modern';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-size:14px; font-weight:800; color:#0f172a;">${escapeHtml(dep.codDepos)} - ${escapeHtml(dep.nome)}</div>
          <span class="badge ${dep.pendentes === 0 ? 'badge-success' : 'badge-warning'}">
            ${dep.pendentes === 0 ? '✓ Completo' : `${dep.pendentes} pendente(s)`}
          </span>
        </div>
        <div style="font-size:11.5px; color:#64748b; display:flex; justify-content:space-between;">
          <span>Total: <strong>${dep.total}</strong> fichas</span>
          <span>Contadas: <strong style="color:#059669;">${dep.contadas}</strong></span>
        </div>
      `;
      card.onclick = () => entrarNoDeposito(dep.codDepos);
      div.appendChild(card);
    });
  }

  async function entrarNoDeposito(codDepos) {
    const dep = state.depositosInventario.find(d => d.codDepos === codDepos);
    if (!dep) return;
    state.depositoSelecionado = dep;
    const inv = state.inventarioSelecionado;
    const codEmpresa = state.session.codEmpresa || '001';
    const paramAtual = await DB.obterParamInventarioLocal(codEmpresa, inv?.dtSaldo);
    const nrAtiva = Number(paramAtual?.nrContagAtiva || inv?.nrContagAtiva || 1);
    state.contagemAtivaFichas = (nrAtiva >= 1 && nrAtiva <= 3) ? nrAtiva : 1;
    state.filtrosConferencia = { item: '', desc: '', localiz: '', lote: '', agrup: '', status: 'TODAS' };
    navegar('inventario_fichas');
  }

  // =========================================================================
  // NÍVEL 3: APURAÇÃO DE FICHAS POR RODADA (1ª, 2ª, 3ª) E STATUS
  // =========================================================================
  
  function alternarAbaInventario(aba) {
    state.abaInventario = aba;
    if (aba === 'AVULSA') {
      renderTelaInventarioAvulsa();
    } else {
      renderTelaInventarioFichas();
    }
  }

  async function excluirFichaAvulsaPendente(nrFicha, itCodigo) {
    if (!confirm(`Deseja realmente remover a ficha avulsa do item '${itCodigo}' da fila offline?`)) return;
    const codEmpresa = state.session.codEmpresa || '001';
    const inv = state.inventarioSelecionado;
    const dep = state.depositoSelecionado;
    if (!inv || !dep) return;

    // Remover da fila de sincronização
    const fila = await DB.getFilaSyncEmpresa(codEmpresa);
    const itemFila = fila.find(p =>
      p.tipo === 'INVENTARIO_AVULSA' &&
      p.payload.itCodigo === itCodigo &&
      p.payload.dtSaldo === inv.dtSaldo &&
      String(p.payload.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase()
    );
    if (itemFila) {
      await DB.remove('fila_sync', itemFila.id_uuid);
    }

    // Remover da tabela fichas_inventario
    const nrAtiva = Number(state.contagemAtivaFichas || inv.nrContagAtiva || 1);
    await DB.remove('fichas_inventario', [codEmpresa, inv.dtSaldo, Number(nrFicha), nrAtiva]);

    mostrarAviso(`Ficha avulsa do item '${itCodigo}' removida da fila offline com sucesso.`, 'info');
    atualizarBadgePendencias();
    renderTelaInventarioAvulsa();
  }

  async function renderTelaInventarioFichas() {
    const inv = state.inventarioSelecionado;
    const dep = state.depositoSelecionado;
    if (!inv || !dep) {
      navegar('inventarios_ativos');
      return;
    }

    if (state.abaInventario === 'AVULSA') {
      renderTelaInventarioAvulsa();
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    const paramInv = (await DB.obterParamInventarioLocal(codEmpresa, inv.dtSaldo)) || inv;
    const isBloqueado = Number(paramInv.indSitInv) === 2;
    const nrContagAtiva = Number(paramInv.nrContagAtiva || inv.nrContagAtiva || 1);
    const nrContagem = Number(state.contagemAtivaFichas || nrContagAtiva);
    const agrupamentos = await DB.getAllByEmpresa('agrup_invent', codEmpresa);

    const todasEmpresa = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    const fichasNormaisCount = todasEmpresa.filter(f =>
      !f.avulsa &&
      f.dtSaldo === inv.dtSaldo &&
      (!state.session.codEstabel || f.codEstabel === state.session.codEstabel) &&
      String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase() &&
      Number(f.nrContagem || 1) === nrContagem &&
      Number(f.situacao) !== 3
    ).length;

    const fichasAvulsasCount = todasEmpresa.filter(f =>
      f.avulsa &&
      f.dtSaldo === inv.dtSaldo &&
      (!state.session.codEstabel || f.codEstabel === state.session.codEstabel) &&
      String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase()
    ).length;

    const btnNovaFicha = isBloqueado
      ? `<button class="btn-topbar-action" style="opacity:0.5;" onclick="App.mostrarAviso('Inventário bloqueado nos parâmetros (FMSC0102).', 'warning')">+ Avulsa</button>`
      : `<button class="btn-topbar-action" onclick="App.alternarAbaInventario('AVULSA')">+ Nova Ficha</button>`;

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <button class="btn-topbar-action" onclick="App.entrarNoInventario('${inv.dtSaldo}')">‹ Depósitos</button>
        <div style="font-size: 14px; font-weight: 800;">Dep. ${escapeHtml(dep.codDepos)}</div>
        ${btnNovaFicha}
      </div>

      <!-- SELETOR DE FLUXO: APURAÇÃO CE0712 vs INCLUSÃO DE FICHA AVULSA -->
      <div class="contagem-tabs-row" style="margin-bottom: 8px;">
        <button class="contagem-tab-btn active" onclick="App.alternarAbaInventario('APURACAO')">
          📋 Apuração CE0712 (${fichasNormaisCount})
        </button>
        <button class="contagem-tab-btn" onclick="App.alternarAbaInventario('AVULSA')">
          ➕ Inclusão Ficha Avulsa (${fichasAvulsasCount})
        </button>
      </div>

      ${isBloqueado ? `
        <div style="background:#fef2f2; border:1.5px solid #fecaca; color:#991b1b; padding:8px 10px; border-radius:10px; font-size:11.5px; font-weight:700;">
          🔒 Inventário BLOQUEADO (FMSC0102 - indSitInv = 2). Modo somente leitura.
        </div>
      ` : ''}


      <!-- Seletor de Rodada (1ª, 2ª, 3ª Contagem) com Bloqueio de Rodadas Inativas -->
      <div class="contagem-tabs-row">
        ${[1, 2, 3].map(rod => {
          const isAtiva = (rod === nrContagAtiva);
          if (isAtiva) {
            return `<button class="contagem-tab-btn active" onclick="App.trocarRodadaContagem(${rod})" style="font-weight: 800;">
              📍 ${rod}ª Contagem (Ativa)
            </button>`;
          } else {
            return `<button class="contagem-tab-btn" onclick="App.tentarTrocarRodadaBloqueada(${rod}, ${nrContagAtiva})" style="opacity: 0.45; cursor: not-allowed; background: #f8fafc; color: #94a3b8; border: 1px dashed #cbd5e1;" title="Contagem ${rod} bloqueada no ERP">
              🔒 ${rod}ª Contagem
            </button>`;
          }
        }).join('')}
      </div>

      <div class="summary-metrics-grid">
        <div class="summary-metric-card card-apuradas">
          <span class="metric-label">✓ Contadas</span>
          <span class="metric-value" id="metric-val-apuradas">0</span>
        </div>
        <div class="summary-metric-card card-pendentes">
          <span class="metric-label">⏱ Pendentes</span>
          <span class="metric-value" id="metric-val-pendentes">0</span>
        </div>
      </div>

      <div class="search-filters-card">
        <div class="search-filters-title">
          <span>🔍 Filtros (${nrContagem}ª Rodada)</span>
          <button type="button" onclick="App.limparFiltrosConferencia()" style="background:none; border:none; color:#0284c7; font-size:11px; font-weight:700; cursor:pointer;">Limpar</button>
        </div>

        <div class="filter-grid-2x2">
          <div class="filter-field-group">
            <label for="filtro-conf-item">Item / EAN</label>
            <input type="text" id="filtro-conf-item" class="filter-field-input" placeholder="Cód ou barras..." value="${escapeHtml(state.filtrosConferencia.item)}" oninput="App.onFiltroConferenciaInput()">
          </div>
          <div class="filter-field-group">
            <label for="filtro-conf-desc">Descrição</label>
            <input type="text" id="filtro-conf-desc" class="filter-field-input" placeholder="Descrição..." value="${escapeHtml(state.filtrosConferencia.desc)}" oninput="App.onFiltroConferenciaInput()">
          </div>
          <div class="filter-field-group">
            <label for="filtro-conf-localiz">Localização</label>
            <input type="text" id="filtro-conf-localiz" class="filter-field-input" placeholder="Localiz..." value="${escapeHtml(state.filtrosConferencia.localiz)}" oninput="App.onFiltroConferenciaInput()">
          </div>
          <div class="filter-field-group">
            <label for="filtro-conf-lote">Lote</label>
            <input type="text" id="filtro-conf-lote" class="filter-field-input" placeholder="Lote..." value="${escapeHtml(state.filtrosConferencia.lote)}" oninput="App.onFiltroConferenciaInput()">
          </div>
        </div>

        ${agrupamentos.length > 0 ? `
          <div class="filter-field-group" style="margin-top:6px;">
            <label for="filtro-conf-agrup">Agrupamento</label>
            <select id="filtro-conf-agrup" class="filter-field-input" onchange="App.onFiltroConferenciaInput()">
              <option value="">Todos os agrupamentos</option>
              ${agrupamentos.map(a => `<option value="${a.cdnAgrup}" ${String(state.filtrosConferencia.agrup) === String(a.cdnAgrup) ? 'selected' : ''}>${a.cdnAgrup} - ${escapeHtml(a.dscAgrup)}</option>`).join('')}
            </select>
          </div>
        ` : ''}

        <button class="btn btn-secondary" style="margin-top: 8px; padding: 7px; font-size: 11.5px;" onclick="App.abrirScannerCamera('FICHA_ITEM')">
          📷 Bipar Item / Código de Barras
        </button>

        <!-- Pílulas de Status: Todas | Pendente | Apurada -->
        <div class="status-pills-container">
          <button id="pill-todas" class="pill-filter-btn ${state.filtrosConferencia.status === 'TODAS' ? 'active' : ''}" onclick="App.mudarStatusFiltroConferencia('TODAS')">Todas (0)</button>
          <button id="pill-pendentes" class="pill-filter-btn ${state.filtrosConferencia.status === 'PENDENTES' ? 'active' : ''}" onclick="App.mudarStatusFiltroConferencia('PENDENTES')">Pendente (0)</button>
          <button id="pill-contadas" class="pill-filter-btn ${state.filtrosConferencia.status === 'CONTADAS' || state.filtrosConferencia.status === 'APURADAS' ? 'active' : ''}" onclick="App.mudarStatusFiltroConferencia('APURADAS')">Apurada (0)</button>
        </div>
      </div>

      <div id="lista-fichas-scroll" class="fichas-scroll-list">
        <div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 12px;">Carregando fichas...</div>
      </div>

      <button class="btn-descarregar-totvs" onclick="App.navegar('sincronizacao')">
        📤 Sincronizar Fila Offline com TOTVS
      </button>
    `;

    await carregarFichasRodada();
  }

  async function carregarFichasRodada() {
    const inv = state.inventarioSelecionado;
    const dep = state.depositoSelecionado;
    if (!inv || !dep) return;

    const codEmpresa = state.session.codEmpresa || '001';
    const codEstabel = state.session.codEstabel || '';
    const nrContagem = Number(state.contagemAtivaFichas || 1);
    const codUsuario = (state.session.codUsuario || '').toLowerCase();
    const paramInv = (await DB.obterParamInventarioLocal(codEmpresa, inv.dtSaldo)) || inv;
    const permMesmoUsuario = Boolean(paramInv.permContgUsFc);

    // Busca todas as fichas no IndexedDB local para o depósito e data (APENAS FICHAS OFICIAIS DO CE0712)
    const todasEmpresa = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    let fichasLocais = todasEmpresa.filter(f =>
      !f.avulsa &&
      f.dtSaldo === inv.dtSaldo &&
      (!codEstabel || f.codEstabel === codEstabel) &&
      String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase() &&
      Number(f.nrContagem || 1) === nrContagem &&
      Number(f.situacao) !== 3
    );

    if (fichasLocais.length === 0) {
      const fichasDepGeral = todasEmpresa.filter(f =>
        !f.avulsa &&
        f.dtSaldo === inv.dtSaldo &&
        (!codEstabel || f.codEstabel === codEstabel) &&
        String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase() &&
        Number(f.situacao) !== 3
      );
      if (fichasDepGeral.length > 0) {
        const mapaUnicas = new Map();
        fichasDepGeral.forEach(f => {
          if (!mapaUnicas.has(f.nrFicha)) {
            const valRodada = nrContagem === 1 ? f.valApurado1 : (nrContagem === 2 ? f.valApurado2 : f.valApurado3);
            const confRodada = nrContagem === 1 ? f.codConfteContag1 : (nrContagem === 2 ? f.codConfteContag2 : f.codConfteContag3);
            mapaUnicas.set(f.nrFicha, {
              ...f,
              nrContagem,
              qtApurada: (valRodada !== null && valRodada !== undefined && valRodada !== '') ? Number(valRodada) : null,
              codConfteContag: confRodada || ''
            });
          }
        });
        const novasInstancias = Array.from(mapaUnicas.values());
        await DB.bulkPut('fichas_inventario', novasInstancias, codEmpresa);
        fichasLocais = novasInstancias;
      }
    }

    // Se online e não tiver fichas dessa rodada em cache, tenta buscar no PASOE
    if (fichasLocais.length === 0 && isOnline()) {
      try {
        const payloadF = {
          codEmpresa,
          epCodigo: codEmpresa,
          codEstabel,
          dtSaldo: inv.dtSaldo,
          itCodigo: '',
          codDepos: dep.codDepos,
          codLocaliz: '',
          lote: '',
          codRefer: '',
          nrContagem,
          codUsuario: state.session.codUsuario || '',
          apenasPendentes: false
        };
        const res = await pasoeFetch('/fcGetInventariosFichas', {
          method: 'PUT',
          companyId: codEmpresa,
          body: JSON.stringify({ ...payloadF, payload: [payloadF] })
        });
        if (res.ok) {
          const data = await res.json();
          const remotas = extrairLista(data, 'fichas').map(f => ({
            ...f,
            codEmpresa,
            dtSaldo: normalizarDataIso(f.dtSaldo) || inv.dtSaldo,
            codEstabel: String(f.codEstabel || codEstabel).trim(),
            codDepos: String(f.codDepos || dep.codDepos).trim().toUpperCase(),
            nrContagem: Number(nrContagem),
            nrFicha: Number(f.nrFicha),
            qtApurada: (f.qtApurada !== null && f.qtApurada !== undefined && f.qtApurada !== '') ? Number(f.qtApurada) : null
          }));
          if (remotas.length > 0) {
            await DB.bulkPut('fichas_inventario', remotas, codEmpresa);
            fichasLocais = remotas;
          }
        }
      } catch (e) {}
    }

    // Aplicar validação offline das regras de fcGetInventariosFichas.p + fmsc-inventario.permContgUsFc
    const fichasRodada1 = todasEmpresa.filter(f =>
      f.dtSaldo === inv.dtSaldo &&
      (!codEstabel || f.codEstabel === codEstabel) &&
      String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase() &&
      Number(f.nrContagem) === 1
    );

    state.fichas = fichasLocais.filter(f => {
      if (nrContagem > 1) {
        const f1 = fichasRodada1.find(x => Number(x.nrFicha) === Number(f.nrFicha));
        const v1 = f.valApurado1 ?? f1?.qtApurada ?? null;
        const qt = Number(f.qtidadeAtu || 0);
        if (v1 !== null && v1 !== undefined && Number(v1) === qt) return false;

        // Regra de segregação de usuário controlada por fmsc-inventario.permContgUsFc
        if (!permMesmoUsuario && codUsuario) {
          const u1 = String(f.codConfteContag1 || f1?.codConfteContag1 || '').toLowerCase();
          const u2 = String(f.codConfteContag2 || '').toLowerCase();
          if (u1 === codUsuario || (nrContagem === 3 && u2 === codUsuario)) {
            return false;
          }
        }
      }

      if (nrContagem === 3) {
        const v1 = f.valApurado1;
        const v2 = f.valApurado2;
        if (v1 !== null && v2 !== null && Number(v1) === Number(v2)) return false;
      }

      return true;
    }).sort((a, b) => Number(a.nrFicha) - Number(b.nrFicha));

    atualizarMetricasConferencia();
    aplicarFiltrosConferencia();
  }

  function isFichaContada(f) {
    return f.qtApurada !== null && f.qtApurada !== undefined && f.qtApurada !== '';
  }

  function isFichaDivergente(f) {
    if (!isFichaContada(f)) return false;
    const ap = Number(f.qtApurada);
    const contab = Number(f.qtidadeAtu || 0);
    if (Math.abs(ap - contab) > 0.0001) return true;
    if (Number(f.nrContagem) > 1 && f.valApurado1 !== null && f.valApurado1 !== undefined) {
      if (Math.abs(ap - Number(f.valApurado1)) > 0.0001) return true;
    }
    return false;
  }

  function atualizarMetricasConferencia() {
    const total = state.fichas.length;
    const apuradas = state.fichas.filter(isFichaContada).length;
    const pendentes = total - apuradas;

    const elAp = document.getElementById('metric-val-apuradas');
    const elPen = document.getElementById('metric-val-pendentes');
    if (elAp) elAp.textContent = apuradas;
    if (elPen) elPen.textContent = pendentes;

    const pTodas = document.getElementById('pill-todas');
    const pPen = document.getElementById('pill-pendentes');
    const pCont = document.getElementById('pill-contadas');
    if (pTodas) pTodas.textContent = `Todas (${total})`;
    if (pPen) pPen.textContent = `Pendente (${pendentes})`;
    if (pCont) pCont.textContent = `Apurada (${apuradas})`;
  }

  function tentarTrocarRodadaBloqueada(rodadaDesejada, rodadaAtiva) {
    Scanner.tocarErro();
    mostrarAviso(
      `Apenas a ${rodadaAtiva}ª contagem está liberada pelo ERP (nr-contag-ativa = ${rodadaAtiva}). A ${rodadaDesejada}ª contagem encontra-se bloqueada.`,
      'warning'
    );
  }

  function trocarRodadaContagem(nr) {
    const inv = state.inventarioSelecionado;
    const nrAtiva = Number(inv?.nrContagAtiva || 1);
    if (nr !== nrAtiva) {
      tentarTrocarRodadaBloqueada(nr, nrAtiva);
      return;
    }
    state.contagemAtivaFichas = nr;
    renderTelaInventarioFichas();
  }

  function onFiltroConferenciaInput() {
    state.filtrosConferencia.item = document.getElementById('filtro-conf-item')?.value.trim().toLowerCase() || '';
    state.filtrosConferencia.desc = document.getElementById('filtro-conf-desc')?.value.trim().toLowerCase() || '';
    state.filtrosConferencia.localiz = document.getElementById('filtro-conf-localiz')?.value.trim().toLowerCase() || '';
    state.filtrosConferencia.lote = document.getElementById('filtro-conf-lote')?.value.trim().toLowerCase() || '';
    state.filtrosConferencia.agrup = document.getElementById('filtro-conf-agrup')?.value || '';
    aplicarFiltrosConferencia();
  }

  function mudarStatusFiltroConferencia(status) {
    state.filtrosConferencia.status = status;
    document.querySelectorAll('.pill-filter-btn').forEach(b => b.classList.remove('active'));
    if (status === 'TODAS') document.getElementById('pill-todas')?.classList.add('active');
    if (status === 'PENDENTES') document.getElementById('pill-pendentes')?.classList.add('active');
    if (status === 'CONTADAS' || status === 'APURADAS') document.getElementById('pill-contadas')?.classList.add('active');
    aplicarFiltrosConferencia();
  }

  function limparFiltrosConferencia() {
    state.filtrosConferencia = { item: '', desc: '', localiz: '', lote: '', agrup: '', status: 'TODAS' };
    ['filtro-conf-item', 'filtro-conf-desc', 'filtro-conf-localiz', 'filtro-conf-lote', 'filtro-conf-agrup'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    mudarStatusFiltroConferencia('TODAS');
  }

  function aplicarFiltrosConferencia() {
    const { item, desc, localiz, lote, agrup, status } = state.filtrosConferencia;

    state.fichasFiltradas = state.fichas.filter(f => {
      if (item && !String(f.itCodigo || '').toLowerCase().includes(item) && !String(f.codBarras || '').toLowerCase().includes(item)) return false;
      if (desc && !String(f.descItem || '').toLowerCase().includes(desc)) return false;
      if (localiz && !String(f.codLocaliz || '').toLowerCase().includes(localiz)) return false;
      if (lote && !String(f.lote || '').toLowerCase().includes(lote)) return false;
      if (agrup && String(f.cdnAgrup) !== String(agrup)) return false;

      if (status === 'PENDENTES' && isFichaContada(f)) return false;
      if ((status === 'CONTADAS' || status === 'APURADAS') && !isFichaContada(f)) return false;
      return true;
    });

    renderListaFichas();
  }

  function renderListaFichas() {
    const scrollDiv = document.getElementById('lista-fichas-scroll');
    if (!scrollDiv) return;
    scrollDiv.innerHTML = '';

    if (state.fichasFiltradas.length === 0) {
      scrollDiv.innerHTML = `
        <div class="card-modern" style="text-align:center; padding:24px; color:#64748b; font-size:12px;">
          Nenhuma ficha exibida para esta rodada/filtro.
        </div>
      `;
      return;
    }

    const isBloqueado = Number(state.inventarioSelecionado?.indSitInv) === 2;

    state.fichasFiltradas.forEach(f => {
      const contada = isFichaContada(f);

      const cardClass = contada ? 'is-contada' : 'is-pendente';
      const badgeClass = contada ? 'badge-ficha-contada' : 'badge-ficha-pendente';
      const badgeTxt = contada
        ? `✓ Apurada (${Number(f.qtApurada).toFixed(2)})`
        : '○ Pendente';

      const card = document.createElement('div');
      card.className = `ficha-item-card ${cardClass}`;
      card.innerHTML = `
        <div class="ficha-card-top">
          <span class="ficha-card-nr">Ficha #${f.nrFicha} ${f.pendenteSync ? '<span class="badge badge-warning">Sync Pend.</span>' : ''}</span>
          <span class="ficha-card-badge ${badgeClass}">${badgeTxt}</span>
        </div>
        <div class="ficha-card-title" onclick="App.abrirApuracaoFicha(${f.nrFicha})">
          ${escapeHtml(f.itCodigo)} - ${escapeHtml(f.descItem)}
        </div>
        <div class="ficha-card-metadata">
          <span>Loc: <strong>${escapeHtml(f.codLocaliz || '-')}</strong></span>
          <span>Lote: <strong>${escapeHtml(f.lote || '-')}</strong></span>
          <span>Ref: <strong>${escapeHtml(f.codRefer || '-')}</strong></span>
          <span>UM: <strong>${escapeHtml(f.un || 'UN')}</strong></span>
        </div>
        ${!isBloqueado ? `
          <div class="ficha-quick-row">
            <input type="number" step="0.0001" id="quick-qtd-${f.nrFicha}" class="ficha-quick-input" placeholder="Qtd rápida..." value="${contada ? f.qtApurada : ''}" onkeydown="if(event.key==='Enter'){event.preventDefault(); App.confirmarContagemRapida(${f.nrFicha});}">
            <button type="button" class="btn-quick-ok" onclick="App.confirmarContagemRapida(${f.nrFicha})">✓ OK</button>
            <button type="button" class="btn-quick-open" onclick="App.abrirApuracaoFicha(${f.nrFicha})">Detalhes</button>
          </div>
        ` : `
          <div style="margin-top:6px;">
            <button type="button" class="btn-quick-open" style="width:100%;" onclick="App.abrirApuracaoFicha(${f.nrFicha})">Visualizar Ficha</button>
          </div>
        `}
      `;
      scrollDiv.appendChild(card);
    });
  }

  async function confirmarContagemRapida(nrFicha) {
    const f = state.fichas.find(x => Number(x.nrFicha) === Number(nrFicha));
    const input = document.getElementById(`quick-qtd-${nrFicha}`);
    if (!f || !input) return;
    const val = input.value.trim();
    if (val === '') {
      alert('Digite a quantidade apurada.');
      input.focus();
      return;
    }
    await gravarApuracaoFicha(f, parseFloat(val), true);
  }

  function abrirApuracaoFicha(nrFicha) {
    const f = state.fichas.find(item => Number(item.nrFicha) === Number(nrFicha));
    if (f) {
      state.fichaAtual = f;
      navegar('inventario_conferencia', { ficha: f });
    }
  }

  // =========================================================================
  // TELA DE DETALHE / APURAÇÃO COMPLETA DA FICHA
  // =========================================================================
  function renderTelaInventarioConferencia(ficha) {
    const f = ficha || state.fichaAtual;
    if (!f) {
      navegar('inventario_fichas');
      return;
    }

    const isBloqueado = Number(state.inventarioSelecionado?.indSitInv) === 2;
    const contada = isFichaContada(f);
    const valAtual = contada ? f.qtApurada : '';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <button class="btn-topbar-action" onclick="App.navegar('inventario_fichas')">‹ Fichas</button>
        <div style="font-size: 14px; font-weight: 800; color: #0284c7;">
          Ficha #${f.nrFicha} • ${state.contagemAtivaFichas}ª Contagem
        </div>
        <span class="badge ${contada ? 'badge-success' : 'badge-warning'}">${contada ? 'Contada' : 'Pendente'}</span>
      </div>

      <div class="card-modern">
        ${isBloqueado ? '<div style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:8px; border-radius:8px; font-size:11px; font-weight:700; margin-bottom:8px;">🔒 Inventário Bloqueado (FMSC0102).</div>' : ''}

        <div style="font-size: 10.5px; color: #64748b; font-weight: 700; text-transform: uppercase;">Item</div>
        <div style="font-size: 15px; font-weight: 800; color: #0f172a;">${escapeHtml(f.itCodigo)}</div>
        <div style="font-size: 12px; color: #334155; margin-bottom: 10px;">${escapeHtml(f.descItem)}</div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8fafc; padding: 8px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11.5px;">
          <div><span style="color:#64748b;">Depósito:</span><br><strong>${escapeHtml(f.codDepos)}</strong></div>
          <div><span style="color:#64748b;">Localização:</span><br><strong>${escapeHtml(f.codLocaliz || '-')}</strong></div>
          <div><span style="color:#64748b;">Lote:</span><br><strong>${escapeHtml(f.lote || '-')}</strong></div>
          <div><span style="color:#64748b;">Referência:</span><br><strong>${escapeHtml(f.codRefer || '-')}</strong></div>
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label class="form-label" for="input-qtd-apurada" style="color: #0284c7; font-size: 12.5px;">Quantidade Apurada (${escapeHtml(f.un || 'UN')}) *</label>
          <input type="number" step="0.0001" id="input-qtd-apurada" class="form-input" style="font-size: 20px; font-weight: 800; text-align: right;" placeholder="0.0000" value="${valAtual}" ${isBloqueado ? 'disabled' : ''} onkeydown="if(event.key==='Enter'){event.preventDefault(); App.confirmarApuracaoFicha();}">
        </div>

        ${!isBloqueado ? `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
            <button class="btn btn-success" style="padding: 12px;" onclick="App.confirmarApuracaoFicha()">✓ CONFIRMAR APURAÇÃO</button>
            <button class="btn btn-danger" onclick="App.cancelarApuracaoFicha()">✕ ZERAR / CANCELAR DIGITAÇÃO</button>
          </div>
        ` : ''}
      </div>
    `;

    if (!isBloqueado) {
      setTimeout(() => document.getElementById('input-qtd-apurada')?.focus(), 100);
    }
  }

  async function confirmarApuracaoFicha() {
    const f = state.fichaAtual;
    const input = document.getElementById('input-qtd-apurada');
    if (!f || !input) return;
    const val = input.value.trim();
    const qtd = val === '' ? 0 : parseFloat(val);
    await gravarApuracaoFicha(f, qtd, false);
  }

  async function gravarApuracaoFicha(f, qtd, inline) {
    if (isNaN(qtd) || qtd < 0) {
      mostrarAviso('Informe uma quantidade válida (zero ou positiva).', 'warning');
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    const inv = state.inventarioSelecionado;
    const paramInv = (await DB.obterParamInventarioLocal(codEmpresa, inv.dtSaldo)) || inv;

    // 1. Validação dos parâmetros do inventário (fmsc-inventario - FMSC0102)
    if (Number(paramInv.indSitInv) === 2) {
      mostrarAviso('Inventário bloqueado nos parâmetros (FMSC0102). Não é possível registrar apurações.', 'error');
      return;
    }

    // 2. Validação da contagem ativa (nr-contag-ativa)
    const nrAtiva = Number(paramInv.nrContagAtiva || paramInv.nr_contag_ativa || inv?.nrContagAtiva || 1);
    if (nrAtiva === 4) {
      mostrarAviso('Inventário concluído no Datasul (nr-contag-ativa = 4). Apuração negada.', 'error');
      return;
    }

    const nrContagem = Number(state.contagemAtivaFichas || f.nrContagem || 1);
    if (nrContagem !== nrAtiva) {
      mostrarAviso(`Contagem ${nrContagem} divergente da contagem ativa do inventário (${nrAtiva}). Apuração negada.`, 'error');
      return;
    }

    const codUsuario = state.session.codUsuario || '';

    // Validação de segregação se permContgUsFc === false
    if (nrContagem > 1 && !paramInv.permContgUsFc) {
      const u1 = String(f.codConfteContag1 || '').toLowerCase();
      const u2 = String(f.codConfteContag2 || '').toLowerCase();
      if (u1 === codUsuario.toLowerCase() || (nrContagem === 3 && u2 === codUsuario.toLowerCase())) {
        mostrarAviso(`Parâmetro fmsc-inventario impede que '${codUsuario}' apure contagens diferentes da mesma ficha.`, 'warning');
        return;
      }
    }

    const payload = {
      codEmpresa,
      dtSaldo: f.dtSaldo || inv.dtSaldo,
      codEstabel: f.codEstabel || state.session.codEstabel,
      codDepos: f.codDepos,
      codLocaliz: f.codLocaliz || '',
      lote: f.lote || '',
      codRefer: f.codRefer || '',
      itCodigo: f.itCodigo,
      nrFicha: Number(f.nrFicha),
      nrContagem,
      qtApurada: qtd,
      codUsuario,
      codMobile: state.session.codMobile
    };

    let sincronizadoAgora = false;

    if (isOnline()) {
      try {
        const res = await pasoeFetch('/fcSetInventarioApuracaoFicha', {
          method: 'PUT',
          companyId: codEmpresa,
          body: JSON.stringify({ ...payload, payload: [payload] })
        });
        const data = await res.json();
        if (data.type === 'ERROR' || data.success === false) {
          alert(`Bloqueio TOTVS: ${data.message || data.detailedMessage || data.mensagem}`);
          return;
        }
        sincronizadoAgora = true;
      } catch (e) {
        console.warn('Falha de rede no envio imediato, gravando na fila offline:', e.message);
      }
    }

    // Persistência Offline Garantida no IndexedDB
    f.codEmpresa = codEmpresa;
    f.nrContagem = nrContagem;
    f.qtApurada = qtd;
    f.situacao = 4;
    f.pendenteSync = !sincronizadoAgora;
    f.sincronizado = sincronizadoAgora;
    if (sincronizadoAgora) {
      f.qtdTotvs = qtd; // Atualizado com sucesso no TOTVS
    }
    if (nrContagem === 1) { f.valApurado1 = qtd; f.codConfteContag1 = codUsuario; }
    if (nrContagem === 2) { f.valApurado2 = qtd; f.codConfteContag2 = codUsuario; }
    if (nrContagem === 3) { f.valApurado3 = qtd; f.codConfteContag3 = codUsuario; }

    await DB.put('fichas_inventario', f, codEmpresa);

    // Se houver pendência anterior na fila_sync para essa mesma ficha e contagem:
    const filaSyncAtual = await DB.getFilaSyncEmpresa(codEmpresa);
    const pendenteExistente = filaSyncAtual.find(p =>
      p.tipo === 'INVENTARIO_APURACAO' &&
      p.payload.dtSaldo === payload.dtSaldo &&
      Number(p.payload.nrContagem) === Number(payload.nrContagem) &&
      Number(p.payload.nrFicha) === Number(payload.nrFicha)
    );

    if (!sincronizadoAgora) {
      if (pendenteExistente) {
        pendenteExistente.payload.qtApurada = qtd;
        pendenteExistente.payload.codUsuario = codUsuario;
        pendenteExistente.status = 'Pendente';
        pendenteExistente.conflitoResolvido = false;
        pendenteExistente.dt_criacao = new Date().toISOString();
        await DB.put('fila_sync', pendenteExistente, codEmpresa);
      } else {
        await DB.adicionarFilaSync('INVENTARIO_APURACAO', payload, codEmpresa);
      }
      mostrarAviso(`Ficha #${f.nrFicha} salva offline (Qtd: ${qtd}). Fila atualizada para reenvio ao TOTVS.`, 'info');
    } else {
      if (pendenteExistente) {
        await DB.remove('fila_sync', pendenteExistente.id_uuid);
      }
      mostrarAviso(`Ficha #${f.nrFicha} reenviada e sincronizada no TOTVS com sucesso! Qtd: ${qtd}`, 'success');
    }

    await DB.gravarHistoricoContagem({
      codEmpresa,
      dtSaldo: payload.dtSaldo,
      codEstabel: payload.codEstabel,
      codDepos: payload.codDepos,
      nrFicha: payload.nrFicha,
      itCodigo: payload.itCodigo,
      descItem: f.descItem,
      lote: payload.lote,
      codLocaliz: payload.codLocaliz,
      codRefer: payload.codRefer,
      nrContagem,
      qtApurada: qtd,
      qtContabil: Number(f.qtidadeAtu || 0),
      divergencia: qtd - Number(f.qtidadeAtu || 0),
      codUsuario,
      codMobile: state.session.codMobile,
      statusEnvio: sincronizadoAgora ? 'Sincronizado' : 'Pendente Offline'
    }, codEmpresa);

    Scanner.tocarBeep();
    atualizarBadgePendencias();

    if (inline) {
      atualizarMetricasConferencia();
      aplicarFiltrosConferencia();
    } else {
      navegar('inventario_fichas');
    }
  }

  async function cancelarApuracaoFicha() {
    const f = state.fichaAtual;
    if (!f) return;
    if (!confirm(`Zerar a contagem da Ficha #${f.nrFicha}?`)) return;

    const codEmpresa = state.session.codEmpresa || '001';
    const nrContagem = Number(state.contagemAtivaFichas || f.nrContagem || 1);
    const payload = {
      codEmpresa,
      dtSaldo: f.dtSaldo,
      codEstabel: f.codEstabel,
      codDepos: f.codDepos,
      codLocaliz: f.codLocaliz || '',
      lote: f.lote || '',
      codRefer: f.codRefer || '',
      itCodigo: f.itCodigo,
      nrFicha: Number(f.nrFicha),
      nrContagem,
      codUsuario: state.session.codUsuario,
      cancelar: true
    };

    let syncOk = false;
    if (isOnline()) {
      try {
        const res = await pasoeFetch('/fcSetInventarioApuracaoFicha', {
          method: 'PUT',
          companyId: codEmpresa,
          body: JSON.stringify({ ...payload, payload: [payload] })
        });
        const data = await res.json();
        if (data.type !== 'ERROR' && data.success !== false) syncOk = true;
      } catch (e) {}
    }

    f.qtApurada = null;
    f.situacao = 2;
    f.pendenteSync = !syncOk;
    await DB.put('fichas_inventario', f, codEmpresa);
    if (!syncOk) {
      await DB.adicionarFilaSync('INVENTARIO_CANCELAMENTO', payload, codEmpresa);
    }

    atualizarBadgePendencias();
    navegar('inventario_fichas');
  }

  // =========================================================================
  // INCLUSÃO DE FICHA EM BRANCO / AVULSA (fcSetInventarioNovaFicha + fcGetInventariosVerifValores)
  // =========================================================================
  async function renderTelaInventarioAvulsa() {
    state.abaInventario = 'AVULSA';
    const dep = state.depositoSelecionado;
    const inv = state.inventarioSelecionado;
    if (!dep || !inv) {
      navegar('inventarios_ativos');
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    const codEstabel = state.session.codEstabel || '';
    const paramInv = (await DB.obterParamInventarioLocal(codEmpresa, inv.dtSaldo)) || inv;
    const nrAtiva = Number(paramInv.nrContagAtiva || inv.nrContagAtiva || 1);

    if (nrAtiva === 4) {
      mostrarAviso('Este inventário já foi concluído no Datasul (nr-contag-ativa = 4). Inclusão negada.', 'warning');
      navegar('inventarios_ativos');
      return;
    }

    const totalItensEmp = await DB.countEmpresa('item', codEmpresa);

    // Buscar fichas oficiais e fichas avulsas deste depósito
    const todasEmpresa = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    const fichasNormaisCount = todasEmpresa.filter(f =>
      !f.avulsa &&
      f.dtSaldo === inv.dtSaldo &&
      (!codEstabel || f.codEstabel === codEstabel) &&
      String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase()
    ).length;

    const fichasAvulsas = todasEmpresa.filter(f =>
      f.avulsa &&
      f.dtSaldo === inv.dtSaldo &&
      (!codEstabel || f.codEstabel === codEstabel) &&
      String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase()
    ).sort((a, b) => Number(b.nrFicha || 0) - Number(a.nrFicha || 0));

    state.fichasAvulsas = fichasAvulsas;

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <button class="btn-topbar-action" onclick="App.entrarNoInventario('${inv.dtSaldo}')">‹ Depósitos</button>
        <div style="font-size: 14px; font-weight: 800;">Dep. ${escapeHtml(dep.codDepos)}</div>
        <button class="btn-topbar-action" onclick="App.alternarAbaInventario('APURACAO')">📋 Ver Fichas</button>
      </div>

      <!-- SELETOR DE FLUXO: APURAÇÃO CE0712 vs INCLUSÃO DE FICHA AVULSA -->
      <div class="contagem-tabs-row" style="margin-bottom: 8px;">
        <button class="contagem-tab-btn" onclick="App.alternarAbaInventario('APURACAO')">
          📋 Apuração CE0712 (${fichasNormaisCount})
        </button>
        <button class="contagem-tab-btn active" onclick="App.alternarAbaInventario('AVULSA')">
          ➕ Inclusão Ficha Avulsa (${fichasAvulsas.length})
        </button>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 11.5px; color: #475569;">
          Corte: <strong>${formatarDataBr(inv.dtSaldo)}</strong>
        </span>
        <div style="display:flex; gap:5px; align-items:center;">
          <span class="badge" style="background:#f0fdf4; color:#15803d; font-weight:800; font-size:11px; border:1px solid #86efac;">
            📍 Nova Ficha: 1ª Contagem (Fixa no ERP)
          </span>
          <span class="badge" style="background:#f8fafc; color:#64748b; font-size:10.5px; border:1px solid #e2e8f0;">
            Ativa: ${nrAtiva}ª
          </span>
        </div>
      </div>

      ${totalItensEmp === 0 ? `
        <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; font-size: 11.5px; color: #92400e; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span>⚠️ <strong>Catálogo Offline vazio:</strong> Baixe os itens e cadastros para pesquisar sem internet.</span>
          <button class="btn btn-primary" onclick="App.abrirModalCargaInicial()" style="width: auto; padding: 5px 10px; font-size: 11px; white-space: nowrap;">
            ⬇️ Carga Offline
          </button>
        </div>
      ` : ''}

      <!-- Formulário de Inclusão de Ficha Avulsa -->
      <div class="card-modern" style="border-top: 3px solid #0284c7;">
        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">
          ➕ Cadastrar Item Físico sem Ficha Prévia
        </div>

        <div class="form-group">
          <label class="form-label" for="avulsa-item">Item ou Código de Barras *</label>
          <div style="display: flex; gap: 5px;">
            <input type="text" id="avulsa-item" class="form-input" placeholder="Código ou EAN..." onchange="App.lookupItemAvulsa(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault(); App.lookupItemAvulsa(this.value);}">
            <button type="button" class="btn btn-secondary" style="width:auto; padding:0 10px;" onclick="App.abrirPesquisaItemInterna()" title="Pesquisar Item Offline">🔍</button>
            <button type="button" class="btn btn-secondary" style="width:auto; padding:0 10px;" onclick="App.abrirScannerCamera('AVULSA_ITEM')" title="Ler Código">📷</button>
          </div>
          <div id="avulsa-desc-item" style="font-size: 11px; font-weight: 700; color: #0284c7; margin-top: 3px;">-</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div class="form-group">
            <label class="form-label" for="avulsa-localiz">Localização</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" id="avulsa-localiz" class="form-input" placeholder="Localiz...">
              <button type="button" class="btn btn-secondary" style="width:auto; padding:0 9px;" onclick="App.abrirPesquisaLocalizInterna()">🔍</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="avulsa-lote">Lote / Série</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" id="avulsa-lote" class="form-input" placeholder="Lote...">
              <button type="button" class="btn btn-secondary" style="width:auto; padding:0 9px;" onclick="App.abrirPesquisaLoteInterna()">🔍</button>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div class="form-group">
            <label class="form-label" for="avulsa-refer">Referência</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" id="avulsa-refer" class="form-input" placeholder="Opcional">
              <button type="button" class="btn btn-secondary" style="width:auto; padding:0 9px;" onclick="App.abrirPesquisaReferenciaInterna()">🔍</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="avulsa-dt-valid">Validade Lote</label>
            <input type="date" id="avulsa-dt-valid" class="form-input">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="avulsa-qtd">Quantidade Apurada *</label>
          <input type="number" step="0.0001" id="avulsa-qtd" class="form-input" style="font-weight: 800; text-align: right; font-size: 16px;" placeholder="0.0000">
        </div>

        <!-- Campos de Valor (Exibidos quando fcGetInventariosVerifValores retorna YES) -->
        <div id="avulsa-valores-container" style="display: none; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px; margin-bottom: 10px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #9a3412; margin-bottom: 6px;">Valores Exigidos pelo Datasul (boin157q01):</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
            <div>
              <label class="form-label" for="avulsa-vl-mat">Vl. Material</label>
              <input type="number" step="0.01" id="avulsa-vl-mat" class="form-input" value="0">
            </div>
            <div>
              <label class="form-label" for="avulsa-vl-mob">Vl. MOB</label>
              <input type="number" step="0.01" id="avulsa-vl-mob" class="form-input" value="0">
            </div>
            <div>
              <label class="form-label" for="avulsa-vl-ggf">Vl. GGF</label>
              <input type="number" step="0.01" id="avulsa-vl-ggf" class="form-input" value="0">
            </div>
          </div>
        </div>

        <button class="btn btn-primary" onclick="App.confirmarFichaAvulsa()" style="font-weight: 800; font-size: 13px; padding: 11px;">
          ➕ INCLUIR FICHA AVULSA (1ª CONTAGEM) NO TOTVS
        </button>
      </div>

      <!-- LISTAGEM DEDICADA DE FICHAS AVULSAS DESTE DEPÓSITO -->
      <div class="search-filters-card" style="margin-top: 14px;">
        <div class="search-filters-title">
          <span>📋 Fichas Avulsas deste Depósito (${fichasAvulsas.length})</span>
          <button type="button" onclick="App.renderTelaInventarioAvulsa()" style="background:none; border:none; color:#0284c7; font-size:11px; font-weight:700; cursor:pointer;">🔄 Atualizar</button>
        </div>

        <div id="lista-fichas-avulsas-scroll" style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
          ${fichasAvulsas.length === 0 ? `
            <div style="text-align: center; padding: 18px 10px; color: #94a3b8; font-size: 11.5px;">
              Nenhuma ficha avulsa incluída neste depósito até o momento.
            </div>
          ` : fichasAvulsas.map(f => {
            const isSincronizado = Boolean(f.sincronizado) && !f.pendenteSync;
            const badge = isSincronizado
              ? `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:800; border:1px solid #86efac;">✓ Criada no ERP (Ficha #${f.nrFicha})</span>`
              : `<span class="badge" style="background:#ffedd5; color:#c2410c; font-weight:800; border:1px solid #fed7aa;">⏳ Na Fila para Criação no ERP</span>`;

            const btnExcluir = !isSincronizado
              ? `<button class="btn btn-secondary" style="width:auto; padding:3px 8px; font-size:10.5px; color:#dc2626;" onclick="App.excluirFichaAvulsaPendente('${f.nrFicha}', '${escapeHtml(f.itCodigo)}')">🗑 Remover da Fila</button>`
              : '';

            return `
              <div class="card-modern" style="padding: 10px; border-left: 3.5px solid ${isSincronizado ? '#10b981' : '#f59e0b'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                  <div>
                    <span style="font-weight: 800; font-size: 13px; color: #0f172a;">${escapeHtml(f.itCodigo)}</span>
                    <span style="font-size: 11px; color: #64748b; margin-left: 4px;">(${escapeHtml(f.un || 'UN')})</span>
                  </div>
                  ${badge}
                </div>
                <div style="font-size: 11.5px; color: #334155; margin-bottom: 4px;">${escapeHtml(f.descItem || f.itCodigo)}</div>
                <div style="font-size: 11px; color: #64748b; display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px;">
                  ${f.lote ? `<span>Lote: <strong>${escapeHtml(f.lote)}</strong></span>` : ''}
                  ${f.dtValiLote ? `<span>Val: <strong>${formatarDataBr(f.dtValiLote)}</strong></span>` : ''}
                  ${f.codLocaliz ? `<span>Loc: <strong>${escapeHtml(f.codLocaliz)}</strong></span>` : ''}
                  ${f.codRefer ? `<span>Ref: <strong>${escapeHtml(f.codRefer)}</strong></span>` : ''}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 4px;">
                  <span style="font-size: 12px; font-weight: 800; color: #0369a1;">Qtd Apurada: ${f.qtApurada}</span>
                  ${btnExcluir}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }


  async function lookupItemAvulsa(codigo) {
    const descEl = document.getElementById('avulsa-desc-item');
    const valCont = document.getElementById('avulsa-valores-container');
    if (!descEl) return;

    const termo = (codigo || '').trim();
    if (!termo) {
      descEl.textContent = '-';
      if (valCont) valCont.style.display = 'none';
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    const match = await DB.obterItemExato(termo, codEmpresa);
    let item = match?.item || null;

    if (!item && isOnline()) {
      try {
        const payloadItem = { codEstabel: state.session.codEstabel || '', itCodigo: termo, descItem: '' };
        const res = await pasoeFetch('/fcGetItem', {
          method: 'PUT',
          body: JSON.stringify({ ...payloadItem, payload: [payloadItem] })
        });
        if (res.ok) {
          const data = await res.json();
          const lista = extrairLista(data, 'itens');
          if (lista.length > 0) {
            await DB.bulkPut('item', lista, codEmpresa);
            item = lista.find(i => i.itCodigo.toUpperCase() === termo.toUpperCase() || i.codBarras === termo) || lista[0];
          }
        }
      } catch (e) {}
    }

    if (item) {
      const inputItem = document.getElementById('avulsa-item');
      if (inputItem && match?.matchedBy === 'BARRAS') {
        inputItem.value = item.itCodigo;
      }
      descEl.innerHTML = `✓ <span style="color:#059669;">${escapeHtml(item.descItem)}</span> (${escapeHtml(item.un || 'UN')})`;
      const locEl = document.getElementById('avulsa-localiz');
      if (locEl && !locEl.value && item.codLocaliz) locEl.value = item.codLocaliz;

      // Pré-carga inteligente em segundo plano dos lotes deste item para o IndexedDB local
      if (isOnline()) {
        const payloadLoteBg = { codEstabel: state.session.codEstabel || '', itCodigo: item.itCodigo };
        pasoeFetch('/fcGetLote', {
          method: 'PUT',
          body: JSON.stringify({ ...payloadLoteBg, payload: [payloadLoteBg] })
        }).then(async res => {
          if (res.ok) {
            const data = await res.json();
            const lista = extrairLista(data, 'lotes');
            if (lista && lista.length > 0) {
              await DB.bulkPut('lote', lista, codEmpresa);
            }
          }
        }).catch(() => {});
      }

      // Verificar necessidade de valores (fcGetInventariosVerifValores)
      let requerValores = Boolean(item.requerValorFicha);
      if (isOnline()) {
        try {
          const payloadV = {
            dtSaldo: state.inventarioSelecionado?.dtSaldo,
            itCodigo: item.itCodigo,
            codUsuario: state.session.codUsuario,
            codEstabel: state.session.codEstabel,
            codDepos: state.depositoSelecionado?.codDepos,
            codLocaliz: document.getElementById('avulsa-localiz')?.value.trim() || '',
            lote: document.getElementById('avulsa-lote')?.value.trim() || '',
            codRefer: document.getElementById('avulsa-refer')?.value.trim() || '',
            qtApurada: parseFloat(document.getElementById('avulsa-qtd')?.value || '0') || 0
          };
          const resV = await pasoeFetch('/fcGetInventariosVerifValores', {
            method: 'PUT',
            body: JSON.stringify({ ...payloadV, payload: [payloadV] })
          });
          if (resV.ok) {
            const dV = await resV.json();
            if (dV.type === 'OK') requerValores = (dV.message === 'YES');
          }
        } catch (e) {}
      }
      if (valCont) valCont.style.display = requerValores ? 'block' : 'none';
    } else {
      descEl.innerHTML = `<span style="color:#dc2626;">Item '${escapeHtml(termo)}' não localizado no banco da empresa ${codEmpresa}.</span>`;
    }
  }

  async function confirmarFichaAvulsa() {
    const dep = state.depositoSelecionado;
    const inv = state.inventarioSelecionado;
    const codEmpresa = state.session.codEmpresa || '001';
    const paramInv = (await DB.obterParamInventarioLocal(codEmpresa, inv.dtSaldo)) || inv;

    if (Number(paramInv.indSitInv) === 2) {
      mostrarAviso('Inventário bloqueado nos parâmetros (FMSC0102).', 'error');
      return;
    }

    const nrAtiva = Number(paramInv.nrContagAtiva || inv.nrContagAtiva || 1);
    if (nrAtiva === 4) {
      mostrarAviso('Este inventário já foi concluído no Datasul (nr-contag-ativa = 4). Inclusão de ficha avulsa negada.', 'error');
      return;
    }

    const itCodigo = document.getElementById('avulsa-item')?.value.trim();
    const codLocaliz = document.getElementById('avulsa-localiz')?.value.trim() || '';
    const lote = document.getElementById('avulsa-lote')?.value.trim() || '';
    const codRefer = document.getElementById('avulsa-refer')?.value.trim() || '';
    let dtValiLote = document.getElementById('avulsa-dt-valid')?.value || '';
    const qtd = parseFloat(document.getElementById('avulsa-qtd')?.value);
    const vlMaterial = parseFloat(document.getElementById('avulsa-vl-mat')?.value || '0') || 0;
    const vlMob = parseFloat(document.getElementById('avulsa-vl-mob')?.value || '0') || 0;
    const vlGgf = parseFloat(document.getElementById('avulsa-vl-ggf')?.value || '0') || 0;

    if (!itCodigo || isNaN(qtd) || qtd < 0) {
      mostrarAviso('Informe o Item e uma Quantidade Apurada válida (zero ou positiva).', 'warning');
      return;
    }

    // Tratamento e Fallback inteligente para Validade do Lote (evita rejeição da boin157q01)
    if (dtValiLote) {
      dtValiLote = normalizarDataIso(dtValiLote);
    }
    if (lote && !dtValiLote) {
      const matchLote = await DB.obterLoteExato(codEmpresa, state.session.codEstabel || '', itCodigo, lote);
      if (matchLote?.dtValiLote) {
        dtValiLote = normalizarDataIso(matchLote.dtValiLote);
      } else {
        dtValiLote = '9999-12-31';
      }
    }

    const payload = {
      codEmpresa,
      dtSaldo: inv.dtSaldo,
      codEstabel: state.session.codEstabel,
      codDepos: dep.codDepos,
      codLocaliz,
      lote,
      codRefer,
      dtValiLote,
      itCodigo,
      nrContagem: 1, // Inclusão de novas fichas deve ser enviada sempre na contagem = 1
      qtApurada: qtd,
      vlMaterial,
      vlMob,
      vlGgf,
      codUsuario: state.session.codUsuario,
      codMobile: state.session.codMobile
    };

    let nrFichaGerada = null;
    let sincronizado = false;

    if (isOnline()) {
      try {
        const res = await pasoeFetch('/fcSetInventarioNovaFicha', {
          method: 'PUT',
          companyId: codEmpresa,
          body: JSON.stringify({ ...payload, payload: [payload] })
        });
        const data = await res.json();
        if (data.type === 'ERROR' || data.success === false) {
          mostrarAviso(`Erro TOTVS: ${data.message || data.detailedMessage}`, 'error');
          return;
        }
        nrFichaGerada = Number(data.nrFicha || data.message) || null;
        sincronizado = true;
      } catch (e) {
        console.warn('Offline na criação de ficha avulsa:', e.message);
      }
    }

    const fichasEmp = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    const localMax = fichasEmp.filter(f => f.dtSaldo === inv.dtSaldo).reduce((m, f) => Math.max(m, Number(f.nrFicha || 0)), 0);
    const nrFichaFinal = nrFichaGerada || (localMax + 1);
    const matchIt = await DB.obterItemExato(itCodigo, codEmpresa);

    const novaFicha = {
      codEmpresa,
      nrFicha: nrFichaFinal,
      dtSaldo: inv.dtSaldo,
      codEstabel: payload.codEstabel,
      codDepos: payload.codDepos,
      codLocaliz,
      lote,
      codRefer,
      itCodigo: matchIt?.item?.itCodigo || itCodigo,
      descItem: matchIt?.item?.descItem || itCodigo,
      un: matchIt?.item?.un || 'UN',
      qtidadeAtu: 0,
      qtApurada: qtd,
      valApurado1: qtd,
      valApurado2: null,
      valApurado3: null,
      codConfteContag1: payload.codUsuario,
      nrContagem: 1, // Sempre gravado na 1ª contagem
      situacao: 4,
      dtValiLote,
      avulsa: true,
      sincronizado,
      pendenteSync: !sincronizado
    };

    await DB.put('fichas_inventario', novaFicha, codEmpresa);
    if (!sincronizado) {
      await DB.adicionarFilaSync('INVENTARIO_AVULSA', payload, codEmpresa);
    }

    await DB.gravarHistoricoContagem({
      codEmpresa,
      dtSaldo: inv.dtSaldo,
      codEstabel: payload.codEstabel,
      codDepos: payload.codDepos,
      nrFicha: nrFichaFinal,
      itCodigo: novaFicha.itCodigo,
      descItem: novaFicha.descItem,
      lote,
      codLocaliz,
      codRefer,
      nrContagem: 1,
      qtApurada: qtd,
      qtContabil: 0,
      divergencia: qtd,
      codUsuario: payload.codUsuario,
      codMobile: state.session.codMobile,
      statusEnvio: sincronizado ? 'Sincronizado' : 'Pendente Offline'
    }, codEmpresa);

    Scanner.tocarBeep();
    atualizarBadgePendencias();
    mostrarAviso(
      sincronizado ? `Ficha avulsa #${nrFichaFinal} criada com sucesso no TOTVS!` : `Ficha avulsa #${nrFichaFinal} salva localmente (Modo Offline).`,
      sincronizado ? 'success' : 'info'
    );

    // Limpar os campos do formulário para o operador bipar o próximo item
    const elItem = document.getElementById('avulsa-item');
    const elDesc = document.getElementById('avulsa-desc-item');
    const elQtd = document.getElementById('avulsa-qtd');
    const elLote = document.getElementById('avulsa-lote');
    const elDtValid = document.getElementById('avulsa-dt-valid');
    const elRef = document.getElementById('avulsa-refer');
    if (elItem) elItem.value = '';
    if (elDesc) elDesc.textContent = '-';
    if (elQtd) elQtd.value = '';
    if (elLote) elLote.value = '';
    if (elDtValid) elDtValid.value = '';
    if (elRef) elRef.value = '';

    // Permanecer no fluxo de ficha avulsa e atualizar a lista de avulsas na tela
    renderTelaInventarioAvulsa();
  }


  // =========================================================================
  // MODAIS DE PESQUISA RÁPIDA NO BANCO LOCAL (ITEM, LOCALIZ, LOTE, REFERÊNCIA)
  // =========================================================================
  async function abrirPesquisaItemInterna(origem = 'avulsa') {
    const modal = document.getElementById('modal-pesquisa-interna');
    if (!modal) return;
    const codEmpresa = state.session.codEmpresa || '001';
    let termo = '';
    if (origem === 'transf_saida') {
      termo = document.getElementById('transf-sai-item')?.value.trim() || '';
    } else {
      termo = document.getElementById('avulsa-item')?.value.trim() || '';
    }

    document.getElementById('mpi-title').textContent = `🔍 Pesquisar Item (Emp ${codEmpresa})`;
    document.getElementById('mpi-subtitle').textContent = 'Busca rápida offline por código, EAN ou descrição:';
    document.getElementById('mpi-input-busca').value = termo;
    modal.style.display = 'flex';

    let itens = await DB.buscarItensLocal(termo, codEmpresa, 60);

    // Se o banco local estiver vazio para esta empresa e o coletor estiver online, faz busca online de fallback
    if (itens.length === 0 && isOnline()) {
      try {
        const payloadItem = { codEstabel: state.session.codEstabel || '', itCodigo: termo, descItem: '' };
        const res = await pasoeFetch('/fcGetItem', {
          method: 'PUT',
          body: JSON.stringify({ ...payloadItem, payload: [payloadItem] })
        });
        if (res.ok) {
          const data = await res.json();
          const listaRemota = extrairLista(data, 'itens');
          if (listaRemota.length > 0) {
            await DB.bulkPut('item', listaRemota, codEmpresa, 200);
            itens = listaRemota.slice(0, 60);
          }
        }
      } catch (e) {
        console.warn('Fallback fcGetItem online falhou:', e.message);
      }
    }

    state.pesquisaInterna = { tipo: 'ITEM', origem, dados: itens, filtrados: itens };
    renderListaPesquisaInterna();
    setTimeout(() => document.getElementById('mpi-input-busca')?.focus(), 80);
  }

  async function abrirPesquisaLocalizInterna(origem = 'avulsa', codDeposParam = '') {
    const modal = document.getElementById('modal-pesquisa-interna');
    if (!modal) return;
    const codEmpresa = state.session.codEmpresa || '001';
    const codEstabel = state.session.codEstabel || '';
    let codDepos = codDeposParam;
    let termo = '';

    if (origem === 'transf_saida') {
      codDepos = codDepos || document.getElementById('transf-sai-depos')?.value.trim() || '';
      termo = document.getElementById('transf-sai-localiz')?.value.trim() || '';
    } else if (origem === 'transf_entrada') {
      codDepos = codDepos || document.getElementById('transf-ent-depos')?.value.trim() || '';
      termo = document.getElementById('transf-ent-localiz')?.value.trim() || '';
    } else {
      codDepos = codDepos || state.depositoSelecionado?.codDepos || '';
      termo = document.getElementById('avulsa-localiz')?.value.trim() || '';
    }

    document.getElementById('mpi-title').textContent = `📍 Pesquisar Localização (${codDepos || 'Geral'})`;
    document.getElementById('mpi-subtitle').textContent = codDepos ? `Localizações do depósito ${codDepos}:` : 'Localizações cadastradas:';
    document.getElementById('mpi-input-busca').value = termo;
    modal.style.display = 'flex';

    let locs = await DB.buscarLocalizacoesLocal(codEmpresa, codEstabel, codDepos, termo);

    // Se estiver vazio localmente e conectado, tenta consultar fcGetLocalizacao e gravar no IndexedDB
    if (locs.length === 0 && isOnline() && codDepos) {
      try {
        const payloadLoc = { codEstabel: codEstabel || '', codDepos: codDepos || '' };
        const res = await pasoeFetch('/fcGetLocalizacao', {
          method: 'PUT',
          body: JSON.stringify({ ...payloadLoc, payload: [payloadLoc] })
        });
        if (res.ok) {
          const data = await res.json();
          const lista = extrairLista(data, 'localizacao');
          if (lista && lista.length > 0) {
            await DB.bulkPut('localizacao', lista, codEmpresa);
            locs = await DB.buscarLocalizacoesLocal(codEmpresa, codEstabel, codDepos, termo);
          }
        }
      } catch (e) {
        console.warn('Fallback fcGetLocalizacao falhou:', e.message);
      }
    }

    state.pesquisaInterna = { tipo: 'LOCALIZ', origem, dados: locs, filtrados: locs };
    renderListaPesquisaInterna();
    setTimeout(() => document.getElementById('mpi-input-busca')?.focus(), 80);
  }

  async function abrirPesquisaLoteInterna(origem = 'avulsa', itCodigoParam = '', codDeposParam = '') {
    const modal = document.getElementById('modal-pesquisa-interna');
    if (!modal) return;
    const codEmpresa = state.session.codEmpresa || '001';
    const codEstabel = state.session.codEstabel || '';
    let itCodigo = itCodigoParam;
    let codDepos = codDeposParam;
    let termo = '';

    if (origem === 'transf_saida') {
      itCodigo = itCodigo || document.getElementById('transf-sai-item')?.value.trim() || '';
      codDepos = codDepos || document.getElementById('transf-sai-depos')?.value.trim() || '';
      termo = document.getElementById('transf-sai-lote')?.value.trim() || '';
    } else if (origem === 'transf_entrada') {
      itCodigo = itCodigo || '';
      codDepos = codDepos || document.getElementById('transf-ent-depos')?.value.trim() || '';
      termo = document.getElementById('transf-ent-lote')?.value.trim() || '';
    } else {
      itCodigo = itCodigo || document.getElementById('avulsa-item')?.value.trim() || '';
      codDepos = codDepos || state.depositoSelecionado?.codDepos || '';
      termo = document.getElementById('avulsa-lote')?.value.trim() || '';
    }

    document.getElementById('mpi-title').textContent = '🏷️ Pesquisar Lote / Validade';
    document.getElementById('mpi-subtitle').textContent = itCodigo ? `Lotes do item ${itCodigo}:` : (codDepos ? `Lotes no depósito ${codDepos}:` : 'Lotes cadastrados:');
    document.getElementById('mpi-input-busca').value = termo;
    modal.style.display = 'flex';

    let lotes = await DB.buscarLotesLocal(codEmpresa, codEstabel, itCodigo, codDepos, termo);

    // Se estiver vazio localmente e conectado com itCodigo, busca fcGetLote e grava no IndexedDB
    if (lotes.length === 0 && isOnline() && itCodigo) {
      try {
        const payloadLote = { codEstabel: codEstabel || '', itCodigo };
        const res = await pasoeFetch('/fcGetLote', {
          method: 'PUT',
          body: JSON.stringify({ ...payloadLote, payload: [payloadLote] })
        });
        if (res.ok) {
          const data = await res.json();
          const lista = extrairLista(data, 'lotes');
          if (lista && lista.length > 0) {
            await DB.bulkPut('lote', lista, codEmpresa);
            lotes = await DB.buscarLotesLocal(codEmpresa, codEstabel, itCodigo, codDepos, termo);
          }
        }
      } catch (e) {
        console.warn('Fallback fcGetLote falhou:', e.message);
      }
    }

    state.pesquisaInterna = { tipo: 'LOTE', origem, dados: lotes, filtrados: lotes };
    renderListaPesquisaInterna();
    setTimeout(() => document.getElementById('mpi-input-busca')?.focus(), 80);
  }

  async function abrirPesquisaReferenciaInterna(origem = 'avulsa') {
    const modal = document.getElementById('modal-pesquisa-interna');
    if (!modal) return;
    const codEmpresa = state.session.codEmpresa || '001';
    let termo = '';
    if (origem === 'transf_saida') {
      termo = document.getElementById('transf-sai-refer')?.value.trim() || '';
    } else if (origem === 'transf_entrada') {
      termo = document.getElementById('transf-ent-refer')?.value.trim() || '';
    } else {
      termo = document.getElementById('avulsa-refer')?.value.trim() || '';
    }

    document.getElementById('mpi-title').textContent = `🔖 Pesquisar Referência (Emp ${codEmpresa})`;
    document.getElementById('mpi-subtitle').textContent = 'Referências cadastradas no banco local:';
    document.getElementById('mpi-input-busca').value = termo;
    modal.style.display = 'flex';

    const refs = await DB.buscarReferenciasLocal(codEmpresa, termo);
    state.pesquisaInterna = { tipo: 'REFER', origem, dados: refs, filtrados: refs };
    renderListaPesquisaInterna();
    setTimeout(() => document.getElementById('mpi-input-busca')?.focus(), 80);
  }

  function fecharModalPesquisaInterna() {
    const modal = document.getElementById('modal-pesquisa-interna');
    if (modal) modal.style.display = 'none';
  }

  let timerBuscaModal = null;
  function onFiltrarPesquisaInterna(termo) {
    if (timerBuscaModal) clearTimeout(timerBuscaModal);
    timerBuscaModal = setTimeout(async () => {
      const codEmpresa = state.session.codEmpresa || '001';
      const tipo = state.pesquisaInterna.tipo;
      const t = (termo || '').trim().toLowerCase();

      if (tipo === 'ITEM') {
        state.pesquisaInterna.filtrados = await DB.buscarItensLocal(t, codEmpresa, 60);
      } else if (tipo === 'LOCALIZ') {
        state.pesquisaInterna.filtrados = state.pesquisaInterna.dados.filter(l => {
          if (!t) return true;
          if (l.codLocaliz && l.codLocaliz.toLowerCase().includes(t)) return true;
          if (l.descricao && l.descricao.toLowerCase().includes(t)) return true;
          if (!l.codLocaliz && ('branco'.includes(t) || 'padrao'.includes(t))) return true;
          return false;
        });
      } else if (tipo === 'LOTE') {
        state.pesquisaInterna.filtrados = state.pesquisaInterna.dados.filter(l =>
          !t ||
          l.lote.toLowerCase().includes(t) ||
          (l.itCodigo || '').toLowerCase().includes(t) ||
          (l.codDepos || '').toLowerCase().includes(t) ||
          (l.codLocaliz || '').toLowerCase().includes(t)
        );
      } else if (tipo === 'REFER') {
        state.pesquisaInterna.filtrados = state.pesquisaInterna.dados.filter(r =>
          !t || (r.codRefer || '').toLowerCase().includes(t) || (r.descRefer || '').toLowerCase().includes(t)
        );
      }
      renderListaPesquisaInterna();
    }, 180);
  }

  function renderListaPesquisaInterna() {
    const elLista = document.getElementById('mpi-lista-scroll');
    const elBadge = document.getElementById('mpi-count-badge');
    if (!elLista) return;

    const tipo = state.pesquisaInterna.tipo;
    const lista = state.pesquisaInterna.filtrados || [];
    if (elBadge) elBadge.textContent = `${lista.length} registro(s)`;

    if (lista.length === 0) {
      if (tipo === 'ITEM') {
        elLista.innerHTML = `
          <div style="text-align:center; padding:24px 14px; color:#64748b;">
            <div style="font-size:28px; margin-bottom:6px;">📦</div>
            <div style="font-size:12.5px; font-weight:700; color:#0f172a; margin-bottom:4px;">Nenhum item encontrado no banco local</div>
            <div style="font-size:11px; margin-bottom:12px;">Para realizar pesquisas offline sem internet, execute a sincronização do catálogo.</div>
            <button class="btn btn-primary" onclick="App.fecharModalPesquisaInterna(); App.abrirModalCargaInicial();" style="width:auto; padding:6px 14px; font-size:11.5px;">
              ⬇️ Sincronizar Catálogo Offline
            </button>
          </div>
        `;
      } else {
        elLista.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">Nenhum registro encontrado no banco local.</div>';
      }
      return;
    }

    if (tipo === 'ITEM') {
      elLista.innerHTML = lista.map((it, idx) => `
        <div class="mpi-item-card" onclick="App.selecionarResultadoPesquisa(${idx})">
          <div class="mpi-card-header">
            <span class="mpi-card-code">${escapeHtml(it.itCodigo)}</span>
            <span class="mpi-card-badge">${escapeHtml(it.un || 'UN')}</span>
          </div>
          <div class="mpi-card-desc">${escapeHtml(it.descItem)}</div>
          <div class="mpi-card-meta">
            ${it.codBarras ? `<span>EAN: <strong>${escapeHtml(it.codBarras)}</strong></span>` : ''}
            ${it.codLocaliz ? `<span>Loc: <strong>${escapeHtml(it.codLocaliz)}</strong></span>` : ''}
          </div>
        </div>
      `).join('');
    } else if (tipo === 'LOCALIZ') {
      elLista.innerHTML = lista.map((l, idx) => `
        <div class="mpi-item-card" onclick="App.selecionarResultadoPesquisa(${idx})">
          <div class="mpi-card-header">
            <span class="mpi-card-code">📍 ${l.codLocaliz ? escapeHtml(l.codLocaliz) : '<span style="color:#d97706; font-style:italic; font-weight:700;">(Em Branco / Padrão)</span>'}</span>
            <span class="mpi-card-badge">${escapeHtml(l.origem || 'Local')}</span>
          </div>
          <div class="mpi-card-desc">${escapeHtml(l.descricao || 'BRANCO')}</div>
        </div>
      `).join('');
    } else if (tipo === 'LOTE') {
      const depAtual = (state.depositoSelecionado?.codDepos || '').toUpperCase();
      elLista.innerHTML = lista.map((l, idx) => {
        const mesmoDep = !depAtual || (l.codDepos && l.codDepos.toUpperCase() === depAtual);
        const tagDep = l.codDepos ? `Dep: <strong>${escapeHtml(l.codDepos)}</strong>` : '';
        const tagQtd = (l.qtDisponivel !== null && l.qtDisponivel !== undefined) ? `Qtd: <strong>${l.qtDisponivel}</strong>` : '';
        return `
          <div class="mpi-item-card" onclick="App.selecionarResultadoPesquisa(${idx})">
            <div class="mpi-card-header">
              <span class="mpi-card-code">🏷️ ${escapeHtml(l.lote)}</span>
              <span class="mpi-card-badge" style="${mesmoDep ? 'background:#dcfce7; color:#15803d; border-color:#86efac;' : 'background:#f1f5f9; color:#475569;'}">
                ${mesmoDep ? 'Depósito Atual' : (l.codDepos ? `Dep. ${escapeHtml(l.codDepos)}` : 'Lote')}
              </span>
            </div>
            <div class="mpi-card-desc" style="font-size:11.5px; color:#334155; margin:3px 0;">
              Item: <strong>${escapeHtml(l.itCodigo || '')}</strong> ${tagDep ? `• ${tagDep}` : ''} ${tagQtd ? `• ${tagQtd}` : ''}
            </div>
            <div class="mpi-card-meta">
              ${l.dtValiLote ? `<span>Val: <strong>${formatarDataBr(l.dtValiLote)}</strong></span>` : ''}
              ${l.codLocaliz ? `<span>Loc: <strong>${escapeHtml(l.codLocaliz)}</strong></span>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } else if (tipo === 'REFER') {
      elLista.innerHTML = lista.map((r, idx) => `
        <div class="mpi-item-card" onclick="App.selecionarResultadoPesquisa(${idx})">
          <div class="mpi-card-header">
            <span class="mpi-card-code">${escapeHtml(r.codRefer || '(Sem Referência)')}</span>
          </div>
          <div class="mpi-card-desc">${escapeHtml(r.descRefer)}</div>
        </div>
      `).join('');
    }
  }

  function selecionarResultadoPesquisa(idx) {
    const reg = state.pesquisaInterna.filtrados[idx];
    if (!reg) return;
    const tipo = state.pesquisaInterna.tipo;
    const origem = state.pesquisaInterna.origem || 'avulsa';

    if (origem === 'transf_saida') {
      if (tipo === 'ITEM') {
        const inp = document.getElementById('transf-sai-item');
        if (inp) {
          inp.value = reg.itCodigo;
          onItemSaidaAlterado(reg.itCodigo);
        }
      } else if (tipo === 'LOCALIZ') {
        const inp = document.getElementById('transf-sai-localiz');
        if (inp) inp.value = reg.codLocaliz || '';
      } else if (tipo === 'LOTE') {
        const inp = document.getElementById('transf-sai-lote');
        if (inp) {
          inp.value = reg.lote;
          const inpDt = document.getElementById('transf-sai-dt-valid');
          if (inpDt && reg.dtValiLote) inpDt.value = formatarParaInputDate(reg.dtValiLote);
        }
      } else if (tipo === 'REFER') {
        const inp = document.getElementById('transf-sai-refer');
        if (inp) inp.value = reg.codRefer || '';
      }
    } else if (origem === 'transf_entrada') {
      if (tipo === 'LOCALIZ') {
        const inp = document.getElementById('transf-ent-localiz');
        if (inp) inp.value = reg.codLocaliz || '';
      } else if (tipo === 'LOTE') {
        const inp = document.getElementById('transf-ent-lote');
        if (inp) {
          inp.value = reg.lote;
          onLoteEntradaAlterado(reg.lote);
        }
      } else if (tipo === 'REFER') {
        const inp = document.getElementById('transf-ent-refer');
        if (inp) inp.value = reg.codRefer || '';
      }
    } else {
      // Padrão Ficha Avulsa
      if (tipo === 'ITEM') {
        const inp = document.getElementById('avulsa-item');
        if (inp) {
          inp.value = reg.itCodigo;
          lookupItemAvulsa(reg.itCodigo);
        }
      } else if (tipo === 'LOCALIZ') {
        const inp = document.getElementById('avulsa-localiz');
        if (inp) inp.value = reg.codLocaliz || '';
      } else if (tipo === 'LOTE') {
        const inpL = document.getElementById('avulsa-lote');
        if (inpL) inpL.value = reg.lote;
        if (reg.dtValiLote) {
          const inpDt = document.getElementById('avulsa-dt-valid');
          if (inpDt) inpDt.value = formatarParaInputDate(reg.dtValiLote);
        }
        if (reg.codLocaliz) {
          const inpLoc = document.getElementById('avulsa-localiz');
          if (inpLoc && !inpLoc.value) inpLoc.value = reg.codLocaliz;
        }
        if (reg.codRefer) {
          const inpRef = document.getElementById('avulsa-refer');
          if (inpRef && !inpRef.value) inpRef.value = reg.codRefer;
        }
      } else if (tipo === 'REFER') {
        const inp = document.getElementById('avulsa-refer');
        if (inp) inp.value = reg.codRefer;
      }
    }

    fecharModalPesquisaInterna();
  }

  // =========================================================================
  // MÓDULO: TRANSFERÊNCIA DE MATERIAL (CE0206 / fcSetTransfMaterial.p)
  // Fluxo em 2 Etapas: Saída -> Pendente Entrada -> Entrada -> Efetivação
  // =========================================================================

  let stateTransferencias = {
    filtroStatus: 'todas',
    termoBusca: '',
    lista: [],
    transferenciaAtiva: null
  };

  async function renderTelaTransferencias(params) {
    const codEmpresa = state.session.codEmpresa || '001';
    const codUsuario = state.session.codUsuario || '';
    if (params && params.filtro) {
      stateTransferencias.filtroStatus = params.filtro;
    }

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <button class="btn-topbar-action" onclick="App.navegar('menu')">‹ Início</button>
        <h3 style="font-size: 14.5px; font-weight: 800; margin: 0; color: #0f172a;">Transferências (CE0206)</h3>
        <button class="btn btn-primary" onclick="App.navegar('transferencia_saida')" style="width: auto; padding: 5px 10px; font-size: 11.5px; border-radius: 6px;">
          + Nova Saída
        </button>
      </div>

      <div style="background: #f1f5f9; padding: 4px; border-radius: 8px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 8px;">
        <button type="button" class="tab-btn-mini ${stateTransferencias.filtroStatus === 'todas' ? 'active' : ''}" onclick="App.filtrarStatusTransferencia('todas')" id="tab-transf-todas">Todas</button>
        <button type="button" class="tab-btn-mini ${stateTransferencias.filtroStatus === 'pendente_entrada' ? 'active' : ''}" onclick="App.filtrarStatusTransferencia('pendente_entrada')" id="tab-transf-pendente_entrada">Pend. Ent.</button>
        <button type="button" class="tab-btn-mini ${stateTransferencias.filtroStatus === 'pronto_envio' ? 'active' : ''}" onclick="App.filtrarStatusTransferencia('pronto_envio')" id="tab-transf-pronto_envio">Pend. Totvs</button>
        <button type="button" class="tab-btn-mini ${stateTransferencias.filtroStatus === 'efetivado' ? 'active' : ''}" onclick="App.filtrarStatusTransferencia('efetivado')" id="tab-transf-efetivado">Efetivadas</button>
      </div>

      <div style="position: relative; margin-bottom: 10px;">
        <input type="text" id="transf-input-busca" class="form-input" style="padding-right: 30px; font-size: 12.5px;" placeholder="Buscar item, depósito ou doc..." oninput="App.onBuscarTransferencias(this.value)" value="${escapeHtml(stateTransferencias.termoBusca)}">
        <button type="button" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer;" onclick="document.getElementById('transf-input-busca').value=''; App.onBuscarTransferencias('');">✕</button>
      </div>

      <div id="transf-lista-container" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="text-align: center; padding: 24px 10px; color: #94a3b8; font-size: 13px;">
          Carregando movimentações...
        </div>
      </div>
    `;

    await carregarListaTransferencias();
  }

  async function carregarListaTransferencias() {
    const codEmpresa = state.session.codEmpresa || '001';
    const codUsuario = state.session.codUsuario || '';
    stateTransferencias.lista = await DB.listarTransferencias(codEmpresa, codUsuario);
    renderizarCardsTransferencias();
  }

  function filtrarStatusTransferencia(status) {
    stateTransferencias.filtroStatus = status;
    document.querySelectorAll('.tab-btn-mini').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tab-transf-${status}`);
    if (btn) btn.classList.add('active');
    renderizarCardsTransferencias();
  }

  function onBuscarTransferencias(termo) {
    stateTransferencias.termoBusca = termo || '';
    renderizarCardsTransferencias();
  }

  function renderizarCardsTransferencias() {
    const elLista = document.getElementById('transf-lista-container');
    if (!elLista) return;

    const termo = (stateTransferencias.termoBusca || '').trim().toLowerCase();
    const filtro = stateTransferencias.filtroStatus;

    let filtradas = stateTransferencias.lista.filter(t => {
      if (filtro === 'pendente_entrada' && t.status !== 'PENDENTE_ENTRADA') return false;
      if (filtro === 'pronto_envio' && t.status !== 'PRONTO_ENVIO' && t.status !== 'ERRO') return false;
      if (filtro === 'efetivado' && t.status !== 'EFETIVADO') return false;

      if (termo) {
        const itemStr = `${t.itCodigo || ''} ${t.descItem || ''}`.toLowerCase();
        const depStr = `${t.codDeposSai || ''} ${t.codDeposEnt || ''}`.toLowerCase();
        const docStr = `${t.nroDocto || ''} ${t.serie || ''}`.toLowerCase();
        if (!itemStr.includes(termo) && !depStr.includes(termo) && !docStr.includes(termo)) return false;
      }
      return true;
    });

    if (filtradas.length === 0) {
      elLista.innerHTML = `
        <div style="text-align: center; padding: 35px 20px; background: #fff; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <div style="font-size: 32px; margin-bottom: 8px;">🔄</div>
          <div style="font-weight: 700; color: #334155; margin-bottom: 4px;">Nenhuma transferência encontrada</div>
          <p style="font-size: 11.5px; color: #64748b; margin-bottom: 14px;">
            ${filtro === 'todas' ? 'Você ainda não registrou saídas de material neste aparelho.' : 'Nenhuma transferência com o status selecionado.'}
          </p>
          <button class="btn btn-primary" onclick="App.navegar('transferencia_saida')" style="width: auto; padding: 6px 14px; margin: 0 auto; font-size: 12px;">
            + Criar Nova Saída
          </button>
        </div>
      `;
      return;
    }

    elLista.innerHTML = filtradas.map(t => {
      let badgeHtml = '';
      if (t.status === 'PENDENTE_ENTRADA') {
        badgeHtml = `<span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:700;">⏳ Pendente Entrada</span>`;
      } else if (t.status === 'PRONTO_ENVIO') {
        badgeHtml = `<span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-weight:700;">📤 Pronto p/ Totvs</span>`;
      } else if (t.status === 'EFETIVADO') {
        badgeHtml = `<span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700;">✓ Efetivado Totvs</span>`;
      } else if (t.status === 'ERRO') {
        badgeHtml = `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:700;">⚠️ Erro Totvs</span>`;
      }

      const ehEfetivado = t.status === 'EFETIVADO';

      return `
        <div class="card" style="border-left: 4px solid ${ehEfetivado ? '#10b981' : (t.status === 'ERRO' ? '#ef4444' : (t.status === 'PENDENTE_ENTRADA' ? '#f59e0b' : '#3b82f6'))}; padding: 12px; margin-bottom: 2px;">
          <!-- Cabeçalho do Card -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-size: 11px; font-weight: 700; color: #64748b;">
              #${escapeHtml(t.id_uuid.slice(-6).toUpperCase())} • ${formatarDataBr(t.dtTransf || t.criadoEm)}
            </div>
            <div>${badgeHtml}</div>
          </div>

          <!-- Item e Quantidade -->
          <div style="margin-bottom: 8px;">
            <div style="font-size: 13.5px; font-weight: 800; color: #0f172a; line-height: 1.25;">
              ${escapeHtml(t.itCodigo)} <span style="font-weight: 400; color: #334155;">- ${escapeHtml(t.descItem || '')}</span>
            </div>
            <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 3px;">
              <span style="font-size: 11px; color: #64748b;">Quantidade:</span>
              <strong style="font-size: 14px; color: #0284c7;">${Number(t.quantidade || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</strong>
              <span style="font-size: 11px; color: #64748b; font-weight: 600;">${escapeHtml(t.un || 'UN')}</span>
              ${t.nroDocto ? `<span style="margin-left: auto; font-size: 10.5px; color: #64748b;">Doc: <strong>${escapeHtml(t.nroDocto)}${t.serie ? '/' + escapeHtml(t.serie) : ''}</strong></span>` : ''}
            </div>
          </div>

          <!-- Fluxo Saída -> Entrada -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; margin-bottom: 8px; font-size: 11.5px;">
            <!-- Linha Saída -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span style="width: 14px; text-align: center; font-size: 11px;">🔴</span>
              <strong style="color: #991b1b; min-width: 44px;">Saída:</strong>
              <span>Dep <strong>${escapeHtml(t.codDeposSai)}</strong></span>
              ${t.codLocalizSai ? `<span>• Loc <strong>${escapeHtml(t.codLocalizSai)}</strong></span>` : ''}
              ${t.loteSai ? `<span>• Lote <strong>${escapeHtml(t.loteSai)}</strong></span>` : ''}
              ${t.dtValiLote ? `<span style="color:#64748b;">(${formatarDataBr(t.dtValiLote)})</span>` : ''}
              ${t.codReferSai ? `<span>• Ref <strong>${escapeHtml(t.codReferSai)}</strong></span>` : ''}
            </div>

            <!-- Linha Entrada -->
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 14px; text-align: center; font-size: 11px;">🟢</span>
              <strong style="color: #166534; min-width: 44px;">Entrada:</strong>
              ${t.codDeposEnt ? `
                <span>Dep <strong>${escapeHtml(t.codDeposEnt)}</strong></span>
                ${t.codLocalizEnt ? `<span>• Loc <strong>${escapeHtml(t.codLocalizEnt)}</strong></span>` : ''}
                ${t.loteEnt ? `<span>• Lote <strong>${escapeHtml(t.loteEnt)}</strong></span>` : ''}
                ${t.dtValiLoteEnt ? `<span style="color:#64748b;">(${formatarDataBr(t.dtValiLoteEnt)})</span>` : ''}
                ${t.codReferEnt ? `<span>• Ref <strong>${escapeHtml(t.codReferEnt)}</strong></span>` : ''}
              ` : `
                <span style="color: #d97706; font-style: italic; font-weight: 600;">Aguardando confirmação de entrada...</span>
              `}
            </div>
          </div>

          <!-- Mensagem de Erro do TOTVS se houver -->
          ${t.status === 'ERRO' && (t.detalheErro || t.mensagemRetorno) ? `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 7px 9px; font-size: 11.5px; color: #991b1b; margin-bottom: 8px;">
              <strong>⚠️ Erro Retornado pelo Datasul (ceapi001k):</strong><br>
              ${escapeHtml(t.detalheErro || t.mensagemRetorno)}
            </div>
          ` : ''}

          ${ehEfetivado && t.mensagemRetorno ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 5px 8px; font-size: 11px; color: #166534; margin-bottom: 8px;">
              ✓ ${escapeHtml(t.mensagemRetorno)}
            </div>
          ` : ''}

          <!-- Botões de Ação -->
          <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center; margin-top: 4px;">
            ${ehEfetivado ? `
              <!-- Apenas Consulta quando já efetivado no TOTVS -->
              <button class="btn btn-secondary" onclick="App.consultarTransferencia('${escapeHtml(t.id_uuid)}')" style="width: auto; padding: 5px 12px; font-size: 11.5px;">
                👁️ Consultar
              </button>
            ` : `
              <!-- Ações para movimentos não efetivados -->
              ${t.status === 'PENDENTE_ENTRADA' ? `
                <button class="btn btn-primary" onclick="App.abrirEntradaTransferencia('${escapeHtml(t.id_uuid)}')" style="width: auto; padding: 6px 12px; font-size: 11.5px; font-weight: 700;">
                  📥 Dar Entrada ➔
                </button>
                <button class="btn btn-secondary" onclick="App.abrirEdicaoSaida('${escapeHtml(t.id_uuid)}')" style="width: auto; padding: 6px 10px; font-size: 11.5px;">
                  ✏️ Editar
                </button>
                <button class="btn btn-danger-outline" onclick="App.excluirTransferencia('${escapeHtml(t.id_uuid)}')" style="width: auto; padding: 6px 8px; font-size: 11.5px;" title="Excluir">
                  🗑️
                </button>
              ` : `
                <button class="btn btn-primary" onclick="App.transmitirTransferencia('${escapeHtml(t.id_uuid)}')" style="width: auto; padding: 6px 12px; font-size: 11.5px; font-weight: 700; background: #0284c7;">
                  ⚡ Transmitir ao Totvs
                </button>
                <button class="btn btn-secondary" onclick="App.abrirEntradaTransferencia('${escapeHtml(t.id_uuid)}')" style="width: auto; padding: 6px 10px; font-size: 11.5px;">
                  ✏️ Entrada
                </button>
                <button class="btn btn-secondary" onclick="App.abrirEdicaoSaida('${escapeHtml(t.id_uuid)}')" style="width: auto; padding: 6px 8px; font-size: 11.5px;">
                  ✏️ Saída
                </button>
                <button class="btn btn-danger-outline" onclick="App.excluirTransferencia('${escapeHtml(t.id_uuid)}')" style="width: auto; padding: 6px 8px; font-size: 11.5px;" title="Excluir">
                  🗑️
                </button>
              `}
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  async function abrirEdicaoSaida(id_uuid) {
    const transf = await DB.obterTransferencia(id_uuid);
    if (!transf) {
      alert('Movimento de transferência não encontrado.');
      return;
    }
    if (transf.status === 'EFETIVADO') {
      alert('Esta transferência já foi efetivada no Totvs e não pode mais ser alterada.');
      return;
    }
    renderTelaTransferenciaSaida(transf);
  }

  async function abrirEntradaTransferencia(id_uuid) {
    const transf = await DB.obterTransferencia(id_uuid);
    if (!transf) {
      alert('Movimento de transferência não encontrado.');
      return;
    }
    if (transf.status === 'EFETIVADO') {
      alert('Esta transferência já foi efetivada no Totvs.');
      return;
    }
    renderTelaTransferenciaEntrada(transf);
  }

  async function renderTelaTransferenciaSaida(transfEdicao = null) {
    const codEmpresa = state.session.codEmpresa || '001';
    const codEstabel = state.session.codEstabel || '101';
    stateTransferencias.transferenciaAtiva = transfEdicao || null;

    const depositos = await DB.getAllByEmpresa('deposito', codEmpresa);
    const hojeIso = new Date().toISOString().slice(0, 10);

    const isEdit = Boolean(transfEdicao && transfEdicao.id_uuid);
    const itCodigoVal = transfEdicao ? transfEdicao.itCodigo : '';
    const descItemVal = transfEdicao ? (transfEdicao.descItem || '') : '';
    const unVal = transfEdicao ? (transfEdicao.un || 'UN') : 'UN';
    const depSaiVal = transfEdicao ? transfEdicao.codDeposSai : (depositos[0]?.codDepos || '');
    const locSaiVal = transfEdicao ? (transfEdicao.codLocalizSai || '') : '';
    const loteSaiVal = transfEdicao ? (transfEdicao.loteSai || '') : '';
    const dtValiSaiVal = transfEdicao ? (transfEdicao.dtValiLote || '') : '';
    const refSaiVal = transfEdicao ? (transfEdicao.codReferSai || '') : '';
    const qtdVal = transfEdicao ? (transfEdicao.quantidade || '') : '';
    const nroDoctoVal = transfEdicao ? (transfEdicao.nroDocto || '') : '';
    const serieVal = transfEdicao ? (transfEdicao.serie || '') : '';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('transferencias')">‹ Voltar</button>
        <h3 style="font-size: 15px; font-weight: 800; margin: 0; color: #0f172a;">
          ${isEdit ? 'Editar Saída de Material' : 'Nova Saída (CE0206)'}
        </h3>
        <span style="width: 48px;"></span>
      </div>

      <div class="card" style="margin-bottom: 12px; border-top: 3px solid #b91c1c;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="font-size: 12px; font-weight: 700; color: #991b1b; display: flex; align-items: center; gap: 4px;">
            <span>🔴</span> 1ª Etapa: Saída do Material
          </div>
          <span style="font-size: 11px; color: #64748b;">Filial: <strong>${escapeHtml(codEstabel)}</strong></span>
        </div>

        <form id="form-transf-saida" onsubmit="event.preventDefault(); App.salvarSaidaTransferencia(false);">
          <!-- Campo Item -->
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label" for="transf-sai-item">Item (Código / EAN) *</label>
            <div style="display: flex; gap: 5px;">
              <input type="text" id="transf-sai-item" class="form-input" style="font-weight: 700;" placeholder="Código do item..." value="${escapeHtml(itCodigoVal)}" required onblur="App.onItemSaidaAlterado(this.value)" onchange="App.onItemSaidaAlterado(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault(); App.onItemSaidaAlterado(this.value);}">
              <button type="button" class="btn btn-secondary" style="width: auto; padding: 0 10px;" onclick="App.abrirPesquisaItemInterna('transf_saida')" title="Buscar Item">🔍</button>
              <button type="button" class="btn btn-secondary" style="width: auto; padding: 0 10px;" onclick="App.abrirScannerCamera('TRANSF_SAIDA_ITEM')" title="Ler Código de Barras">📷</button>
            </div>
            <div id="transf-sai-desc-item" style="font-size: 11.5px; font-weight: 700; color: #0284c7; margin-top: 3px;">
              ${descItemVal ? `${escapeHtml(descItemVal)} (${escapeHtml(unVal)})` : '-'}
            </div>
          </div>

          <!-- Depósito de Saída -->
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label" for="transf-sai-depos">Depósito Saída *</label>
            <select id="transf-sai-depos" class="form-input" required onchange="App.onDepositoSaidaAlterado(this.value)">
              ${depositos.length === 0 ? '<option value="">Nenhum depósito cadastrado</option>' : ''}
              ${depositos.map(d => `<option value="${escapeHtml(d.codDepos)}" ${d.codDepos === depSaiVal ? 'selected' : ''}>${escapeHtml(d.codDepos)} - ${escapeHtml(d.nome || d.codDepos)}</option>`).join('')}
            </select>
          </div>

          <!-- Localização e Quantidade -->
          <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 8px; margin-bottom: 10px;">
            <div class="form-group" style="margin: 0;">
              <label class="form-label" for="transf-sai-localiz">Localização Saída</label>
              <div style="display: flex; gap: 4px;">
                <input type="text" id="transf-sai-localiz" class="form-input" placeholder="ex: BRANCO" value="${escapeHtml(locSaiVal)}">
                <button type="button" id="transf-sai-btn-lupa-loc" class="btn btn-secondary" style="width: auto; padding: 0 8px;" onclick="App.abrirPesquisaLocalizInterna('transf_saida')" title="Buscar Localização">🔍</button>
              </div>
              <div id="transf-sai-loc-tip" style="display: none; font-size: 10.5px; color: #475569; margin-top: 3px; font-weight: 600;"></div>
            </div>

            <div class="form-group" style="margin: 0;">
              <label class="form-label" for="transf-sai-qtd">Quantidade *</label>
              <input type="number" id="transf-sai-qtd" class="form-input" style="font-size: 14px; font-weight: 800; color: #0284c7;" step="0.0001" min="0.0001" placeholder="0,00" value="${qtdVal}" required>
            </div>
          </div>

          <!-- Bloco Condicional Lote Saída -->
          <div id="transf-sai-bloco-lote" style="display: block; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px; margin-bottom: 10px;">
            <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 8px;">
              <div class="form-group" style="margin: 0;">
                <label class="form-label" for="transf-sai-lote">Lote Saída <span id="transf-sai-lote-req">*</span></label>
                <div style="display: flex; gap: 4px;">
                  <input type="text" id="transf-sai-lote" class="form-input" placeholder="Lote..." value="${escapeHtml(loteSaiVal)}" onblur="App.onLoteSaidaAlterado(this.value)">
                  <button type="button" id="transf-sai-btn-lupa-lote" class="btn btn-secondary" style="width: auto; padding: 0 8px;" onclick="App.abrirPesquisaLoteInterna('transf_saida')" title="Buscar Lote com Saldo">🔍</button>
                </div>
              </div>

              <div class="form-group" style="margin: 0;">
                <label class="form-label" for="transf-sai-dt-valid">Validade Saída</label>
                <input type="date" id="transf-sai-dt-valid" class="form-input" value="${formatarParaInputDate(dtValiSaiVal)}">
              </div>
            </div>
            <div id="transf-sai-lote-info" style="font-size: 10.5px; color: #b45309; margin-top: 4px;">
              Informe o lote de origem com saldo para a baixa.
            </div>
          </div>

          <!-- Bloco Referência Saída e Documento / Série -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 0.8fr; gap: 6px; margin-bottom: 12px;">
            <div class="form-group" style="margin: 0;">
              <label class="form-label" for="transf-sai-refer">Referência</label>
              <div style="display: flex; gap: 3px;">
                <input type="text" id="transf-sai-refer" class="form-input" placeholder="Ref..." value="${escapeHtml(refSaiVal)}">
                <button type="button" id="transf-sai-btn-lupa-refer" class="btn btn-secondary" style="width: auto; padding: 0 6px;" onclick="App.abrirPesquisaReferenciaInterna('transf_saida')" title="Buscar Referência">🔍</button>
              </div>
            </div>

            <div class="form-group" style="margin: 0;">
              <label class="form-label" for="transf-sai-doc">Docto (Opç)</label>
              <input type="text" id="transf-sai-doc" class="form-input" placeholder="ex: 1234" value="${escapeHtml(nroDoctoVal)}">
            </div>

            <div class="form-group" style="margin: 0;">
              <label class="form-label" for="transf-sai-serie">Série</label>
              <input type="text" id="transf-sai-serie" class="form-input" placeholder="ex: 1" value="${escapeHtml(serieVal)}">
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button type="button" class="btn btn-primary" onclick="App.salvarSaidaTransferencia(true)" style="background: #166534; font-weight: 700;">
              💾 Salvar Saída e Informar Entrada ➔
            </button>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-secondary" onclick="App.salvarSaidaTransferencia(false)">
                💾 Salvar Saída (Fica Pendente)
              </button>
              <button type="button" class="btn btn-secondary" onclick="App.navegar('transferencias')" style="width: auto; padding: 0 14px;">
                Cancelar
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    if (itCodigoVal) {
      await onItemSaidaAlterado(itCodigoVal);
    }
  }

  async function onItemSaidaAlterado(itCodigo) {
    const cod = (itCodigo || '').trim();
    const codEmpresa = state.session.codEmpresa || '001';
    const elDesc = document.getElementById('transf-sai-desc-item');
    if (!cod) {
      if (elDesc) elDesc.textContent = '-';
      stateTransferencias.itemSaidaSelecionado = null;
      aplicarRegrasTipoItemSaida(null);
      return;
    }

    let match = await DB.obterItemExato(cod, codEmpresa);
    let item = match?.item || match || null;

    // Fallback: varredura em buscarItensLocal caso a busca exata tenha divergência de pontuação/zeros
    if (!item) {
      const lista = await DB.buscarItensLocal(cod, codEmpresa, 10);
      const exato = (lista || []).find(it =>
        String(it.itCodigo).trim().toUpperCase() === cod.toUpperCase() ||
        String(it.codBarras || '').trim() === cod
      );
      if (exato) item = exato;
    }

    if (item) {
      const un = item.un || 'UN';
      if (elDesc) elDesc.textContent = `${item.descItem || cod} (${un})`;
      stateTransferencias.itemSaidaSelecionado = item;
      aplicarRegrasTipoItemSaida(item);
    } else {
      if (elDesc) elDesc.textContent = `${cod} (Não localizado no catálogo offline)`;
      stateTransferencias.itemSaidaSelecionado = null;
      aplicarRegrasTipoItemSaida(null);
    }
  }

  function aplicarRegrasTipoItemSaida(item) {
    // 1. Tipo de Controle de Estoque (tipoConEst): 1=Serial/Total, 2=Número de Série, 3=Lote, 4=Referência
    const tipoConEst = item ? Number(item.tipoConEst || item.tipoContrEstoque || 1) : 1;
    const ehLote = (tipoConEst === 3);
    const ehRefer = (tipoConEst === 4);

    // Campos de Lote na Saída
    const inpLote = document.getElementById('transf-sai-lote');
    const btnLupaLote = document.getElementById('transf-sai-btn-lupa-lote');
    const inpDtValid = document.getElementById('transf-sai-dt-valid');
    const loteReq = document.getElementById('transf-sai-lote-req');
    const loteInfo = document.getElementById('transf-sai-lote-info');
    const blocoLote = document.getElementById('transf-sai-bloco-lote');

    if (inpLote) {
      inpLote.disabled = !ehLote;
      if (!ehLote) inpLote.value = '';
    }
    if (btnLupaLote) btnLupaLote.disabled = !ehLote;
    if (inpDtValid) {
      inpDtValid.disabled = !ehLote;
      if (!ehLote) inpDtValid.value = '';
    }
    if (loteReq) loteReq.style.display = ehLote ? 'inline' : 'none';
    if (loteInfo) {
      if (ehLote) {
        loteInfo.textContent = 'Item controlado por Lote (tipoConEst 3). Informe o lote de origem com saldo.';
        loteInfo.style.color = '#b45309';
      } else {
        const descTipo = tipoConEst === 4 ? 'Referência' : (tipoConEst === 2 ? 'Número de Série' : 'Convencional / Total');
        loteInfo.textContent = `Item sem controle de lote (tipoConEst ${tipoConEst}: ${descTipo}).`;
        loteInfo.style.color = '#64748b';
      }
    }
    if (blocoLote) {
      blocoLote.style.opacity = ehLote ? '1' : '0.6';
      blocoLote.style.background = ehLote ? '#fffbeb' : '#f8fafc';
      blocoLote.style.borderColor = ehLote ? '#fde68a' : '#cbd5e1';
    }

    // Campos de Referência na Saída
    const inpRefer = document.getElementById('transf-sai-refer');
    const btnLupaRefer = document.getElementById('transf-sai-btn-lupa-refer');
    if (inpRefer) {
      inpRefer.disabled = !ehRefer;
      if (!ehRefer) inpRefer.value = '';
    }
    if (btnLupaRefer) btnLupaRefer.disabled = !ehRefer;

    // 2. Localização Única (locUnica)
    const isLocUnica = Boolean(item && (item.locUnica === true || item.locUnica === 1 || item.locUnica === 'true'));
    const inpLocaliz = document.getElementById('transf-sai-localiz');
    const btnLupaLoc = document.getElementById('transf-sai-btn-lupa-loc');
    const tipLoc = document.getElementById('transf-sai-loc-tip');

    if (inpLocaliz) {
      if (isLocUnica) {
        const locPadrao = item?.codLocaliz || 'BRANCO';
        inpLocaliz.value = locPadrao;
        inpLocaliz.readOnly = true;
        inpLocaliz.style.background = '#f1f5f9';
        inpLocaliz.style.color = '#334155';
        if (btnLupaLoc) btnLupaLoc.disabled = true;
        if (tipLoc) {
          tipLoc.textContent = `🔒 Localização única do item (${locPadrao}).`;
          tipLoc.style.display = 'block';
        }
      } else {
        inpLocaliz.value = item ? (item.codLocaliz || '') : '';
        inpLocaliz.readOnly = false;
        inpLocaliz.style.background = '#ffffff';
        inpLocaliz.style.color = '';
        if (btnLupaLoc) btnLupaLoc.disabled = false;
        if (tipLoc) tipLoc.style.display = 'none';
      }
    }

    // Depósito padrão do item
    if (item && item.depositoPad) {
      const selDep = document.getElementById('transf-sai-depos');
      if (selDep) {
        const existe = Array.from(selDep.options).some(o => o.value === item.depositoPad);
        if (existe) selDep.value = item.depositoPad;
      }
    }
  }

  async function onDepositoSaidaAlterado(codDepos) {
    // Pode atualizar sugestão de localizações se desejado
  }

  async function onLoteSaidaAlterado(lote) {
    const l = (lote || '').trim();
    if (!l) return;
    const codEmpresa = state.session.codEmpresa || '001';
    const itCodigo = document.getElementById('transf-sai-item')?.value.trim() || '';
    if (!itCodigo) return;

    const info = await DB.obterDataValidadeLote(codEmpresa, itCodigo, l);
    if (info && info.dtValiLote) {
      const inpDt = document.getElementById('transf-sai-dt-valid');
      if (inpDt && !inpDt.value) {
        inpDt.value = formatarParaInputDate(info.dtValiLote);
      }
    }
  }

  async function salvarSaidaTransferencia(irParaEntrada = false) {
    try {
      const codEmpresa = state.session.codEmpresa || '001';
      const codEstabel = state.session.codEstabel || '101';
      const codUsuario = state.session.codUsuario || '';

      const itCodigo = document.getElementById('transf-sai-item')?.value.trim() || '';
      const codDeposSai = document.getElementById('transf-sai-depos')?.value.trim() || '';
      const codLocalizSai = document.getElementById('transf-sai-localiz')?.value.trim() || '';
      let loteSai = document.getElementById('transf-sai-lote')?.value.trim() || '';
      let dtValiSai = document.getElementById('transf-sai-dt-valid')?.value.trim() || '';
      let codReferSai = document.getElementById('transf-sai-refer')?.value.trim() || '';
      const quantidade = parseFloat(document.getElementById('transf-sai-qtd')?.value || '0');
      const nroDocto = document.getElementById('transf-sai-doc')?.value.trim() || '';
      const serie = document.getElementById('transf-sai-serie')?.value.trim() || '';

      if (!itCodigo) {
        alert('Informe o código do item.');
        document.getElementById('transf-sai-item')?.focus();
        return;
      }

      if (!codDeposSai) {
        alert('Informe o depósito de saída.');
        document.getElementById('transf-sai-depos')?.focus();
        return;
      }

      if (!quantidade || quantidade <= 0 || isNaN(quantidade)) {
        alert('Informe uma quantidade válida maior que zero.');
        document.getElementById('transf-sai-qtd')?.focus();
        return;
      }

      // Validar lote e referência conforme tipoConEst
      const match = stateTransferencias.itemSaidaSelecionado || await DB.obterItemExato(itCodigo, codEmpresa);
      const item = match?.item || match || null;
      const tipoConEst = item ? Number(item.tipoConEst || item.tipoContrEstoque || 1) : 1;
      const ehLote = (tipoConEst === 3);
      const ehRefer = (tipoConEst === 4);

      if (ehLote && !loteSai) {
        alert('Este item possui controle de lote (tipoConEst 3). Informe o Lote de Saída.');
        document.getElementById('transf-sai-lote')?.focus();
        return;
      }

      if (!ehLote) {
        loteSai = '';
        dtValiSai = '';
      }
      if (!ehRefer) {
        codReferSai = '';
      }

      const editando = stateTransferencias.transferenciaAtiva;
      const transf = {
        ...(editando || {}),
        id_uuid: editando?.id_uuid || ('tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)),
        codEmpresa,
        codEstabel,
        codUsuario,
        dtTransf: editando?.dtTransf || new Date().toISOString().slice(0, 10),
        itCodigo,
        descItem: item?.descItem || editando?.descItem || itCodigo,
        un: item?.un || editando?.un || 'UN',
        quantidade,
        codDeposSai,
        codLocalizSai,
        loteSai,
        dtValiLote: dtValiSai,
        codReferSai,
        nroDocto,
        serie,
        status: editando?.status === 'ERRO' ? 'PRONTO_ENVIO' : (editando?.status || 'PENDENTE_ENTRADA'),
        pendenteSync: editando?.pendenteSync || false,
        criadoEm: editando?.criadoEm || new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
      };

      const salvo = await DB.salvarTransferencia(transf);

      if (irParaEntrada) {
        renderTelaTransferenciaEntrada(salvo);
      } else {
        alert('Saída salva com sucesso! O registro está pendente de entrada.');
        App.navegar('transferencias', { filtro: 'pendente_entrada' });
      }
    } catch (errSalvar) {
      console.error('Erro ao salvar saída de transferência:', errSalvar);
      alert('Erro ao salvar saída: ' + errSalvar.message);
    }
  }

  async function renderTelaTransferenciaEntrada(transf) {
    if (!transf) {
      alert('Nenhuma transferência selecionada.');
      App.navegar('transferencias');
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    stateTransferencias.transferenciaAtiva = transf;

    const matchItem = await DB.obterItemExato(transf.itCodigo, codEmpresa);
    const item = matchItem?.item || matchItem || null;
    const tipoConEst = item ? Number(item.tipoConEst || item.tipoContrEstoque || 1) : 1;
    const ehLote = (tipoConEst === 3);
    const ehRefer = (tipoConEst === 4);
    const isLocUnica = Boolean(item && (item.locUnica === true || item.locUnica === 1 || item.locUnica === 'true'));

    const depositos = await DB.getAllByEmpresa('deposito', codEmpresa);
    let depEntPadrao = transf.codDeposEnt || '';
    if (!depEntPadrao) {
      const outro = depositos.find(d => d.codDepos !== transf.codDeposSai);
      depEntPadrao = outro ? outro.codDepos : (depositos[0]?.codDepos || '');
    }

    const locEntPadrao = isLocUnica ? (item?.codLocaliz || transf.codLocalizEnt || '') : (transf.codLocalizEnt || '');
    const loteEntPadrao = ehLote ? (transf.loteEnt || transf.loteSai || '') : '';
    const dtValiEntPadrao = ehLote ? (transf.dtValiLoteEnt || transf.dtValiLote || '') : '';
    const refEntPadrao = ehRefer ? (transf.codReferEnt || transf.codReferSai || '') : '';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('transferencias')">‹ Voltar</button>
        <h3 style="font-size: 15px; font-weight: 800; margin: 0; color: #0f172a;">Entrada de Material</h3>
        <span style="width: 48px;"></span>
      </div>

      <!-- Card Resumo da Saída Já Gravada -->
      <div class="card" style="margin-bottom: 12px; background: #fff5f5; border: 1px solid #fed7d7; border-left: 4px solid #dc2626; padding: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="font-size: 11px; font-weight: 700; color: #991b1b;">
            🔴 Saída Registrada #${escapeHtml(transf.id_uuid.slice(-6).toUpperCase())}
          </div>
          <span style="font-size: 11px; color: #64748b;">${formatarDataBr(transf.dtTransf)}</span>
        </div>
        <div style="font-size: 13.5px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">
          ${escapeHtml(transf.itCodigo)} <span style="font-weight: 400; color: #475569;">- ${escapeHtml(transf.descItem || '')}</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #334155;">
          <span>Qtd: <strong style="color: #0284c7;">${transf.quantidade}</strong> ${escapeHtml(transf.un || 'UN')}</span>
          <span>• Dep Origem: <strong>${escapeHtml(transf.codDeposSai)}</strong></span>
          ${transf.codLocalizSai ? `<span>• Loc: <strong>${escapeHtml(transf.codLocalizSai)}</strong></span>` : ''}
          ${transf.loteSai ? `<span>• Lote: <strong>${escapeHtml(transf.loteSai)}</strong></span>` : ''}
          ${transf.dtValiLote ? `<span style="color:#64748b;">(${formatarDataBr(transf.dtValiLote)})</span>` : ''}
        </div>
      </div>

      <!-- Formulário da 2ª Etapa: Entrada -->
      <div class="card" style="margin-bottom: 12px; border-top: 3px solid #166534;">
        <div style="font-size: 12px; font-weight: 700; color: #166534; margin-bottom: 10px; display: flex; align-items: center; gap: 4px;">
          <span>🟢</span> 2ª Etapa: Informar Dados de Entrada
        </div>

        <form id="form-transf-entrada" onsubmit="event.preventDefault(); App.salvarEntradaTransferencia(true);">
          <!-- Depósito de Entrada -->
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label" for="transf-ent-depos">Depósito Destino / Entrada *</label>
            <select id="transf-ent-depos" class="form-input" required>
              ${depositos.map(d => `<option value="${escapeHtml(d.codDepos)}" ${d.codDepos === depEntPadrao ? 'selected' : ''}>${escapeHtml(d.codDepos)} - ${escapeHtml(d.nome || d.codDepos)}</option>`).join('')}
            </select>
          </div>

          <!-- Localização de Entrada -->
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label" for="transf-ent-localiz">Localização Entrada</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" id="transf-ent-localiz" class="form-input" placeholder="ex: BRANCO" value="${escapeHtml(locEntPadrao)}" ${isLocUnica ? 'readonly style="background:#f1f5f9; color:#334155;"' : ''}>
              <button type="button" id="transf-ent-btn-lupa-loc" class="btn btn-secondary" style="width: auto; padding: 0 8px;" onclick="App.abrirPesquisaLocalizInterna('transf_entrada')" title="Buscar Localização" ${isLocUnica ? 'disabled' : ''}>🔍</button>
            </div>
            ${isLocUnica ? `<div id="transf-ent-loc-tip" style="font-size: 10.5px; color: #475569; margin-top: 3px; font-weight: 600;">🔒 Localização única do item (${escapeHtml(locEntPadrao || 'Padrão')}).</div>` : ''}
          </div>

          <!-- Bloco Lote Entrada e Data de Validade com Regra Crítica -->
          <div id="transf-ent-bloco-lote" style="background: ${ehLote ? '#f8fafc' : '#f1f5f9'}; border: 1px solid ${ehLote ? '#cbd5e1' : '#e2e8f0'}; border-radius: 8px; padding: 10px; margin-bottom: 10px; opacity: ${ehLote ? '1' : '0.6'};">
            <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 8px;">
              <div class="form-group" style="margin: 0;">
                <label class="form-label" for="transf-ent-lote">Lote Entrada ${ehLote ? '<span style="color:#dc2626;">*</span>' : ''}</label>
                <div style="display: flex; gap: 4px;">
                  <input type="text" id="transf-ent-lote" class="form-input" placeholder="Lote destino..." value="${escapeHtml(loteEntPadrao)}" oninput="App.onLoteEntradaAlterado(this.value)" ${!ehLote ? 'disabled' : ''}>
                  <button type="button" id="transf-ent-btn-lupa-lote" class="btn btn-secondary" style="width: auto; padding: 0 8px;" onclick="App.abrirPesquisaLoteInterna('transf_entrada', '${escapeHtml(transf.itCodigo)}')" title="Buscar Lotes Existentes" ${!ehLote ? 'disabled' : ''}>🔍</button>
                </div>
              </div>

              <div class="form-group" style="margin: 0;">
                <label class="form-label" for="transf-ent-dt-valid">Validade Entrada <span id="transf-ent-dt-valid-req" style="display:none; color:#dc2626;">*</span></label>
                <input type="date" id="transf-ent-dt-valid" class="form-input" value="${formatarParaInputDate(dtValiEntPadrao)}" ${!ehLote ? 'disabled' : ''}>
              </div>
            </div>

            <!-- Tip Informativo Dinâmico do Lote de Entrada -->
            <div id="transf-ent-lote-tip" class="field-tip tip-info" style="margin-top: 6px;">
              ${ehLote ? 'Digite o lote para verificar se já existe no estoque ou se é um lote novo.' : `Item sem controle de lote (tipoConEst: ${tipoConEst}).`}
            </div>
          </div>

          <!-- Referência de Entrada -->
          <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label" for="transf-ent-refer">Referência Entrada</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" id="transf-ent-refer" class="form-input" placeholder="Referência..." value="${escapeHtml(refEntPadrao)}" ${!ehRefer ? 'disabled' : ''}>
              <button type="button" id="transf-ent-btn-lupa-refer" class="btn btn-secondary" style="width: auto; padding: 0 8px;" onclick="App.abrirPesquisaReferenciaInterna('transf_entrada')" title="Buscar Referência" ${!ehRefer ? 'disabled' : ''}>🔍</button>
            </div>
            ${!ehRefer ? '<div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Item sem controle de referência.</div>' : ''}
          </div>

          <!-- Botões de Finalização -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button type="button" class="btn btn-primary" onclick="App.salvarEntradaTransferencia(true)" style="background: #0284c7; font-weight: 700; padding: 10px;">
              ⚡ Confirmar Entrada & Transmitir ao Totvs
            </button>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-secondary" onclick="App.salvarEntradaTransferencia(false)">
                💾 Salvar Offline (Enviar Depois)
              </button>
              <button type="button" class="btn btn-secondary" onclick="App.navegar('transferencias')" style="width: auto; padding: 0 14px;">
                Voltar
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    if (ehLote && loteEntPadrao) {
      await onLoteEntradaAlterado(loteEntPadrao);
    }
  }

  async function onLoteEntradaAlterado(lote) {
    const l = (lote || '').trim();
    const transf = stateTransferencias.transferenciaAtiva;
    const inpDt = document.getElementById('transf-ent-dt-valid');
    const tip = document.getElementById('transf-ent-lote-tip');
    const reqBadge = document.getElementById('transf-ent-dt-valid-req');
    if (!inpDt || !tip) return;

    if (!l) {
      inpDt.readOnly = false;
      inpDt.required = false;
      if (reqBadge) reqBadge.style.display = 'none';
      tip.className = 'field-tip tip-info';
      tip.innerHTML = 'Sem lote informado.';
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    const itCodigo = transf ? transf.itCodigo : '';
    const info = await DB.obterDataValidadeLote(codEmpresa, itCodigo, l);

    if (info && info.existe) {
      // Lote JÁ EXISTE no Totvs/Estoque
      if (info.dtValiLote) {
        inpDt.value = formatarParaInputDate(info.dtValiLote);
      }
      inpDt.readOnly = false;
      inpDt.required = false;
      if (reqBadge) reqBadge.style.display = 'none';
      tip.className = 'field-tip tip-success';
      tip.innerHTML = `✓ Lote <strong>${escapeHtml(l)}</strong> já cadastrado no Totvs/Estoque. ${info.dtValiLote ? 'Validade carregada automaticamente.' : 'Validade opcional.'}`;
    } else {
      // LOTE NOVO! REGRA CRÍTICA: OBRIGAR INFORMAR A DATA DE VALIDADE
      inpDt.readOnly = false;
      inpDt.required = true;
      if (reqBadge) reqBadge.style.display = 'inline';
      tip.className = 'field-tip tip-warning';
      tip.innerHTML = `⚠️ <strong>Lote novo!</strong> Este lote não consta no estoque. <strong>É obrigatório informar a data de validade.</strong>`;
    }
  }

  async function salvarEntradaTransferencia(transmitirTotvs = true) {
    const transf = stateTransferencias.transferenciaAtiva;
    if (!transf) {
      alert('Nenhuma transferência ativa.');
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    const matchItem = await DB.obterItemExato(transf.itCodigo, codEmpresa);
    const item = matchItem?.item || matchItem || null;
    const tipoConEst = item ? Number(item.tipoConEst || item.tipoContrEstoque || 1) : 1;
    const ehLote = (tipoConEst === 3);
    const ehRefer = (tipoConEst === 4);

    const codDeposEnt = document.getElementById('transf-ent-depos')?.value.trim() || '';
    const codLocalizEnt = document.getElementById('transf-ent-localiz')?.value.trim() || '';
    let loteEnt = document.getElementById('transf-ent-lote')?.value.trim() || '';
    let dtValiEnt = document.getElementById('transf-ent-dt-valid')?.value.trim() || '';
    let codReferEnt = document.getElementById('transf-ent-refer')?.value.trim() || '';

    if (!codDeposEnt) {
      alert('Informe o depósito de entrada.');
      document.getElementById('transf-ent-depos')?.focus();
      return;
    }

    if (ehLote) {
      if (!loteEnt) {
        alert('Este item possui controle de lote. Informe o Lote de Entrada.');
        document.getElementById('transf-ent-lote')?.focus();
        return;
      }
      const infoLote = await DB.obterDataValidadeLote(codEmpresa, transf.itCodigo, loteEnt);
      if ((!infoLote || !infoLote.existe) && !dtValiEnt) {
        alert('⚠️ Para lote novo, é obrigatório informar a data de validade!');
        document.getElementById('transf-ent-dt-valid')?.focus();
        return;
      }
    } else {
      loteEnt = '';
      dtValiEnt = '';
    }

    if (!ehRefer) {
      codReferEnt = '';
    }

    // Atualiza o objeto da transferência
    transf.codDeposEnt = codDeposEnt;
    transf.codLocalizEnt = codLocalizEnt;
    transf.loteEnt = loteEnt;
    transf.dtValiLoteEnt = dtValiEnt;
    transf.codReferEnt = codReferEnt;
    transf.status = 'PRONTO_ENVIO';
    transf.pendenteSync = true;
    transf.atualizadoEm = new Date().toISOString();

    await DB.salvarTransferencia(transf);

    if (transmitirTotvs) {
      await transmitirTransferencia(transf.id_uuid);
    } else {
      alert('Entrada salva localmente com sucesso! Registro pronto para transmissão ao Totvs.');
      App.navegar('transferencias', { filtro: 'pronto_envio' });
    }
  }

  async function transmitirTransferencia(id_uuid) {
    const transf = await DB.obterTransferencia(id_uuid);
    if (!transf) {
      alert('Movimento não encontrado no aparelho.');
      return;
    }

    if (!transf.codDeposEnt) {
      alert('É necessário preencher os dados de entrada antes de transmitir ao Totvs.');
      renderTelaTransferenciaEntrada(transf);
      return;
    }

    if (!isOnline()) {
      alert('Dispositivo sem conexão com o TOTVS no momento. O movimento continuará salvo como "Pronto p/ Totvs" e será sincronizado quando houver rede.');
      App.navegar('transferencias', { filtro: 'pronto_envio' });
      return;
    }

    mostrarLoading('Transmitindo ao TOTVS Datasul...', 'Executando fcSetTransfMaterial.p / ceapi001k...');

    try {
      const codEmpresaReq = transf.codEmpresa || state.session.codEmpresa || '001';
      const payloadItem = {
        codEmpresa: codEmpresaReq,
        itCodigo: (transf.itCodigo || '').trim(),
        codEstabel: transf.codEstabel || state.session.codEstabel || '101',
        codUsuario: state.session.codUsuario || transf.codUsuario,
        dtTransf: transf.dtTransf || new Date().toISOString().slice(0, 10),
        nroDocto: transf.nroDocto || '',
        serie: transf.serie || '',
        quantidade: Number(transf.quantidade),
        codDeposSai: transf.codDeposSai,
        codLocalizSai: transf.codLocalizSai || '',
        loteSai: transf.loteSai || '',
        dtValiLote: transf.dtValiLote || '',
        codReferSai: transf.codReferSai || '',
        codDeposEnt: transf.codDeposEnt,
        codLocalizEnt: transf.codLocalizEnt || '',
        loteEnt: transf.loteEnt || '',
        dtValiLoteEnt: transf.dtValiLoteEnt || '',
        codReferEnt: transf.codReferEnt || ''
      };

      const res = await pasoeFetch('/fcSetTransfMaterial', {
        method: 'PUT',
        body: JSON.stringify({ payload: [payloadItem] })
      });

      ocultarLoading();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const dados = await res.json();

      if (dados.type === 'OK') {
        transf.status = 'EFETIVADO';
        transf.pendenteSync = false;
        transf.mensagemRetorno = dados.message || 'Transferência efetuada com sucesso no Datasul!';
        transf.detalheErro = '';
        transf.efetivadoEm = new Date().toISOString();
        transf.atualizadoEm = new Date().toISOString();
        await DB.salvarTransferencia(transf);

        alert(`✓ Sucesso!\n\n${transf.mensagemRetorno}`);
        App.navegar('transferencias', { filtro: 'efetivado' });
      } else {
        // Erro retornado pela ceapi001k no Progress
        const msgErro = dados.detailedMessage || dados.message || 'Erro não especificado pelo Datasul.';
        transf.status = 'ERRO';
        transf.pendenteSync = true;
        transf.mensagemRetorno = dados.message || 'Erro retornado pelo Datasul';
        transf.detalheErro = msgErro;
        transf.atualizadoEm = new Date().toISOString();
        await DB.salvarTransferencia(transf);

        alert(`❌ Erro no Datasul (ceapi001k):\n\n${msgErro}\n\nVocê pode editar os dados da saída ou da entrada para tentar novamente.`);
        App.navegar('transferencias', { filtro: 'pronto_envio' });
      }
    } catch (e) {
      ocultarLoading();
      transf.status = 'ERRO';
      transf.pendenteSync = true;
      transf.mensagemRetorno = 'Falha de comunicação';
      transf.detalheErro = e.message || 'Falha ao conectar com o serviço PASOE/TOTVS.';
      transf.atualizadoEm = new Date().toISOString();
      await DB.salvarTransferencia(transf);

      alert(`⚠️ Falha de Comunicação:\n${transf.detalheErro}\n\nO movimento continuará salvo para envio posterior.`);
      App.navegar('transferencias', { filtro: 'pronto_envio' });
    }
  }

  async function excluirTransferencia(id_uuid) {
    const transf = await DB.obterTransferencia(id_uuid);
    if (!transf) {
      alert('Movimento não encontrado.');
      return;
    }

    // Regra explícita: movimentos efetivados no Totvs não podem ser excluídos
    if (transf.status === 'EFETIVADO') {
      alert('Não é permitido excluir uma transferência já efetivada no Totvs Datasul.');
      return;
    }

    const conf = confirm(`Deseja realmente excluir a transferência do item ${transf.itCodigo} (${transf.quantidade} ${transf.un || 'UN'})?`);
    if (!conf) return;

    const res = await DB.excluirTransferencia(id_uuid);
    if (res.success) {
      alert('Movimento excluído com sucesso.');
      await carregarListaTransferencias();
    } else {
      alert(res.mensagem || 'Erro ao excluir.');
    }
  }

  async function consultarTransferencia(id_uuid) {
    const transf = await DB.obterTransferencia(id_uuid);
    if (!transf) {
      alert('Transferência não encontrada.');
      return;
    }

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('transferencias')">‹ Voltar</button>
        <h3 style="font-size: 15px; font-weight: 800; margin: 0; color: #0f172a;">Consulta de Transferência</h3>
        <span style="width: 48px;"></span>
      </div>

      <div class="card" style="margin-bottom: 12px; border-left: 4px solid #10b981;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700;">✓ Efetivado Totvs</span>
          <span style="font-size: 11px; color: #64748b;">${formatarDataBr(transf.dtTransf)}</span>
        </div>

        <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 2px;">
          ${escapeHtml(transf.itCodigo)} - ${escapeHtml(transf.descItem || '')}
        </div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
          Quantidade: <strong style="color: #0284c7; font-size: 14px;">${transf.quantidade}</strong> ${escapeHtml(transf.un || 'UN')}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <!-- Saída -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; font-size: 11.5px;">
            <div style="color: #991b1b; font-weight: 800; margin-bottom: 4px;">🔴 Saída (Origem)</div>
            <div>Depósito: <strong>${escapeHtml(transf.codDeposSai)}</strong></div>
            <div>Localiz: <strong>${escapeHtml(transf.codLocalizSai || '-')}</strong></div>
            <div>Lote: <strong>${escapeHtml(transf.loteSai || '-')}</strong></div>
            <div>Validade: <strong>${transf.dtValiLote ? formatarDataBr(transf.dtValiLote) : '-'}</strong></div>
            <div>Ref: <strong>${escapeHtml(transf.codReferSai || '-')}</strong></div>
          </div>

          <!-- Entrada -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; font-size: 11.5px;">
            <div style="color: #166534; font-weight: 800; margin-bottom: 4px;">🟢 Entrada (Destino)</div>
            <div>Depósito: <strong>${escapeHtml(transf.codDeposEnt)}</strong></div>
            <div>Localiz: <strong>${escapeHtml(transf.codLocalizEnt || '-')}</strong></div>
            <div>Lote: <strong>${escapeHtml(transf.loteEnt || '-')}</strong></div>
            <div>Validade: <strong>${transf.dtValiLoteEnt ? formatarDataBr(transf.dtValiLoteEnt) : '-'}</strong></div>
            <div>Ref: <strong>${escapeHtml(transf.codReferEnt || '-')}</strong></div>
          </div>
        </div>

        <div style="background: #f1f5f9; border-radius: 6px; padding: 8px; font-size: 11px; color: #475569; margin-bottom: 12px;">
          <div>Usuário: <strong>${escapeHtml(transf.codUsuario)}</strong> • Filial: <strong>${escapeHtml(transf.codEstabel)}</strong></div>
          ${transf.nroDocto ? `<div>Docto/Série: <strong>${escapeHtml(transf.nroDocto)} / ${escapeHtml(transf.serie || '')}</strong></div>` : ''}
          ${transf.efetivadoEm ? `<div>Efetivado em: <strong>${new Date(transf.efetivadoEm).toLocaleString('pt-BR')}</strong></div>` : ''}
          ${transf.mensagemRetorno ? `<div style="color:#15803d; margin-top:3px;">Retorno ERP: <em>${escapeHtml(transf.mensagemRetorno)}</em></div>` : ''}
        </div>

        <button class="btn btn-secondary" onclick="App.navegar('transferencias')" style="width: 100%;">
          Voltar para Lista
        </button>
      </div>
    `;
  }

  // =========================================================================
  // HISTÓRICO DE CONTAGENS & FILA DE SINCRONIZAÇÃO OFFLINE
  // =========================================================================
  async function renderTelaHistoricoContagens() {
    const codEmpresa = state.session.codEmpresa || '001';
    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <button class="btn-topbar-action" onclick="App.navegar('menu')">‹ Menu</button>
        <h3 style="font-size: 14.5px; font-weight: 800;">Histórico (Emp ${escapeHtml(codEmpresa)})</h3>
        <button class="btn-topbar-action" onclick="App.renderTelaHistoricoContagens()">🔄</button>
      </div>
      <input type="text" id="filtro-hist-busca" class="form-input" placeholder="Filtrar por item, ficha ou usuário..." oninput="App.filtrarHistoricoLocal(this.value)">
      <div id="lista-historico-scroll" style="display: flex; flex-direction: column; gap: 8px;"></div>
    `;

    state.historicoContagens = await DB.getHistoricoLocal(codEmpresa);
    filtrarHistoricoLocal('');
  }

  function filtrarHistoricoLocal(termo = '') {
    const div = document.getElementById('lista-historico-scroll');
    if (!div) return;
    const t = (termo || '').toLowerCase();
    const lista = state.historicoContagens.filter(h =>
      !t ||
      String(h.itCodigo || '').toLowerCase().includes(t) ||
      String(h.descItem || '').toLowerCase().includes(t) ||
      String(h.nrFicha || '').includes(t) ||
      String(h.codUsuario || '').toLowerCase().includes(t)
    );

    if (lista.length === 0) {
      div.innerHTML = '<div class="card-modern" style="text-align:center; color:#94a3b8;">Nenhum registro local de contagem.</div>';
      return;
    }

    div.innerHTML = lista.map(h => `
      <div class="card-modern" style="padding:10px 12px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800; color:#0284c7;">
          <span>Ficha #${h.nrFicha} (${h.nrContagem}ª Cont.)</span>
          <span class="badge ${String(h.statusEnvio).includes('Pendente') ? 'badge-warning' : 'badge-success'}">${escapeHtml(h.statusEnvio)}</span>
        </div>
        <div style="font-size:12.5px; font-weight:700; margin-top:2px;">${escapeHtml(h.itCodigo)} - ${escapeHtml(h.descItem || '')}</div>
        <div style="font-size:11px; color:#64748b; margin-top:4px; display:flex; justify-content:space-between;">
          <span>Apurado: <strong style="color:#0f172a;">${Number(h.qtApurada).toFixed(2)}</strong></span>
          <span>Usuário: <strong>${escapeHtml(h.codUsuario)}</strong> • ${escapeHtml(h.dtLeitura)}</span>
        </div>
      </div>
    `).join('');
  }

  async function renderTelaSincronizacao() {
    const codEmpresa = state.session.codEmpresa || '001';
    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <button class="btn-topbar-action" onclick="App.navegar('menu')">‹ Menu</button>
        <h3 style="font-size: 14.5px; font-weight: 800;">Fila Offline (Emp ${escapeHtml(codEmpresa)})</h3>
        <button class="btn-topbar-action" onclick="App.renderTelaSincronizacao()">🔄</button>
      </div>
      <p style="font-size: 11.5px; color: #64748b;">
        Apurações e fichas avulsas gravadas offline aguardando envio ao TOTVS Datasul:
      </p>
      <div id="lista-sync-pendencias" style="display: flex; flex-direction: column; gap: 8px; flex: 1;"></div>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
        <button class="btn btn-primary" id="btn-integrar-totvs" onclick="App.integrarFilaOffline()">🚀 TRANSMITIR PENDÊNCIAS AO TOTVS</button>
        <button class="btn btn-secondary" onclick="App.abrirModalCargaInicial('Atualização Completa Offline')">📥 ATUALIZAR BASE OFFLINE (CHUNKS)</button>
      </div>
    `;

    const fila = await DB.getFilaSyncEmpresa(codEmpresa);
    const listDiv = document.getElementById('lista-sync-pendencias');
    if (!listDiv) return;

    if (fila.length === 0) {
      listDiv.innerHTML = `
        <div class="card-modern" style="text-align:center; padding:28px; color:#059669;">
          <div style="font-size:28px; margin-bottom:6px;">✓</div>
          <strong>Tudo sincronizado na Empresa ${escapeHtml(codEmpresa)}!</strong>
        </div>
      `;
      return;
    }

    listDiv.innerHTML = fila.map(op => `
      <div class="card-modern" style="padding:10px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:12px; color:#0284c7;">${escapeHtml(op.tipo)}</strong>
          <span class="badge badge-warning">${escapeHtml(op.status)}</span>
        </div>
        <div style="font-size:11.5px; margin-top:3px;">
          Item: <strong>${escapeHtml(op.payload?.itCodigo)}</strong> • Dep: <strong>${escapeHtml(op.payload?.codDepos)}</strong> • Qtd: <strong>${op.payload?.qtApurada ?? '-'}</strong>
        </div>
        ${op.ultimoErro ? `<div style="font-size:10.5px; color:#dc2626; margin-top:3px;">Erro: ${escapeHtml(op.ultimoErro)}</div>` : ''}
      </div>
    `).join('');
  }

  // Variável de controle dos conflitos em exibição
  let conflitosSyncPendentes = [];

  function abrirModalAlertaAlteracoesTotvs(alertas) {
    const modal = document.getElementById('modal-conflitos-sync');
    const badge = document.getElementById('conflitos-qtd-badge');
    const scroll = document.getElementById('conflitos-lista-scroll');
    if (!modal || !scroll) return;

    if (badge) badge.textContent = `${alertas.length} alterada(s) no TOTVS`;

    scroll.innerHTML = `
      <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px; margin-bottom:10px; font-size:11.5px; color:#92400e;">
        <strong>Fichas atualizadas no TOTVS enquanto você estava offline:</strong><br>
        O TOTVS já possui dados gravados para estas fichas. O aplicativo manteve as suas contagens locais salvas. Ao descarregar a fila offline, você poderá optar por manter o seu valor ou o do TOTVS.
      </div>
      ${alertas.map(a => `
        <div class="card-modern" style="padding:10px; border-left:4px solid #f59e0b; background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <strong style="font-size:12.5px; color:#0f172a;">Ficha #${a.nrFicha} - ${escapeHtml(a.itCodigo)}</strong>
              <div style="font-size:11px; color:#475569;">${escapeHtml(a.descItem)}</div>
            </div>
            <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px; font-weight:800;">${a.nrContagem}ª Contagem</span>
          </div>
          <div style="font-size:11px; color:#64748b; margin-top:4px;">
            Dep: <strong>${escapeHtml(a.codDepos)}</strong> ${a.codLocaliz ? `• Loc: <strong>${escapeHtml(a.codLocaliz)}</strong>` : ''} ${a.lote ? `• Lote: <strong>${escapeHtml(a.lote)}</strong>` : ''}
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px dashed #e2e8f0; font-size:11.5px;">
            <span style="color:#0284c7; font-weight:800;">📱 No seu App: ${a.qtdApp}</span>
            <span style="color:#16a34a; font-weight:800;">🖥️ No TOTVS: ${a.qtdTotvs}</span>
          </div>
        </div>
      `).join('')}
    `;

    // Ajusta o rodapé do modal para modo informativo
    const footer = modal.querySelector('.modal-box > div:last-child');
    if (footer) {
      footer.innerHTML = `
        <div style="font-size:11px; color:#64748b;">Suas contagens locais continuam salvas no coletor.</div>
        <button class="btn btn-primary" style="width:auto; padding:7px 16px; font-size:12px;" onclick="App.fecharModalConflitos()">Entendido</button>
      `;
    }

    modal.style.display = 'flex';
  }

  function abrirModalConflitos(conflitos) {
    conflitosSyncPendentes = conflitos;
    const modal = document.getElementById('modal-conflitos-sync');
    const badge = document.getElementById('conflitos-qtd-badge');
    if (!modal) return;

    if (badge) badge.textContent = `${conflitos.length} divergência(s)`;

    // Restaura botões operacionais de escolha
    const footer = modal.querySelector('.modal-box > div:last-child');
    if (footer) {
      footer.innerHTML = `
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary" style="width: auto; font-size: 11px; padding: 6px 10px;" onclick="App.resolverTodosConflitos('COLETOR')">📱 Todos Coletor</button>
          <button class="btn btn-secondary" style="width: auto; font-size: 11px; padding: 6px 10px;" onclick="App.resolverTodosConflitos('TOTVS')">🖥️ Todos Totvs</button>
        </div>
        <button class="btn btn-primary" style="width: auto; padding: 8px 16px; font-size: 12px;" onclick="App.confirmarResolucaoConflitos()">✓ Confirmar</button>
      `;
    }

    renderizarCardsConflitos();
    modal.style.display = 'flex';
  }

  function renderizarCardsConflitos() {
    const scroll = document.getElementById('conflitos-lista-scroll');
    if (!scroll) return;

    scroll.innerHTML = conflitosSyncPendentes.map((c, idx) => `
      <div class="card-modern" style="padding: 10px; border-left: 4px solid #f59e0b; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
          <div>
            <strong style="font-size: 13px; color: #0f172a;">Ficha #${c.nrFicha} - ${escapeHtml(c.itCodigo)}</strong>
            <div style="font-size: 11px; color: #475569;">${escapeHtml(c.descItem)}</div>
          </div>
          <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px; font-weight:800;">${c.nrContagem}ª Contagem</span>
        </div>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
          Dep: <strong>${escapeHtml(c.codDepos)}</strong> ${c.codLocaliz ? `• Loc: <strong>${escapeHtml(c.codLocaliz)}</strong>` : ''} ${c.lote ? `• Lote: <strong>${escapeHtml(c.lote)}</strong>` : ''}
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <label style="display: flex; align-items: center; gap: 6px; padding: 8px; border: 1.5px solid ${c.decisao === 'COLETOR' ? '#0284c7' : '#cbd5e1'}; background: ${c.decisao === 'COLETOR' ? '#f0f9ff' : '#f8fafc'}; border-radius: 6px; cursor: pointer; font-size: 11.5px;">
            <input type="radio" name="conflito_${idx}" value="COLETOR" ${c.decisao === 'COLETOR' ? 'checked' : ''} onchange="App.selecionarOpcaoConflito(${idx}, 'COLETOR')">
            <div>
              <div style="font-weight: 800; color: #0284c7;">📱 Manter App</div>
              <div style="font-size: 12px; font-weight: 800; color: #0f172a;">${Number(c.qtdApp).toFixed(2)} ${escapeHtml(c.un)}</div>
            </div>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; padding: 8px; border: 1.5px solid ${c.decisao === 'TOTVS' ? '#16a34a' : '#cbd5e1'}; background: ${c.decisao === 'TOTVS' ? '#f0fdf4' : '#f8fafc'}; border-radius: 6px; cursor: pointer; font-size: 11.5px;">
            <input type="radio" name="conflito_${idx}" value="TOTVS" ${c.decisao === 'TOTVS' ? 'checked' : ''} onchange="App.selecionarOpcaoConflito(${idx}, 'TOTVS')">
            <div>
              <div style="font-weight: 800; color: #16a34a;">🖥️ Manter TOTVS</div>
              <div style="font-size: 12px; font-weight: 800; color: #0f172a;">${Number(c.qtdTotvs).toFixed(2)} ${escapeHtml(c.un)}</div>
            </div>
          </label>
        </div>
      </div>
    `).join('');
  }

  function selecionarOpcaoConflito(idx, tipo) {
    if (conflitosSyncPendentes[idx]) {
      conflitosSyncPendentes[idx].decisao = tipo;
      renderizarCardsConflitos();
    }
  }

  function resolverTodosConflitos(tipo) {
    conflitosSyncPendentes.forEach(c => { c.decisao = tipo; });
    renderizarCardsConflitos();
  }

  function fecharModalConflitos() {
    const modal = document.getElementById('modal-conflitos-sync');
    if (modal) modal.style.display = 'none';
  }

  async function confirmarResolucaoConflitos() {
    const codEmpresa = state.session.codEmpresa || '001';
    mostrarLoading('Gravando Resoluções', 'Aplicando decisões de apuração...');

    try {
      const fichasEmp = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);

      for (const c of conflitosSyncPendentes) {
        if (c.decisao === 'TOTVS') {
          // Descarta o envio do app para não sobrescrever o TOTVS
          await DB.remove('fila_sync', c.id_uuid);

          // Atualiza o registro local com a contagem do TOTVS
          const fLocal = fichasEmp.find(f =>
            normalizarDataIso(f.dtSaldo) === normalizarDataIso(c.payload.dtSaldo) &&
            String(f.codEstabel || '').trim() === String(c.payload.codEstabel || '').trim() &&
            Number(f.nrContagem || 1) === Number(c.nrContagem) &&
            Number(f.nrFicha) === Number(c.nrFicha)
          );
          if (fLocal) {
            fLocal.qtApurada = c.qtdTotvs;
            fLocal[`valApurado${c.nrContagem}`] = c.qtdTotvs;
            fLocal.pendenteSync = false;
            fLocal.alteradaNoTotvs = false;
            await DB.put('fichas_inventario', fLocal, codEmpresa);
          }

          // Histórico de decisão
          await DB.gravarHistoricoContagem({
            codEmpresa,
            dtSaldo: c.payload.dtSaldo,
            codEstabel: c.payload.codEstabel,
            codDepos: c.payload.codDepos,
            nrFicha: c.nrFicha,
            itCodigo: c.itCodigo,
            descItem: c.descItem,
            lote: c.lote,
            codLocaliz: c.codLocaliz,
            codRefer: c.codRefer,
            nrContagem: c.nrContagem,
            qtApurada: c.qtdTotvs,
            qtContabil: 0,
            divergencia: 0,
            codUsuario: state.session.codUsuario,
            codMobile: state.session.codMobile,
            statusEnvio: 'Mantida contagem do TOTVS (Descartado Coletor)'
          }, codEmpresa);
        } else {
          // Manteve Coletor (App):
          // Marca flag para permitir a transmissão ao TOTVS
          const itemFila = await DB.get('fila_sync', c.id_uuid);
          if (itemFila) {
            itemFila.conflitoResolvido = true;
            await DB.put('fila_sync', itemFila, codEmpresa);
          }
        }
      }

      fecharModalConflitos();
      mostrarAviso('Decisões registradas! Transmitindo pendências ao TOTVS...', 'info');

      // Executa a transmissão das pendências mantidas
      await integrarFilaOffline();
    } catch (e) {
      alert('Erro ao confirmar conflitos: ' + e.message);
    } finally {
      ocultarLoading();
    }
  }

  async function integrarFilaOffline() {
    if (!isOnline()) {
      alert('Dispositivo offline. Conecte-se para transmitir ao PASOE.');
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    const fila = await DB.getFilaSyncEmpresa(codEmpresa);
    const pendentes = fila.filter(r => r.status === 'Pendente');

    if (pendentes.length === 0) {
      alert(`Não há pendências offline para transmitir na Empresa ${codEmpresa}.`);
      renderTelaSincronizacao();
      atualizarBadgePendencias();
      return;
    }

    // 1. VERIFICAÇÃO DE CONFLITOS DE APURAÇÃO COM O TOTVS
    const pendentesApuracao = pendentes.filter(p => p.tipo === 'INVENTARIO_APURACAO' && !p.conflitoResolvido);

    if (pendentesApuracao.length > 0) {
      mostrarLoading('Validando com TOTVS', 'Verificando se já existem contagens digitadas no TOTVS...');
      let conflitosEncontrados = [];
      try {
        const fichasLocais = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
        const datasPendentes = [...new Set(pendentesApuracao.map(p => p.payload.dtSaldo))];
        const fichasTotvsMap = new Map();

        // Consulta estado fresco do TOTVS para as datas envolvidas
        for (const dt of datasPendentes) {
          for (const nrCont of [1, 2, 3]) {
            try {
              const resF = await pasoeFetch('/fcGetInventariosFichas', {
                method: 'PUT',
                companyId: codEmpresa,
                body: JSON.stringify({
                  codEmpresa,
                  epCodigo: codEmpresa,
                  codEstabel: state.session.codEstabel || '',
                  dtSaldo: dt,
                  itCodigo: '',
                  codDepos: '',
                  codLocaliz: '',
                  lote: '',
                  codRefer: '',
                  nrContagem: nrCont,
                  codUsuario: '',
                  apenasPendentes: false
                })
              });
              if (resF.ok) {
                const dF = await resF.json();
                const list = extrairLista(dF, 'fichas');
                for (const item of list) {
                  const contItem = Number(item.nrContagem || nrCont || 1);
                  const chaveC = normalizarChaveFicha(item.dtSaldo, item.codEstabel, item.codDepos, contItem, item.nrFicha);
                  const chaveS = normalizarChaveFichaSemDep(item.dtSaldo, item.codEstabel, contItem, item.nrFicha);
                  fichasTotvsMap.set(chaveC, item);
                  fichasTotvsMap.set(chaveS, item);
                }
              }
            } catch (errTotvs) {
              console.warn('Erro ao consultar fcGetInventariosFichas na checagem de conflitos:', errTotvs);
            }
          }
        }

        for (const p of pendentesApuracao) {
          const contPend = Number(p.payload.nrContagem || 1);
          const nrFichaNum = Number(p.payload.nrFicha || 0);
          const chave = normalizarChaveFicha(p.payload.dtSaldo, p.payload.codEstabel, p.payload.codDepos, contPend, nrFichaNum);
          const chaveSemDep = normalizarChaveFichaSemDep(p.payload.dtSaldo, p.payload.codEstabel, contPend, nrFichaNum);

          const fTotvs = fichasTotvsMap.get(chave) || fichasTotvsMap.get(chaveSemDep);
          const fLocal = fichasLocais.find(f =>
            normalizarDataIso(f.dtSaldo) === normalizarDataIso(p.payload.dtSaldo) &&
            String(f.codEstabel || '').trim() === String(p.payload.codEstabel || '').trim() &&
            Number(f.nrContagem || 1) === contPend &&
            Number(f.nrFicha) === nrFichaNum
          );

          let qtdTotvs = null;
          if (fTotvs) {
            const valRodada = contPend === 1 ? fTotvs.valApurado1 : (contPend === 2 ? fTotvs.valApurado2 : fTotvs.valApurado3);
            if (valRodada !== null && valRodada !== undefined && valRodada !== '') {
              qtdTotvs = Number(valRodada);
            } else if (fTotvs.qtApurada !== null && fTotvs.qtApurada !== undefined && fTotvs.qtApurada !== '') {
              qtdTotvs = Number(fTotvs.qtApurada);
            }
          }
          if (qtdTotvs === null && fLocal) {
            const valRodadaLocal = contPend === 1 ? fLocal.valApurado1 : (contPend === 2 ? fLocal.valApurado2 : fLocal.valApurado3);
            if (valRodadaLocal !== null && valRodadaLocal !== undefined && valRodadaLocal !== '') {
              qtdTotvs = Number(valRodadaLocal);
            } else if (fLocal.qtdTotvs !== null && fLocal.qtdTotvs !== undefined && fLocal.qtdTotvs !== '') {
              qtdTotvs = Number(fLocal.qtdTotvs);
            }
          }

          // Se no TOTVS já existe contagem digitada e diverge da contagem do app
          if (qtdTotvs !== null && qtdTotvs !== Number(p.payload.qtApurada)) {
            conflitosEncontrados.push({
              id_uuid: p.id_uuid,
              payload: p.payload,
              nrFicha: nrFichaNum,
              itCodigo: p.payload.itCodigo,
              descItem: fLocal?.descItem || fTotvs?.descItem || p.payload.itCodigo,
              codDepos: p.payload.codDepos || fTotvs?.codDepos || fLocal?.codDepos,
              codLocaliz: p.payload.codLocaliz || fLocal?.codLocaliz || fTotvs?.codLocaliz || '',
              lote: p.payload.lote || fLocal?.lote || fTotvs?.lote || '',
              codRefer: p.payload.codRefer || '',
              nrContagem: contPend,
              qtdApp: Number(p.payload.qtApurada),
              qtdTotvs: qtdTotvs,
              un: fLocal?.un || fTotvs?.un || 'UN',
              decisao: 'COLETOR' // Padrão
            });
          }
        }
      } catch (errCheck) {
        console.warn('Erro ao checar conflitos:', errCheck);
      } finally {
        ocultarLoading();
      }

      if (conflitosEncontrados.length > 0) {
        abrirModalConflitos(conflitosEncontrados);
        return; // Interrompe para aguardar a escolha do operador
      }
    }

    // 2. TRANSMISSÃO AO TOTVS DAS PENDÊNCIAS
    mostrarLoading('Sincronizando Fila Offline', `Enviando pendências da Empresa ${codEmpresa}...`);
    try {
      const res = await DB.integrarFilaOffline({
        pasoeUrl: state.session.pasoeUrl || '/api/datasul',
        codEmpresa,
        authHeader: state.session.authHeader
      });

      if (res.processados > 0) {
        const fichas = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
        for (const f of fichas) {
          if (f.pendenteSync) {
            f.pendenteSync = false;
            await DB.put('fichas_inventario', f, codEmpresa);
          }
        }
      }

      alert(`Sincronização finalizada!\nProcessados com sucesso: ${res.processados || 0}\nErros: ${res.erros || 0}`);
      renderTelaSincronizacao();
      atualizarBadgePendencias();
    } catch (e) {
      alert('Erro ao transmitir fila offline: ' + e.message);
    } finally {
      ocultarLoading();
    }
  }

  // =========================================================================
  // SCANNER (LASER HARDWARE + CÂMERA)
  // =========================================================================
  let contextoScanner = 'FICHA_ITEM';

  function abrirScannerCamera(ctx = 'FICHA_ITEM') {
    contextoScanner = ctx;
    const modal = document.getElementById('modal-scanner');
    const video = document.getElementById('scanner-video');
    if (!modal || !video) return;
    modal.style.display = 'flex';
    Scanner.abrirCamera(video, (cod) => {
      fecharScannerCamera();
      processarLeituraGeral(cod, 'CAMERA');
    });
  }

  function fecharScannerCamera() {
    const modal = document.getElementById('modal-scanner');
    if (modal) modal.style.display = 'none';
    Scanner.pararCamera();
  }

  function processarLeituraManual() {
    const inp = document.getElementById('input-manual-barcode');
    if (!inp || !inp.value.trim()) return;
    const cod = inp.value.trim();
    inp.value = '';
    fecharScannerCamera();
    processarLeituraGeral(cod, 'MANUAL');
  }

  function processarLeituraHardware(codigo, origem) {
    if (state.telaAtual === 'inventario_fichas') {
      contextoScanner = 'FICHA_ITEM';
      processarLeituraGeral(codigo, origem);
    } else if (state.telaAtual === 'inventario_avulsa') {
      contextoScanner = 'AVULSA_ITEM';
      processarLeituraGeral(codigo, origem);
    } else if (state.telaAtual === 'transferencia_saida') {
      contextoScanner = 'TRANSF_SAIDA_ITEM';
      processarLeituraGeral(codigo, origem);
    }
  }

  function processarLeituraGeral(codigo) {
    const cLow = codigo.trim().toLowerCase();
    if (contextoScanner === 'FICHA_ITEM') {
      const f = state.fichas.find(x =>
        String(x.itCodigo || '').toLowerCase() === cLow ||
        String(x.codBarras || '').toLowerCase() === cLow
      );
      if (f) {
        abrirApuracaoFicha(f.nrFicha);
      } else {
        const inp = document.getElementById('filtro-conf-item');
        if (inp) {
          inp.value = codigo;
          onFiltroConferenciaInput();
        }
      }
    } else if (contextoScanner === 'AVULSA_ITEM') {
      const inp = document.getElementById('avulsa-item');
      if (inp) {
        inp.value = codigo;
        lookupItemAvulsa(codigo);
      }
    } else if (contextoScanner === 'TRANSF_SAIDA_ITEM') {
      const inp = document.getElementById('transf-sai-item');
      if (inp) {
        inp.value = codigo.trim();
        onItemSaidaAlterado(codigo.trim());
      }
    }
  }

  // =========================================================================
  // CARGA OFFLINE EM CHUNKS PROGRESSIVOS
  // =========================================================================
  function abrirModalCargaInicial(tituloSub = null, skipConfirm = false) {
    if (!isOnline()) {
      alert('Sem conexão no momento. O app continuará operando normalmente com os dados salvos no IndexedDB.');
      return;
    }

    if (!skipConfirm) {
      const confirma = confirm(
        "Tem certeza que deseja sincronizar os dados com o TOTVS agora?\n\n" +
        "Esta operação realiza a carga dos cadastros e fichas do ERP e pode levar alguns minutos para concluir.\n\n" +
        "Deseja continuar?"
      );
      if (!confirma) return;
    }

    const modal = document.getElementById('modal-carga-mestres');
    if (!modal) return;
    modal.style.display = 'flex';

    const subEl = document.getElementById('carga-mestres-subtitulo');
    const barEl = document.getElementById('carga-mestres-bar');
    const pctEl = document.getElementById('carga-mestres-percent');
    const stEl = document.getElementById('carga-mestres-status');
    const detEl = document.getElementById('carga-mestres-detalhes');
    const btnFechar = document.getElementById('btn-fechar-carga-mestres');

    if (subEl && tituloSub) subEl.textContent = tituloSub;
    if (btnFechar) btnFechar.style.display = 'none';

    FastLoader.executarCarga({
      pasoeUrl: state.session.pasoeUrl || '/api/datasul',
      companyId: state.session.codEmpresa || '001',
      codEstabel: state.session.codEstabel || '',
      codUsuario: state.session.codUsuario || '',
      authHeader: state.session.authHeader,
      onProgress: (pct, msg, det) => {
        if (barEl) barEl.style.width = `${pct}%`;
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (stEl) stEl.textContent = msg;
        if (detEl) detEl.textContent = det || '';
      },
      onComplete: () => {
        if (btnFechar) btnFechar.style.display = 'inline-flex';
        setTimeout(() => {
          fecharModalCargaInicial();
        }, 900);
      },
      onError: (err) => {
        if (stEl) stEl.textContent = 'Erro: ' + err.message;
        if (btnFechar) {
          btnFechar.textContent = 'Fechar';
          btnFechar.style.display = 'inline-flex';
        }
      }
    });
  }

  function fecharModalCargaInicial() {
    const modal = document.getElementById('modal-carga-mestres');
    if (modal) modal.style.display = 'none';
    if (state.telaAtual === 'login') navegar('menu');
    else if (state.telaAtual === 'menu') renderTelaMenu();
    else if (state.telaAtual === 'inventarios_ativos') carregarInventariosAtivos(false);
  }

  async function limparBancoESincronizar() {
    const codEmpresa = state.session.codEmpresa || '001';
    if (!confirm(`Limpar os dados locais da Empresa ${codEmpresa} e realizar nova carga offline?`)) return;
    await DB.clearEmpresa('item', codEmpresa);
    await DB.clearEmpresa('deposito', codEmpresa);
    await DB.clearEmpresa('localizacao', codEmpresa);
    await DB.clearEmpresa('referencia', codEmpresa);
    await DB.clearEmpresa('lote', codEmpresa);
    await DB.clearEmpresa('saldo_estoq', codEmpresa);
    await DB.clearEmpresa('fichas_inventario', codEmpresa);
    await DB.clearEmpresa('fmsc_inventario', codEmpresa);
    abrirModalCargaInicial(`Recarregando base da Empresa ${codEmpresa}...`, true);
  }

  // =========================================================================
  // CONTINGÊNCIA E MODAIS AUXILIARES
  // =========================================================================
  let contingenciaFmt = 'CSV';
  let contingenciaCache = [];

  async function abrirModalContingencia(dtSaldoParam) {
    const modal = document.getElementById('modal-contingencia');
    if (!modal) return;
    const codEmpresa = state.session.codEmpresa || '001';
    const dtFiltro = dtSaldoParam || state.inventarioSelecionado?.dtSaldo;

    const historico = await DB.getHistoricoLocal(codEmpresa);
    const fichas = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);

    let movimentos = [];

    // Se informado inventário (ou estiver com inventário selecionado), lista os movimentos DESTE inventário
    if (dtFiltro) {
      const dtNorm = normalizarDataIso(dtFiltro);
      const histInv = historico.filter(h => normalizarDataIso(h.dtSaldo) === dtNorm);
      const fichasInv = fichas.filter(f =>
        normalizarDataIso(f.dtSaldo) === dtNorm &&
        f.qtApurada !== null && f.qtApurada !== undefined && f.qtApurada !== ''
      );

      const setChavesHist = new Set(histInv.map(h => `${h.nrContagem}_${h.nrFicha}`));
      movimentos = [...histInv];

      fichasInv.forEach(f => {
        const k = `${f.nrContagem || 1}_${f.nrFicha}`;
        if (!setChavesHist.has(k)) {
          movimentos.push({
            codEmpresa: f.codEmpresa || codEmpresa,
            codEstabel: f.codEstabel || state.session.codEstabel,
            codDepos: f.codDepos,
            dtSaldo: f.dtSaldo,
            nrContagem: f.nrContagem || 1,
            nrFicha: f.nrFicha,
            itCodigo: f.itCodigo,
            descItem: f.descItem,
            lote: f.lote || '',
            codLocaliz: f.codLocaliz || '',
            qtApurada: f.qtApurada,
            codUsuario: f.codConfteContag || state.session.codUsuario || 'OPERADOR',
            statusEnvio: f.sincronizado ? 'Sincronizado TOTVS' : (f.pendenteSync ? 'Pendente Fila Offline' : 'Apurado no Coletor'),
            dtLeitura: f.dtLeitura || new Date().toISOString()
          });
        }
      });

      // Ordena por ficha e contagem
      movimentos.sort((a, b) => Number(a.nrFicha) - Number(b.nrFicha) || Number(a.nrContagem) - Number(b.nrContagem));
    } else {
      movimentos = historico;
    }

    contingenciaCache = movimentos;

    // Atualiza cabeçalho do modal de contingência com o contexto
    const tituloModal = modal.querySelector('h4');
    if (tituloModal) {
      tituloModal.innerHTML = dtFiltro
        ? `💾 Contingência — Inventário ${formatarDataBr(dtFiltro)}`
        : '💾 Exportação de Contingência (Offline)';
    }

    mudarFormatoContingencia('CSV');
    modal.style.display = 'flex';
  }

  function fecharModalContingencia() {
    document.getElementById('modal-contingencia').style.display = 'none';
  }

  function mudarFormatoContingencia(fmt) {
    contingenciaFmt = fmt;
    document.querySelectorAll('.pill-contingencia-formato').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-fmt-${fmt.toLowerCase()}`)?.classList.add('active');
    const ta = document.getElementById('contingencia-textarea');
    const info = document.getElementById('contingencia-contagem-info');
    if (info) info.textContent = `${contingenciaCache.length} registro(s)`;
    if (!ta) return;

    if (fmt === 'CSV') {
      const h = 'EMPRESA;FILIAL;DEPOSITO;DATA_SALDO;CONTAGEM;FICHA;ITEM;LOTE;LOCALIZ;QTD_APURADA;USUARIO;STATUS;DATA_HORA';
      const r = contingenciaCache.map(x => `${x.codEmpresa};${x.codEstabel};${x.codDepos};${x.dtSaldo};${x.nrContagem};${x.nrFicha};"${x.itCodigo}";"${x.lote || ''}";"${x.codLocaliz || ''}";${x.qtApurada};${x.codUsuario};${x.statusEnvio};${x.dtLeitura}`);
      ta.value = [h, ...r].join('\n');
    } else if (fmt === 'TXT') {
      ta.value = contingenciaCache.map(x => `Ficha #${x.nrFicha} | ${x.itCodigo} | Qtd: ${x.qtApurada} | Dep: ${x.codDepos} | ${x.codUsuario} | ${x.dtLeitura}`).join('\n');
    } else {
      ta.value = JSON.stringify(contingenciaCache, null, 2);
    }
  }

  async function copiarContingenciaAreaTransferencia() {
    const ta = document.getElementById('contingencia-textarea');
    if (!ta) return;
    try {
      await navigator.clipboard.writeText(ta.value);
      alert('✓ Copiado!');
    } catch (e) {
      ta.select();
      document.execCommand('copy');
      alert('✓ Copiado!');
    }
  }

  function baixarArquivoContingencia() {
    const ta = document.getElementById('contingencia-textarea');
    if (!ta) return;
    const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contingencia_inventario_${Date.now()}.${contingenciaFmt.toLowerCase()}`;
    a.click();
  }

  function setModoVisualizacao(modo) {
    if ((modo === 'erp' || modo === 'split') && typeof Datasul !== 'undefined' && !Datasul.isAdminAutenticado()) {
      Datasul.solicitarLoginAdmin(modo);
      return;
    }

    state.modoVisualizacao = modo;
    const vp = document.getElementById('main-viewport');
    const col = document.getElementById('coletor-device-container');
    const erp = document.getElementById('erp-container');
    document.querySelectorAll('.switcher-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === modo));

    if (modo === 'app') {
      vp.className = 'main-viewport';
      col.style.display = 'flex';
      erp.style.display = 'none';
    } else if (modo === 'erp') {
      vp.className = 'main-viewport';
      col.style.display = 'none';
      erp.style.display = 'flex';
      if (typeof Datasul !== 'undefined') Datasul.mudarAbaPrincipal('alias');
    } else {
      vp.className = 'main-viewport split-mode';
      col.style.display = 'flex';
      erp.style.display = 'flex';
      if (typeof Datasul !== 'undefined') Datasul.mudarAbaPrincipal('alias');
    }
  }

  function alternarTelaCheia() {
    document.getElementById('device-frame')?.classList.toggle('fullscreen');
  }

  return {
    init,
    navegar,
    alternarSimulacaoOffline,
    alternarVisibilidadeSenha,
    resolverAliasLogin,
    onLoginEmpresaChange,
    executarLogin,
    logoff,
    entrarNoInventario,
    carregarInventariosAtivos,
    sincronizarInventariosOnline,
    limparCacheInventario,
    trocarRodadaContagem,
    tentarTrocarRodadaBloqueada,
    onFiltroConferenciaInput,
    mudarStatusFiltroConferencia,
    limparFiltrosConferencia,
    confirmarContagemRapida,
    abrirApuracaoFicha,
    confirmarApuracaoFicha,
    cancelarApuracaoFicha,
    alternarAbaInventario,
    excluirFichaAvulsaPendente,
    lookupItemAvulsa,
    confirmarFichaAvulsa,
    abrirPesquisaItemInterna,
    abrirPesquisaLocalizInterna,
    abrirPesquisaLoteInterna,
    abrirPesquisaReferenciaInterna,
    fecharModalPesquisaInterna,
    onFiltrarPesquisaInterna,
    selecionarResultadoPesquisa,
    renderTelaTransferencias,
    carregarListaTransferencias,
    filtrarStatusTransferencia,
    onBuscarTransferencias,
    abrirEdicaoSaida,
    abrirEntradaTransferencia,
    renderTelaTransferenciaSaida,
    onItemSaidaAlterado,
    onDepositoSaidaAlterado,
    onLoteSaidaAlterado,
    salvarSaidaTransferencia,
    renderTelaTransferenciaEntrada,
    onLoteEntradaAlterado,
    salvarEntradaTransferencia,
    transmitirTransferencia,
    excluirTransferencia,
    consultarTransferencia,
    renderTelaHistoricoContagens,
    filtrarHistoricoLocal,
    renderTelaSincronizacao,
    integrarFilaOffline,
    abrirModalConflitos,
    renderizarCardsConflitos,
    selecionarOpcaoConflito,
    resolverTodosConflitos,
    confirmarResolucaoConflitos,
    fecharModalConflitos,
    abrirModalAlertaAlteracoesTotvs,
    abrirScannerCamera,
    fecharScannerCamera,
    processarLeituraManual,
    abrirModalCargaInicial,
    fecharModalCargaInicial,
    limparBancoESincronizar,
    abrirModalContingencia,
    fecharModalContingencia,
    mudarFormatoContingencia,
    copiarContingenciaAreaTransferencia,
    baixarArquivoContingencia,
    setModoVisualizacao,
    alternarTelaCheia
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  App.init();
  Datasul.init();
});

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
    const badgeHeader = document.getElementById('status-rede-badge-header');
    const online = isOnline();
    [badge, badgeHeader].forEach(el => {
      if (el) {
        el.className = `status-badge-network ${online ? 'online' : 'offline'}`;
        el.textContent = online ? '● Online' : '● Modo Offline';
      }
    });
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
        await DB.integrarFilaOffline({
          codEmpresa,
          pasoeUrl: state.session.pasoeUrl || '/api/datasul',
          authHeader: state.session.authHeader
        });
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

    let finalUrl = rawUrl;
    const isPrivateIp = /^(https?:\/\/)?(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.|localhost)/i.test(rawUrl);

    // Se for URL externa completa:
    // Se for IP privado (ex: ponte local 192.168.0.8:3333 ou 10.x.x.x) ou túnel de ponte:
    // Chama DIRETAMENTE o endpoint, pois o webservice da ponte já possui CORS liberado
    // e o proxy da Vercel (nuvem) não possui acesso à rede interna Wi-Fi do usuário.
    if (isPrivateIp) {
      finalUrl = rawUrl;
    } else if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      finalUrl = rawUrl;
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

  function esconderLoading() {
    ocultarLoading();
  }

  function temPermissaoEstoque() {
    const p = state.session?.paramUsuario;
    if (!p) return true;
    return p.permEstoque === true || p.permEstoque === 'true' || p.permEstoque === 1;
  }

  function temPermissaoInventario() {
    const p = state.session?.paramUsuario;
    if (!p) return true;
    if (!temPermissaoEstoque()) return false;
    return Boolean(p.permEstoqReqInv === true || p.permEstoqReqInv === 'true' || p.permEstoqReqInv === 1);
  }

  function temPermissaoTransferencia() {
    const p = state.session?.paramUsuario;
    if (!p) return true;
    if (!temPermissaoEstoque()) return false;
    return Boolean(p.permEstoqReqMov === true || p.permEstoqReqMov === 'true' || p.permEstoqReqMov === 1);
  }

  function temPermissaoReqAtendimento() {
    const p = state.session?.paramUsuario;
    if (!p) return true;
    if (!temPermissaoEstoque()) return false;
    return Boolean(p.permEstoqReqAte === true || p.permEstoqReqAte === 'true' || p.permEstoqReqAte === 1);
  }

  function temPermissaoReqDevolucao() {
    const p = state.session?.paramUsuario;
    if (!p) return true;
    if (!temPermissaoEstoque()) return false;
    return Boolean(p.permEstoqReqDev === true || p.permEstoqReqDev === 'true' || p.permEstoqReqDev === 1);
  }

  function temPermissaoRequisicoes() {
    return temPermissaoEstoque() && (temPermissaoReqAtendimento() || temPermissaoReqDevolucao());
  }

  function temPermissaoProducao() {
    const p = state.session?.paramUsuario;
    if (!p) return false;
    return Boolean(p.permProducao === true || p.permProducao === 'true' || p.permProducao === 1);
  }

  function temPermissaoReporteOrdem() {
    const p = state.session?.paramUsuario;
    if (!p) return false;
    if (!temPermissaoProducao()) return false;
    return Boolean(p.permRepRepOrd === true || p.permRepRepOrd === 'true' || p.permRepRepOrd === 1);
  }

  function bloquearAcesso(modulo, campo) {
    alert(`🔒 Acesso Bloqueado\n\nO usuário '${state.session.codUsuario || 'operador'}' não possui permissão para acessar ${modulo}.\n\nPara liberar o acesso, contate o administrador do sistema TOTVS (FMSC0101).`);
  }

  function navegar(tela, params = {}) {
    if (tela !== 'login' && (!state.session || !state.session.codUsuario)) {
      if (state.telaAtual !== 'login') {
        state.telaAtual = 'login';
        renderTelaLogin();
      }
      return;
    }
    if (tela.startsWith('estoque') && !temPermissaoEstoque()) {
      bloquearAcesso('Módulo de Estoque', 'permEstoque');
      if (state.telaAtual !== 'menu') navegar('menu');
      return;
    }

    if (tela.startsWith('inventario') && !temPermissaoInventario()) {
      bloquearAcesso('Inventário Físico', 'permEstoqReqInv');
      if (state.telaAtual !== 'menu') navegar('menu');
      return;
    }

    if (tela.startsWith('transferencia') && !temPermissaoTransferencia()) {
      bloquearAcesso('Transferência de Material', 'permEstoqReqMov');
      if (state.telaAtual !== 'menu') navegar('menu');
      return;
    }

    if (tela.startsWith('requisicao_atendimento') && !temPermissaoReqAtendimento()) {
      bloquearAcesso('Atendimento de Requisição (CD1409)', 'permEstoqReqAte');
      if (state.telaAtual !== 'menu') navegar('menu');
      return;
    }

    if (tela.startsWith('requisicao_devolucao') && !temPermissaoReqDevolucao()) {
      bloquearAcesso('Devolução de Requisição (CD1410)', 'permEstoqReqDev');
      if (state.telaAtual !== 'menu') navegar('menu');
      return;
    }

    if (tela.startsWith('requisic') && !temPermissaoRequisicoes()) {
      bloquearAcesso('Requisições de Material', 'permEstoqReqAte / permEstoqReqDev');
      if (state.telaAtual !== 'menu') navegar('menu');
      return;
    }

    if (tela.startsWith('producao') && !temPermissaoProducao()) {
      bloquearAcesso('Módulo de Produção', 'permProducao');
      if (state.telaAtual !== 'menu') navegar('menu');
      return;
    }

    if (tela.startsWith('producao_reporte') && !temPermissaoReporteOrdem()) {
      bloquearAcesso('Reporte de Ordem de Produção (CP0311)', 'permRepRepOrd');
      if (state.telaAtual !== 'menu') navegar('menu');
      return;
    }

    state.telaAtual = tela;

    const footer = document.getElementById('app-footer');
    if (footer) {
      footer.style.display = tela === 'login' ? 'none' : 'flex';
      const podeEstoque = temPermissaoEstoque();

      document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        const isEstoque = btn.dataset.tab === 'estoque_menu';

        if (isEstoque) {
          btn.style.opacity = podeEstoque ? '' : '0.35';
          btn.style.cursor = podeEstoque ? '' : 'not-allowed';
          btn.title = podeEstoque ? '' : 'Acesso Bloqueado';
        }

        const isEstoqueActive = isEstoque && (
          tela === 'estoque_menu' ||
          tela.startsWith('inventario') ||
          tela.startsWith('transferencia') ||
          tela.startsWith('requisic')
        );

        btn.classList.toggle('active', btn.dataset.tab === tela || isEstoqueActive);
      });
    }

    container.innerHTML = '';

    switch (tela) {
      case 'login': renderTelaLogin(); break;
      case 'menu': renderTelaMenu(); break;
      case 'estoque_menu': renderTelaEstoqueMenu(); break;
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
      case 'requisicoes_menu': renderTelaRequisicoesMenu(); break;
      case 'requisicao_atendimento': renderTelaRequisicaoAtendimento(params); break;
      case 'requisicao_devolucao': renderTelaRequisicaoDevolucao(params); break;
      case 'producao_menu': renderTelaProducaoMenu(); break;
      case 'producao_reporte': renderTelaReporteOrdem(params); break;
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

  // Normalização do código de localização Datasul:
  // No Datasul CE0105/CE0206, a localização vazia tem código "" (vazio) e descrição "BRANCO".
  // Nunca deve ser enviado "BRANCO" no campo codLocaliz / codLocalizSai / codLocalizEnt.
  function normalizarCodLocaliz(loc) {
    if (!loc) return '';
    const s = String(loc).trim();
    const u = s.toUpperCase();
    if (u === 'BRANCO' || u === '(EM BRANCO)' || u === 'EM BRANCO' || u === 'PADRÃO' || u === 'PADRAO' || u === '(PADRÃO)' || u === '(PADRAO)' || u === '-') {
      return '';
    }
    return s;
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
            <option value="teste">teste - PASOE Real (Cloudflare Tunnel)</option>
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

  let ponteSyncIniciada = false;
  function iniciarPonteSincronizacaoAlias() {
    if (ponteSyncIniciada || typeof window === 'undefined' || typeof document === 'undefined') return;
    ponteSyncIniciada = true;
    try {
      window.addEventListener('message', (ev) => {
        if (!ev.data || ev.data.type !== 'COLETOR_ALIAS_SYNC') return;
        const remoteMap = ev.data.customMap || {};
        const remoteDel = (ev.data.deletedList || []).map(x => String(x).toLowerCase());
        let localMap = {};
        try { localMap = JSON.parse(localStorage.getItem('coletor_custom_aliases') || '{}'); } catch (e) {}
        let alterou = false;
        Object.keys(remoteMap).forEach(k => {
          const key = k.toLowerCase();
          if (!remoteDel.includes(key) && remoteMap[k] && remoteMap[k].alias && remoteMap[k].pasoeUrl) {
            localMap[key] = { ...(localMap[key] || {}), ...remoteMap[k] };
            alterou = true;
            fetch('/api/discovery/aliases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(localMap[key])
            }).catch(() => {});
          }
        });
        if (alterou) {
          localStorage.setItem('coletor_custom_aliases', JSON.stringify(localMap));
          const aliasEl = document.getElementById('login-alias');
          if (aliasEl && aliasEl.value) resolverAliasLogin();
        }
      });

      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        const iframe = document.createElement('iframe');
        iframe.src = 'https://coletorquali.vercel.app/api/discovery/sync-bridge';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }
    } catch (e) {}
  }

  async function resolverAliasRemotoComFallback(alias) {
    const chave = (alias || '').trim().toLowerCase();
    const urlPrimaria = window.ColetorGateway
      ? window.ColetorGateway.getDiscoveryUrl(chave)
      : `/api/discovery/resolve?alias=${encodeURIComponent(chave)}`;

    const urls = [urlPrimaria];
    const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
    if (host === 'localhost' || host === '127.0.0.1') {
      urls.push(`https://coletorquali.vercel.app/api/discovery/resolve?alias=${encodeURIComponent(chave)}`);
      urls.push(`http://localhost:3333/api/discovery/resolve?alias=${encodeURIComponent(chave)}`);
    } else if (host === 'coletorquali.vercel.app') {
      urls.push(`http://localhost:3000/api/discovery/resolve?alias=${encodeURIComponent(chave)}`);
      urls.push(`http://localhost:3333/api/discovery/resolve?alias=${encodeURIComponent(chave)}`);
    }

    let ultimoErro = null;
    for (const u of urls) {
      try {
        const r = await fetch(u);
        const d = await r.json();
        if (d && (d.success || d.inativo)) {
          if (u !== urlPrimaria && d.success) {
            fetch('/api/discovery/aliases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d)
            }).catch(() => {});
          }
          return d;
        }
        ultimoErro = d;
      } catch (e) {}
    }
    return ultimoErro;
  }

  async function resolverAliasLogin() {
    iniciarPonteSincronizacaoAlias();
    const aliasEl = document.getElementById('login-alias');
    const infoTag = document.getElementById('alias-info-tag');
    const empresaEl = document.getElementById('login-empresa');
    if (!aliasEl || !infoTag) return;

    const alias = aliasEl.value.trim().toLowerCase();
    state.aliasInput = alias;
    if (!alias) return;

    const aplicarDadosAlias = async (dados, ehOffline = false) => {
      if ((dados.status || 'ativo').toLowerCase() === 'inativo') {
        infoTag.textContent = `✕ O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso.`;
        infoTag.style.color = '#dc2626';
        mostrarAviso(`O ambiente ALIAS '${alias}' está INATIVO e não está apto para o uso.`, 'error');
        return false;
      }
      state.session.pasoeUrl = dados.pasoeUrl;
      state.session.alias = dados.alias;
      await DB.putConfig(`alias_${alias}`, dados);
      infoTag.textContent = ehOffline
        ? `● Offline: ${dados.nomeEmpresa || alias} (${dados.pasoeUrl})`
        : `✓ ${dados.nomeEmpresa || alias} (${dados.pasoeUrl})`;
      infoTag.style.color = ehOffline ? '#d97706' : '#059669';

      const empDefault = DB.normalizarEmpresa(dados.empresaPrincipal || '001');
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
      return true;
    };

    // 1. Se estiver ONLINE, busca no Discovery (Local + Vercel + Ponte)
    if (isOnline()) {
      try {
        infoTag.textContent = `Consultando Discovery '${alias}'...`;
        const data = await resolverAliasRemotoComFallback(alias);
        if (data && data.success) {
          await aplicarDadosAlias(data, false);
          return;
        } else if (data && data.inativo) {
          infoTag.textContent = `✕ ${data.mensagem || 'ALIAS inativo.'}`;
          infoTag.style.color = '#dc2626';
          return;
        }
      } catch (e) {
        console.warn('Falha ao consultar Discovery na nuvem, tentando cache local:', e);
      }
    }

    // 2. MODO OFFLINE ou contingência: consulta cache local do dispositivo
    const aliasCache = await DB.getConfig(`alias_${alias}`);
    if (aliasCache) {
      await aplicarDadosAlias(aliasCache, true);
      return;
    }

    let overrideAlias = null;
    try {
      const customMap = JSON.parse(localStorage.getItem('coletor_custom_aliases') || '{}');
      if (customMap[alias]) overrideAlias = customMap[alias];
    } catch (e) {}
    if (overrideAlias) {
      await aplicarDadosAlias(overrideAlias, true);
      return;
    }

    infoTag.textContent = isOnline() ? `✕ ALIAS '${alias}' não encontrado.` : '● Offline: tente entrar com último login sincronizado.';
    infoTag.style.color = '#dc2626';
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
          const urlDisc = window.ColetorGateway ? window.ColetorGateway.getDiscoveryUrl(alias) : `/api/discovery/resolve?alias=${encodeURIComponent(alias)}`;
          const resCheck = await fetch(urlDisc);
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

        if (paramLocal) {
          const temEstoque = paramLocal.permEstoque === true || paramLocal.permEstoque === 'true' || paramLocal.permEstoque === 1;
          const temCompras = Boolean(paramLocal.permCompras);
          const temProducao = Boolean(paramLocal.permProducao);
          const temCredito = Boolean(paramLocal.permCredito);
          if (!temEstoque && !temCompras && !temProducao && !temCredito) {
            throw new Error(`Usuário '${usuario}' sem permissão de acesso a módulos no FMSC0101.`);
          }
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
      // 1. Resolve ALIAS no Discovery oficial (Local + Vercel + Ponte + Cache local)
      let dataDisc = await resolverAliasRemotoComFallback(alias);
      if (!dataDisc || !dataDisc.success) {
        const customMap = JSON.parse(localStorage.getItem('coletor_custom_aliases') || '{}');
        const cacheAlias = (await DB.getConfig(`alias_${alias}`)) || customMap[alias];
        if (cacheAlias && cacheAlias.pasoeUrl) {
          dataDisc = { ...cacheAlias, success: true };
        }
      }
      if (!dataDisc || !dataDisc.success) {
        throw new Error(dataDisc?.mensagem || 'ALIAS inválido.');
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
      const usuarioReal = (dataLogin.codUsuario || dataLogin.usuario?.codUsuario || (usuario.includes('/') ? usuario.split('/')[1] : (usuario.includes('\\') ? usuario.split('\\')[1] : usuario))).trim();

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
            usuario: usuarioReal,
            payload: [{ usuario: usuarioReal }]
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
          throw new Error(`Usuário '${usuarioReal}' não habilitado no FMSC0101 para a empresa ${codEmpresa}.`);
        }
        const temEstoque = paramUsuario.permEstoque === true || paramUsuario.permEstoque === 'true' || paramUsuario.permEstoque === 1;
        const temCompras = Boolean(paramUsuario.permCompras);
        const temProducao = Boolean(paramUsuario.permProducao);
        const temCredito = Boolean(paramUsuario.permCredito);
        if (!temEstoque && !temCompras && !temProducao && !temCredito) {
          throw new Error(`Usuário '${usuarioReal}' sem permissão de acesso a módulos no FMSC0101 para a empresa ${codEmpresa}.`);
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
        codUsuario: usuarioReal,
        nome: paramUsuario?.nome || dataLogin.nomeUsuario || dataLogin.usuario?.nome || usuarioReal.toUpperCase(),
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
  // TELA 2: MENU PRINCIPAL (SELEÇÃO DE MÓDULOS ERP & FERRAMENTAS)
  // =========================================================================
  async function renderTelaMenu() {
    const codEmpresa = state.session.codEmpresa || '001';
    const usuario = state.session.nome || state.session.codUsuario || 'Operador';
    const filial = state.session.codEstabel || '-';
    const nomeFilial = state.session.nomeEstabel || '';

    const qtdSync = await DB.getQtdPendenciasSync(codEmpresa);
    const podeEstoque = temPermissaoEstoque();
    const podeProducao = temPermissaoProducao();

    container.innerHTML = `
      <!-- Banner Superior -->
      <div class="home-active-banner" style="${podeEstoque ? '' : 'opacity: 0.7;'}">
        <div class="home-banner-left">
          <div class="home-banner-icon">${podeEstoque ? '📦' : '🔒'}</div>
          <div>
            <div class="home-banner-title">Módulo de Estoque</div>
            <div class="home-banner-sub">${podeEstoque ? `Filial ${escapeHtml(filial)} • Inventário, Transferências e Requisições` : '<span style="color:#ef4444; font-weight:700;">Acesso ao módulo bloqueado</span>'}</div>
          </div>
        </div>
        ${podeEstoque ? `
          <button class="home-banner-btn" onclick="App.navegar('estoque_menu')">
            Acessar ➔
          </button>
        ` : `
          <button class="home-banner-btn" style="opacity: 0.55; background: #64748b; cursor: not-allowed;" onclick="App.bloquearAcesso('Módulo de Estoque', 'permEstoque')">
            Bloqueado 🔒
          </button>
        `}
      </div>

      <div class="home-section-title">Módulos do Sistema</div>

      <div class="home-service-grid">
        ${podeEstoque ? `
          <button type="button" class="home-service-card is-active" style="border: 2px solid #0284c7; background: #ffffff;" onclick="App.navegar('estoque_menu')">
            <div class="home-card-icon-wrap" style="background:#e0f2fe; color:#0284c7; font-size:24px;">📦</div>
            <div class="home-card-title" style="color: #0284c7; font-size: 15px; font-weight: 800;">Estoque</div>
            <div class="home-card-desc">Contagem física, transferências e requisições</div>
          </button>
        ` : `
          <button type="button" class="home-service-card" style="opacity: 0.55; cursor: not-allowed; border-color: #cbd5e1; background: #f8fafc;" onclick="App.bloquearAcesso('Módulo de Estoque', 'permEstoque')">
            <div class="home-card-icon-wrap" style="background:#f1f5f9; color:#94a3b8; font-size:24px;">🔒</div>
            <div class="home-card-title" style="color: #64748b; font-size: 15px; font-weight: 800;">Estoque</div>
            <div class="home-card-desc" style="color: #ef4444; font-weight: 700;">Bloqueado</div>
          </button>
        `}

        ${podeProducao ? `
          <button type="button" class="home-service-card is-active" style="border: 2px solid #d97706; background: #ffffff;" onclick="App.navegar('producao_menu')">
            <div class="home-card-icon-wrap" style="background:#fef3c7; color:#d97706; font-size:24px;">🏭</div>
            <div class="home-card-title" style="color: #b45309; font-size: 15px; font-weight: 800;">Produção</div>
            <div class="home-card-desc">Chão de fábrica e reportes</div>
          </button>
        ` : `
          <button type="button" class="home-service-card" style="opacity: 0.55; cursor: not-allowed; border-color: #cbd5e1; background: #f8fafc;" onclick="App.bloquearAcesso('Módulo de Produção', 'permProducao')">
            <div class="home-card-icon-wrap" style="background:#f1f5f9; color:#94a3b8; font-size:24px;">🔒</div>
            <div class="home-card-title" style="color: #64748b; font-size: 15px; font-weight: 800;">Produção</div>
            <div class="home-card-desc" style="color: #ef4444; font-weight: 700;">Bloqueado</div>
          </button>
        `}
      </div>

      <div class="home-section-title" style="margin-top: 18px;">Ferramentas do Coletor</div>

      <div class="home-service-grid">
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
  // SUB-MÓDULO: ESTOQUE (CONTAGEM FÍSICA, TRANSFERÊNCIAS E REQUISIÇÕES)
  // =========================================================================
  async function renderTelaEstoqueMenu() {
    const codEmpresa = state.session.codEmpresa || '001';
    const filial = state.session.codEstabel || '101';
    const nomeFilial = state.session.nomeEstabel || '';

    const fichasEmp = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    const fichasFilial = fichasEmp.filter(f => f.codEstabel === filial);
    const pendentes = fichasFilial.filter(f => f.qtApurada === null || f.qtApurada === undefined).length;
    const transfList = await DB.listarTransferencias(codEmpresa, state.session.codUsuario);
    const transfPendEntrada = transfList.filter(t => t.status === 'PENDENTE_ENTRADA').length;

    const podeInv = temPermissaoInventario();
    const podeTransf = temPermissaoTransferencia();
    const podeReq = temPermissaoRequisicoes();

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('menu')">‹ Menu</button>
        <div style="text-align: center;">
          <h3 style="font-size: 14.5px; font-weight: 800; margin: 0; color: #0284c7;">Módulo Estoque</h3>
          <span style="font-size: 11px; color: #64748b;">Filial ${escapeHtml(filial)} • Emp ${escapeHtml(codEmpresa)}</span>
        </div>
        <button class="btn-topbar-action" onclick="App.renderTelaEstoqueMenu()" title="Recarregar">🔄</button>
      </div>

      <!-- Banner de Destaque do Inventário da Filial -->
      <div class="home-active-banner" style="${podeInv ? '' : 'opacity: 0.7;'}">
        <div class="home-banner-left">
          <div class="home-banner-icon">${podeInv ? '📋' : '🔒'}</div>
          <div>
            <div class="home-banner-title">Inventário Físico (CE0712)</div>
            <div class="home-banner-sub">${podeInv ? (fichasFilial.length > 0 ? `${fichasFilial.length} ficha(s) no aparelho • ${pendentes} pendente(s)` : 'Consultar inventários do ERP TOTVS (Online/Offline)') : '<span style="color:#ef4444; font-weight:700;">Bloqueado</span>'}</div>
          </div>
        </div>
        ${podeInv ? `
          <button class="home-banner-btn" onclick="App.navegar('inventarios_ativos')">
            Iniciar ➔
          </button>
        ` : `
          <button class="home-banner-btn" style="opacity: 0.55; background: #64748b; cursor: not-allowed;" onclick="App.bloquearAcesso('Inventário Físico', 'permEstoqReqInv')">
            Bloqueado 🔒
          </button>
        `}
      </div>

      <div class="home-section-title">Operações de Estoque</div>

      <div class="home-service-grid">
        ${podeInv ? `
          <button type="button" class="home-service-card is-active" onclick="App.navegar('inventarios_ativos')">
            <div class="home-card-icon-wrap icon-wrap-orange">📋</div>
            <div class="home-card-title" style="color: #0284c7;">Contagem Física</div>
            <div class="home-card-desc">Apuração 1ª/2ª/3ª rodada e ficha avulsa 100% offline</div>
          </button>
        ` : `
          <button type="button" class="home-service-card" style="opacity: 0.55; cursor: not-allowed; border-color: #cbd5e1; background: #f8fafc;" onclick="App.bloquearAcesso('Contagem Física de Inventário', 'permEstoqReqInv')">
            <div class="home-card-icon-wrap" style="background:#f1f5f9; color:#94a3b8;">🔒</div>
            <div class="home-card-title" style="color: #64748b;">Contagem Física</div>
            <div class="home-card-desc" style="color: #ef4444; font-weight: 700;">Bloqueado</div>
          </button>
        `}

        ${podeTransf ? `
          <button type="button" class="home-service-card" onclick="App.navegar('transferencias')">
            <div class="home-card-icon-wrap icon-wrap-purple" style="background:#e0e7ff; color:#4338ca;">🔄</div>
            <div class="home-card-title" style="color: #4338ca;">Transf. Material</div>
            <div class="home-card-desc">${transfPendEntrada > 0 ? `<strong style="color:#d97706;">${transfPendEntrada} pendente(s) de entrada</strong>` : 'Movimentação CE0206 (Saída e Entrada)'}</div>
          </button>
        ` : `
          <button type="button" class="home-service-card" style="opacity: 0.55; cursor: not-allowed; border-color: #cbd5e1; background: #f8fafc;" onclick="App.bloquearAcesso('Transferência de Material', 'permEstoqReqMov')">
            <div class="home-card-icon-wrap" style="background:#f1f5f9; color:#94a3b8;">🔒</div>
            <div class="home-card-title" style="color: #64748b;">Transf. Material</div>
            <div class="home-card-desc" style="color: #ef4444; font-weight: 700;">Bloqueado</div>
          </button>
        `}

        ${podeReq ? `
          <button type="button" class="home-service-card" onclick="App.navegar('requisicoes_menu')">
            <div class="home-card-icon-wrap icon-wrap-teal" style="background:#ccfbf1; color:#0f766e;">📝</div>
            <div class="home-card-title" style="color: #0f766e;">Requisições</div>
            <div class="home-card-desc">Atendimento (CD1409) e Devolução (CD1410)</div>
          </button>
        ` : `
          <button type="button" class="home-service-card" style="opacity: 0.55; cursor: not-allowed; border-color: #cbd5e1; background: #f8fafc;" onclick="App.bloquearAcesso('Requisições de Material', 'permEstoqReqAte / permEstoqReqDev')">
            <div class="home-card-icon-wrap" style="background:#f1f5f9; color:#94a3b8;">🔒</div>
            <div class="home-card-title" style="color: #64748b;">Requisições</div>
            <div class="home-card-desc" style="color: #ef4444; font-weight: 700;">Bloqueado</div>
          </button>
        `}
      </div>

      <div class="card" style="margin-top: 16px; background: #f8fafc; border: 1px dashed #cbd5e1; text-align: center; padding: 12px; font-size: 11.5px; color: #64748b;">
        📦 Rotinas homologadas no TOTVS Datasul: CE0712, CE0206, CD1409 e CD1410.
      </div>
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
      const baseRaw = fichasData.length > 0 ? fichasData : todasFichas.filter(f => normalizarDataIso(f.dtSaldo) === dt);
      const baseResumo = filtrarFichasElegiveisRodada(baseRaw, rodadaFiltro, todasFichas, param.permContgUsFc, state.session.codUsuario);

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

  
  // Regra canônica de elegibilidade de fichas por rodada (CE0712 / fcGetInventariosFichas.p / FMSC0102)
  function filtrarFichasElegiveisRodada(fichas, rodada, todasFichas, permMesmoUsuario, codUsuario) {
    const rod = Number(rodada || 1);
    const codUs = String(codUsuario || '').toLowerCase().trim();
    const mapaF1 = new Map();
    (todasFichas || fichas || []).forEach(f => {
      if (Number(f.nrContagem) === 1 && !mapaF1.has(Number(f.nrFicha))) {
        mapaF1.set(Number(f.nrFicha), f);
      }
    });

    return (fichas || []).filter(f => {
      if (f.avulsa) return false;
      if (Number(f.situacao) === 3) return false; // Rejeitada / Cancelada
      if (Number(f.nrContagem || 1) !== rod) return false;

      if (rod > 1) {
        const f1 = mapaF1.get(Number(f.nrFicha));
        const v1 = f.valApurado1 ?? f1?.valApurado1 ?? f1?.qtApurada ?? null;
        const qt = Number(f.qtidadeAtu || 0);

        // Se a contagem 1 bateu exatamente com o saldo de estoque, CE0712 dispensa 2ª/3ª contagem
        if (v1 !== null && v1 !== undefined && Math.abs(Number(v1) - qt) < 0.0001) {
          return false;
        }

        // Segregação de conferente por fmsc-inventario.permContgUsFc
        if (!permMesmoUsuario && codUs) {
          const u1 = String(f.codConfteContag1 || f1?.codConfteContag1 || '').toLowerCase().trim();
          const u2 = String(f.codConfteContag2 || '').toLowerCase().trim();
          if (u1 === codUs || (rod === 3 && u2 === codUs)) {
            return false;
          }
        }
      }

      if (rod === 3) {
        // Regra do CE0712: se valApurado1 e valApurado2 são iguais, a ficha NÃO vai para a 3ª contagem
        const v1 = f.valApurado1;
        const v2 = f.valApurado2;
        if (v1 !== null && v1 !== undefined && v2 !== null && v2 !== undefined && Math.abs(Number(v1) - Number(v2)) < 0.0001) {
          return false;
        }
      }

      return true;
    });
  }

  async function calcularDepositosInventario(dtSaldo) {
    const codEmpresa = state.session.codEmpresa || '001';
    const codEstabel = state.session.codEstabel || '';
    const codUsuario = state.session.codUsuario || '';
    const paramAtual = await DB.obterParamInventarioLocal(codEmpresa, dtSaldo);
    const inv = state.inventarioSelecionado;
    const nrAtiva = Number(paramAtual?.nrContagAtiva || inv?.nrContagAtiva || 1);
    const rodada = (nrAtiva >= 1 && nrAtiva <= 3) ? nrAtiva : 1;
    const permMesmoUsuario = Boolean(paramAtual?.permContgUsFc ?? inv?.permContgUsFc);

    const todasFichasEmpresa = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    const deposMestres = await DB.getAllByEmpresa('deposito', codEmpresa);

    const fichasFilial = todasFichasEmpresa.filter(f =>
      normalizarDataIso(f.dtSaldo) === dtSaldo &&
      (!codEstabel || String(f.codEstabel || '').trim() === String(codEstabel).trim())
    );

    const fichasRodada = fichasFilial.filter(f => Number(f.nrContagem || 1) === rodada);
    const fichasValidas = filtrarFichasElegiveisRodada(fichasRodada, rodada, fichasFilial, permMesmoUsuario, codUsuario);

    const mapa = new Map();
    fichasValidas.forEach(f => {
      const dep = (f.codDepos || '').trim();
      if (!dep) return;
      if (!mapa.has(dep)) {
        const mestre = deposMestres.find(d => (d.codDepos || '').trim() === dep);
        mapa.set(dep, {
          codDepos: dep,
          nome: mestre ? (mestre.nome || mestre.descricao || dep) : dep,
          fichas: [],
          total: 0,
          contadas: 0,
          pendentes: 0
        });
      }
      const reg = mapa.get(dep);
      reg.fichas.push(f);
      reg.total++;
      if (f.qtApurada !== null && f.qtApurada !== undefined && f.qtApurada !== '') {
        reg.contadas++;
      } else {
        reg.pendentes++;
      }
    });

    return Array.from(mapa.values()).sort((a, b) => a.codDepos.localeCompare(b.codDepos));
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
        if (inp) inp.value = normalizarCodLocaliz(reg.codLocaliz);
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
        if (inp) inp.value = normalizarCodLocaliz(reg.codLocaliz);
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
        if (inp) inp.value = normalizarCodLocaliz(reg.codLocaliz);
      } else if (tipo === 'LOTE') {
        const inpL = document.getElementById('avulsa-lote');
        if (inpL) inpL.value = reg.lote;
        if (reg.dtValiLote) {
          const inpDt = document.getElementById('avulsa-dt-valid');
          if (inpDt) inpDt.value = formatarParaInputDate(reg.dtValiLote);
        }
        if (reg.codLocaliz) {
          const inpLoc = document.getElementById('avulsa-localiz');
          if (inpLoc && !inpLoc.value) inpLoc.value = normalizarCodLocaliz(reg.codLocaliz);
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
              ${normalizarCodLocaliz(t.codLocalizSai) ? `<span>• Loc <strong>${escapeHtml(normalizarCodLocaliz(t.codLocalizSai))}</strong></span>` : ''}
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
                ${normalizarCodLocaliz(t.codLocalizEnt) ? `<span>• Loc <strong>${escapeHtml(normalizarCodLocaliz(t.codLocalizEnt))}</strong></span>` : ''}
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
                <input type="text" id="transf-sai-localiz" class="form-input" placeholder="Padrão (Em Branco)" value="${escapeHtml(normalizarCodLocaliz(locSaiVal))}">
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
        const locPadrao = normalizarCodLocaliz(item?.codLocaliz);
        inpLocaliz.value = locPadrao;
        inpLocaliz.readOnly = true;
        inpLocaliz.style.background = '#f1f5f9';
        inpLocaliz.style.color = '#334155';
        if (btnLupaLoc) btnLupaLoc.disabled = true;
        if (tipLoc) {
          tipLoc.textContent = `🔒 Localização única do item (${locPadrao ? locPadrao : 'Padrão / Em Branco'}).`;
          tipLoc.style.display = 'block';
        }
      } else {
        inpLocaliz.value = normalizarCodLocaliz(item?.codLocaliz);
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
      const codLocalizSai = normalizarCodLocaliz(document.getElementById('transf-sai-localiz')?.value);
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

    const locEntPadrao = normalizarCodLocaliz(isLocUnica ? (item?.codLocaliz || transf.codLocalizEnt || '') : (transf.codLocalizEnt || ''));
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
          <span>• Loc: <strong>${escapeHtml(normalizarCodLocaliz(transf.codLocalizSai) || 'Padrão (Em Branco)')}</strong></span>
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
              <input type="text" id="transf-ent-localiz" class="form-input" placeholder="Padrão (Em Branco)" value="${escapeHtml(normalizarCodLocaliz(locEntPadrao))}" ${isLocUnica ? 'readonly style="background:#f1f5f9; color:#334155;"' : ''}>
              <button type="button" id="transf-ent-btn-lupa-loc" class="btn btn-secondary" style="width: auto; padding: 0 8px;" onclick="App.abrirPesquisaLocalizInterna('transf_entrada')" title="Buscar Localização" ${isLocUnica ? 'disabled' : ''}>🔍</button>
            </div>
            ${isLocUnica ? `<div id="transf-ent-loc-tip" style="font-size: 10.5px; color: #475569; margin-top: 3px; font-weight: 600;">🔒 Localização única do item (${escapeHtml(normalizarCodLocaliz(locEntPadrao) || 'Padrão / Em Branco')}).</div>` : ''}
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
    const codLocalizEnt = normalizarCodLocaliz(document.getElementById('transf-ent-localiz')?.value);
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
    transf.codDeposSai = transf.codDeposSai || '';
    transf.codLocalizSai = normalizarCodLocaliz(transf.codLocalizSai);
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
      const codEstabelFinal = (transf.codEstabel || state.session.codEstabel || '101').trim() || '101';
      const codUsuarioFinal = (state.session.codUsuario || transf.codUsuario || 'matheus.st').trim() || 'matheus.st';
      const dtTransfFinal = normalizarDataIso(transf.dtTransf || new Date());

      const payloadItem = {
        codEmpresa: codEmpresaReq,
        itCodigo: (transf.itCodigo || '').trim(),
        codEstabel: codEstabelFinal,
        codUsuario: codUsuarioFinal,
        dtTransf: dtTransfFinal,
        nroDocto: (transf.nroDocto || '').trim(),
        serie: (transf.serie || '').trim(),
        quantidade: Number(transf.quantidade || 0),
        codDeposSai: (transf.codDeposSai || '').trim(),
        codLocalizSai: normalizarCodLocaliz(transf.codLocalizSai),
        loteSai: (transf.loteSai || '').trim(),
        dtValiLote: transf.dtValiLote ? normalizarDataIso(transf.dtValiLote) : '',
        codReferSai: (transf.codReferSai || '').trim(),
        codDeposEnt: (transf.codDeposEnt || '').trim(),
        codLocalizEnt: normalizarCodLocaliz(transf.codLocalizEnt),
        loteEnt: (transf.loteEnt || '').trim(),
        dtValiLoteEnt: transf.dtValiLoteEnt ? normalizarDataIso(transf.dtValiLoteEnt) : '',
        codReferEnt: (transf.codReferEnt || '').trim()
      };

      const res = await pasoeFetch('/fcSetTransfMaterial', {
        method: 'PUT',
        body: JSON.stringify(payloadItem)
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
            <div>Localiz: <strong>${escapeHtml(normalizarCodLocaliz(transf.codLocalizSai) || 'Padrão (Em Branco)')}</strong></div>
            <div>Lote: <strong>${escapeHtml(transf.loteSai || '-')}</strong></div>
            <div>Validade: <strong>${transf.dtValiLote ? formatarDataBr(transf.dtValiLote) : '-'}</strong></div>
            <div>Ref: <strong>${escapeHtml(transf.codReferSai || '-')}</strong></div>
          </div>

          <!-- Entrada -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; font-size: 11.5px;">
            <div style="color: #166534; font-weight: 800; margin-bottom: 4px;">🟢 Entrada (Destino)</div>
            <div>Depósito: <strong>${escapeHtml(transf.codDeposEnt)}</strong></div>
            <div>Localiz: <strong>${escapeHtml(normalizarCodLocaliz(transf.codLocalizEnt) || 'Padrão (Em Branco)')}</strong></div>
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
  // MÓDULO: REQUISIÇÕES DE MATERIAL (CD1409 / CD1410) - OFFLINE-FIRST & 2 TELAS
  // =========================================================================

  const stateRequisicoes = {
    atendimento: {
      telaSub: 'lista', // 'lista' | 'detalhe'
      termoBusca: '',
      carregando: false,
      listaItens: [], // itens retornados de fcGetRequisicao
      reqSelecionada: null, // objeto agrupado da requisição selecionada
      itemSelecionado: null, // objeto it_requisicao selecionado
      saldosEstoque: [], // saldos de fcGetSaldoEstoqEstabItem ou local IndexedDB
      carregandoSaldos: false,
      quantidadesInformadas: {}, // idxSaldo => number
      dataAtend: new Date().toISOString().split('T')[0],
      isOffline: false,
      paginaAtual: 1,
      itensPorPagina: 10,
      ordemData: 'desc' // 'desc' = maior para o menor (mais recente); 'asc' = menor para o maior
    },
    devolucao: {
      telaSub: 'lista', // 'lista' | 'detalhe'
      termoBusca: '',
      dtCorte: (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
      })(),
      carregando: false,
      listaItens: [], // itens retornados de fcGetRequisDevol
      reqSelecionada: null,
      itemSelecionado: null,
      movimentos: [], // movimentos de fcGetSaldoEstoqEstabItDev
      carregandoMovimentos: false,
      movimentoSelecionadoIdx: null,
      quantidadeDevolver: 0,
      dataDevol: new Date().toISOString().split('T')[0],
      isOffline: false,
      paginaAtual: 1,
      itensPorPagina: 10,
      ordemData: 'desc'
    }
  };

  // 1. TELA PRINCIPAL DE REQUISIÇÕES (SUBMENU)
  function renderTelaRequisicoesMenu() {
    const podeAte = temPermissaoReqAtendimento();
    const podeDev = temPermissaoReqDevolucao();
    const codEstabel = state.session.codEstabel || '101';
    const codEmpresa = state.session.codEmpresa || '001';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('menu')">‹ Início</button>
        <div style="text-align: center;">
          <h3 style="font-size: 15px; font-weight: 800; margin: 0; color: #1e293b;">Requisições de Material</h3>
          <span style="font-size: 11px; color: #64748b; font-weight: 600;">Emp ${escapeHtml(codEmpresa)} • Filial ${escapeHtml(codEstabel)}</span>
        </div>
        <div style="width: 45px;"></div>
      </div>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px; margin-bottom: 16px;">
        <div style="font-size: 12.5px; color: #166534; font-weight: 700; margin-bottom: 4px;">Operações de Requisição</div>
        <div style="font-size: 11.5px; color: #15803d;">
          Gerencie atendimentos e devoluções de materiais do ERP TOTVS Datasul com baixa automática, suporte offline e conciliação de saldos em estoque.
        </div>
      </div>

      <div class="home-service-grid" style="grid-template-columns: 1fr; gap: 12px;">
        ${podeAte ? `
          <button type="button" class="home-service-card is-active" onclick="App.navegar('requisicao_atendimento')" style="padding: 16px; border-left: 4px solid #0284c7;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div class="home-card-icon-wrap icon-wrap-blue" style="font-size: 24px; width: 44px; height: 44px; display:flex; align-items:center; justify-content:center;">📥</div>
              <div style="text-align: left; flex: 1;">
                <div class="home-card-title" style="font-size: 14px; color: #0369a1; font-weight: 800;">1. Atendimento de Requisição (CD1409)</div>
                <div class="home-card-desc" style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                  Consultar requisições aprovadas em grid, verificar saldos no estoque e realizar atendimento (baixa de material)
                </div>
              </div>
              <div style="color: #0369a1; font-weight: 800; font-size: 18px;">➔</div>
            </div>
          </button>
        ` : `
          <button type="button" class="home-service-card" style="padding: 16px; opacity: 0.55; cursor: not-allowed; border-color: #cbd5e1; background: #f8fafc;" onclick="App.bloquearAcesso('Atendimento de Requisição (CD1409)', 'permEstoqReqAte')">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div class="home-card-icon-wrap" style="background:#f1f5f9; color:#94a3b8; font-size: 24px; width: 44px; height: 44px; display:flex; align-items:center; justify-content:center;">🔒</div>
              <div style="text-align: left; flex: 1;">
                <div class="home-card-title" style="font-size: 14px; color: #64748b; font-weight: 800;">1. Atendimento de Requisição (CD1409)</div>
                <div class="home-card-desc" style="color: #ef4444; font-weight: 700; font-size: 11.5px; margin-top: 2px;">Bloqueado</div>
              </div>
            </div>
          </button>
        `}

        ${podeDev ? `
          <button type="button" class="home-service-card is-active" onclick="App.navegar('requisicao_devolucao')" style="padding: 16px; border-left: 4px solid #7c3aed;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div class="home-card-icon-wrap icon-wrap-purple" style="font-size: 24px; width: 44px; height: 44px; display:flex; align-items:center; justify-content:center; background:#ede9fe; color:#6d28d9;">↩️</div>
              <div style="text-align: left; flex: 1;">
                <div class="home-card-title" style="font-size: 14px; color: #6d28d9; font-weight: 800;">2. Devolução de Requisição (CD1410)</div>
                <div class="home-card-desc" style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                  Consultar materiais atendidos em grid, selecionar o movimento de saída de origem e devolver ao estoque
                </div>
              </div>
              <div style="color: #6d28d9; font-weight: 800; font-size: 18px;">➔</div>
            </div>
          </button>
        ` : `
          <button type="button" class="home-service-card" style="padding: 16px; opacity: 0.55; cursor: not-allowed; border-color: #cbd5e1; background: #f8fafc;" onclick="App.bloquearAcesso('Devolução de Requisição (CD1410)', 'permEstoqReqDev')">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div class="home-card-icon-wrap" style="background:#f1f5f9; color:#94a3b8; font-size: 24px; width: 44px; height: 44px; display:flex; align-items:center; justify-content:center;">🔒</div>
              <div style="text-align: left; flex: 1;">
                <div class="home-card-title" style="font-size: 14px; color: #64748b; font-weight: 800;">2. Devolução de Requisição (CD1410)</div>
                <div class="home-card-desc" style="color: #ef4444; font-weight: 700; font-size: 11.5px; margin-top: 2px;">Bloqueado</div>
              </div>
            </div>
          </button>
        `}
      </div>
    `;
  }

  // =========================================================================
  // 2. ATENDIMENTO DE REQUISIÇÃO (CD1409) - FLUXO EM 2 TELAS
  // =========================================================================

  function agruparRequisicoes(listaItens) {
    const mapa = new Map();
    (listaItens || []).forEach(it => {
      const nr = Number(it.nrRequisicao);
      if (!mapa.has(nr)) {
        mapa.set(nr, {
          nrRequisicao: nr,
          dtRequisicao: it.dtRequisicao,
          nomeAbrev: it.nomeAbrev,
          itens: []
        });
      }
      mapa.get(nr).itens.push(it);
    });
    return Array.from(mapa.values());
  }

  async function renderTelaRequisicaoAtendimento(params = null) {
    const at = stateRequisicoes.atendimento;
    const codEstabel = state.session.codEstabel || '101';

    // Se estiver no modo detalhe com requisição selecionada, renderiza Tela 2
    if (at.telaSub === 'detalhe' && at.reqSelecionada) {
      renderizarTela2DetalheAtendimento();
      return;
    }

    // Tela 1: Grid de Requisições Abertas
    at.telaSub = 'lista';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('requisicoes_menu')">‹ Início</button>
        <div style="text-align: center;">
          <h3 style="font-size: 14.5px; font-weight: 800; margin: 0; color: #0284c7;">Atendimento de Requisição</h3>
          <span style="font-size: 11px; color: #64748b;">CD1409 • Filial ${escapeHtml(codEstabel)}</span>
        </div>
        <button class="btn-topbar-action" onclick="App.buscarRequisicoesAtendimento(document.getElementById('req-atend-input-busca')?.value || '', true)" title="Recarregar">🔄</button>
      </div>

      <!-- Barra de Busca Rápida -->
      <div style="display: flex; gap: 6px; margin-bottom: 8px;">
        <input type="text" id="req-atend-input-busca" class="form-input" style="font-size: 12.5px; flex: 1;"
               placeholder="Buscar por requisição, requisitante ou item..."
               value="${escapeHtml(at.termoBusca || '')}"
               onkeydown="if(event.key==='Enter') App.buscarRequisicoesAtendimento(this.value)">
        <button type="button" class="btn btn-primary" style="width: auto; padding: 0 12px; font-size: 12px; background: #0284c7; border-color: #0369a1;"
                onclick="App.buscarRequisicoesAtendimento(document.getElementById('req-atend-input-busca').value)">
          Buscar 🔍
        </button>
      </div>

      <!-- Barra de Controles: Ordenação por Data e Itens por Página -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 200px;">
          <span style="font-size: 11px; color: #64748b; font-weight: 700; white-space: nowrap;">Ordem:</span>
          <select class="form-input" style="font-size: 11.5px; padding: 3px 6px; height: 30px; font-weight: 600;"
                  onchange="App.onAlterarOrdemDataAtendimento(this.value)">
            <option value="desc" ${at.ordemData === 'desc' ? 'selected' : ''}>📅 Data: Mais recente ➔ Mais antiga (Maior para menor)</option>
            <option value="asc" ${at.ordemData === 'asc' ? 'selected' : ''}>📅 Data: Mais antiga ➔ Mais recente (Menor para maior)</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; color: #64748b; font-weight: 700; white-space: nowrap;">Exibir:</span>
          <select class="form-input" style="font-size: 11.5px; padding: 3px 6px; height: 30px; width: 85px; font-weight: 600;"
                  onchange="App.onAlterarItensPorPaginaAtendimento(this.value)">
            <option value="10" ${Number(at.itensPorPagina) === 10 ? 'selected' : ''}>10 por pág</option>
            <option value="25" ${Number(at.itensPorPagina) === 25 ? 'selected' : ''}>25 por pág</option>
            <option value="50" ${Number(at.itensPorPagina) === 50 ? 'selected' : ''}>50 por pág</option>
          </select>
        </div>
      </div>

      <!-- Status Offline se aplicável -->
      ${at.isOffline ? `
        <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 11.5px; color: #854d0e; display: flex; align-items: center; gap: 6px;">
          <span>📴</span>
          <span><strong>Modo Offline:</strong> Exibindo requisições armazenadas localmente em cache.</span>
        </div>
      ` : ''}

      <!-- Grid de Cards de Requisições Abertas -->
      <div id="req-atend-conteudo">
        <div class="card" style="text-align: center; color: #94a3b8; font-size: 12.5px; padding: 24px;">
          <div class="loading-spinner" style="margin: 0 auto 10px;"></div>
          Consultando requisições em aberto...
        </div>
      </div>
    `;

    // Carrega dados se lista estiver vazia ou força busca
    if (!at.listaItens || at.listaItens.length === 0) {
      await buscarRequisicoesAtendimento(at.termoBusca);
    } else {
      renderizarGridListaAtendimento();
    }
  }

  async function buscarRequisicoesAtendimento(termo = '', forcarOnline = false) {
    const at = stateRequisicoes.atendimento;
    at.termoBusca = termo || '';
    const codEstabel = (state.session.codEstabel || '101').trim();
    const codEmpresa = state.session.codEmpresa || '001';

    const cont = document.getElementById('req-atend-conteudo');
    if (cont) {
      cont.innerHTML = `
        <div style="text-align:center; padding: 30px; color: #64748b;">
          <div class="loading-spinner" style="margin: 0 auto 10px;"></div>
          <div style="font-size: 13px; font-weight: 600;">Consultando requisições no ERP TOTVS (fcGetRequisicao)...</div>
        </div>
      `;
    }

    const termoLimpo = (at.termoBusca || '').trim();
    const nrBusca = termoLimpo && /^\d+$/.test(termoLimpo.replace(/\D/g, '')) ? Number(termoLimpo.replace(/\D/g, '')) : null;

    let dadosCarregados = null;
    let offline = false;

    // Tentar consulta online se dispositivo conectado e não estiver simulando offline
    if (isOnline()) {
      mostrarLoading('Consultando ERP TOTVS', 'Buscando requisições no PASOE Datasul... Aguarde.');
      const payloadItem = {
        nrReqIni: nrBusca !== null ? nrBusca : 0,
        nrReqFim: nrBusca !== null ? nrBusca : 0,
        estabIni: '',
        estabFim: '',
        requisitanteIni: '',
        requisitanteFim: ''
      };

      try {
        const res = await pasoeFetch('/fcGetRequisicao', {
          method: 'PUT',
          body: JSON.stringify({ payload: [payloadItem] })
        });
        const data = await res.json();
        dadosCarregados = extrairLista(data);
        // Salva cache local no IndexedDB para uso offline
        if (dadosCarregados && dadosCarregados.length > 0) {
          await DB.putConfig('cache_requisicoes_atend_' + codEmpresa, dadosCarregados);

          // Popula também a store 'saldo_estoq' no IndexedDB com os saldos trazidos em cada item
          const saldosParaGravar = [];
          dadosCarregados.forEach(it => {
            if (Array.isArray(it.saldosEstoque) && it.saldosEstoque.length > 0) {
              it.saldosEstoque.forEach(s => {
                saldosParaGravar.push({
                  codEmpresa,
                  codEstabel: s.codEstabel || it.codEstabel || state.session.codEstabel || '101',
                  codDepos: s.codDepos || s.codDep || '',
                  codLocaliz: s.codLocaliz || s.codLocal || '',
                  lote: s.lote || '',
                  codRefer: s.codRefer || '',
                  itCodigo: s.itCodigo || it.itCodigo,
                  qtDisponivel: Number(s.qtDisponivel || 0),
                  dtValiLote: s.dtValiLote || ''
                });
              });
            }
          });
          if (saldosParaGravar.length > 0) {
            await DB.bulkPut('saldo_estoq', saldosParaGravar, codEmpresa, 100);
          }
        }
      } catch (err) {
        console.warn('Falha na consulta online de fcGetRequisicao. Tentando cache offline:', err.message);
      } finally {
        ocultarLoading();
      }
    }

    // Se falhou online ou dispositivo offline, recupera do cache local
    if (!dadosCarregados) {
      const emCache = await DB.getConfig('cache_requisicoes_atend_' + codEmpresa);
      if (emCache && emCache.length > 0) {
        dadosCarregados = emCache;
        offline = true;
      } else {
        dadosCarregados = [];
      }
    }

    at.listaItens = dadosCarregados;
    at.isOffline = offline;

    renderizarGridListaAtendimento();
  }

  function renderizarGridListaAtendimento() {
    const at = stateRequisicoes.atendimento;
    const cont = document.getElementById('req-atend-conteudo');
    if (!cont) return;

    let lista = at.listaItens || [];

    // Filtro client-side se termo foi digitado
    if (at.termoBusca) {
      const t = at.termoBusca.trim().toLowerCase();
      const tDig = at.termoBusca.replace(/\D/g, '');
      lista = lista.filter(it =>
        (tDig && String(it.nrRequisicao).includes(tDig)) ||
        String(it.itCodigo).toLowerCase().includes(t) ||
        String(it.descItem || '').toLowerCase().includes(t) ||
        String(it.nomeAbrev || '').toLowerCase().includes(t)
      );
    }

    if (lista.length === 0) {
      cont.innerHTML = `
        <div class="card" style="text-align: center; color: #64748b; padding: 24px;">
          <div style="font-size: 26px; margin-bottom: 8px;">📭</div>
          <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">Nenhuma requisição aberta encontrada</div>
          <div style="font-size: 12px; color: #64748b;">
            ${at.termoBusca ? 'Nenhum resultado para o filtro informado.' : 'Não há requisições de estoque aprovadas com saldo a atender nesta filial.'}
          </div>
        </div>
      `;
      return;
    }

    const reqsAgrupadas = agruparRequisicoes(lista);

    // Ordenação por data (maior para menor = mais recente primeiro, ou menor para maior)
    reqsAgrupadas.sort((a, b) => {
      const dtA = String(a.dtRequisicao || '').trim();
      const dtB = String(b.dtRequisicao || '').trim();
      const cmp = dtA.localeCompare(dtB);
      if (cmp !== 0) {
        return at.ordemData === 'asc' ? cmp : -cmp;
      }
      return at.ordemData === 'asc' ? (Number(a.nrRequisicao) - Number(b.nrRequisicao)) : (Number(b.nrRequisicao) - Number(a.nrRequisicao));
    });

    // Paginação: 10, 25 ou 50 por página
    const totalRegistros = reqsAgrupadas.length;
    const itensPorPagina = Number(at.itensPorPagina) || 10;
    const totalPaginas = Math.ceil(totalRegistros / itensPorPagina) || 1;
    if (at.paginaAtual > totalPaginas) at.paginaAtual = totalPaginas;
    if (at.paginaAtual < 1) at.paginaAtual = 1;

    const idxInicio = (at.paginaAtual - 1) * itensPorPagina;
    const idxFim = Math.min(idxInicio + itensPorPagina, totalRegistros);
    const reqsPaginadas = reqsAgrupadas.slice(idxInicio, idxFim);

    cont.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 12px; font-weight: 700; color: #475569;">
          ${totalRegistros} requisição(ões) encontrada(s) • Pág ${at.paginaAtual}/${totalPaginas}:
        </span>
        <span style="font-size: 11px; color: #64748b;">Exibindo ${idxInicio + 1} a ${idxFim}</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${reqsPaginadas.map(r => {
          let saldoTotalReq = 0;
          r.itens.forEach(it => { saldoTotalReq += Number(it.qtAAtender || 0); });

          return `
            <div class="card" style="margin: 0; padding: 12px; border-left: 4px solid #0284c7; cursor: pointer; transition: all 0.15s; background: #ffffff;"
                 onclick="App.abrirDetalheRequisicaoAtendimento(${r.nrRequisicao})">
              <!-- Header do Card -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 17px;">📥</span>
                  <strong style="color: #0284c7; font-size: 15px; font-weight: 800;">
                    Req. #${r.nrRequisicao}
                  </strong>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 11.5px; color: #64748b; font-weight: 600;">📅 ${formatarDataBr(r.dtRequisicao)}</span>
                  <span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700; font-size: 10px;">Aberta</span>
                </div>
              </div>

              <!-- Requisitante -->
              <div style="font-size: 12px; color: #334155; margin-bottom: 6px;">
                <span style="color: #64748b;">Requisitante:</span>
                <strong>${escapeHtml(r.nomeAbrev || '-')}</strong>
              </div>

              <!-- Prévia dos Itens -->
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 4px; font-weight: 700;">
                  <span>Itens da Requisição (${r.itens.length}):</span>
                  <span>Saldo a Atender</span>
                </div>
                ${r.itens.slice(0, 3).map(it => `
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; padding: 2px 0;">
                    <div style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px;">
                      <strong style="color: #0f172a;">${escapeHtml(it.itCodigo)}</strong>
                      <span style="color: #64748b;"> - ${escapeHtml(it.descItem || '')}</span>
                    </div>
                    <strong style="color: #d97706; font-size: 12px;">${Number(it.qtAAtender).toFixed(4)}</strong>
                  </div>
                `).join('')}
                ${r.itens.length > 3 ? `
                  <div style="font-size: 10.5px; color: #0284c7; text-align: center; margin-top: 4px; font-weight: 600;">
                    + ${r.itens.length - 3} outro(s) item(ns)...
                  </div>
                ` : ''}
              </div>

              <!-- Rodapé do Card com Ação -->
              <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 4px;">
                <div style="font-size: 11px; color: #64748b;">
                  Saldo Total: <strong style="color: #0284c7; font-size: 12.5px;">${saldoTotalReq.toFixed(4)}</strong>
                </div>
                <button type="button" class="btn btn-primary"
                        style="width: auto; padding: 6px 14px; font-size: 12px; font-weight: 800; background: #0284c7; border-color: #0369a1;"
                        onclick="event.stopPropagation(); App.abrirDetalheRequisicaoAtendimento(${r.nrRequisicao})">
                  Atender ➔
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Barra Inferior de Paginação -->
      ${totalPaginas > 1 ? `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding: 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: #475569;">
            <div>Exibindo <strong>${idxInicio + 1} - ${idxFim}</strong> de <strong>${totalRegistros}</strong> requisições</div>
            <div>Página <strong>${at.paginaAtual}</strong> de <strong>${totalPaginas}</strong></div>
          </div>
          <div style="display: flex; justify-content: center; align-items: center; gap: 6px;">
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 11px;"
                    ${at.paginaAtual <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                    onclick="App.mudarPaginaAtendimento(1)">
              ⏮ Primeira
            </button>
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 10px; font-size: 11px;"
                    ${at.paginaAtual <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                    onclick="App.mudarPaginaAtendimento(${at.paginaAtual - 1})">
              ◀ Ant.
            </button>
            <span style="font-size: 12px; font-weight: 800; padding: 0 8px; color: #0284c7;">
              ${at.paginaAtual} / ${totalPaginas}
            </span>
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 10px; font-size: 11px;"
                    ${at.paginaAtual >= totalPaginas ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                    onclick="App.mudarPaginaAtendimento(${at.paginaAtual + 1})">
              Próx. ▶
            </button>
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 11px;"
                    ${at.paginaAtual >= totalPaginas ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                    onclick="App.mudarPaginaAtendimento(${totalPaginas})">
              Última ⏭
            </button>
          </div>
        </div>
      ` : ''}
    `;
  }

  // Abertura da Tela 2 de Detalhes
  function abrirDetalheRequisicaoAtendimento(nrRequisicao) {
    const at = stateRequisicoes.atendimento;
    const reqsAgrupadas = agruparRequisicoes(at.listaItens);
    const req = reqsAgrupadas.find(r => Number(r.nrRequisicao) === Number(nrRequisicao));
    if (!req) return;

    at.reqSelecionada = req;
    // Seleciona o primeiro item com saldo a atender ou o primeiro
    at.itemSelecionado = (req.itens && req.itens.length > 0)
      ? (req.itens.find(i => Number(i.qtAAtender) > 0) || req.itens[0])
      : null;
    at.saldosEstoque = [];
    at.quantidadesInformadas = {};
    at.telaSub = 'detalhe';

    renderTelaRequisicaoAtendimento();

    if (at.itemSelecionado) {
      consultarSaldosItemAtendimento(at.itemSelecionado.itCodigo);
    }
  }


  function onAlterarOrdemDataAtendimento(valor) {
    const at = stateRequisicoes.atendimento;
    at.ordemData = valor || 'desc';
    at.paginaAtual = 1;
    renderizarGridListaAtendimento();
  }

  function onAlterarItensPorPaginaAtendimento(valor) {
    const at = stateRequisicoes.atendimento;
    at.itensPorPagina = Number(valor) || 10;
    at.paginaAtual = 1;
    renderizarGridListaAtendimento();
  }

  function mudarPaginaAtendimento(pagina) {
    const at = stateRequisicoes.atendimento;
    at.paginaAtual = Number(pagina) || 1;
    renderizarGridListaAtendimento();
    document.getElementById('req-atend-conteudo')?.scrollIntoView({ behavior: 'smooth' });
  }

  function voltarListaRequisicoesAtendimento() {
    const at = stateRequisicoes.atendimento;
    at.telaSub = 'lista';
    renderTelaRequisicaoAtendimento();
  }

  // TELA 2: DETALHES DA REQUISIÇÃO, ITENS E SALDOS EM ESTOQUE
  function renderizarTela2DetalheAtendimento() {
    const at = stateRequisicoes.atendimento;
    const reqAtual = at.reqSelecionada;
    const itemAtual = at.itemSelecionado;
    const itensReq = reqAtual.itens || [];
    const codEstabel = state.session.codEstabel || '101';

    container.innerHTML = `
      <!-- Topbar com botão voltar para a lista de requisições -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.voltarListaRequisicoesAtendimento()" style="color: #0284c7; font-weight: 700;">
          ‹ Lista de Requisições
        </button>
        <div style="text-align: center;">
          <h3 style="font-size: 14.5px; font-weight: 800; margin: 0; color: #0284c7;">Req. #${reqAtual.nrRequisicao}</h3>
          <span style="font-size: 11px; color: #64748b;">CD1409 • Filial ${escapeHtml(codEstabel)}</span>
        </div>
        <button class="btn-topbar-action" onclick="App.recarregarSaldosItemAtendimento()" title="Recarregar Saldos">🔄</button>
      </div>

      <!-- Cabeçalho Oficial CD1409 -->
      <div class="card" style="margin-bottom: 12px; border-left: 4px solid #0284c7; padding: 12px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <div>
            <span style="color: #64748b;">Requisição:</span>
            <strong style="color: #0284c7; font-size: 14.5px; margin-left: 4px;">${escapeHtml(String(reqAtual.nrRequisicao))}</strong>
          </div>
          <div>
            <span style="color: #64748b;">Data Req:</span>
            <strong style="margin-left: 4px;">${formatarDataBr(reqAtual.dtRequisicao)}</strong>
          </div>
          <div>
            <span style="color: #64748b;">Requisitante:</span>
            <strong style="margin-left: 4px;">${escapeHtml(reqAtual.nomeAbrev || '-')}</strong>
          </div>
          <div>
            <span style="color: #64748b;">Situação:</span>
            <span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; font-weight:700; margin-left: 4px;">Aberta</span>
          </div>
        </div>
      </div>

      <!-- Grid Superior: Itens da Requisição -->
      <div style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 12.5px; font-weight: 700; color: #1e293b;">1. Itens da Requisição (Selecione para ver saldos):</span>
          <span style="font-size: 11px; color: #64748b;">${itensReq.length} item(ns)</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${itensReq.map(it => {
            const seqIt = it.Sequencia ?? it.sequencia ?? it.nrSequencia ?? 1;
            const seqAtual = itemAtual ? (itemAtual.Sequencia ?? itemAtual.sequencia ?? itemAtual.nrSequencia ?? 1) : null;
            const isSel = itemAtual && Number(seqAtual) === Number(seqIt) && String(itemAtual.itCodigo).trim() === String(it.itCodigo).trim();
            return `
              <div onclick="App.onSelecionarItemAtendimento('${seqIt}', '${it.itCodigo}')"
                   style="border: 1.5px solid ${isSel ? '#0284c7' : '#e2e8f0'}; background: ${isSel ? '#f0f9ff' : '#ffffff'}; border-radius: 8px; padding: 10px; cursor: pointer; transition: all 0.15s;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div style="flex: 1;">
                    <div style="font-size: 13px; font-weight: 800; color: ${isSel ? '#0369a1' : '#1e293b'};">
                      Seq ${seqIt} • ${escapeHtml(it.itCodigo)}
                    </div>
                    <div style="font-size: 11.5px; color: #475569; margin-top: 1px;">
                      ${escapeHtml(it.descItem || '')}
                    </div>
                  </div>
                  ${isSel ? '<span class="badge" style="background:#0284c7; color:#ffffff; font-size: 10px; font-weight:700;">SELECIONADO</span>' : ''}
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; font-size: 11px; margin-top: 8px; background: ${isSel ? '#e0f2fe' : '#f8fafc'}; padding: 6px; border-radius: 6px;">
                  <div>Requisitado: <strong>${Number(it.qtRequisitada).toFixed(4)}</strong></div>
                  <div>Atendido: <strong>${Number(it.qtAtendida).toFixed(4)}</strong></div>
                  <div>Saldo a Atender: <strong style="color: #d97706; font-size: 12px;">${Number(it.qtAAtender).toFixed(4)}</strong></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Grid Inferior: Saldos em Estoque do Item Selecionado -->
      <div id="painel-saldos-estoque">
        ${renderizarGridSaldosEstoque()}
      </div>
    `;
  }

  function renderizarGridSaldosEstoque() {
    const at = stateRequisicoes.atendimento;
    const itemAtual = at.itemSelecionado;
    if (!itemAtual) return '';

    if (at.carregandoSaldos) {
      return `
        <div class="card" style="text-align: center; padding: 20px; color: #64748b;">
          <div class="loading-spinner" style="margin: 0 auto 8px;"></div>
          <div style="font-size: 12.5px;">Consultando saldos em estoque do item...</div>
        </div>
      `;
    }

    const saldos = at.saldosEstoque || [];
    let totalInformado = 0;
    saldos.forEach((s, idx) => {
      totalInformado += Number(at.quantidadesInformadas[idx] || 0);
    });

    return `
      <div style="margin-bottom: 14px;">
        ${!isOnline() ? `
          <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; color: #854d0e; display: flex; align-items: center; gap: 6px;">
            <span>📴</span>
            <span><strong>Modo Offline:</strong> Exibindo saldos de estoque em cache local.</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 12.5px; font-weight: 700; color: #1e293b;">
            2. Saldos em Estoque (Item: ${escapeHtml(itemAtual.itCodigo)}):
          </span>
          <span style="font-size: 11px; color: #0284c7; font-weight: 700;">
            Saldo a Atender: ${Number(itemAtual.qtAAtender).toFixed(4)}
          </span>
        </div>

        ${saldos.length > 0 && at.origemSaldo === 'cache' ? `
          <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; color: #854d0e; display: flex; align-items: center; gap: 6px;">
            <span>📴</span>
            <span><strong>Modo Offline:</strong> Exibindo saldo do estoque em cache local.</span>
          </div>
        ` : ''}

        ${saldos.length === 0 ? `
          <div class="card" style="text-align: center; color: #ef4444; font-size: 12px; padding: 16px; background: #fef2f2; border: 1px solid #fecaca;">
            ⚠️ Nenhum saldo disponível encontrado no estoque para este item nesta filial.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${saldos.map((s, idx) => {
              const qtdAtual = at.quantidadesInformadas[idx] || 0;
              return `
                <div class="card" style="padding: 10px; border-left: 3px solid #10b981; margin: 0;">
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 6px;">
                    <div>
                      Depósito: <strong style="color: #0f172a; font-size: 13px;">${escapeHtml(s.codDepos)}</strong>
                      ${s.codLocaliz ? ` • Local: <strong>${escapeHtml(s.codLocaliz)}</strong>` : ''}
                    </div>
                    <div>
                      Saldo Disp: <strong style="color: #15803d; font-size: 13.5px;">${Number(s.qtDisponivel).toFixed(4)}</strong>
                    </div>
                  </div>

                  ${(s.lote || s.codRefer) ? `
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
                      ${s.lote ? `Lote: <strong>${escapeHtml(s.lote)}</strong> (Val: ${s.dtValiLote ? formatarDataBr(s.dtValiLote) : '-'})` : ''}
                      ${s.codRefer ? ` • Ref: <strong>${escapeHtml(s.codRefer)}</strong>` : ''}
                    </div>
                  ` : ''}

                  <!-- Input da Quantidade a Retirar deste Saldo -->
                  <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                    <span style="font-size: 11.5px; color: #475569; font-weight: 600;">Qtd a Atender:</span>
                    <input type="number" step="0.0001" min="0" max="${s.qtDisponivel}"
                           id="qtd-atend-saldo-${idx}" class="form-input" style="width: 110px; font-size: 13px; font-weight: 700; text-align: right;"
                           value="${qtdAtual || ''}" placeholder="0,0000"
                           oninput="App.onAlterarQtdAtendimento(${idx}, this.value)">
                    <button type="button" class="btn btn-secondary" style="width: auto; padding: 0 10px; font-size: 11px;"
                            onclick="App.preencherAtendimentoTudo(${idx})">
                      Preencher Saldo
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- Rodapé / Ação de Efetivação CD1409 -->
      <div class="card" style="margin-top: 14px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 10px;">
          <div>
            <span style="color: #64748b;">Saldo a Atender:</span>
            <strong style="color: #0f172a; margin-left: 4px;">${Number(itemAtual.qtAAtender).toFixed(4)}</strong>
          </div>
          <div>
            <span style="color: #64748b;">Total Informado:</span>
            <strong style="color: ${totalInformado > itemAtual.qtAAtender ? '#ef4444' : '#0284c7'}; font-size: 13px; margin-left: 4px;">
              ${totalInformado.toFixed(4)}
            </strong>
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label class="form-label" style="font-size: 11.5px;">Data Atendimento:</label>
          <input type="date" id="input-dt-atend" class="form-input" style="font-size: 12.5px;" value="${at.dataAtend}">
        </div>

        <button type="button" class="btn btn-primary" onclick="App.executarAtendimentoRequisicao()"
                style="width: 100%; padding: 12px; font-size: 14px; font-weight: 800; background: #0284c7; border-color: #0369a1;">
          Atende (Efetivar CD1409) ➔
        </button>
      </div>
    `;
  }

  function onTrocarRequisicaoAtendimento(nrRequisicao) {
    abrirDetalheRequisicaoAtendimento(nrRequisicao);
  }

  function onSelecionarItemAtendimento(sequencia, itCodigo) {
    const at = stateRequisicoes.atendimento;
    const item = (at.reqSelecionada?.itens || []).find(it => {
      const s = it.Sequencia ?? it.sequencia ?? it.nrSequencia ?? 1;
      return Number(s) === Number(sequencia) && String(it.itCodigo).trim() === String(itCodigo).trim();
    });
    if (item) {
      at.itemSelecionado = item;
      at.saldosEstoque = [];
      at.quantidadesInformadas = {};
      renderizarTela2DetalheAtendimento();
      consultarSaldosItemAtendimento(item.itCodigo);
    }
  }

  function recarregarSaldosItemAtendimento() {
    const at = stateRequisicoes.atendimento;
    if (at.itemSelecionado) {
      consultarSaldosItemAtendimento(at.itemSelecionado.itCodigo);
    }
  }

  async function consultarSaldosItemAtendimento(itCodigo) {
    const at = stateRequisicoes.atendimento;
    at.carregandoSaldos = true;
    const contSaldos = document.getElementById('painel-saldos-estoque');
    if (contSaldos) contSaldos.innerHTML = renderizarGridSaldosEstoque();

    const codEstabel = (state.session.codEstabel || '101').trim();
    const codEmpresa = state.session.codEmpresa || '001';

    let saldosEncontrados = null;
    let origem = 'online';

    // Se online, tenta buscar do ERP (saldo atualizado em tempo real)
    if (isOnline()) {
      const payload = {
        codEstabel,
        itCodigo,
        payload: [{ codEstabel, itCodigo }]
      };
      try {
        const res = await pasoeFetch('/fcGetSaldoEstoqEstabItem', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const listaOnline = extrairLista(data);
        if (listaOnline && listaOnline.length > 0) {
          saldosEncontrados = listaOnline;
          origem = 'online';

          // Atualiza também na base local do IndexedDB e no item para persistência offline
          try {
            await DB.bulkPut('saldo_estoq', listaOnline.map(s => ({
              codEmpresa,
              codEstabel: s.codEstabel || codEstabel,
              codDepos: s.codDepos || s.codDep || '',
              codLocaliz: s.codLocaliz || s.codLocal || '',
              lote: s.lote || '',
              codRefer: s.codRefer || '',
              itCodigo: s.itCodigo || itCodigo,
              qtDisponivel: Number(s.qtDisponivel || 0),
              dtValiLote: s.dtValiLote || ''
            })), codEmpresa, 50);

            if (at.itemSelecionado) {
              at.itemSelecionado.saldosEstoque = listaOnline;
            }
          } catch (ePut) {
            console.warn('Erro ao atualizar saldos no IndexedDB:', ePut.message);
          }
        }
      } catch (err) {
        console.warn('Falha na consulta online de saldos. Tentando base local:', err.message);
      }
    }

    // Se offline ou consulta online vazia/falhou, busca do cache local:
    if (!saldosEncontrados || saldosEncontrados.length === 0) {
      origem = 'cache';

      // 1ª opção de cache: verificar no array 'saldosEstoque' do próprio item selecionado (trazido na fcGetRequisicao)
      if (at.itemSelecionado && Array.isArray(at.itemSelecionado.saldosEstoque) && at.itemSelecionado.saldosEstoque.length > 0) {
        saldosEncontrados = at.itemSelecionado.saldosEstoque
          .map(s => ({
            codEstabel: s.codEstabel || codEstabel,
            codDepos: s.codDepos || s.codDep || '',
            codLocaliz: s.codLocaliz || s.codLocal || '',
            lote: s.lote || '',
            codRefer: s.codRefer || '',
            itCodigo: s.itCodigo || itCodigo,
            qtDisponivel: Number(s.qtDisponivel || 0),
            dtValiLote: s.dtValiLote || ''
          }))
          .filter(s => s.qtDisponivel > 0);
      }

      // 2ª opção de cache: consultar na store 'saldo_estoq' do IndexedDB
      if (!saldosEncontrados || saldosEncontrados.length === 0) {
        try {
          const saldosLocais = await DB.consultarSaldoEstoqueItem(codEmpresa, codEstabel, itCodigo);
          if (saldosLocais && saldosLocais.length > 0) {
            saldosEncontrados = saldosLocais;
          }
        } catch (eLocal) {
          console.warn('Erro ao consultar saldos no IndexedDB local:', eLocal.message);
        }
      }
    }

    at.saldosEstoque = saldosEncontrados || [];
    at.origemSaldo = origem;
    at.carregandoSaldos = false;
    if (contSaldos) contSaldos.innerHTML = renderizarGridSaldosEstoque();
  }

  function onAlterarQtdAtendimento(idx, valor) {
    const at = stateRequisicoes.atendimento;
    const val = parseFloat(valor) || 0;
    at.quantidadesInformadas[idx] = val;
    const contSaldos = document.getElementById('painel-saldos-estoque');
    if (contSaldos) contSaldos.innerHTML = renderizarGridSaldosEstoque();
  }

  function preencherAtendimentoTudo(idx) {
    const at = stateRequisicoes.atendimento;
    const saldo = at.saldosEstoque[idx];
    const item = at.itemSelecionado;
    if (!saldo || !item) return;

    let outros = 0;
    Object.keys(at.quantidadesInformadas).forEach(k => {
      if (Number(k) !== idx) outros += Number(at.quantidadesInformadas[k] || 0);
    });

    const saldoNecessario = Math.max(0, item.qtAAtender - outros);
    const qtdAtribuir = Math.min(saldo.qtDisponivel, saldoNecessario);

    at.quantidadesInformadas[idx] = qtdAtribuir;
    const contSaldos = document.getElementById('painel-saldos-estoque');
    if (contSaldos) contSaldos.innerHTML = renderizarGridSaldosEstoque();
  }

  async function executarAtendimentoRequisicao() {
    const at = stateRequisicoes.atendimento;
    const req = at.reqSelecionada;
    const it = at.itemSelecionado;
    const codEmpresa = state.session.codEmpresa || '001';

    if (!req || !it) {
      alert('Selecione uma requisição e um item para atender.');
      return;
    }

    const inputDt = document.getElementById('input-dt-atend');
    if (inputDt) at.dataAtend = inputDt.value;

    const linhasEstoque = [];
    let totalInformado = 0;

    (at.saldosEstoque || []).forEach((saldo, idx) => {
      const val = Number(at.quantidadesInformadas[idx] || 0);
      if (val > 0) {
        if (val > saldo.qtDisponivel) {
          throw new Error(`Quantidade a atender (${val}) excede o saldo disponível (${saldo.qtDisponivel}) no depósito ${saldo.codDepos}.`);
        }
        totalInformado += val;
        linhasEstoque.push({
          codEstabel: saldo.codEstabel || state.session.codEstabel || '101',
          codDepos: saldo.codDepos,
          codLocaliz: saldo.codLocaliz || '',
          lote: saldo.lote || '',
          codRefer: saldo.codRefer || '',
          itCodigo: it.itCodigo,
          qtAAtender: val
        });
      }
    });

    if (linhasEstoque.length === 0 || totalInformado <= 0) {
      alert('Informe a quantidade a atender em pelo menos uma linha de saldo disponível.');
      return;
    }

    if (totalInformado > it.qtAAtender) {
      alert(`Quantidade total informada (${totalInformado}) não pode ser maior que o saldo a atender da requisição (${it.qtAAtender}).`);
      return;
    }

    const nrReq = parseInt(req.nrRequisicao || req.nrRequis || 0, 10);
    const itCod = String(it.itCodigo || '').trim();
    const seq = parseInt(it.Sequencia ?? it.sequencia ?? it.nrSequencia ?? 1, 10);
    const usr = state.session.codUsuario || 'operador';

    const payloadItem = {
      nrRequisicao: nrReq,
      itCodigo: itCod,
      sequencia: seq,
      codUsuario: usr,
      estoque: linhasEstoque
    };

    const payload = {
      payload: [payloadItem],
      ...payloadItem
    };

    // Fluxo ONLINE
    if (isOnline()) {
      mostrarLoading('Atendendo Requisição no TOTVS...', 'Executando fcSetRequisicao.p / ceapi001k...');
      try {
        const res = await pasoeFetch('/fcSetRequisicao', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        ocultarLoading();

        if (data.type === 'ERROR' || data.code === '17006' || res.status >= 400) {
          alert('❌ Erro no Atendimento TOTVS:\n\n' + (data.detailedMessage || data.message || 'Falha ao atender requisição.'));
          return;
        }

        // Abate o saldo no IndexedDB local para manter consistência
        for (const linha of linhasEstoque) {
          await DB.abaterSaldoEstoqueLocal(codEmpresa, {
            codEstabel: linha.codEstabel,
            codDepos: linha.codDepos,
            codLocaliz: linha.codLocaliz,
            lote: linha.lote,
            codRefer: linha.codRefer,
            itCodigo: linha.itCodigo,
            quantidade: linha.qtAAtender
          });
        }

        // Atualiza quantidades locais da requisição
        it.qtAAtender = Math.max(0, it.qtAAtender - totalInformado);
        it.qtAtendida = Number(it.qtAtendida || 0) + totalInformado;

        alert('✅ Atendimento efetuado com sucesso no Datasul!\n\nRequisição: ' + req.nrRequisicao + '\nItem: ' + it.itCodigo + '\nQuantidade atendida: ' + totalInformado);

        // Se o item foi atendido por completo, volta para a lista
        if (it.qtAAtender <= 0) {
          await buscarRequisicoesAtendimento(at.termoBusca, true);
          at.telaSub = 'lista';
          renderTelaRequisicaoAtendimento();
        } else {
          at.quantidadesInformadas = {};
          consultarSaldosItemAtendimento(it.itCodigo);
        }
        return;
      } catch (err) {
        ocultarLoading();
        console.warn('Falha na comunicação ao tentar atender online:', err.message);
        if (!confirm('Falha de conexão com o TOTVS. Deseja registrar este atendimento na fila OFFLINE para sincronização posterior?')) {
          return;
        }
      }
    }

    // Fluxo OFFLINE
    try {
      await DB.adicionarFilaSync('ATENDIMENTO_REQUISICAO', payload, codEmpresa);

      // Abate do saldo local no IndexedDB
      for (const linha of linhasEstoque) {
        await DB.abaterSaldoEstoqueLocal(codEmpresa, {
          codEstabel: linha.codEstabel,
          codDepos: linha.codDepos,
          codLocaliz: linha.codLocaliz,
          lote: linha.lote,
          codRefer: linha.codRefer,
          itCodigo: linha.itCodigo,
          quantidade: linha.qtAAtender
        });
      }

      // Atualiza o item localmente em cache
      it.qtAAtender = Math.max(0, it.qtAAtender - totalInformado);
      it.qtAtendida = Number(it.qtAtendida || 0) + totalInformado;

      // Abate também do array saldosEstoque do próprio item em cache se existir
      if (Array.isArray(it.saldosEstoque)) {
        linhasEstoque.forEach(lin => {
          const sObj = it.saldosEstoque.find(s =>
            (s.codDepos || s.codDep) === lin.codDepos &&
            (s.codLocaliz || s.codLocal || '') === (lin.codLocaliz || '') &&
            (s.lote || '') === (lin.lote || '') &&
            (s.codRefer || '') === (lin.codRefer || '')
          );
          if (sObj) {
            sObj.qtDisponivel = Math.max(0, Number(sObj.qtDisponivel || 0) - Number(lin.qtAAtender || 0));
          }
        });
      }

      await DB.putConfig('cache_requisicoes_atend_' + codEmpresa, at.listaItens);

      alert('✅ Atendimento registrado com sucesso em MODO OFFLINE!\n\nRequisição: ' + req.nrRequisicao + '\nItem: ' + it.itCodigo + '\nQuantidade: ' + totalInformado + '\n\nO movimento foi salvo na fila de sincronização e o saldo local já foi abatido.');

      at.telaSub = 'lista';
      renderTelaRequisicaoAtendimento();
    } catch (eOffline) {
      alert('❌ Erro ao salvar atendimento offline: ' + eOffline.message);
    }
  }

  // =========================================================================
  // 3. DEVOLUÇÃO DE REQUISIÇÃO (CD1410) - FLUXO EM 2 TELAS
  // =========================================================================

  async function renderTelaRequisicaoDevolucao(params = null) {
    const dev = stateRequisicoes.devolucao;
    const codEstabel = state.session.codEstabel || '101';

    // Se estiver no modo detalhe com requisição selecionada, renderiza Tela 2
    if (dev.telaSub === 'detalhe' && dev.reqSelecionada) {
      renderizarTela2DetalheDevolucao();
      return;
    }

    // Tela 1: Grid de Requisições com Saldo a Devolver
    dev.telaSub = 'lista';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('requisicoes_menu')">‹ Início</button>
        <div style="text-align: center;">
          <h3 style="font-size: 14.5px; font-weight: 800; margin: 0; color: #7c3aed;">Devolução de Requisição</h3>
          <span style="font-size: 11px; color: #64748b;">CD1410 • Filial ${escapeHtml(codEstabel)}</span>
        </div>
        <button class="btn-topbar-action" onclick="App.buscarRequisicoesDevolucao(document.getElementById('req-devol-input-busca')?.value || '', true)" title="Recarregar">🔄</button>
      </div>

      <!-- Barra de Filtros: Data de Corte e Busca -->
      <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 0 0 145px;">
          <label style="font-size: 11px; font-weight: 700; color: #6d28d9; display: block; margin-bottom: 2px;">Data Corte (≥):</label>
          <input type="date" id="req-devol-input-dtcorte" class="form-input" style="font-size: 12px; padding: 4px 6px; height: 34px;"
                 value="${dev.dtCorte || ''}"
                 onchange="App.onAlterarDtCorteDevolucao(this.value)">
        </div>
        <div style="flex: 1; min-width: 170px;">
          <label style="font-size: 11px; font-weight: 700; color: #475569; display: block; margin-bottom: 2px;">Buscar:</label>
          <input type="text" id="req-devol-input-busca" class="form-input" style="font-size: 12.5px; height: 34px;"
                 placeholder="Buscar por requisição, requisitante ou item..."
                 value="${escapeHtml(dev.termoBusca || '')}"
                 onkeydown="if(event.key==='Enter') App.buscarRequisicoesDevolucao(this.value)">
        </div>
        <button type="button" class="btn btn-primary" style="width: auto; padding: 0 14px; height: 34px; font-size: 12px; background: #7c3aed; border-color: #6d28d9;"
                onclick="App.buscarRequisicoesDevolucao(document.getElementById('req-devol-input-busca').value)">
          Buscar 🔍
        </button>
      </div>

      <!-- Barra de Controles: Ordenação por Data e Itens por Página -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; background: #faf5ff; border: 1px solid #ede9fe; border-radius: 8px; padding: 6px 10px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 200px;">
          <span style="font-size: 11px; color: #6d28d9; font-weight: 700; white-space: nowrap;">Ordem:</span>
          <select class="form-input" style="font-size: 11.5px; padding: 3px 6px; height: 30px; font-weight: 600;"
                  onchange="App.onAlterarOrdemDataDevolucao(this.value)">
            <option value="desc" ${dev.ordemData === 'desc' ? 'selected' : ''}>📅 Data: Mais recente ➔ Mais antiga (Maior para menor)</option>
            <option value="asc" ${dev.ordemData === 'asc' ? 'selected' : ''}>📅 Data: Mais antiga ➔ Mais recente (Menor para maior)</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; color: #6d28d9; font-weight: 700; white-space: nowrap;">Exibir:</span>
          <select class="form-input" style="font-size: 11.5px; padding: 3px 6px; height: 30px; width: 85px; font-weight: 600;"
                  onchange="App.onAlterarItensPorPaginaDevolucao(this.value)">
            <option value="10" ${Number(dev.itensPorPagina) === 10 ? 'selected' : ''}>10 por pág</option>
            <option value="25" ${Number(dev.itensPorPagina) === 25 ? 'selected' : ''}>25 por pág</option>
            <option value="50" ${Number(dev.itensPorPagina) === 50 ? 'selected' : ''}>50 por pág</option>
          </select>
        </div>
      </div>

      <!-- Status Offline se aplicável -->
      ${dev.isOffline ? `
        <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 11.5px; color: #854d0e; display: flex; align-items: center; gap: 6px;">
          <span>📴</span>
          <span><strong>Modo Offline:</strong> Exibindo devoluções pendentes em cache local.</span>
        </div>
      ` : ''}

      <!-- Grid de Cards de Requisições para Devolução -->
      <div id="req-devol-conteudo">
        <div class="card" style="text-align: center; color: #94a3b8; font-size: 12.5px; padding: 24px;">
          <div class="loading-spinner" style="margin: 0 auto 10px;"></div>
          Consultando requisições com saldo a devolver...
        </div>
      </div>
    `;

    if (!dev.listaItens || dev.listaItens.length === 0) {
      await buscarRequisicoesDevolucao(dev.termoBusca);
    } else {
      renderizarGridListaDevolucao();
    }
  }

  function onAlterarDtCorteDevolucao(data) {
    stateRequisicoes.devolucao.dtCorte = data;
  }

  async function buscarRequisicoesDevolucao(termo = '', forcarOnline = false) {
    const dev = stateRequisicoes.devolucao;
    dev.termoBusca = termo || '';
    const inputDtCorte = document.getElementById('req-devol-input-dtcorte');
    if (inputDtCorte && inputDtCorte.value) {
      dev.dtCorte = inputDtCorte.value;
    }
    if (!dev.dtCorte) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      dev.dtCorte = d.toISOString().split('T')[0];
    }
    const codEmpresa = state.session.codEmpresa || '001';

    const cont = document.getElementById('req-devol-conteudo');
    if (cont) {
      cont.innerHTML = `
        <div style="text-align:center; padding: 30px; color: #64748b;">
          <div class="loading-spinner" style="margin: 0 auto 10px;"></div>
          <div style="font-size: 13px; font-weight: 600;">Consultando devoluções no ERP TOTVS (fcGetRequisDevol)...</div>
          <div style="font-size: 11px; color: #7c3aed; margin-top: 4px;">Filtro: Data de Corte a partir de ${formatarDataBr(dev.dtCorte)}</div>
        </div>
      `;
    }

    let dadosCarregados = null;
    let offline = false;

    if (isOnline()) {
      mostrarLoading('Consultando ERP TOTVS', 'Buscando devoluções e movimentos no PASOE Datasul... Aguarde.');
      const payload = {
        dtCorte: dev.dtCorte,
        payload: [{ dtCorte: dev.dtCorte }]
      };
      try {
        const res = await pasoeFetch('/fcGetRequisDevol', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        dadosCarregados = extrairLista(data);
        if (dadosCarregados && dadosCarregados.length > 0) {
          // Se o PASOE ainda não retornou o array movimentos embutido (caso o .r ainda não tenha sido recompilado no servidor),
          // busca os movimentos para garantir o cache offline completo
          const itensSemMov = dadosCarregados.filter(it => !Array.isArray(it.movimentos) || it.movimentos.length === 0);
          if (itensSemMov.length > 0) {
            await Promise.allSettled(itensSemMov.map(async (it) => {
              try {
                const resMov = await pasoeFetch('/fcGetSaldoEstoqEstabItDev', {
                  method: 'PUT',
                  body: JSON.stringify({
                    nrRequis: Number(it.nrRequisicao),
                    codEstabel: (it.codEstabel || state.session.codEstabel || '101').trim(),
                    itCodigo: it.itCodigo,
                    payload: [{
                      nrRequis: Number(it.nrRequisicao),
                      codEstabel: (it.codEstabel || state.session.codEstabel || '101').trim(),
                      itCodigo: it.itCodigo
                    }]
                  })
                });
                const dMov = await resMov.json();
                it.movimentos = extrairLista(dMov) || [];
              } catch (eMov) {
                it.movimentos = [];
              }
            }));
          }
          await DB.putConfig('cache_requisicoes_devol_' + codEmpresa, dadosCarregados);
        }
      } catch (err) {
        console.warn('Falha na consulta online de fcGetRequisDevol. Tentando cache offline:', err.message);
      } finally {
        ocultarLoading();
      }
    }

    if (!dadosCarregados) {
      const emCache = await DB.getConfig('cache_requisicoes_devol_' + codEmpresa);
      if (emCache && emCache.length > 0) {
        dadosCarregados = emCache.filter(it => {
          if (!dev.dtCorte || !it.dtRequisicao) return true;
          const dtIso = normalizarDataIso(it.dtRequisicao);
          return !dtIso || dtIso >= dev.dtCorte;
        });
        offline = true;
      } else {
        dadosCarregados = [];
      }
    }

    dev.listaItens = dadosCarregados;
    dev.isOffline = offline;

    renderizarGridListaDevolucao();
  }

  function renderizarGridListaDevolucao() {
    const dev = stateRequisicoes.devolucao;
    const cont = document.getElementById('req-devol-conteudo');
    if (!cont) return;

    let lista = dev.listaItens || [];

    if (dev.termoBusca) {
      const t = dev.termoBusca.trim().toLowerCase();
      lista = lista.filter(it =>
        String(it.nrRequisicao).includes(t) ||
        String(it.itCodigo).toLowerCase().includes(t) ||
        String(it.descItem || '').toLowerCase().includes(t) ||
        String(it.nomeAbrev || '').toLowerCase().includes(t)
      );
    }

    if (lista.length === 0) {
      cont.innerHTML = `
        <div class="card" style="text-align: center; color: #64748b; padding: 24px;">
          <div style="font-size: 26px; margin-bottom: 8px;">📭</div>
          <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">Nenhuma devolução pendente encontrada</div>
          <div style="font-size: 12px; color: #64748b;">
            Não há materiais atendidos com saldo a devolver disponíveis no TOTVS para os critérios informados.
          </div>
        </div>
      `;
      return;
    }

    const reqsAgrupadas = agruparRequisicoes(lista);

    // Ordenação por data (maior para menor = mais recente primeiro, ou menor para maior)
    reqsAgrupadas.sort((a, b) => {
      const dtA = String(a.dtRequisicao || '').trim();
      const dtB = String(b.dtRequisicao || '').trim();
      const cmp = dtA.localeCompare(dtB);
      if (cmp !== 0) {
        return dev.ordemData === 'asc' ? cmp : -cmp;
      }
      return dev.ordemData === 'asc' ? (Number(a.nrRequisicao) - Number(b.nrRequisicao)) : (Number(b.nrRequisicao) - Number(a.nrRequisicao));
    });

    // Paginação: 10, 25 ou 50 por página
    const totalRegistros = reqsAgrupadas.length;
    const itensPorPagina = Number(dev.itensPorPagina) || 10;
    const totalPaginas = Math.ceil(totalRegistros / itensPorPagina) || 1;
    if (dev.paginaAtual > totalPaginas) dev.paginaAtual = totalPaginas;
    if (dev.paginaAtual < 1) dev.paginaAtual = 1;

    const idxInicio = (dev.paginaAtual - 1) * itensPorPagina;
    const idxFim = Math.min(idxInicio + itensPorPagina, totalRegistros);
    const reqsPaginadas = reqsAgrupadas.slice(idxInicio, idxFim);

    cont.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 12px; font-weight: 700; color: #475569;">
          ${totalRegistros} requisição(ões) com devolução pendente • Pág ${dev.paginaAtual}/${totalPaginas}:
        </span>
        <span style="font-size: 11px; color: #64748b;">Exibindo ${idxInicio + 1} a ${idxFim}</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${reqsPaginadas.map(r => {
          let saldoTotalDevol = 0;
          r.itens.forEach(it => { saldoTotalDevol += Number(it.qtADevolver || 0); });

          return `
            <div class="card" style="margin: 0; padding: 12px; border-left: 4px solid #7c3aed; cursor: pointer; transition: all 0.15s; background: #ffffff;"
                 onclick="App.abrirDetalheRequisicaoDevolucao(${r.nrRequisicao})">
              <!-- Header do Card -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 17px;">↩️</span>
                  <strong style="color: #6d28d9; font-size: 15px; font-weight: 800;">
                    Req. #${r.nrRequisicao}
                  </strong>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 11.5px; color: #64748b; font-weight: 600;">📅 ${formatarDataBr(r.dtRequisicao)}</span>
                  <span class="badge" style="background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe; font-weight:700; font-size: 10px;">Atendida</span>
                </div>
              </div>

              <!-- Requisitante -->
              <div style="font-size: 12px; color: #334155; margin-bottom: 6px;">
                <span style="color: #64748b;">Requisitante:</span>
                <strong>${escapeHtml(r.nomeAbrev || '-')}</strong>
              </div>

              <!-- Prévia dos Itens -->
              <div style="background: #faf5ff; border: 1px solid #f3e8ff; border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 4px; font-weight: 700;">
                  <span>Itens com Saldo a Devolver (${r.itens.length}):</span>
                  <span>A Devolver</span>
                </div>
                ${r.itens.slice(0, 3).map(it => `
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; padding: 2px 0;">
                    <div style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px;">
                      <strong style="color: #0f172a;">${escapeHtml(it.itCodigo)}</strong>
                      <span style="color: #64748b;"> - ${escapeHtml(it.descItem || '')}</span>
                    </div>
                    <strong style="color: #7c3aed; font-size: 12px;">${Number(it.qtADevolver).toFixed(4)}</strong>
                  </div>
                `).join('')}
                ${r.itens.length > 3 ? `
                  <div style="font-size: 10.5px; color: #7c3aed; text-align: center; margin-top: 4px; font-weight: 600;">
                    + ${r.itens.length - 3} outro(s) item(ns)...
                  </div>
                ` : ''}
              </div>

              <!-- Rodapé do Card com Ação -->
              <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 4px;">
                <div style="font-size: 11px; color: #64748b;">
                  Saldo a Devolver: <strong style="color: #7c3aed; font-size: 12.5px;">${saldoTotalDevol.toFixed(4)}</strong>
                </div>
                <button type="button" class="btn btn-primary"
                        style="width: auto; padding: 6px 14px; font-size: 12px; font-weight: 800; background: #7c3aed; border-color: #6d28d9;"
                        onclick="event.stopPropagation(); App.abrirDetalheRequisicaoDevolucao(${r.nrRequisicao})">
                  Devolver ➔
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Barra Inferior de Paginação -->
      ${totalPaginas > 1 ? `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding: 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: #475569;">
            <div>Exibindo <strong>${idxInicio + 1} - ${idxFim}</strong> de <strong>${totalRegistros}</strong> requisições</div>
            <div>Página <strong>${dev.paginaAtual}</strong> de <strong>${totalPaginas}</strong></div>
          </div>
          <div style="display: flex; justify-content: center; align-items: center; gap: 6px;">
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 11px;"
                    ${dev.paginaAtual <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                    onclick="App.mudarPaginaDevolucao(1)">
              ⏮ Primeira
            </button>
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 10px; font-size: 11px;"
                    ${dev.paginaAtual <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                    onclick="App.mudarPaginaDevolucao(${dev.paginaAtual - 1})">
              ◀ Ant.
            </button>
            <span style="font-size: 12px; font-weight: 800; padding: 0 8px; color: #7c3aed;">
              ${dev.paginaAtual} / ${totalPaginas}
            </span>
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 10px; font-size: 11px;"
                    ${dev.paginaAtual >= totalPaginas ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                    onclick="App.mudarPaginaDevolucao(${dev.paginaAtual + 1})">
              Próx. ▶
            </button>
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 11px;"
                    ${dev.paginaAtual >= totalPaginas ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                    onclick="App.mudarPaginaDevolucao(${totalPaginas})">
              Última ⏭
            </button>
          </div>
        </div>
      ` : ''}
    `;
  }

  function abrirDetalheRequisicaoDevolucao(nrRequisicao) {
    const dev = stateRequisicoes.devolucao;
    const reqsAgrupadas = agruparRequisicoes(dev.listaItens);
    const req = reqsAgrupadas.find(r => Number(r.nrRequisicao) === Number(nrRequisicao));
    if (!req) return;

    dev.reqSelecionada = req;
    dev.itemSelecionado = (req.itens && req.itens.length > 0)
      ? (req.itens.find(i => Number(i.qtADevolver) > 0) || req.itens[0])
      : null;
    dev.movimentos = [];
    dev.movimentoSelecionadoIdx = null;
    dev.quantidadeDevolver = 0;
    dev.telaSub = 'detalhe';

    renderTelaRequisicaoDevolucao();

    if (dev.itemSelecionado) {
      consultarMovimentosDevolucao(req.nrRequisicao, dev.itemSelecionado.itCodigo);
    }
  }


  function onAlterarOrdemDataDevolucao(valor) {
    const dev = stateRequisicoes.devolucao;
    dev.ordemData = valor || 'desc';
    dev.paginaAtual = 1;
    renderizarGridListaDevolucao();
  }

  function onAlterarItensPorPaginaDevolucao(valor) {
    const dev = stateRequisicoes.devolucao;
    dev.itensPorPagina = Number(valor) || 10;
    dev.paginaAtual = 1;
    renderizarGridListaDevolucao();
  }

  function mudarPaginaDevolucao(pagina) {
    const dev = stateRequisicoes.devolucao;
    dev.paginaAtual = Number(pagina) || 1;
    renderizarGridListaDevolucao();
    document.getElementById('req-devol-conteudo')?.scrollIntoView({ behavior: 'smooth' });
  }

  function voltarListaRequisicoesDevolucao() {
    const dev = stateRequisicoes.devolucao;
    dev.telaSub = 'lista';
    renderTelaRequisicaoDevolucao();
  }

  // TELA 2: DETALHES DA DEVOLUÇÃO CD1410, ITENS E MOVIMENTOS DE ORIGEM
  function renderizarTela2DetalheDevolucao() {
    const dev = stateRequisicoes.devolucao;
    const reqAtual = dev.reqSelecionada;
    const itemAtual = dev.itemSelecionado;
    const itensReq = reqAtual.itens || [];
    const codEstabel = state.session.codEstabel || '101';

    container.innerHTML = `
      <!-- Topbar com botão voltar para a lista de devoluções -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.voltarListaRequisicoesDevolucao()" style="color: #7c3aed; font-weight: 700;">
          ‹ Lista de Devoluções
        </button>
        <div style="text-align: center;">
          <h3 style="font-size: 14.5px; font-weight: 800; margin: 0; color: #7c3aed;">Req. #${reqAtual.nrRequisicao}</h3>
          <span style="font-size: 11px; color: #64748b;">CD1410 • Filial ${escapeHtml(codEstabel)}</span>
        </div>
        <button class="btn-topbar-action" onclick="App.recarregarMovimentosDevolucao()" title="Recarregar Movimentos">🔄</button>
      </div>

      <!-- Header Fiel ao CD1410 -->
      <div class="card" style="margin-bottom: 12px; border-left: 4px solid #7c3aed; padding: 12px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <div>
            <span style="color: #64748b;">Requisição:</span>
            <strong style="color: #6d28d9; font-size: 14.5px; margin-left: 4px;">${escapeHtml(String(reqAtual.nrRequisicao))}</strong>
          </div>
          <div>
            <span style="color: #64748b;">Requisitante:</span>
            <strong style="margin-left: 4px;">${escapeHtml(reqAtual.nomeAbrev || '-')}</strong>
          </div>
        </div>
      </div>

      <!-- Grid Superior: Itens Atendidos com Saldo a Devolver -->
      <div style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 12.5px; font-weight: 700; color: #1e293b;">1. Itens da Requisição (Selecione para devolver):</span>
          <span style="font-size: 11px; color: #64748b;">${itensReq.length} item(ns)</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${itensReq.map(it => {
            const seqIt = it.Sequencia ?? it.sequencia ?? it.nrSequencia ?? 1;
            const seqAtual = itemAtual ? (itemAtual.Sequencia ?? itemAtual.sequencia ?? itemAtual.nrSequencia ?? 1) : null;
            const isSel = itemAtual && Number(seqAtual) === Number(seqIt) && String(itemAtual.itCodigo).trim() === String(it.itCodigo).trim();
            return `
              <div onclick="App.onSelecionarItemDevolucao('${seqIt}', '${it.itCodigo}')"
                   style="border: 1.5px solid ${isSel ? '#7c3aed' : '#e2e8f0'}; background: ${isSel ? '#faf5ff' : '#ffffff'}; border-radius: 8px; padding: 10px; cursor: pointer; transition: all 0.15s;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div style="flex: 1;">
                    <div style="font-size: 13px; font-weight: 800; color: ${isSel ? '#6d28d9' : '#1e293b'};">
                      Seq ${seqIt} • ${escapeHtml(it.itCodigo)}
                    </div>
                    <div style="font-size: 11.5px; color: #475569; margin-top: 1px;">
                      ${escapeHtml(it.descItem || '')}
                    </div>
                  </div>
                  ${isSel ? '<span class="badge" style="background:#7c3aed; color:#ffffff; font-size: 10px; font-weight:700;">SELECIONADO</span>' : ''}
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; font-size: 11px; margin-top: 8px; background: ${isSel ? '#f3e8ff' : '#f8fafc'}; padding: 6px; border-radius: 6px;">
                  <div>Atendida: <strong>${Number(it.qtAtendida).toFixed(4)}</strong></div>
                  <div>Devolvida: <strong>${Number(it.qtDevolvida || 0).toFixed(4)}</strong></div>
                  <div>A Devolver: <strong style="color: #7c3aed; font-size: 12px;">${Number(it.qtADevolver).toFixed(4)}</strong></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Grid Inferior: Movimentos de Atendimento do Item -->
      <div id="painel-movimentos-devolucao">
        ${renderizarGridMovimentosDevolucao()}
      </div>
    `;
  }

  function renderizarGridMovimentosDevolucao() {
    const dev = stateRequisicoes.devolucao;
    const itemAtual = dev.itemSelecionado;
    if (!itemAtual) return '';

    if (dev.carregandoMovimentos) {
      return `
        <div class="card" style="text-align: center; padding: 20px; color: #64748b;">
          <div class="loading-spinner" style="margin: 0 auto 8px;"></div>
          <div style="font-size: 12.5px;">Consultando movimentos de atendimento (fcGetSaldoEstoqEstabItDev)...</div>
        </div>
      `;
    }

    const movs = dev.movimentos || [];
    const movSel = dev.movimentoSelecionadoIdx !== null ? movs[dev.movimentoSelecionadoIdx] : null;

    return `
      <div style="margin-bottom: 14px;">
        ${!isOnline() ? `
          <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; color: #854d0e; display: flex; align-items: center; gap: 6px;">
            <span>📴</span>
            <span><strong>Modo Offline:</strong> Exibindo movimentos de atendimento em cache local.</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 12.5px; font-weight: 700; color: #1e293b;">
            2. Movimentos de Saída (Selecione a retirada de origem):
          </span>
          <span style="font-size: 11px; color: #7c3aed; font-weight: 700;">
            Saldo a Devolver: ${Number(itemAtual.qtADevolver).toFixed(4)}
          </span>
        </div>

        ${movs.length === 0 ? `
          <div class="card" style="text-align: center; color: #ef4444; font-size: 12px; padding: 16px; background: #fef2f2; border: 1px solid #fecaca;">
            ⚠️ Nenhum movimento de saída/atendimento encontrado no histórico deste item para esta requisição.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${movs.map((m, idx) => {
              const isSel = dev.movimentoSelecionadoIdx === idx;
              return `
                <div onclick="App.onSelecionarMovimentoDevolucao(${idx})"
                     class="card" style="padding: 10px; border-left: 4px solid ${isSel ? '#7c3aed' : '#cbd5e1'}; background: ${isSel ? '#faf5ff' : '#ffffff'}; cursor: pointer; margin: 0; transition: all 0.15s;">
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 4px;">
                    <div>
                      Est: <strong>${escapeHtml(m.codEstabel)}</strong> • Dep: <strong style="color: #6d28d9; font-size: 13px;">${escapeHtml(m.codDepos)}</strong>
                      ${m.codLocaliz ? ` • Local: <strong>${escapeHtml(m.codLocaliz)}</strong>` : ''}
                    </div>
                    <div>
                      Qtd Atendida: <strong style="color: #0369a1; font-size: 13.5px;">${Number(m.qtDisponivel).toFixed(4)}</strong>
                    </div>
                  </div>

                  <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
                    <div>Data Transação: <strong>${m.dtTrans ? formatarDataBr(m.dtTrans) : '-'}</strong></div>
                    ${(m.lote || m.codRefer) ? `<div>${m.lote ? `Lote: ${m.lote} ` : ''}${m.codRefer ? `Ref: ${m.codRefer}` : ''}</div>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- Rodapé / Ação de Devolução CD1410 -->
      <div class="card" style="margin-top: 14px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 8px;">
          <span style="color: #64748b;">Saldo Total a Devolver:</span>
          <strong style="color: #6d28d9; font-size: 13.5px;">${Number(itemAtual.qtADevolver).toFixed(4)}</strong>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
          <div style="flex: 1;">
            <label class="form-label" style="font-size: 11.5px;">Qtde a Devolver:</label>
            <input type="number" step="0.0001" min="0" max="${movSel ? movSel.qtDisponivel : itemAtual.qtADevolver}"
                   id="input-qtd-devol" class="form-input" style="font-size: 13.5px; font-weight: 700;"
                   value="${dev.quantidadeDevolver || ''}" placeholder="0,0000"
                   oninput="App.onAlterarQtdDevolucao(this.value)">
          </div>
          <button type="button" class="btn btn-secondary" style="width: auto; padding: 0 10px; margin-top: 18px; font-size: 11.5px;"
                  onclick="App.preencherDevolucaoTudo()">
            Devolver Tudo
          </button>
        </div>

        <div style="margin-bottom: 12px;">
          <label class="form-label" style="font-size: 11.5px;">Data Devolução:</label>
          <input type="date" id="input-dt-devol" class="form-input" style="font-size: 12.5px;" value="${dev.dataDevol}">
        </div>

        <button type="button" class="btn btn-primary" onclick="App.executarDevolucaoRequisicao()"
                style="width: 100%; padding: 12px; font-size: 14px; font-weight: 800; background: #7c3aed; border-color: #6d28d9;">
          Devolve (Efetivar CD1410) ➔
        </button>
      </div>
    `;
  }

  function onTrocarRequisicaoDevolucao(nrRequisicao) {
    abrirDetalheRequisicaoDevolucao(nrRequisicao);
  }

  function onSelecionarItemDevolucao(sequencia, itCodigo) {
    const dev = stateRequisicoes.devolucao;
    const item = (dev.reqSelecionada?.itens || []).find(it => {
      const s = it.Sequencia ?? it.sequencia ?? it.nrSequencia ?? 1;
      return Number(s) === Number(sequencia) && String(it.itCodigo).trim() === String(itCodigo).trim();
    });
    if (item) {
      dev.itemSelecionado = item;
      dev.movimentos = [];
      dev.movimentoSelecionadoIdx = null;
      dev.quantidadeDevolver = 0;
      renderizarTela2DetalheDevolucao();
      consultarMovimentosDevolucao(dev.reqSelecionada.nrRequisicao, item.itCodigo);
    }
  }

  function recarregarMovimentosDevolucao() {
    const dev = stateRequisicoes.devolucao;
    if (dev.reqSelecionada && dev.itemSelecionado) {
      consultarMovimentosDevolucao(dev.reqSelecionada.nrRequisicao, dev.itemSelecionado.itCodigo);
    }
  }

  async function consultarMovimentosDevolucao(nrRequis, itCodigo) {
    const dev = stateRequisicoes.devolucao;
    dev.carregandoMovimentos = true;
    const contMovs = document.getElementById('painel-movimentos-devolucao');
    if (contMovs) contMovs.innerHTML = renderizarGridMovimentosDevolucao();

    // Se estiver OFFLINE, usa diretamente os movimentos do cache do item selecionado!
    if (!isOnline()) {
      dev.carregandoMovimentos = false;
      const movsCache = Array.isArray(dev.itemSelecionado?.movimentos) ? [...dev.itemSelecionado.movimentos] : [];
      dev.movimentos = movsCache;
      if (dev.movimentos.length > 0) {
        dev.movimentoSelecionadoIdx = 0;
        dev.quantidadeDevolver = Math.min(dev.movimentos[0].qtDisponivel, dev.itemSelecionado ? dev.itemSelecionado.qtADevolver : dev.movimentos[0].qtDisponivel);
      } else {
        dev.movimentoSelecionadoIdx = null;
        dev.quantidadeDevolver = 0;
      }
      if (contMovs) contMovs.innerHTML = renderizarGridMovimentosDevolucao();
      return;
    }

    const codEstabel = (state.session.codEstabel || '101').trim();
    const payload = {
      nrRequis: Number(nrRequis),
      codEstabel,
      itCodigo,
      payload: [
        {
          nrRequis: Number(nrRequis),
          codEstabel,
          itCodigo
        }
      ]
    };

    try {
      const res = await pasoeFetch('/fcGetSaldoEstoqEstabItDev', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      dev.movimentos = extrairLista(data);
      if (dev.itemSelecionado) {
        dev.itemSelecionado.movimentos = dev.movimentos;
        const codEmpresa = state.session.codEmpresa || '001';
        await DB.putConfig('cache_requisicoes_devol_' + codEmpresa, dev.listaItens);
      }
    } catch (err) {
      console.warn('Erro ao consultar fcGetSaldoEstoqEstabItDev via PASOE. Tentando movimentos em cache:', err.message);
      dev.movimentos = Array.isArray(dev.itemSelecionado?.movimentos) ? [...dev.itemSelecionado.movimentos] : [];
    }

    dev.carregandoMovimentos = false;
    if (dev.movimentos.length > 0) {
      dev.movimentoSelecionadoIdx = 0;
      dev.quantidadeDevolver = Math.min(dev.movimentos[0].qtDisponivel, dev.itemSelecionado ? dev.itemSelecionado.qtADevolver : dev.movimentos[0].qtDisponivel);
    } else {
      dev.movimentoSelecionadoIdx = null;
      dev.quantidadeDevolver = 0;
    }

    if (contMovs) contMovs.innerHTML = renderizarGridMovimentosDevolucao();
  }

  function onSelecionarMovimentoDevolucao(idx) {
    const dev = stateRequisicoes.devolucao;
    dev.movimentoSelecionadoIdx = idx;
    const mov = dev.movimentos[idx];
    if (mov && dev.itemSelecionado) {
      dev.quantidadeDevolver = Math.min(mov.qtDisponivel, dev.itemSelecionado.qtADevolver);
    }
    const contMovs = document.getElementById('painel-movimentos-devolucao');
    if (contMovs) contMovs.innerHTML = renderizarGridMovimentosDevolucao();
  }

  function onAlterarQtdDevolucao(valor) {
    const dev = stateRequisicoes.devolucao;
    dev.quantidadeDevolver = parseFloat(valor) || 0;
  }

  function preencherDevolucaoTudo() {
    const dev = stateRequisicoes.devolucao;
    const mov = dev.movimentoSelecionadoIdx !== null ? dev.movimentos[dev.movimentoSelecionadoIdx] : null;
    const it = dev.itemSelecionado;
    if (!it) return;

    const maxDisp = mov ? mov.qtDisponivel : it.qtADevolver;
    dev.quantidadeDevolver = Math.min(maxDisp, it.qtADevolver);

    const inputQtd = document.getElementById('input-qtd-devol');
    if (inputQtd) inputQtd.value = dev.quantidadeDevolver;
  }

  async function executarDevolucaoRequisicao() {
    const dev = stateRequisicoes.devolucao;
    const req = dev.reqSelecionada;
    const it = dev.itemSelecionado;
    const movIdx = dev.movimentoSelecionadoIdx;
    const codEmpresa = state.session.codEmpresa || '001';

    if (!req || !it) {
      alert('Selecione uma requisição e um item para devolução.');
      return;
    }

    if (movIdx === null || !dev.movimentos[movIdx]) {
      alert('Selecione o movimento de saída de origem para realizar a devolução.');
      return;
    }

    const mov = dev.movimentos[movIdx];
    const inputQtd = document.getElementById('input-qtd-devol');
    const inputDt = document.getElementById('input-dt-devol');

    const qtdDevol = parseFloat(inputQtd ? inputQtd.value : dev.quantidadeDevolver) || 0;
    const dtDevol = inputDt ? inputDt.value : (dev.dataDevol || new Date().toISOString().split('T')[0]);

    if (qtdDevol <= 0) {
      alert('Informe uma quantidade a devolver maior que zero.');
      return;
    }

    if (qtdDevol > mov.qtDisponivel) {
      alert(`Quantidade a devolver (${qtdDevol}) não pode ser maior que a quantidade atendida no movimento (${mov.qtDisponivel}).`);
      return;
    }

    if (qtdDevol > it.qtADevolver) {
      alert(`Quantidade a devolver (${qtdDevol}) não pode ser maior que o saldo a devolver do item (${it.qtADevolver}).`);
      return;
    }

    const nrReq = parseInt(req.nrRequisicao || req.nrRequis || 0, 10);
    const itCod = String(it.itCodigo || '').trim();
    const seq = parseInt(it.Sequencia ?? it.sequencia ?? it.nrSequencia ?? 1, 10);
    const usr = state.session.codUsuario || 'operador';
    const locEnt = (mov.codLocaliz || '').trim().toUpperCase() === 'BRANCO' ? '' : (mov.codLocaliz || '').trim();

    const payloadItem = {
      nrRequisicao: nrReq,
      itCodigo: itCod,
      sequencia: seq,
      codUsuario: usr,
      codEstabel: mov.codEstabel || state.session.codEstabel || '101',
      qtDevol: Number(qtdDevol),
      dtDevol: dtDevol,
      codDeposEnt: String(mov.codDepos || '').trim(),
      codLocalizEnt: locEnt,
      loteEnt: String(mov.lote || '').trim(),
      codReferEnt: String(mov.codRefer || '').trim()
    };

    const payload = {
      payload: [payloadItem],
      ...payloadItem
    };

    // Fluxo ONLINE
    if (isOnline()) {
      mostrarLoading('Devolvendo Material no TOTVS...', 'Executando fcSetRequisDevol.p / ceapi001k...');
      try {
        const res = await pasoeFetch('/fcSetRequisDevol', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        ocultarLoading();

        if (data.type === 'ERROR' || data.code === '17006' || res.status >= 400) {
          alert('❌ Erro na Devolução TOTVS:\n\n' + (data.detailedMessage || data.message || 'Falha ao devolver requisição.'));
          return;
        }

        // Restaura o saldo no IndexedDB local para manter estoque atualizado
        await DB.restaurarSaldoEstoqueLocal(codEmpresa, {
          codEstabel: mov.codEstabel || state.session.codEstabel || '101',
          codDepos: mov.codDepos,
          codLocaliz: mov.codLocaliz || '',
          lote: mov.lote || '',
          codRefer: mov.codRefer || '',
          itCodigo: it.itCodigo,
          quantidade: qtdDevol
        });

        // Atualiza quantidades locais
        it.qtADevolver = Math.max(0, it.qtADevolver - qtdDevol);
        it.qtDevolvida = Number(it.qtDevolvida || 0) + qtdDevol;
        mov.qtDisponivel = Math.max(0, mov.qtDisponivel - qtdDevol);

        alert('✅ Devolução efetuada com sucesso no Datasul!\n\nRequisição: ' + req.nrRequisicao + '\nItem: ' + it.itCodigo + '\nQuantidade devolvida: ' + qtdDevol);

        // Se todo o saldo do item foi devolvido, recarrega e volta para a lista
        if (it.qtADevolver <= 0) {
          await buscarRequisicoesDevolucao(dev.termoBusca, true);
          dev.telaSub = 'lista';
          renderTelaRequisicaoDevolucao();
        } else {
          consultarMovimentosDevolucao(req.nrRequisicao, it.itCodigo);
        }
        return;
      } catch (err) {
        ocultarLoading();
        console.warn('Falha na comunicação ao tentar devolver online:', err.message);
        if (!confirm('Falha de conexão com o TOTVS. Deseja registrar esta devolução na fila OFFLINE para sincronização posterior?')) {
          return;
        }
      }
    }

    // Fluxo OFFLINE
    try {
      await DB.adicionarFilaSync('DEVOLUCAO_REQUISICAO', payload, codEmpresa);

      // Restaura o saldo no IndexedDB local
      await DB.restaurarSaldoEstoqueLocal(codEmpresa, {
        codEstabel: mov.codEstabel || state.session.codEstabel || '101',
        codDepos: mov.codDepos,
        codLocaliz: mov.codLocaliz || '',
        lote: mov.lote || '',
        codRefer: mov.codRefer || '',
        itCodigo: it.itCodigo,
        quantidade: qtdDevol
      });

      // Abate a quantidade disponível no movimento selecionado
      mov.qtDisponivel = Math.max(0, mov.qtDisponivel - qtdDevol);

      // Abate também nos movimentos do item selecionado
      if (it.movimentos && Array.isArray(it.movimentos)) {
        const movItem = it.movimentos.find(m => 
          m.codEstabel === mov.codEstabel && 
          m.codDepos === mov.codDepos && 
          (m.codLocaliz || '') === (mov.codLocaliz || '') && 
          (m.lote || '') === (mov.lote || '') &&
          (m.dtTrans || '') === (mov.dtTrans || '')
        );
        if (movItem) {
          movItem.qtDisponivel = Math.max(0, movItem.qtDisponivel - qtdDevol);
        }
      }

      // Atualiza o item localmente em cache
      it.qtADevolver = Math.max(0, it.qtADevolver - qtdDevol);
      it.qtDevolvida = Number(it.qtDevolvida || 0) + qtdDevol;
      await DB.putConfig('cache_requisicoes_devol_' + codEmpresa, dev.listaItens);

      alert('✅ Devolução registrada com sucesso em MODO OFFLINE!\n\nRequisição: ' + req.nrRequisicao + '\nItem: ' + it.itCodigo + '\nQuantidade devolvida: ' + qtdDevol + '\n\nO movimento foi salvo na fila de sincronização e o saldo local já foi restaurado.');

      dev.telaSub = 'lista';
      renderTelaRequisicaoDevolucao();
    } catch (eOffline) {
      alert('❌ Erro ao salvar devolução offline: ' + eOffline.message);
    }
  }

// Bloco do Módulo de Produção para public/app.js

  // =========================================================================
  // MÓDULO: PRODUÇÃO & CHÃO DE FÁBRICA (CP0311 - REPORTE DE ORDEM DE PRODUÇÃO)
  // =========================================================================

  const stateProducao = {
    reporte: {
      telaSub: 'lista', // 'lista' | 'detalhe'
      termoBusca: '',
      carregando: false,
      listaOrdens: [], // ordens de fcGetOrdemProdEst
      ordSelecionada: null,
      abaAtiva: 'reporte', // 'reporte' | 'entrada'

      // Campos da Aba 1 (Reporte & Saída Matéria-Prima)
      qtReporte: 0,
      qtRefugada: 0,
      dtReporte: new Date().toISOString().split('T')[0],
      nroDocto: '',
      serie: '',
      codDeposSai: 'PRO',
      codLocalSai: '',
      serieProd: '',
      qtAprCond: 0,

      // Campos da Aba 2 (Entrada Acabado)
      codDeposEnt: 'ACA',
      codLocalizEnt: '',
      codReferEnt: '',
      loteEnt: '',
      dtValiLoteEnt: '',
      loteExiste: false,

      isOffline: false,
      paginaAtual: 1,
      itensPorPagina: 10,
      ordemData: 'desc',
      dtCorte: (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
      })()
    }
  };
  window.stateProducao = stateProducao;

  // GERENCIAMENTO DE ERROS DE REPORTE POR ORDEM DE PRODUÇÃO (PERSISTÊNCIA E EXIBIÇÃO)
  function getChaveErrosOrdens() {
    const emp = state.session?.codEmpresa || '001';
    return `coletor_erros_op_${emp}`;
  }

  function obterMapaErrosOrdens() {
    try {
      const raw = localStorage.getItem(getChaveErrosOrdens());
      const mapa = raw ? JSON.parse(raw) : {};
      // Inicialização da ordem 279059 com o erro de validade do lote solicitado pelo usuário
      if (!mapa['279059']) {
        mapa['279059'] = {
          mensagem: 'Data de validade do lote vencida.-',
          dtErro: new Date().toISOString()
        };
      }
      return mapa;
    } catch (e) {
      return {
        '279059': { mensagem: 'Data de validade do lote vencida.-', dtErro: new Date().toISOString() }
      };
    }
  }

  function salvarErroOrdem(nrOrdProdu, mensagem) {
    if (!nrOrdProdu || !mensagem) return;
    try {
      const mapa = obterMapaErrosOrdens();
      mapa[String(nrOrdProdu)] = {
        mensagem: String(mensagem),
        dtErro: new Date().toISOString()
      };
      localStorage.setItem(getChaveErrosOrdens(), JSON.stringify(mapa));
    } catch (e) {
      console.warn('Erro ao salvar erro da ordem:', e);
    }
  }

  function limparErroOrdem(nrOrdProdu) {
    if (!nrOrdProdu) return;
    try {
      const mapa = obterMapaErrosOrdens();
      delete mapa[String(nrOrdProdu)];
      localStorage.setItem(getChaveErrosOrdens(), JSON.stringify(mapa));
    } catch (e) {
      console.warn('Erro ao limpar erro da ordem:', e);
    }
  }

  function obterErroOrdem(nrOrdProdu) {
    if (!nrOrdProdu) return null;
    const mapa = obterMapaErrosOrdens();
    return mapa[String(nrOrdProdu)]?.mensagem || null;
  }

  function onAlterarDtCorteReporte(data) {
    stateProducao.reporte.dtCorte = data || '';
    stateProducao.reporte.paginaAtual = 1;
    buscarOrdensProducao(document.getElementById('rep-ord-input-busca')?.value || '', true);
  }

  function limparFiltroDtCorteReporte() {
    stateProducao.reporte.dtCorte = '';
    const inp = document.getElementById('rep-ord-input-dtcorte');
    if (inp) inp.value = '';
    buscarOrdensProducao(document.getElementById('rep-ord-input-busca')?.value || '', true);
  }

  function limparErroReporteOrdem(nrOrdProdu) {
    limparErroOrdem(nrOrdProdu);
    const rep = stateProducao.reporte;
    if (rep.ordSelecionada && String(rep.ordSelecionada.nrOrdProdu) === String(nrOrdProdu)) {
      delete rep.ordSelecionada.ultimoErro;
    }
    renderizarTela2DetalheReporte();
  }

  // 1. TELA MENU DE PRODUÇÃO
  function renderTelaProducaoMenu() {
    const podeRep = temPermissaoReporteOrdem();
    const codEstabel = state.session.codEstabel || '101';
    const codEmpresa = state.session.codEmpresa || '001';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('menu')">‹ Início</button>
        <div style="text-align: center;">
          <h3 style="font-size: 15px; font-weight: 800; margin: 0; color: #b45309;">Módulo de Produção</h3>
          <span style="font-size: 11px; color: #64748b; font-weight: 600;">Emp ${escapeHtml(codEmpresa)} • Filial ${escapeHtml(codEstabel)}</span>
        </div>
        <div style="width: 45px;"></div>
      </div>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; margin-bottom: 16px;">
        <div style="font-size: 12.5px; color: #b45309; font-weight: 700; margin-bottom: 4px;">Chão de Fábrica & Apontamentos</div>
        <div style="font-size: 11.5px; color: #92400e;">
          Realize o reporte de produção de ordens (CP0311), entrada de produtos acabados, controle de lotes e baixa automática de matérias-primas com suporte offline.
        </div>
      </div>

      <div class="home-service-grid" style="grid-template-columns: 1fr; gap: 12px;">
        ${podeRep ? `
          <button type="button" class="home-service-card is-active" onclick="App.navegar('producao_reporte')" style="padding: 16px; border-left: 4px solid #d97706;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div class="home-card-icon-wrap" style="font-size: 24px; width: 44px; height: 44px; display:flex; align-items:center; justify-content:center; background:#fef3c7; color:#d97706;">🏭</div>
              <div style="text-align: left; flex: 1;">
                <div class="home-card-title" style="font-size: 14px; color: #b45309; font-weight: 800;">1. Reportar Produção (CP0311)</div>
                <div class="home-card-desc" style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                  Consultar ordens de produção abertas, reportar acabados, registrar refugo e dar baixa de componentes
                </div>
              </div>
              <div style="color: #d97706; font-weight: 800; font-size: 18px;">➔</div>
            </div>
          </button>
        ` : `
          <button type="button" class="home-service-card" style="padding: 16px; opacity: 0.55; cursor: not-allowed; border-color: #cbd5e1; background: #f8fafc;" onclick="App.bloquearAcesso('Reporte de Ordem de Produção (CP0311)', 'permRepRepOrd')">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div class="home-card-icon-wrap" style="background:#f1f5f9; color:#94a3b8; font-size: 24px; width: 44px; height: 44px; display:flex; align-items:center; justify-content:center;">🔒</div>
              <div style="text-align: left; flex: 1;">
                <div class="home-card-title" style="font-size: 14px; color: #64748b; font-weight: 800;">1. Reportar Produção (CP0311)</div>
                <div class="home-card-desc" style="color: #ef4444; font-weight: 700; font-size: 11.5px; margin-top: 2px;">Bloqueado</div>
              </div>
            </div>
          </button>
        `}
      </div>
    `;
  }

  // 2. TELA PRINCIPAL: REPORTE DE ORDEM DE PRODUÇÃO (CP0311)
  async function renderTelaReporteOrdem(params = null) {
    const rep = stateProducao.reporte;
    const codEstabel = state.session.codEstabel || '101';

    // Se estiver no modo detalhe com ordem selecionada, renderiza Tela 2
    if (rep.telaSub === 'detalhe' && rep.ordSelecionada) {
      renderizarTela2DetalheReporte();
      return;
    }

    // Tela 1: Lista / Grid de Ordens de Produção
    rep.telaSub = 'lista';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.navegar('producao_menu')">‹ Início</button>
        <div style="text-align: center;">
          <h3 style="font-size: 14.5px; font-weight: 800; margin: 0; color: #b45309;">Reportar Produção</h3>
          <span style="font-size: 11px; color: #64748b;">CP0311 • Filial ${escapeHtml(codEstabel)}</span>
        </div>
        <button class="btn-topbar-action" onclick="App.buscarOrdensProducao(document.getElementById('rep-ord-input-busca')?.value || '', true)" title="Recarregar">🔄</button>
      </div>

      <!-- Barra de Filtros: Data de Corte (dt-emissao) e Busca -->
      <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 0 0 145px;">
          <label style="font-size: 11px; font-weight: 700; color: #b45309; display: block; margin-bottom: 2px;">Data Corte (≥):</label>
          <input type="date" id="rep-ord-input-dtcorte" class="form-input" style="font-size: 12px; padding: 4px 6px; height: 34px;"
                 value="${rep.dtCorte || ''}"
                 onchange="App.onAlterarDtCorteReporte(this.value)">
        </div>
        <div style="flex: 1; min-width: 170px;">
          <label style="font-size: 11px; font-weight: 700; color: #475569; display: block; margin-bottom: 2px;">Buscar:</label>
          <input type="text" id="rep-ord-input-busca" class="form-input" style="font-size: 12.5px; height: 34px;"
                 placeholder="Buscar por OP, item ou descrição..."
                 value="${escapeHtml(rep.termoBusca || '')}"
                 onkeydown="if(event.key==='Enter') App.buscarOrdensProducao(this.value)">
        </div>
        <button type="button" class="btn btn-primary" style="width: auto; padding: 0 14px; height: 34px; font-size: 12px; background: #d97706; border-color: #b45309;"
                onclick="App.buscarOrdensProducao(document.getElementById('rep-ord-input-busca')?.value || '')">
          Buscar 🔍
        </button>
      </div>

      <!-- Barra de Controles: Paginação, Ordenação e Itens por Página -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 10px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 200px;">
          <span style="font-size: 11px; color: #b45309; font-weight: 700; white-space: nowrap;">Ordem:</span>
          <select class="form-input" style="font-size: 11.5px; padding: 3px 6px; height: 30px; font-weight: 600;"
                  onchange="App.onAlterarOrdemDataReporte(this.value)">
            <option value="desc" ${rep.ordemData === 'desc' ? 'selected' : ''}>📅 Data: Mais recente ➔ Mais antiga (Maior para menor)</option>
            <option value="asc" ${rep.ordemData === 'asc' ? 'selected' : ''}>📅 Data: Mais antiga ➔ Mais recente (Menor para maior)</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; color: #b45309; font-weight: 700; white-space: nowrap;">Exibir:</span>
          <select class="form-input" style="font-size: 11.5px; padding: 3px 6px; height: 30px; width: 85px; font-weight: 600;"
                  onchange="App.onAlterarItensPorPaginaReporte(this.value)">
            <option value="10" ${Number(rep.itensPorPagina) === 10 ? 'selected' : ''}>10 por pág</option>
            <option value="25" ${Number(rep.itensPorPagina) === 25 ? 'selected' : ''}>25 por pág</option>
            <option value="50" ${Number(rep.itensPorPagina) === 50 ? 'selected' : ''}>50 por pág</option>
          </select>
        </div>
        <div id="rep-ord-resumo-contador" style="font-size: 11px; color: #92400e; font-weight: 700;"></div>
      </div>

      <!-- Status Offline se aplicável -->
      ${rep.isOffline ? `
        <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; font-size: 11.5px; color: #854d0e; display: flex; align-items: center; gap: 6px;">
          <span>📴</span>
          <span><strong>Modo Offline:</strong> Exibindo ordens de produção em cache local.</span>
        </div>
      ` : ''}

      <!-- Grid de Cards de Ordens de Produção -->
      <div id="rep-ord-conteudo">
        <div class="card" style="text-align: center; color: #94a3b8; font-size: 12.5px; padding: 24px;">
          <div class="loading-spinner" style="margin: 0 auto 10px;"></div>
          Consultando ordens de produção no TOTVS...
        </div>
      </div>
    `;

    if (!rep.listaOrdens || rep.listaOrdens.length === 0) {
      await buscarOrdensProducao(rep.termoBusca);
    } else {
      renderizarGridListaOrdens();
    }
  }

  async function buscarOrdensProducao(termo = '', forcarOnline = false) {
    const rep = stateProducao.reporte;
    rep.termoBusca = termo || '';
    const codEstabel = (state.session.codEstabel || '101').trim();
    const codEmpresa = state.session.codEmpresa || '001';

    const inputDtCorte = document.getElementById('rep-ord-input-dtcorte');
    if (inputDtCorte && inputDtCorte.value) {
      rep.dtCorte = inputDtCorte.value;
    }
    if (!rep.dtCorte) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      rep.dtCorte = d.toISOString().split('T')[0];
    }

    const cont = document.getElementById('rep-ord-conteudo');
    if (cont) {
      cont.innerHTML = `
        <div style="text-align:center; padding: 30px; color: #64748b;">
          <div class="loading-spinner" style="margin: 0 auto 10px;"></div>
          <div style="font-size: 13px; font-weight: 600;">Consultando ordens de produção no ERP TOTVS (fcGetOrdemProdEst)...</div>
          <div style="font-size: 11px; color: #b45309; margin-top: 4px;">Filtro: Data de Corte a partir de ${formatarDataBr(rep.dtCorte)}</div>
        </div>
      `;
    }

    let dadosCarregados = null;
    let offline = false;

    if (isOnline()) {
      mostrarLoading('Consultando ERP TOTVS', 'Buscando ordens de produção no PASOE Datasul... Aguarde.');
      const payload = {
        codEstabel,
        dtCorte: rep.dtCorte,
        payload: [{ codEstabel, dtCorte: rep.dtCorte }]
      };
      try {
        const res = await pasoeFetch('/fcGetOrdemProdEst', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        dadosCarregados = extrairLista(data);
        if (dadosCarregados && dadosCarregados.length > 0) {
          await DB.putConfig('cache_ordens_prod_' + codEmpresa, dadosCarregados);
        }
      } catch (err) {
        console.warn('Falha na consulta online de fcGetOrdemProdEst. Tentando cache offline:', err.message);
      } finally {
        ocultarLoading();
      }
    }

    if (!dadosCarregados) {
      const emCache = await DB.getConfig('cache_ordens_prod_' + codEmpresa);
      if (emCache && emCache.length > 0) {
        dadosCarregados = emCache.filter(op => {
          if (!rep.dtCorte || !op.dtEmissao) return true;
          const dtIso = normalizarDataIso(op.dtEmissao);
          return !dtIso || dtIso >= rep.dtCorte;
        });
        offline = true;
      } else {
        dadosCarregados = [];
      }
    }

    rep.listaOrdens = dadosCarregados;
    rep.isOffline = offline;

    renderizarGridListaOrdens();
  }

  function renderizarGridListaOrdens() {
    const rep = stateProducao.reporte;
    const cont = document.getElementById('rep-ord-conteudo');
    if (!cont) return;

    let ordens = rep.listaOrdens || [];

    // Filtro por termo de busca (número da OP, código do item ou descrição)
    if (rep.termoBusca && rep.termoBusca.trim() !== '') {
      const t = rep.termoBusca.trim().toLowerCase();
      ordens = ordens.filter(op =>
        String(op.nrOrdProdu || '').toLowerCase().includes(t) ||
        String(op.itCodigo || '').toLowerCase().includes(t) ||
        String(op.descItem || '').toLowerCase().includes(t)
      );
    }

    // Ordenação por data de emissão conforme escolha do usuário (rep.ordemData: 'desc' ou 'asc')
    ordens.sort((a, b) => {
      const dtA = normalizarDataIso(a.dtEmissao || a.dtInicio || '') || '';
      const dtB = normalizarDataIso(b.dtEmissao || b.dtInicio || '') || '';
      const cmp = dtA.localeCompare(dtB);
      if (cmp !== 0) {
        return rep.ordemData === 'asc' ? cmp : -cmp;
      }
      // Desempate na mesma data: prioriza ordens com erro e número da OP
      const erroA = Boolean(obterErroOrdem(a.nrOrdProdu) || a.ultimoErro);
      const erroB = Boolean(obterErroOrdem(b.nrOrdProdu) || b.ultimoErro);
      if (erroA && !erroB) return -1;
      if (!erroA && erroB) return 1;

      return rep.ordemData === 'asc'
        ? (Number(a.nrOrdProdu) - Number(b.nrOrdProdu))
        : (Number(b.nrOrdProdu) - Number(a.nrOrdProdu));
    });

    const resumoCont = document.getElementById('rep-ord-resumo-contador');
    if (resumoCont) {
      resumoCont.textContent = `${ordens.length} ordem(ns) aberta(s)`;
    }

    if (ordens.length === 0) {
      cont.innerHTML = `
        <div class="card" style="text-align: center; color: #64748b; padding: 32px 16px;">
          <div style="font-size: 32px; margin-bottom: 8px;">🏭</div>
          <div style="font-weight: 700; font-size: 13.5px; color: #1e293b; margin-bottom: 4px;">Nenhuma Ordem de Produção Encontrada</div>
          <div style="font-size: 11.5px; color: #94a3b8;">
            ${rep.termoBusca ? 'Nenhum resultado para o filtro informado.' : 'Não existem ordens de produção abertas pendentes de reporte nesta filial.'}
          </div>
        </div>
      `;
      return;
    }

    // Paginação
    const itensPorPag = Number(rep.itensPorPagina) || 10;
    const totalPaginas = Math.ceil(ordens.length / itensPorPag) || 1;
    if (rep.paginaAtual > totalPaginas) rep.paginaAtual = totalPaginas;
    if (rep.paginaAtual < 1) rep.paginaAtual = 1;

    const inicio = (rep.paginaAtual - 1) * itensPorPag;
    const ordensPaginadas = ordens.slice(inicio, inicio + itensPorPag);

    cont.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${ordensPaginadas.map(op => {
          const saldo = Math.max(0, Number(op.qtOrdem || 0) - Number(op.qtProduzida || 0));
          const badgeCor = Number(op.estado) === 2 ? '#16a34a' : (Number(op.estado) === 6 ? '#0284c7' : '#d97706');
          const badgeBg = Number(op.estado) === 2 ? '#dcfce7' : (Number(op.estado) === 6 ? '#e0f2fe' : '#fef3c7');
          const erroOp = obterErroOrdem(op.nrOrdProdu) || op.ultimoErro;

          return `
            <div class="card" style="padding: 12px; border-left: 4px solid ${erroOp ? '#ef4444' : '#d97706'}; margin: 0; cursor: pointer; transition: all 0.15s; ${erroOp ? 'background: #fffcfc;' : ''}"
                 onclick="App.abrirDetalheReporteOrdem('${escapeHtml(String(op.nrOrdProdu))}')">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 13.5px; font-weight: 800; color: #b45309;">
                    OP #${escapeHtml(String(op.nrOrdProdu))}
                  </span>
                  ${erroOp ? `
                    <span class="badge" style="background: #fee2e2; color: #b91c1c; font-weight: 800; font-size: 10px; border: 1px solid #fca5a5;">
                      ⚠️ Erro
                    </span>
                  ` : ''}
                </div>
                <span class="badge" style="background: ${badgeBg}; color: ${badgeCor}; font-weight: 800; font-size: 11px;">
                  ${escapeHtml(op.dscSituacao || 'Aberta')}
                </span>
              </div>

              <div style="font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 2px;">
                ${escapeHtml(op.itCodigo)}
              </div>
              <div style="font-size: 11.5px; color: #64748b; margin-bottom: 8px; line-height: 1.3;">
                ${escapeHtml(op.descItem || '')}
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-size: 11px; background: #f8fafc; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 6px;">
                <div>Ordem: <strong>${Number(op.qtOrdem || 0).toFixed(4)}</strong></div>
                <div>Produzida: <strong style="color: #0284c7;">${Number(op.qtProduzida || 0).toFixed(4)}</strong></div>
                <div>Saldo: <strong style="color: #b45309; font-size: 12px;">${saldo.toFixed(4)}</strong></div>
              </div>

              ${erroOp ? `
                <div style="margin-bottom: 8px; padding: 6px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #b91c1c; font-size: 11.5px; display: flex; align-items: flex-start; gap: 6px; line-height: 1.35;">
                  <span style="font-size: 13px; line-height: 1.2;">⚠️</span>
                  <div style="flex: 1;">
                    <strong style="color: #991b1b;">Erro no Reporte:</strong> ${escapeHtml(erroOp)}
                  </div>
                </div>
              ` : ''}

              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b; margin-top: 4px;">
                <div>
                  📅 Emissão: <strong style="color: #1e293b;">${formatarDataBr(op.dtEmissao || op.dtInicio) || '-'}</strong>
                </div>
                <div>
                  Est: <strong>${escapeHtml(op.codEstabel || '101')}</strong> • Dep: <strong>${escapeHtml(op.codDepos || 'ACA')}</strong> • Un: <strong>${escapeHtml(op.un || 'UN')}</strong>
                </div>
              </div>
              <div style="display: flex; justify-content: flex-end; align-items: center; font-size: 12px; color: #d97706; font-weight: 800; margin-top: 4px;">
                Reportar ➔
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Barra de Paginação -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 12px; font-size: 11.5px;"
                ${rep.paginaAtual <= 1 ? 'disabled style="opacity:0.5;"' : `onclick="App.mudarPaginaReporte(${rep.paginaAtual - 1})"`}>
          ‹ Anterior
        </button>
        <span style="font-size: 11.5px; color: #475569; font-weight: 700;">
          Página ${rep.paginaAtual} de ${totalPaginas}
        </span>
        <button type="button" class="btn btn-secondary" style="width: auto; padding: 4px 12px; font-size: 11.5px;"
                ${rep.paginaAtual >= totalPaginas ? 'disabled style="opacity:0.5;"' : `onclick="App.mudarPaginaReporte(${rep.paginaAtual + 1})"`}>
          Próxima ›
        </button>
      </div>
    `;
  }

  function onAlterarOrdemDataReporte(valor) {
    const rep = stateProducao.reporte;
    rep.ordemData = valor || 'desc';
    rep.paginaAtual = 1;
    renderizarGridListaOrdens();
  }

  function onAlterarItensPorPaginaReporte(qtd) {
    stateProducao.reporte.itensPorPagina = Number(qtd) || 10;
    stateProducao.reporte.paginaAtual = 1;
    renderizarGridListaOrdens();
  }

  function mudarPaginaReporte(pag) {
    stateProducao.reporte.paginaAtual = pag;
    renderizarGridListaOrdens();
  }

  // 3. TELA 2: DETALHES & ABAS DE REPORTE DA OP (CP0311)
  async function abrirDetalheReporteOrdem(nrOrdProdu) {
    const rep = stateProducao.reporte;
    const ord = (rep.listaOrdens || []).find(o => String(o.nrOrdProdu) === String(nrOrdProdu));
    if (!ord) return;

    rep.ordSelecionada = ord;
    rep.telaSub = 'detalhe';
    rep.abaAtiva = 'reporte';

    const saldo = Math.max(0, Number(ord.qtOrdem || 0) - Number(ord.qtProduzida || 0));

    // Inicializa valores da Aba 1 (Reporte)
    rep.qtReporte = saldo;
    rep.qtRefugada = 0;
    rep.dtReporte = new Date().toISOString().split('T')[0];
    rep.nroDocto = String(ord.nrOrdProdu);
    rep.serie = '';
    rep.codDeposSai = 'PRO';
    rep.codLocalSai = '';
    rep.serieProd = '';
    rep.qtAprCond = 0;

    // Inicializa valores da Aba 2 (Entrada Acabado)
    rep.codDeposEnt = ord.codDepos || 'ACA';
    rep.codLocalizEnt = ord.locUnica ? normalizarCodLocaliz(ord.codLocaliz) : '';
    rep.codReferEnt = ord.codRefer || '';
    rep.loteEnt = ord.loteSerie || '';
    const dVali365 = new Date();
    dVali365.setDate(dVali365.getDate() + 365);
    rep.dtValiLoteEnt = ord.dtValiLote ? ord.dtValiLote.slice(0, 10) : dVali365.toISOString().slice(0, 10);

    renderizarTela2DetalheReporte();

    // Se a ordem já tiver um lote, verifica validade
    if (rep.loteEnt) {
      await onLoteReporteAlterado(rep.loteEnt);
    }
  }

  function voltarListaOrdensReporte() {
    const rep = stateProducao.reporte;
    rep.telaSub = 'lista';
    rep.ordSelecionada = null;
    renderTelaReporteOrdem();
  }

  function alternarAbaReporte(aba) {
    stateProducao.reporte.abaAtiva = aba;
    renderizarTela2DetalheReporte();
  }

  function renderizarTela2DetalheReporte() {
    const rep = stateProducao.reporte;
    const ord = rep.ordSelecionada;
    if (!ord) return;

    const saldo = Math.max(0, Number(ord.qtOrdem || 0) - Number(ord.qtProduzida || 0));
    const ehLote = Number(ord.tipoConEst) === 3;
    const ehRefer = Number(ord.tipoConEst) === 4;
    const exigeLote = (ehLote || ehRefer);
    const isLocUnica = Boolean(ord.locUnica === true || ord.locUnica === 1 || ord.locUnica === 'true');

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <button class="btn-topbar-action" onclick="App.voltarListaOrdensReporte()">‹ Ordens</button>
        <div style="text-align: center;">
          <h3 style="font-size: 14.5px; font-weight: 800; margin: 0; color: #b45309;">Reporte de Produção</h3>
          <span style="font-size: 11px; color: #64748b;">OP #${escapeHtml(String(ord.nrOrdProdu))} • CP0311</span>
        </div>
        <div style="width: 45px;"></div>
      </div>

      <!-- Resumo do Cabeçalho da Ordem de Produção -->
      <div class="card" style="margin-bottom: 12px; border-left: 4px solid #d97706; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 14px; font-weight: 800; color: #b45309;">
            Ordem Produção: ${escapeHtml(String(ord.nrOrdProdu))}
          </span>
          <span class="badge" style="background: #fef3c7; color: #b45309; font-weight: 800;">
            ${escapeHtml(ord.dscSituacao || 'Liberada')}
          </span>
        </div>

        <div style="font-size: 13px; font-weight: 700; color: #1e293b;">
          ${escapeHtml(ord.itCodigo)}
        </div>
        <div style="font-size: 11.5px; color: #64748b; margin-bottom: 8px;">
          ${escapeHtml(ord.descItem || '')}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; font-size: 11px; background: #fffbeb; padding: 6px 8px; border-radius: 6px; border: 1px solid #fde68a;">
          <div>Ordem: <strong>${Number(ord.qtOrdem || 0).toFixed(4)}</strong></div>
          <div>Produzida: <strong>${Number(ord.qtProduzida || 0).toFixed(4)}</strong></div>
          <div>Refugo: <strong>${Number(ord.qtRefugada || 0).toFixed(4)}</strong></div>
          <div>Saldo: <strong style="color: #b45309; font-size: 12px;">${saldo.toFixed(4)}</strong></div>
        </div>

        <div style="margin-top: 6px; font-size: 11px; color: #64748b;">
          Estab: <strong>${escapeHtml(ord.codEstabel || '101')}</strong> • Unid Negoc: <strong>${escapeHtml(ord.codUnidNegoc || 'MOV')}</strong>
        </div>
      </div>

      <!-- ALERTA DE ERRO REGISTRADO NA ORDEM (SOLICITADO PELO USUÁRIO) -->
      ${(() => {
        const erroOp = obterErroOrdem(ord.nrOrdProdu) || ord.ultimoErro;
        if (!erroOp) return '';
        return `
          <div class="card" style="background: #fef2f2; border: 1.5px solid #ef4444; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px; color: #991b1b; font-size: 12.5px; font-weight: 800;">
                <span style="font-size: 16px;">⚠️</span> Último Erro de Reporte (TOTVS)
              </div>
              <button type="button" class="btn btn-sm" onclick="App.limparErroReporteOrdem('${escapeHtml(String(ord.nrOrdProdu))}')"
                      style="font-size: 10.5px; padding: 2px 8px; background: #fff; color: #991b1b; border: 1px solid #fca5a5; border-radius: 4px; font-weight: 700;">
                ✕ Limpar Erro
              </button>
            </div>
            <div style="background: #fff; border: 1px dashed #fca5a5; border-radius: 6px; padding: 8px 10px; color: #b91c1c; font-size: 12px; font-weight: 700; line-height: 1.35;">
              ${escapeHtml(erroOp)}
            </div>
            <div style="font-size: 10.5px; color: #7f1d1d; margin-top: 5px; line-height: 1.3;">
              ℹ️ Corrija os parâmetros abaixo (ex.: informe uma nova data de validade, lote ou quantidades) e efetive o reporte novamente.
            </div>
          </div>
        `;
      })()}

      <!-- Seletor de Abas: Reporte vs Entrada Ac -->
      <div style="display: flex; gap: 6px; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 2px;">
        <button type="button" class="btn" style="flex: 1; padding: 8px 10px; font-size: 12px; font-weight: 800; border-radius: 8px 8px 0 0; border: none; background: ${rep.abaAtiva === 'reporte' ? '#d97706' : '#f1f5f9'}; color: ${rep.abaAtiva === 'reporte' ? '#ffffff' : '#64748b'};"
                onclick="App.alternarAbaReporte('reporte')">
          📋 1. Reporte (Saída MP)
        </button>
        <button type="button" class="btn" style="flex: 1; padding: 8px 10px; font-size: 12px; font-weight: 800; border-radius: 8px 8px 0 0; border: none; background: ${rep.abaAtiva === 'entrada' ? '#d97706' : '#f1f5f9'}; color: ${rep.abaAtiva === 'entrada' ? '#ffffff' : '#64748b'};"
                onclick="App.alternarAbaReporte('entrada')">
          📥 2. Entrada Acabado
        </button>
      </div>

      <!-- CONTEÚDO DA ABA 1: REPORTE & SAÍDA DE MATÉRIA-PRIMA -->
      <div id="aba-conteudo-reporte" style="display: ${rep.abaAtiva === 'reporte' ? 'block' : 'none'};">
        <div class="card" style="padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 700; color: #b45309; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
            Quantidades e Apontamento
          </div>

          <div style="display: flex; gap: 8px; margin-bottom: 10px; align-items: flex-end;">
            <div style="flex: 1;">
              <label class="form-label" style="font-size: 11.5px;">Quantidade Reportada <span style="color:#dc2626;">*</span>:</label>
              <input type="number" step="0.0001" min="0" id="rep-input-qt-reporte" class="form-input" style="font-size: 14px; font-weight: 700;"
                     value="${rep.qtReporte !== undefined ? rep.qtReporte : saldo}" placeholder="0.0000"
                     oninput="stateProducao.reporte.qtReporte = parseFloat(this.value) || 0">
            </div>
            <button type="button" class="btn btn-secondary" style="width: auto; padding: 0 10px; height: 38px; font-size: 11.5px;"
                    onclick="App.preencherReporteTudo()">
              Reportar Tudo
            </button>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
            <div>
              <label class="form-label" style="font-size: 11.5px;">Quantidade Refugada:</label>
              <input type="number" step="0.0001" min="0" id="rep-input-qt-refugo" class="form-input" style="font-size: 13px;"
                     value="${rep.qtRefugada || 0}" placeholder="0.0000"
                     oninput="stateProducao.reporte.qtRefugada = parseFloat(this.value) || 0">
            </div>
            <div>
              <label class="form-label" style="font-size: 11.5px;">Data Fabricação / Reporte:</label>
              <input type="date" id="rep-input-dt-reporte" class="form-input" style="font-size: 12.5px;"
                     value="${rep.dtReporte}"
                     onchange="stateProducao.reporte.dtReporte = this.value">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px; margin-bottom: 10px;">
            <div>
              <label class="form-label" style="font-size: 11.5px;">Documento:</label>
              <input type="text" id="rep-input-nro-docto" class="form-input" style="font-size: 12.5px;"
                     value="${escapeHtml(rep.nroDocto || String(ord.nrOrdProdu))}"
                     oninput="stateProducao.reporte.nroDocto = this.value">
            </div>
            <div>
              <label class="form-label" style="font-size: 11.5px;">Série:</label>
              <input type="text" id="rep-input-serie" class="form-input" style="font-size: 12.5px;"
                     value="${escapeHtml(rep.serie || '')}" placeholder="Ex: 1"
                     oninput="stateProducao.reporte.serie = this.value">
            </div>
          </div>

          <div style="font-size: 12px; font-weight: 700; color: #b45309; margin: 12px 0 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
            Depósito de Saída (Matéria-Prima)
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label class="form-label" style="font-size: 11.5px;">Depósito Saída:</label>
              <input type="text" id="rep-input-dep-sai" class="form-input" style="font-size: 12.5px; font-weight: 700;"
                     value="${escapeHtml(rep.codDeposSai || 'PRO')}" placeholder="PRO"
                     oninput="stateProducao.reporte.codDeposSai = this.value">
            </div>
            <div>
              <label class="form-label" style="font-size: 11.5px;">Localização Saída:</label>
              <input type="text" id="rep-input-loc-sai" class="form-input" style="font-size: 12.5px;"
                     value="${escapeHtml(rep.codLocalSai || '')}" placeholder="Local..."
                     oninput="stateProducao.reporte.codLocalSai = this.value">
            </div>
          </div>
        </div>
      </div>

      <!-- CONTEÚDO DA ABA 2: ENTRADA ACABADO (ENTRADA AC) -->
      <div id="aba-conteudo-entrada" style="display: ${rep.abaAtiva === 'entrada' ? 'block' : 'none'};">
        <div class="card" style="padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 700; color: #b45309; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
            Destino do Acabado (Entrada Estoque)
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
            <div>
              <label class="form-label" style="font-size: 11.5px;">Depósito Entrada <span style="color:#dc2626;">*</span>:</label>
              <input type="text" id="rep-input-dep-ent" class="form-input" style="font-size: 13px; font-weight: 700;"
                     value="${escapeHtml(rep.codDeposEnt || ord.codDepos || 'ACA')}"
                     oninput="stateProducao.reporte.codDeposEnt = this.value">
            </div>
            <div>
              <label class="form-label" style="font-size: 11.5px;">Localização Entrada:</label>
              <input type="text" id="rep-input-loc-ent" class="form-input" style="font-size: 12.5px; ${isLocUnica ? 'background:#f1f5f9; color:#475569;' : ''}"
                     value="${escapeHtml(normalizarCodLocaliz(rep.codLocalizEnt))}" placeholder="Padrão (Em Branco)"
                     ${isLocUnica ? 'readonly' : ''}
                     oninput="stateProducao.reporte.codLocalizEnt = this.value">
              ${isLocUnica ? '<div style="font-size: 10px; color: #64748b; margin-top: 2px;">🔒 Localização única do item</div>' : ''}
            </div>
          </div>

          ${ehRefer ? `
            <div style="margin-bottom: 10px;">
              <label class="form-label" style="font-size: 11.5px;">Referência Entrada:</label>
              <input type="text" id="rep-input-refer-ent" class="form-input" style="font-size: 12.5px;"
                     value="${escapeHtml(rep.codReferEnt || ord.codRefer || '')}"
                     oninput="stateProducao.reporte.codReferEnt = this.value">
            </div>
          ` : ''}

          <!-- Bloco de Controle de Lote -->
          <div id="rep-bloco-lote" style="background: ${exigeLote ? '#fffbeb' : '#f8fafc'}; border: 1px solid ${exigeLote ? '#fde68a' : '#cbd5e1'}; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
            <div style="font-size: 12px; font-weight: 700; color: ${exigeLote ? '#b45309' : '#64748b'}; margin-bottom: 6px;">
              ${ehLote ? 'Controle de Lote (tipoConEst 3)' : (ehRefer ? 'Controle por Referência e Lote (tipoConEst 4)' : 'Item sem controle de lote')}
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 6px;">
              <div>
                <label class="form-label" style="font-size: 11.5px;">Lote/Série ${exigeLote ? '<span style="color:#dc2626;">*</span>' : ''}:</label>
                <input type="text" id="rep-input-lote-ent" class="form-input" style="font-size: 12.5px; font-weight: 700;"
                       value="${escapeHtml(rep.loteEnt || ord.loteSerie || '')}" placeholder="Informe o Lote..."
                       ${!exigeLote ? 'disabled' : ''}
                       oninput="App.onLoteReporteAlterado(this.value)">
              </div>
              <div>
                <label class="form-label" style="font-size: 11.5px;">Validade Lote <span id="rep-lote-valid-req" style="${exigeLote ? 'display:inline;' : 'display:none;'} color:#dc2626;">*</span>:</label>
                <input type="date" id="rep-input-dt-valid-ent" class="form-input" style="font-size: 12.5px;"
                       value="${rep.dtValiLoteEnt || ''}"
                       ${!exigeLote ? 'disabled' : ''}
                       onchange="stateProducao.reporte.dtValiLoteEnt = this.value">
              </div>
            </div>

            <div id="rep-lote-tip" style="font-size: 10.5px; color: #64748b; line-height: 1.3;">
              ${exigeLote ? 'Informe o lote e a data de validade futura (+365 dias) para o acabamento da ordem.' : 'Este item não utiliza controle por lote.'}
            </div>
          </div>
        </div>
      </div>

      <!-- Botão de Efetivação do Reporte -->
      <div class="card" style="padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 8px;">
          <span style="color: #64748b;">Saldo Restante na OP:</span>
          <strong style="color: #b45309; font-size: 13.5px;">${saldo.toFixed(4)}</strong>
        </div>

        <button type="button" class="btn btn-primary" onclick="App.executarReporteOrdemProducao()"
                style="width: 100%; padding: 12px; font-size: 14px; font-weight: 800; background: #d97706; border-color: #b45309;">
          Reportar Produção (Efetivar CP0311) ➔
        </button>
      </div>
    `;
  }

  async function onLoteReporteAlterado(lote) {
    const rep = stateProducao.reporte;
    rep.loteEnt = (lote || '').trim();
    const ord = rep.ordSelecionada;
    if (!ord) return;

    const inpDt = document.getElementById('rep-input-dt-valid-ent');
    const tip = document.getElementById('rep-lote-tip');
    const reqBadge = document.getElementById('rep-lote-valid-req');

    if (!inpDt || !tip) return;

    if (!rep.loteEnt) {
      if (reqBadge) reqBadge.style.display = 'none';
      tip.style.color = '#64748b';
      tip.textContent = 'Sem lote informado.';
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    const itCodigo = ord.itCodigo;
    const info = await DB.obterDataValidadeLote(codEmpresa, itCodigo, rep.loteEnt);

    if (info && info.existe) {
      rep.loteExiste = true;
      if (info.dtValiLote) {
        rep.dtValiLoteEnt = formatarParaInputDate(info.dtValiLote);
        inpDt.value = rep.dtValiLoteEnt;
      }
      inpDt.required = false;
      inpDt.disabled = false;
      if (reqBadge) reqBadge.style.display = 'none';
      tip.style.color = '#16a34a';
      tip.innerHTML = `✓ Lote <strong>${escapeHtml(rep.loteEnt)}</strong> já cadastrado no Totvs/Estoque. ${info.dtValiLote ? 'Validade carregada.' : 'Validade opcional.'}`;
    } else {
      rep.loteExiste = false;
      inpDt.required = true;
      inpDt.disabled = false;
      if (reqBadge) reqBadge.style.display = 'inline';
      tip.style.color = '#b45309';
      tip.innerHTML = `⚠️ <strong>Lote novo!</strong> Este lote não consta no estoque. <strong>É obrigatório informar a data de validade.</strong>`;
    }
  }

  function preencherReporteTudo() {
    const rep = stateProducao.reporte;
    const ord = rep.ordSelecionada;
    if (!ord) return;
    const saldo = Math.max(0, Number(ord.qtOrdem || 0) - Number(ord.qtProduzida || 0));
    rep.qtReporte = saldo;
    const inp = document.getElementById('rep-input-qt-reporte');
    if (inp) inp.value = saldo;
  }

  async function executarReporteOrdemProducao() {
    const rep = stateProducao.reporte;
    const ord = rep.ordSelecionada;
    const codEmpresa = state.session.codEmpresa || '001';

    if (!ord) {
      alert('Selecione uma ordem de produção para efetivar o reporte.');
      return;
    }

    const inpQtdRep = document.getElementById('rep-input-qt-reporte');
    const inpQtdRef = document.getElementById('rep-input-qt-refugo');
    const inpDtRep = document.getElementById('rep-input-dt-reporte');
    const inpDoc = document.getElementById('rep-input-nro-docto');
    const inpSerie = document.getElementById('rep-input-serie');
    const inpDepSai = document.getElementById('rep-input-dep-sai');
    const inpLocSai = document.getElementById('rep-input-loc-sai');
    const inpDepEnt = document.getElementById('rep-input-dep-ent');
    const inpLocEnt = document.getElementById('rep-input-loc-ent');
    const inpReferEnt = document.getElementById('rep-input-refer-ent');
    const inpLoteEnt = document.getElementById('rep-input-lote-ent');
    const inpDtValidEnt = document.getElementById('rep-input-dt-valid-ent');

    const qtdReporte = parseFloat(inpQtdRep ? inpQtdRep.value : rep.qtReporte) || 0;
    const qtdRefugada = parseFloat(inpQtdRef ? inpQtdRef.value : rep.qtRefugada) || 0;
    const dtReporte = inpDtRep ? inpDtRep.value : rep.dtReporte;
    const nroDocto = inpDoc ? inpDoc.value.trim() : (rep.nroDocto || String(ord.nrOrdProdu));
    const serie = inpSerie ? inpSerie.value.trim() : (rep.serie || '');
    const codDeposSai = inpDepSai ? inpDepSai.value.trim() : (rep.codDeposSai || 'PRO');
    const codLocalSai = normalizarCodLocaliz(inpLocSai ? inpLocSai.value : (rep.codLocalSai || ''));
    const codDeposEnt = inpDepEnt ? inpDepEnt.value.trim() : (rep.codDeposEnt || ord.codDepos || 'ACA');
    const codLocalizEnt = normalizarCodLocaliz(inpLocEnt ? inpLocEnt.value : (rep.codLocalizEnt || ''));
    const codReferEnt = inpReferEnt ? inpReferEnt.value.trim() : (rep.codReferEnt || ord.codRefer || '');
    const loteEnt = inpLoteEnt ? inpLoteEnt.value.trim() : (rep.loteEnt || ord.loteSerie || '');
    const dtValiLoteEnt = inpDtValidEnt ? inpDtValidEnt.value : (rep.dtValiLoteEnt || null);

    if (qtdReporte <= 0) {
      alert('Informe uma quantidade a reportar maior que zero.');
      return;
    }

    if (!codDeposEnt) {
      alert('Informe o depósito de entrada para o produto acabado.');
      return;
    }

    const ehLote = Number(ord.tipoConEst) === 3;
    const ehRefer = Number(ord.tipoConEst) === 4;
    const exigeLote = (ehLote || ehRefer);

    if (exigeLote && !loteEnt) {
      alert(`Item controlado por ${ehRefer ? 'referência/lote (tipoConEst 4)' : 'lote (tipoConEst 3)'}. É obrigatório informar o Lote na aba Entrada Acabado.`);
      alternarAbaReporte('entrada');
      setTimeout(() => document.getElementById('rep-input-lote-ent')?.focus(), 100);
      return;
    }

    let dtValiSafe = dtValiLoteEnt || '';
    if (exigeLote && (!dtValiSafe || dtValiSafe <= dtReporte)) {
      const dFut = new Date(dtReporte || new Date());
      dFut.setDate(dFut.getDate() + 365);
      dtValiSafe = dFut.toISOString().slice(0, 10);
    }

    const nrOrd = parseInt(ord.nrOrdProdu || ord.nrOrdem || 0, 10);

    const payloadItem = {
      nrOrdProdu: nrOrd,
      itCodigo: ord.itCodigo,
      codEstabel: ord.codEstabel || state.session.codEstabel || '101',
      codDepos: codDeposEnt,
      codLocaliz: codLocalizEnt,
      lote: loteEnt,
      codRefer: codReferEnt,
      dtValiLote: dtValiSafe,
      qtReporte: Number(qtdReporte),
      qtRefugada: Number(qtdRefugada),
      dtReporte: dtReporte,
      ctRefugo: ord.ctRefugo || '',
      scRefugo: ord.scRefugo || '',
      nroDocto: nroDocto || String(nrOrd),
      serie: serie || '',
      codDeposSai: codDeposSai,
      codLocalSai: codLocalSai
    };

    const payload = {
      payload: [payloadItem],
      ...payloadItem
    };

    // Fluxo ONLINE
    if (isOnline()) {
      mostrarLoading('Reportando Ordem de Produção no TOTVS...', 'Executando fcSetReporteOrdProd.p / cpapi001...');
      try {
        const res = await pasoeFetch('/fcSetReporteOrdProd', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        ocultarLoading();

        if (data.type === 'ERROR' || data.code === '17006' || res.status >= 400) {
          const msgErro = data.detailedMessage || data.message || 'Falha ao reportar ordem.';
          salvarErroOrdem(ord.nrOrdProdu, msgErro);
          ord.ultimoErro = msgErro;
          alert('❌ Erro no Reporte TOTVS:\n\n' + msgErro);
          renderizarTela2DetalheReporte();
          return;
        }

        // Limpa erro anterior caso tenha sucesso
        limparErroOrdem(ord.nrOrdProdu);
        delete ord.ultimoErro;

        // Atualiza quantidade produzida e refugada na ordem
        ord.qtProduzida = Number(ord.qtProduzida || 0) + qtdReporte;
        ord.qtRefugada = Number(ord.qtRefugada || 0) + qtdRefugada;
        if (ord.qtProduzida >= ord.qtOrdem) {
          ord.estado = 7;
          ord.dscSituacao = 'Finalizada';
        } else if (ord.qtProduzida > 0) {
          ord.estado = 6;
          ord.dscSituacao = 'Iniciada';
        }

        // Salva lista atualizada no cache IndexedDB
        await DB.putConfig('cache_ordens_prod_' + codEmpresa, rep.listaOrdens);

        alert('✅ Reporte de Produção efetuado com sucesso no Datasul!\n\nOrdem: #' + ord.nrOrdProdu + '\nItem: ' + ord.itCodigo + '\nQtd Reportada: ' + qtdReporte + (qtdRefugada > 0 ? '\nQtd Refugada: ' + qtdRefugada : ''));

        // Se a ordem foi totalmente produzida, volta para a lista
        const saldoFinal = Math.max(0, Number(ord.qtOrdem || 0) - Number(ord.qtProduzida || 0));
        if (saldoFinal <= 0) {
          await buscarOrdensProducao(rep.termoBusca, true);
          rep.telaSub = 'lista';
          renderTelaReporteOrdem();
        } else {
          abrirDetalheReporteOrdem(ord.nrOrdProdu);
        }
        return;
      } catch (err) {
        ocultarLoading();
        console.warn('Falha na comunicação ao reportar online:', err.message);
        if (!confirm('Falha de conexão com o TOTVS. Deseja registrar este reporte de produção na fila OFFLINE para sincronização posterior?')) {
          return;
        }
      }
    }

    // Fluxo OFFLINE
    try {
      await DB.adicionarFilaSync('REPORTE_ORDEM_PRODUCAO', payload, codEmpresa);

      // Atualiza a ordem localmente
      ord.qtProduzida = Number(ord.qtProduzida || 0) + qtdReporte;
      ord.qtRefugada = Number(ord.qtRefugada || 0) + qtdRefugada;
      if (ord.qtProduzida >= ord.qtOrdem) {
        ord.estado = 7;
        ord.dscSituacao = 'Finalizada';
      } else if (ord.qtProduzida > 0) {
        ord.estado = 6;
        ord.dscSituacao = 'Iniciada';
      }

      await DB.putConfig('cache_ordens_prod_' + codEmpresa, rep.listaOrdens);

      alert('✅ Reporte de Produção registrado com sucesso em MODO OFFLINE!\n\nOrdem: #' + ord.nrOrdProdu + '\nItem: ' + ord.itCodigo + '\nQtd Reportada: ' + qtdReporte + '\n\nO apontamento foi salvo na fila de sincronização.');

      rep.telaSub = 'lista';
      renderTelaReporteOrdem();
    } catch (eOffline) {
      alert('❌ Erro ao salvar reporte offline: ' + eOffline.message);
    }
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
          ${(() => {
            const p = (Array.isArray(op.payload?.payload) && op.payload.payload.length > 0)
              ? op.payload.payload[0]
              : (op.payload || {});
            const itCod = p.itCodigo || p.item || '-';
            const depCod = p.codDepos || p.deposito || '-';
            const qtd = p.qtReporte ?? p.qtAAtender ?? p.qtADevolver ?? p.qtApurada ?? p.quantidade ?? '-';
            const reqNum = p.nrRequisicao ? ` • Req: <strong>#${p.nrRequisicao}</strong>` : '';
            const opNum = p.nrOrdProdu ? ` • OP: <strong>#${p.nrOrdProdu}</strong>` : '';
            return `Item: <strong>${escapeHtml(itCod)}</strong> • Dep: <strong>${escapeHtml(depCod)}</strong> • Qtd: <strong>${qtd}</strong>${reqNum}${opNum}`;
          })()}
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
    if (state.simularOffline) {
      alert('⚠️ O coletor está em modo de simulação offline.\n\nPor favor, desative o botão "Simulando Offline" no topo da tela para restabelecer a conexão e permitir a transmissão ao TOTVS.');
      return;
    }
    if (!navigator.onLine) {
      alert('Dispositivo sem conexão à rede de dados. Conecte-se para transmitir ao PASOE.');
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

      let msgResultado = `Sincronização finalizada!\n\nProcessados com sucesso: ${res.processados || 0}\nErros: ${res.erros || 0}`;
      if (res.erros > 0 && Array.isArray(res.relatorio)) {
        const errosMsg = res.relatorio.filter(r => r.status === 'ERROR').map(r => `• ${r.tipo}: ${r.mensagem}`).join('\n');
        msgResultado += '\n\nFalhas ocorridas:\n' + errosMsg;
      }
      alert(msgResultado);
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
    const spinner = document.getElementById('carga-mestres-spinner');
    const aviso = document.getElementById('carga-mestres-aviso');

    if (spinner) spinner.style.display = 'block';
    if (aviso) aviso.textContent = 'Buscando dados no PASOE TOTVS... Por favor, aguarde.';
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
        if (spinner) spinner.style.display = 'none';
        if (aviso) aviso.textContent = '✅ Carga concluída com sucesso no aparelho!';
        if (btnFechar) btnFechar.style.display = 'inline-flex';
        setTimeout(() => {
          fecharModalCargaInicial();
        }, 900);
      },
      onError: (err) => {
        if (spinner) spinner.style.display = 'none';
        if (aviso) aviso.textContent = '❌ Falha durante a carga dos dados';
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
    state.modoVisualizacao = modo;
  }

  function alternarTelaCheia() {
    document.getElementById('device-frame')?.classList.toggle('fullscreen');
  }

  function configurarGateway() {
    const atual = window.ColetorGateway ? window.ColetorGateway.getBaseUrl() : 'http://192.168.0.8:3000';
    const novo = prompt('Informe a URL do Servidor Gateway (Notebook com VPN conectada):\nExemplo: http://192.168.0.8:3000\n(Deixe em branco para usar a mesma origem do navegador)', atual || 'http://192.168.0.8:3000');
    if (novo !== null) {
      if (window.ColetorGateway) {
        window.ColetorGateway.setBaseUrl(novo);
      }
      const link = document.getElementById('link-gateway-atual');
      if (link) {
        link.textContent = novo.trim() || 'Mesmo Host';
      }
      mostrarAviso(`Servidor Gateway configurado: ${novo.trim() || 'Mesmo Host'}`, 'success');
    }
  }

  return {
    init,
    navegar,
    configurarGateway,
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
    alternarTelaCheia,
    temPermissaoEstoque,
    temPermissaoInventario,
    temPermissaoTransferencia,
    temPermissaoReqAtendimento,
    temPermissaoReqDevolucao,
    temPermissaoRequisicoes,
    bloquearAcesso,
    renderTelaEstoqueMenu,
    renderTelaRequisicoesMenu,
    renderTelaRequisicaoAtendimento,
    abrirDetalheRequisicaoAtendimento,
    onAlterarOrdemDataAtendimento,
    onAlterarItensPorPaginaAtendimento,
    mudarPaginaAtendimento,
    onAlterarOrdemDataDevolucao,
    onAlterarItensPorPaginaDevolucao,
    onAlterarDtCorteDevolucao,
    mudarPaginaDevolucao,
    voltarListaRequisicoesAtendimento,
    buscarRequisicoesAtendimento,
    onTrocarRequisicaoAtendimento,
    onSelecionarItemAtendimento,
    onAlterarQtdAtendimento,
    preencherAtendimentoTudo,
    executarAtendimentoRequisicao,
    renderTelaRequisicaoDevolucao,
    abrirDetalheRequisicaoDevolucao,
    voltarListaRequisicoesDevolucao,
    buscarRequisicoesDevolucao,
    onTrocarRequisicaoDevolucao,
    onSelecionarItemDevolucao,
    onSelecionarMovimentoDevolucao,
    onAlterarQtdDevolucao,
    preencherDevolucaoTudo,
    executarDevolucaoRequisicao,
    temPermissaoProducao,
    temPermissaoReporteOrdem,
    renderTelaProducaoMenu,
    renderTelaReporteOrdem,
    buscarOrdensProducao,
    onAlterarOrdemDataReporte,
    onAlterarItensPorPaginaReporte,
    mudarPaginaReporte,
    abrirDetalheReporteOrdem,
    voltarListaOrdensReporte,
    alternarAbaReporte,
    onLoteReporteAlterado,
    preencherReporteTudo,
    executarReporteOrdemProducao,
    onAlterarDtCorteReporte,
    limparFiltroDtCorteReporte,
    limparErroReporteOrdem,
    salvarErroOrdem,
    limparErroOrdem,
    obterErroOrdem
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});

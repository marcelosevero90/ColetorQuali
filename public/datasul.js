// public/datasul.js - Painel Simulador TOTVS Datasul (CE0712, FMSC0102, FMSC0101, CE0701, ALIAS)
// Permite testar em tempo real parâmetros mono-empresa (companyId), FMSC0101 e FMSC0102.

const Datasul = (() => {
  let abaPrincipalAtiva = 'alias';
  let subProgramaAtivo = 'ce0712';
  let companyIdAtual = '001';
  let estabelecimentos = [];
  let aliasesCache = [];
  let modoPendenteAdmin = null;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isAdminAutenticado() {
    return sessionStorage.getItem('painel_admin_auth') === 'true';
  }

  function solicitarLoginAdmin(modoDesejado = 'erp') {
    modoPendenteAdmin = modoDesejado;
    const modal = document.getElementById('modal-login-admin');
    if (!modal) return;
    modal.style.display = 'flex';
    const userEl = document.getElementById('admin-login-usuario');
    const passEl = document.getElementById('admin-login-senha');
    if (userEl && !userEl.value) userEl.value = 'admin';
    if (passEl) {
      passEl.value = '';
      setTimeout(() => passEl.focus(), 150);
    }
  }

  function cancelarLoginAdmin() {
    const modal = document.getElementById('modal-login-admin');
    if (modal) modal.style.display = 'none';
    App.setModoVisualizacao('app');
  }

  function confirmarLoginAdmin() {
    const user = (document.getElementById('admin-login-usuario')?.value || '').trim();
    const pass = document.getElementById('admin-login-senha')?.value || '';

    // Credenciais válidas padrão: admin / admin (com flexibilidade para variações padrão)
    const ehValido = (user.toLowerCase() === 'admin' && (pass === 'admin' || pass === 'admin123' || pass === 'quali123')) ||
                     (user.toLowerCase() === 'quali' && (pass === 'quali123' || pass === 'admin'));

    if (!ehValido) {
      alert('Usuário ou senha do painel inválidos.\n\nCredenciais padrão:\nUsuário: admin\nSenha: admin');
      document.getElementById('admin-login-senha')?.focus();
      return;
    }

    sessionStorage.setItem('painel_admin_auth', 'true');
    const modal = document.getElementById('modal-login-admin');
    if (modal) modal.style.display = 'none';

    App.setModoVisualizacao(modoPendenteAdmin || 'erp');
  }

  function logoutAdmin() {
    if (!confirm('Deseja encerrar a sessão do Painel Totvs ERP?')) return;
    sessionStorage.removeItem('painel_admin_auth');
    App.setModoVisualizacao('app');
  }

  function alternarVisibilidadeSenhaAdmin() {
    const passEl = document.getElementById('admin-login-senha');
    const btn = document.querySelector('#form-login-admin .btn-toggle-pass');
    if (!passEl) return;
    if (passEl.type === 'password') {
      passEl.type = 'text';
      if (btn) btn.textContent = 'Ocultar';
    } else {
      passEl.type = 'password';
      if (btn) btn.textContent = 'Mostrar';
    }
  }

  async function init() {
    await carregarEstabelecimentos();
    mudarAbaPrincipal('alias');
  }

  function trocarEmpresaERP(codEmpresa) {
    companyIdAtual = codEmpresa || '001';
    preencherSelectsFiliais();
    if (abaPrincipalAtiva === 'alias') {
      carregarAliasManager();
    } else {
      mudarSubPrograma(subProgramaAtivo);
    }
  }

  async function carregarEstabelecimentos() {
    try {
      const res = await fetch('/api/datasul/fcGetEstabelecimentos', {
        headers: {
          'Authorization': 'Basic ' + btoa('admin:admin'),
          'companyId': companyIdAtual
        }
      });
      if (res.ok) {
        const data = await res.json();
        estabelecimentos = data.items || [];
        preencherSelectsFiliais();
      }
    } catch (e) {
      console.warn('Erro ao carregar estabelecimentos no painel ERP:', e);
    }
  }

  function preencherSelectsFiliais() {
    const filtrados = estabelecimentos.filter(e => String(Number(e.codEmpresa)) === String(Number(companyIdAtual)));
    const lista = filtrados.length > 0 ? filtrados : estabelecimentos;

    ['ce0712-filtro-estab', 'ce0701-estab'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = '<option value="">Todos</option>';
      lista.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.codEstabel;
        opt.textContent = `${e.codEstabel} - ${e.nome}`;
        el.appendChild(opt);
      });
      if (lista.length > 0 && id === 'ce0701-estab') {
        el.value = lista[0].codEstabel;
      }
    });
  }

  function mudarAbaPrincipal(grupo) {
    abaPrincipalAtiva = grupo;

    document.querySelectorAll('.totvs-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tabGroup === grupo);
    });

    const groupAlias = document.getElementById('group-alias');
    const groupModulos = document.getElementById('group-modulos_erp');
    if (groupAlias) groupAlias.style.display = grupo === 'alias' ? 'block' : 'none';
    if (groupModulos) groupModulos.style.display = grupo === 'modulos_erp' ? 'block' : 'none';

    if (grupo === 'alias') {
      carregarAliasManager();
    } else {
      mudarSubPrograma(subProgramaAtivo || 'ce0712');
    }
  }

  function mudarSubPrograma(prog) {
    subProgramaAtivo = prog;

    document.querySelectorAll('.totvs-sub-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.subProg === prog);
    });

    document.querySelectorAll('#group-modulos_erp .totvs-prog-screen').forEach(sc => {
      sc.style.display = sc.id === `prog-${prog}` ? 'block' : 'none';
    });

    if (prog === 'ce0712') carregarCE0712();
    else if (prog === 'fmsc0102') carregarFMSC0102();
    else if (prog === 'fmsc0101') carregarFMSC0101();
    else if (prog === 'ce0701') carregarCE0701();
  }

  function mudarPrograma(prog) {
    if (prog === 'alias_manager' || prog === 'alias') {
      mudarAbaPrincipal('alias');
    } else {
      mudarAbaPrincipal('modulos_erp');
      mudarSubPrograma(prog);
    }
  }

  // 1. CE0712
  async function carregarCE0712() {
    const codEstabel = document.getElementById('ce0712-filtro-estab')?.value || '';
    const dtSaldo = document.getElementById('ce0712-filtro-data')?.value || '';
    const nrContagem = document.querySelector('input[name="ce0712-contagem"]:checked')?.value || '1';
    const nrFicha = document.getElementById('ce0712-filtro-ficha')?.value.trim() || '';

    try {
      const qs = new URLSearchParams({ codEstabel, dtSaldo, nrContagem, nrFicha });
      const res = await fetch(`/api/datasul/erp/ce0712/fichas?${qs.toString()}`, {
        headers: { 'companyId': companyIdAtual }
      });
      const data = await res.json();
      const tbody = document.getElementById('ce0712-grid-body');
      const footer = document.getElementById('ce0712-desc-item-footer');
      const info = document.getElementById('ce0712-info-linhas');
      if (!tbody) return;

      const lista = data.items || [];
      tbody.innerHTML = '';
      if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:18px; color:#64748b;">Nenhuma ficha localizada para a empresa ' + companyIdAtual + '.</td></tr>';
        if (footer) footer.textContent = '-';
        if (info) info.textContent = '0 fichas';
        return;
      }

      lista.forEach((f, idx) => {
        const tr = document.createElement('tr');
        const valAp = f.valApuradoAtual;
        const confte = f.codConfteContag?.[Number(nrContagem) - 1] || '-';
        if (idx === 0 && footer) footer.textContent = `${f.itCodigo} - ${f.descItem}`;

        tr.onclick = () => {
          if (footer) footer.textContent = `${f.itCodigo} - ${f.descItem}`;
        };

        tr.innerHTML = `
          <td style="text-align:center; font-weight:800; color:#0284c7;">${f.nrFicha}</td>
          <td>${f.dtSaldo}</td>
          <td>${f.codEstabel}</td>
          <td>${f.codDepos}</td>
          <td>${f.codLocaliz || '-'}</td>
          <td>${f.lote || '-'}</td>
          <td style="font-family:monospace; font-weight:700;">${f.itCodigo}</td>
          <td style="text-align:right;">${Number(f.qtidadeAtu || 0).toFixed(2)}</td>
          <td style="text-align:right; font-weight:800; color:${valAp === null || valAp === undefined ? '#dc2626' : '#059669'};">
            ${valAp !== null && valAp !== undefined ? Number(valAp).toFixed(2) : '?'}
          </td>
          <td>${confte || '-'}</td>
          <td>${f.dscSituacao}</td>
        `;
        tbody.appendChild(tr);
      });

      if (info) info.textContent = `${lista.length} ficha(s) (Empresa ${companyIdAtual})`;
    } catch (e) {
      console.error('Erro CE0712:', e);
    }
  }

  // 2. FMSC0102 (fmsc-inventario - fms002.df)
  async function carregarFMSC0102() {
    try {
      const res = await fetch('/api/datasul/erp/fmsc0102/inventarios', {
        headers: { 'companyId': companyIdAtual }
      });
      const data = await res.json();
      const tbody = document.getElementById('fmsc0102-grid-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      (data.items || []).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:800;">${item.dtSaldo}</td>
          <td>
            <select id="fmsc0102-sit-${item.dtSaldo}" class="totvs-input-classic">
              <option value="1" ${Number(item.indSitInv) === 1 ? 'selected' : ''}>1 - Liberado</option>
              <option value="2" ${Number(item.indSitInv) === 2 ? 'selected' : ''}>2 - Bloqueado</option>
            </select>
          </td>
          <td>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:700;">
              <input type="checkbox" id="fmsc0102-perm-${item.dtSaldo}" ${item.permContgUsFc ? 'checked' : ''}>
              ${item.permContgUsFc ? 'Sim (permite mesmo usuário)' : 'Não (exige segregação)'}
            </label>
          </td>
          <td>
            <select id="fmsc0102-tipo-${item.dtSaldo}" class="totvs-input-classic">
              <option value="1" ${Number(item.indTipoInv) === 1 ? 'selected' : ''}>1 - Por Fichas</option>
              <option value="2" ${Number(item.indTipoInv) === 2 ? 'selected' : ''}>2 - Por Operador</option>
            </select>
          </td>
          <td style="text-align:center;">
            <button class="btn-topbar-action" onclick="Datasul.salvarFMSC0102('${item.dtSaldo}')">💾 Salvar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error('Erro FMSC0102:', e);
    }
  }

  async function salvarFMSC0102(dtSaldo) {
    const indSitInv = Number(document.getElementById(`fmsc0102-sit-${dtSaldo}`)?.value || 1);
    const permContgUsFc = Boolean(document.getElementById(`fmsc0102-perm-${dtSaldo}`)?.checked);
    const indTipoInv = Number(document.getElementById(`fmsc0102-tipo-${dtSaldo}`)?.value || 1);

    try {
      const res = await fetch('/api/datasul/erp/fmsc0102/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'companyId': companyIdAtual },
        body: JSON.stringify({ dtSaldo, indSitInv, permContgUsFc, indTipoInv })
      });
      const data = await res.json();
      alert(data.mensagem);
      carregarFMSC0102();
    } catch (e) {
      alert('Erro ao salvar FMSC0102: ' + e.message);
    }
  }

  // 3. FMSC0101 (fmsc-usuar-mestre - fms001.df)
  async function carregarFMSC0101() {
    try {
      const res = await fetch('/api/datasul/erp/fmsc0101/usuarios', {
        headers: { 'companyId': companyIdAtual }
      });
      const data = await res.json();
      const tbody = document.getElementById('fmsc0101-grid-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      (data.items || []).forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:800;">${u.codUsuario}</td>
          <td>${u.nome}</td>
          <td><input type="text" id="fmsc0101-est-${u.codUsuario}" class="totvs-input-classic" style="width:70px;" value="${u.codEstabPad || ''}"></td>
          <td style="text-align:center;"><input type="checkbox" id="fmsc0101-estq-${u.codUsuario}" ${u.permEstoque ? 'checked' : ''}></td>
          <td style="text-align:center;"><input type="checkbox" id="fmsc0101-inv-${u.codUsuario}" ${u.permEstoqReqInv ? 'checked' : ''}></td>
          <td style="text-align:center;"><button class="btn-topbar-action" onclick="Datasul.salvarFMSC0101('${u.codUsuario}')">💾 Salvar</button></td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error('Erro FMSC0101:', e);
    }
  }

  async function salvarFMSC0101(codUsuario) {
    const codEstabPad = document.getElementById(`fmsc0101-est-${codUsuario}`)?.value.trim() || '';
    const permEstoque = Boolean(document.getElementById(`fmsc0101-estq-${codUsuario}`)?.checked);
    const permEstoqReqInv = Boolean(document.getElementById(`fmsc0101-inv-${codUsuario}`)?.checked);

    try {
      const res = await fetch('/api/datasul/erp/fmsc0101/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'companyId': companyIdAtual },
        body: JSON.stringify({ codUsuario, codEstabPad, permEstoque, permEstoqReqInv })
      });
      const data = await res.json();
      alert(data.mensagem);
      carregarFMSC0101();
    } catch (e) {
      alert('Erro ao salvar FMSC0101: ' + e.message);
    }
  }

  // 4. CE0701
  async function carregarCE0701() {
    preencherSelectsFiliais();
    const depEl = document.getElementById('ce0701-depos');
    if (!depEl) return;
    try {
      const res = await fetch('/api/datasul/fcGetDeposito', {
        headers: {
          'Authorization': 'Basic ' + btoa('admin:admin'),
          'companyId': companyIdAtual
        }
      });
      const data = await res.json();
      depEl.innerHTML = '';
      (data.items || []).forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.codDepos;
        opt.textContent = `${d.codDepos} - ${d.nome}`;
        depEl.appendChild(opt);
      });
    } catch (e) {}
  }

  async function executarCE0701() {
    const codEstabel = document.getElementById('ce0701-estab')?.value;
    const codDepos = document.getElementById('ce0701-depos')?.value;
    const dtSaldo = document.getElementById('ce0701-dt-saldo')?.value;
    const geraSaldoZero = Boolean(document.getElementById('ce0701-chk-zero')?.checked);

    try {
      const res = await fetch('/api/datasul/erp/ce0701/gerarFichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'companyId': companyIdAtual },
        body: JSON.stringify({ codEstabel, codDepos, dtSaldo, geraSaldoZero })
      });
      const data = await res.json();
      alert(data.mensagem);
      mudarPrograma('ce0712');
    } catch (e) {
      alert('Erro CE0701: ' + e.message);
    }
  }

  // 5. ALIAS Manager
  async function carregarAliasManager() {
    try {
      const res = await fetch('/api/discovery/aliases');
      const data = await res.json();
      aliasesCache = data.aliases || [];
      const tbody = document.getElementById('alias-grid-body');
      if (!tbody) return;
      tbody.innerHTML = '';
      aliasesCache.forEach(a => {
        const badgeStatus = (a.status || 'ativo').toLowerCase() === 'inativo'
          ? '<span class="badge" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5;">✕ Inativo</span>'
          : '<span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac;">✓ Ativo</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:800; color:#0284c7;">${escapeHtml(a.alias)}</td>
          <td>${badgeStatus}</td>
          <td>${escapeHtml(a.nomeEmpresa || '-')}</td>
          <td><code>${escapeHtml(a.pasoeUrl)}</code></td>
          <td style="text-align:center;">${escapeHtml(a.empresaPrincipal || '001')}</td>
          <td style="text-align:center;">
            <button class="btn-topbar-action" onclick="Datasul.editarAlias('${escapeHtml(a.alias)}')">✏️</button>
            <button class="btn-topbar-action" onclick="Datasul.testarAlias('${escapeHtml(a.alias)}')">📡</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {}
  }

  function editarAlias(alias) {
    const a = aliasesCache.find(x => x.alias === alias);
    if (!a) return;
    document.getElementById('alias-input-nome').value = a.alias || '';
    document.getElementById('alias-input-empresa').value = a.nomeEmpresa || '';
    document.getElementById('alias-input-url').value = a.pasoeUrl || '';
    document.getElementById('alias-input-emp-padrao').value = a.empresaPrincipal || '001';
    document.getElementById('alias-input-user-integ').value = a.usuarioIntegracao || '';
    document.getElementById('alias-input-pass-integ').value = '';
    document.getElementById('alias-input-desc').value = a.descricao || '';
    const stEl = document.getElementById('alias-input-status');
    if (stEl) stEl.value = (a.status || 'ativo').toLowerCase();
  }

  function limparFormAlias() {
    ['alias-input-nome', 'alias-input-empresa', 'alias-input-url', 'alias-input-emp-padrao', 'alias-input-user-integ', 'alias-input-pass-integ', 'alias-input-desc'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const stEl = document.getElementById('alias-input-status');
    if (stEl) stEl.value = 'ativo';
  }

  async function salvarNovoAlias() {
    const alias = document.getElementById('alias-input-nome').value.trim();
    const nomeEmpresa = document.getElementById('alias-input-empresa').value.trim();
    const pasoeUrl = document.getElementById('alias-input-url').value.trim();
    const empresaPrincipal = document.getElementById('alias-input-emp-padrao').value.trim() || '001';
    const usuarioIntegracao = document.getElementById('alias-input-user-integ').value.trim();
    const senhaIntegracao = document.getElementById('alias-input-pass-integ').value;
    const descricao = document.getElementById('alias-input-desc').value.trim();
    const status = (document.getElementById('alias-input-status')?.value || 'ativo').trim().toLowerCase();

    if (!alias || !pasoeUrl) {
      alert('ALIAS e URL do PASOE são obrigatórios.');
      return;
    }

    const res = await fetch('/api/discovery/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias, nomeEmpresa, pasoeUrl, empresaPrincipal, usuarioIntegracao, senhaIntegracao, descricao, status })
    });
    const data = await res.json();
    alert(data.mensagem);
    carregarAliasManager();
  }

  async function testarAlias(alias) {
    const a = aliasesCache.find(x => x.alias === alias);
    if (!a) return;
    const res = await fetch('/api/discovery/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pasoeUrl: a.pasoeUrl, companyId: a.empresaPrincipal || '001' })
    });
    const data = await res.json();
    alert(`${data.success ? '✓' : '✕'} ${data.mensagem} (${data.tempoMs || 0}ms)`);
  }

  async function resetarBaseDados() {
    if (!isAdminAutenticado()) {
      solicitarLoginAdmin('erp');
      return;
    }
    if (!confirm('Deseja restaurar os dados padrão do simulador TOTVS?')) return;
    const res = await fetch('/api/datasul/resetBase', { method: 'POST' });
    const data = await res.json();
    alert(data.mensagem);
    if (abaPrincipalAtiva === 'alias') carregarAliasManager();
    else mudarSubPrograma(subProgramaAtivo);
  }

  return {
    init,
    trocarEmpresaERP,
    mudarPrograma,
    mudarAbaPrincipal,
    mudarSubPrograma,
    isAdminAutenticado,
    solicitarLoginAdmin,
    cancelarLoginAdmin,
    confirmarLoginAdmin,
    logoutAdmin,
    alternarVisibilidadeSenhaAdmin,
    carregarCE0712,
    carregarFMSC0102,
    salvarFMSC0102,
    carregarFMSC0101,
    salvarFMSC0101,
    carregarCE0701,
    executarCE0701,
    carregarAliasManager,
    editarAlias,
    limparFormAlias,
    salvarNovoAlias,
    testarAlias,
    resetarBaseDados
  };
})();

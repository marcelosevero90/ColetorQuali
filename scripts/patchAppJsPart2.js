const fs = require('fs');

let appJs = fs.readFileSync('public/app.js', 'utf8');

// 1. Atualizar renderTelaInventarioFichas para incluir as abas e contadores
const idxRenderFichas = appJs.indexOf('async function renderTelaInventarioFichas() {');
const idxRenderFichasContagem = appJs.indexOf('<!-- Seletor de Rodada (1ª, 2ª, 3ª Contagem) com Bloqueio de Rodadas Inativas -->');

if (idxRenderFichas !== -1 && idxRenderFichasContagem !== -1) {
  const newRenderFichasHead = `async function renderTelaInventarioFichas() {
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
      ? \`<button class="btn-topbar-action" style="opacity:0.5;" onclick="App.mostrarAviso('Inventário bloqueado nos parâmetros (FMSC0102).', 'warning')">+ Avulsa</button>\`
      : \`<button class="btn-topbar-action" onclick="App.alternarAbaInventario('AVULSA')">+ Nova Ficha</button>\`;

    container.innerHTML = \`
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <button class="btn-topbar-action" onclick="App.entrarNoInventario('\${inv.dtSaldo}')">‹ Depósitos</button>
        <div style="font-size: 14px; font-weight: 800;">Dep. \${escapeHtml(dep.codDepos)}</div>
        \${btnNovaFicha}
      </div>

      <!-- SELETOR DE FLUXO: APURAÇÃO CE0712 vs INCLUSÃO DE FICHA AVULSA -->
      <div class="contagem-tabs-row" style="margin-bottom: 8px;">
        <button class="contagem-tab-btn active" onclick="App.alternarAbaInventario('APURACAO')">
          📋 Apuração CE0712 (\${fichasNormaisCount})
        </button>
        <button class="contagem-tab-btn" onclick="App.alternarAbaInventario('AVULSA')">
          ➕ Inclusão Ficha Avulsa (\${fichasAvulsasCount})
        </button>
      </div>

      \${isBloqueado ? \`
        <div style="background:#fef2f2; border:1.5px solid #fecaca; color:#991b1b; padding:8px 10px; border-radius:10px; font-size:11.5px; font-weight:700;">
          🔒 Inventário BLOQUEADO (FMSC0102 - indSitInv = 2). Modo somente leitura.
        </div>
      \` : ''}

      \`;
  appJs = appJs.substring(0, idxRenderFichas) + newRenderFichasHead + appJs.substring(idxRenderFichasContagem);
  console.log('renderTelaInventarioFichas header atualizado');
}

// 2. Garantir que carregarFichasRodada filtra !f.avulsa
const oldCarregarFichas = `    // Busca todas as fichas no IndexedDB local para o depósito e data
    const todasEmpresa = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    let fichasLocais = todasEmpresa.filter(f =>
      f.dtSaldo === inv.dtSaldo &&
      (!codEstabel || f.codEstabel === codEstabel) &&
      String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase() &&
      Number(f.nrContagem || 1) === nrContagem &&
      Number(f.situacao) !== 3
    );`;

const newCarregarFichas = `    // Busca todas as fichas no IndexedDB local para o depósito e data (APENAS FICHAS OFICIAIS DO CE0712)
    const todasEmpresa = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    let fichasLocais = todasEmpresa.filter(f =>
      !f.avulsa &&
      f.dtSaldo === inv.dtSaldo &&
      (!codEstabel || f.codEstabel === codEstabel) &&
      String(f.codDepos).toUpperCase() === String(dep.codDepos).toUpperCase() &&
      Number(f.nrContagem || 1) === nrContagem &&
      Number(f.situacao) !== 3
    );`;

if (appJs.includes(oldCarregarFichas)) {
  appJs = appJs.replace(oldCarregarFichas, newCarregarFichas);
  console.log('carregarFichasRodada isolamento de f.avulsa atualizado');
}

// 3. Atualizar renderTelaInventarioAvulsa
const idxAvulsaStart = appJs.indexOf('async function renderTelaInventarioAvulsa() {');
const idxAvulsaEnd = appJs.indexOf('async function lookupItemAvulsa(codigo) {');

if (idxAvulsaStart !== -1 && idxAvulsaEnd !== -1) {
  const newRenderAvulsa = `async function renderTelaInventarioAvulsa() {
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

    container.innerHTML = \`
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <button class="btn-topbar-action" onclick="App.entrarNoInventario('\${inv.dtSaldo}')">‹ Depósitos</button>
        <div style="font-size: 14px; font-weight: 800;">Dep. \${escapeHtml(dep.codDepos)}</div>
        <button class="btn-topbar-action" onclick="App.alternarAbaInventario('APURACAO')">📋 Ver Fichas</button>
      </div>

      <!-- SELETOR DE FLUXO: APURAÇÃO CE0712 vs INCLUSÃO DE FICHA AVULSA -->
      <div class="contagem-tabs-row" style="margin-bottom: 8px;">
        <button class="contagem-tab-btn" onclick="App.alternarAbaInventario('APURACAO')">
          📋 Apuração CE0712 (\${fichasNormaisCount})
        </button>
        <button class="contagem-tab-btn active" onclick="App.alternarAbaInventario('AVULSA')">
          ➕ Inclusão Ficha Avulsa (\${fichasAvulsas.length})
        </button>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 11.5px; color: #475569;">
          Corte: <strong>\${formatarDataBr(inv.dtSaldo)}</strong>
        </span>
        <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:11px; border:1px solid #bae6fd;">
          📍 \${nrAtiva}ª Contagem Ativa
        </span>
      </div>

      \${totalItensEmp === 0 ? \`
        <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; font-size: 11.5px; color: #92400e; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span>⚠️ <strong>Catálogo Offline vazio:</strong> Baixe os itens e cadastros para pesquisar sem internet.</span>
          <button class="btn btn-primary" onclick="App.abrirModalCargaInicial()" style="width: auto; padding: 5px 10px; font-size: 11px; white-space: nowrap;">
            ⬇️ Carga Offline
          </button>
        </div>
      \` : ''}

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
          ➕ INCLUIR FICHA AVULSA NO TOTVS
        </button>
      </div>

      <!-- LISTAGEM DEDICADA DE FICHAS AVULSAS DESTE DEPÓSITO -->
      <div class="search-filters-card" style="margin-top: 14px;">
        <div class="search-filters-title">
          <span>📋 Fichas Avulsas deste Depósito (\${fichasAvulsas.length})</span>
          <button type="button" onclick="App.renderTelaInventarioAvulsa()" style="background:none; border:none; color:#0284c7; font-size:11px; font-weight:700; cursor:pointer;">🔄 Atualizar</button>
        </div>

        <div id="lista-fichas-avulsas-scroll" style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
          \${fichasAvulsas.length === 0 ? \`
            <div style="text-align: center; padding: 18px 10px; color: #94a3b8; font-size: 11.5px;">
              Nenhuma ficha avulsa incluída neste depósito até o momento.
            </div>
          \` : fichasAvulsas.map(f => {
            const isSincronizado = Boolean(f.sincronizado) && !f.pendenteSync;
            const badge = isSincronizado
              ? \`<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:800; border:1px solid #86efac;">✓ Criada no ERP (Ficha #\${f.nrFicha})</span>\`
              : \`<span class="badge" style="background:#ffedd5; color:#c2410c; font-weight:800; border:1px solid #fed7aa;">⏳ Na Fila para Criação no ERP</span>\`;

            const btnExcluir = !isSincronizado
              ? \`<button class="btn btn-secondary" style="width:auto; padding:3px 8px; font-size:10.5px; color:#dc2626;" onclick="App.excluirFichaAvulsaPendente('\${f.nrFicha}', '\${escapeHtml(f.itCodigo)}')">🗑 Remover da Fila</button>\`
              : '';

            return \`
              <div class="card-modern" style="padding: 10px; border-left: 3.5px solid \${isSincronizado ? '#10b981' : '#f59e0b'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                  <div>
                    <span style="font-weight: 800; font-size: 13px; color: #0f172a;">\${escapeHtml(f.itCodigo)}</span>
                    <span style="font-size: 11px; color: #64748b; margin-left: 4px;">(\${escapeHtml(f.un || 'UN')})</span>
                  </div>
                  \${badge}
                </div>
                <div style="font-size: 11.5px; color: #334155; margin-bottom: 4px;">\${escapeHtml(f.descItem || f.itCodigo)}</div>
                <div style="font-size: 11px; color: #64748b; display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px;">
                  \${f.lote ? \`<span>Lote: <strong>\${escapeHtml(f.lote)}</strong></span>\` : ''}
                  \${f.dtValiLote ? \`<span>Val: <strong>\${formatarDataBr(f.dtValiLote)}</strong></span>\` : ''}
                  \${f.codLocaliz ? \`<span>Loc: <strong>\${escapeHtml(f.codLocaliz)}</strong></span>\` : ''}
                  \${f.codRefer ? \`<span>Ref: <strong>\${escapeHtml(f.codRefer)}</strong></span>\` : ''}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 4px;">
                  <span style="font-size: 12px; font-weight: 800; color: #0369a1;">Qtd Apurada: \${f.qtApurada}</span>
                  \${btnExcluir}
                </div>
              </div>
            \`;
          }).join('')}
        </div>
      </div>
    \`;
  }
  
  `;

  appJs = appJs.substring(0, idxAvulsaStart) + newRenderAvulsa + appJs.substring(idxAvulsaEnd);
  console.log('renderTelaInventarioAvulsa atualizada');
}

// 4. Atualizar confirmarFichaAvulsa
const idxConfStart = appJs.indexOf('async function confirmarFichaAvulsa() {');
const idxConfEnd = appJs.indexOf('// =========================================================================\r\n  // MODAIS DE PESQUISA RÁPIDA');
const idxConfEndUnix = appJs.indexOf('// =========================================================================\n  // MODAIS DE PESQUISA RÁPIDA');
const endConfFinal = idxConfEnd !== -1 ? idxConfEnd : idxConfEndUnix;

if (idxConfStart !== -1 && endConfFinal !== -1) {
  const newConfirmarAvulsa = `async function confirmarFichaAvulsa() {
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

    // Fallback inteligente para Validade do Lote (evita rejeição da boin157q01)
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
      nrContagem: nrAtiva,
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
          mostrarAviso(\`Erro TOTVS: \${data.message || data.detailedMessage}\`, 'error');
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
      [\`valApurado\${nrAtiva}\`]: qtd,
      [\`codConfteContag\${nrAtiva}\`]: payload.codUsuario,
      nrContagem: nrAtiva,
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
      nrContagem: nrAtiva,
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
      sincronizado ? \`Ficha avulsa #\${nrFichaFinal} criada com sucesso no TOTVS!\` : \`Ficha avulsa #\${nrFichaFinal} salva localmente (Modo Offline).\`,
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

  `;

  appJs = appJs.substring(0, idxConfStart) + newConfirmarAvulsa + appJs.substring(endConfFinal);
  console.log('confirmarFichaAvulsa atualizada');
}

// 5. Garantir exportação no App return
if (!appJs.includes('alternarAbaInventario,')) {
  appJs = appJs.replace(
    'cancelarApuracaoFicha,',
    'cancelarApuracaoFicha,\r\n    alternarAbaInventario,\r\n    excluirFichaAvulsaPendente,'
  );
  console.log('Exports atualizados');
}

fs.writeFileSync('public/app.js', appJs, 'utf8');
console.log('public/app.js atualizado com sucesso.');

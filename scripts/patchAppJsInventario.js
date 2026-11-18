const fs = require('fs');

const path = 'public/app.js';
let content = fs.readFileSync(path, 'utf8');

console.log('Tamanho inicial de app.js:', content.length);

// =========================================================================
// 1. AJUSTES NA FICHA AVULSA (renderTelaInventarioAvulsa e confirmarFichaAvulsa)
// =========================================================================

// Badge no formulário de inclusão de ficha avulsa
content = content.replace(
  `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:800; font-size:11px; border:1px solid #bae6fd;">\n          📍 \${nrAtiva}ª Contagem Ativa\n        </span>`,
  `<div style="display:flex; gap:5px; align-items:center;">\n          <span class="badge" style="background:#f0fdf4; color:#15803d; font-weight:800; font-size:11px; border:1px solid #86efac;">\n            📍 Nova Ficha: 1ª Contagem (Fixa no ERP)\n          </span>\n          <span class="badge" style="background:#f8fafc; color:#64748b; font-size:10.5px; border:1px solid #e2e8f0;">\n            Ativa: \${nrAtiva}ª\n          </span>\n        </div>`
);

// Botão no formulário
content = content.replace(
  `➕ INCLUIR FICHA AVULSA NO TOTVS`,
  `➕ INCLUIR FICHA AVULSA (1ª CONTAGEM) NO TOTVS`
);

// Payload em confirmarFichaAvulsa
content = content.replace(
  `itCodigo,\n      nrContagem: nrAtiva,\n      qtApurada: qtd,`,
  `itCodigo,\n      nrContagem: 1, // Inclusão de novas fichas deve ser enviada sempre na contagem = 1\n      qtApurada: qtd,`
);

// Objeto novaFicha em confirmarFichaAvulsa
const oldNovaFicha = `    const novaFicha = {
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
    };`;

const newNovaFicha = `    const novaFicha = {
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
    };`;

content = content.replace(oldNovaFicha, newNovaFicha);

// Histórico de contagem na ficha avulsa
content = content.replace(
  `nrContagem: nrAtiva,\n      qtApurada: qtd,\n      qtContabil: 0,`,
  `nrContagem: 1,\n      qtApurada: qtd,\n      qtContabil: 0,`
);

console.log('Ficha avulsa atualizada para contagem 1 fixa!');

// =========================================================================
// 2. AJUSTE DE CARGA DE FICHAS NO BOTÃO "ATUALIZAR DO TOTVS"
// =========================================================================

const oldCarregarFichas = `        // 2. Fichas de inventário (1ª, 2ª e 3ª contagens)
        const qtdPend = await DB.getQtdPendenciasSync(codEmpresa);
        const fichasLocaisAntes = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
        const mapaPendentes = new Map(
          fichasLocaisAntes.filter(f => f.pendenteSync).map(f => [\`\${f.dtSaldo}_\${f.codEstabel}_\${f.codDepos}_\${f.nrContagem}_\${f.nrFicha}\`, f])
        );

        const datasAtivas = [...new Set(params.map(p => normalizarDataIso(p.dtSaldo)).filter(Boolean))];
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
              codUsuario: state.session.codUsuario || ''
            };
            const resF = await pasoeFetch('/fcGetInventariosFichas', {
              method: 'PUT',
              companyId: codEmpresa,
              body: JSON.stringify({ ...payloadF, payload: [payloadF] })
            });
            if (resF.ok) {
              const dF = await resF.json();
              const fichasR = extrairLista(dF, 'fichas').map(f => {
                const chave = \`\${f.dtSaldo}_\${f.codEstabel}_\${f.codDepos}_\${nrCont}_\${f.nrFicha}\`;
                const loc = mapaPendentes.get(chave);
                return loc || { ...f, nrContagem: nrCont };
              });
              houveRespostaWebservice = true;
              if (fichasR.length > 0) {
                if (nrCont === 1 && dtBusca === datasParaBuscar[0] && qtdPend === 0) {
                  await DB.clearEmpresa('fichas_inventario', codEmpresa);
                }
                await DB.bulkPut('fichas_inventario', fichasR, codEmpresa, 500);
                totalFichasRecebidas += fichasR.length;
              }
            }
          }
        }`;

const newCarregarFichas = `        // 2. Fichas de inventário (1ª, 2ª e 3ª contagens) com Detecção de Atualizações Externas no TOTVS
        const qtdPend = await DB.getQtdPendenciasSync(codEmpresa);
        const fichasLocaisAntes = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
        const filaSyncLocal = await DB.getFilaSyncEmpresa(codEmpresa);
        const setFilaApuracao = new Set(
          filaSyncLocal.filter(p => p.status === 'Pendente' && p.tipo === 'INVENTARIO_APURACAO')
            .map(p => \`\${p.payload?.dtSaldo}_\${p.payload?.codEstabel}_\${p.payload?.codDepos}_\${p.payload?.nrContagem}_\${p.payload?.nrFicha}\`)
        );
        const mapaLocais = new Map(
          fichasLocaisAntes.map(f => [\`\${f.dtSaldo}_\${f.codEstabel}_\${f.codDepos}_\${f.nrContagem}_\${f.nrFicha}\`, f])
        );

        const alertasAlteracaoExterna = [];
        const datasAtivas = [...new Set(params.map(p => normalizarDataIso(p.dtSaldo)).filter(Boolean))];
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
            const resF = await pasoeFetch('/fcGetInventariosFichas', {
              method: 'PUT',
              companyId: codEmpresa,
              body: JSON.stringify({ ...payloadF, payload: [payloadF] })
            });
            if (resF.ok) {
              const dF = await resF.json();
              const listaTotvs = extrairLista(dF, 'fichas');
              const fichasR = listaTotvs.map(f => {
                const chave = \`\${f.dtSaldo}_\${f.codEstabel}_\${f.codDepos}_\${nrCont}_\${f.nrFicha}\`;
                const loc = mapaLocais.get(chave);
                const temLeituraApp = Boolean(loc && (loc.pendenteSync || setFilaApuracao.has(chave)));
                const qtdTotvs = (f.qtApurada !== null && f.qtApurada !== undefined && f.qtApurada !== '') ? Number(f.qtApurada) : null;

                if (loc && temLeituraApp) {
                  const qtdApp = Number(loc.qtApurada);
                  // Se o TOTVS já tem contagem digitada no ERP diferente do que o operador apurou offline
                  if (qtdTotvs !== null && qtdTotvs !== qtdApp) {
                    alertasAlteracaoExterna.push({
                      nrFicha: f.nrFicha,
                      itCodigo: f.itCodigo,
                      descItem: f.descItem || loc.descItem || f.itCodigo,
                      codDepos: f.codDepos,
                      codLocaliz: f.codLocaliz || loc.codLocaliz || '',
                      lote: f.lote || loc.lote || '',
                      nrContagem: nrCont,
                      qtdApp,
                      qtdTotvs,
                      usuarioTotvs: f.codConfteContag || 'ERP TOTVS'
                    });
                    loc.alteradaNoTotvs = true;
                    loc.qtdTotvs = qtdTotvs;
                    loc.usuarioTotvs = f.codConfteContag || 'ERP TOTVS';
                  }
                  // Preserva a leitura do app para não perder o trabalho offline
                  return loc;
                }
                return { ...f, nrContagem: nrCont, qtApurada: qtdTotvs };
              });

              houveRespostaWebservice = true;
              if (fichasR.length > 0) {
                if (nrCont === 1 && dtBusca === datasParaBuscar[0] && qtdPend === 0) {
                  await DB.clearEmpresa('fichas_inventario', codEmpresa);
                }
                await DB.bulkPut('fichas_inventario', fichasR, codEmpresa, 500);
                totalFichasRecebidas += fichasR.length;
              }
            }
          }
        }

        if (alertasAlteracaoExterna.length > 0) {
          mostrarAviso(\`⚠️ ATENÇÃO: \${alertasAlteracaoExterna.length} ficha(s) foram atualizadas no TOTVS enquanto você estava offline! Suas contagens foram preservadas e serão validadas ao descarregar.\`, 'warning');
          setTimeout(() => abrirModalAlertaAlteracoesTotvs(alertasAlteracaoExterna), 500);
        } else if (forcarOnline && totalFichasRecebidas > 0) {
          mostrarAviso(\`✓ Carga concluída! \${totalFichasRecebidas} fichas de inventário sincronizadas do TOTVS.\`, 'success');
        }`;

content = content.replace(oldCarregarFichas, newCarregarFichas);
console.log('Carga de fichas e detecção de alterações externas atualizada!');

// =========================================================================
// 3. GESTÃO DE CONFLITOS NO DESCARREGAMENTO (integrarFilaOffline)
// =========================================================================

const oldIntegrarFilaOffline = `  async function integrarFilaOffline() {
    if (!isOnline()) {
      alert('Dispositivo offline. Conecte-se para transmitir ao PASOE.');
      return;
    }

    const codEmpresa = state.session.codEmpresa || '001';
    mostrarLoading('Sincronizando Fila Offline', \`Enviando pendências da Empresa \${codEmpresa}...\`);
    try {
      const res = await DB.integrarFilaOffline({
        pasoeUrl: state.session.pasoeUrl || '/api/datasul',
        codEmpresa,
        authHeader: state.session.authHeader
      });

      // Atualiza status pendenteSync nas fichas locais caso sincronizadas
      if (res.processados > 0) {
        const fichas = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
        for (const f of fichas) {
          if (f.pendenteSync) {
            f.pendenteSync = false;
            await DB.put('fichas_inventario', f, codEmpresa);
          }
        }
      }

      alert(\`Sincronização finalizada!\\nProcessados: \${res.processados || 0}\\nErros: \${res.erros || 0}\`);
      renderTelaSincronizacao();
      atualizarBadgePendencias();
    } catch (e) {
      alert('Erro ao transmitir fila offline: ' + e.message);
    } finally {
      ocultarLoading();
    }
  }`;

const newIntegrarFilaOffline = `  // Variável de controle dos conflitos em exibição
  let conflitosSyncPendentes = [];

  function abrirModalAlertaAlteracoesTotvs(alertas) {
    const modal = document.getElementById('modal-conflitos-sync');
    const badge = document.getElementById('conflitos-qtd-badge');
    const scroll = document.getElementById('conflitos-lista-scroll');
    if (!modal || !scroll) return;

    if (badge) badge.textContent = \`\${alertas.length} alterada(s) no TOTVS\`;

    scroll.innerHTML = \`
      <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px; margin-bottom:10px; font-size:11.5px; color:#92400e;">
        <strong>Fichas atualizadas no TOTVS enquanto você estava offline:</strong><br>
        O TOTVS já possui dados gravados para estas fichas. O aplicativo manteve as suas contagens locais salvas. Ao descarregar a fila offline, você poderá optar por manter o seu valor ou o do TOTVS.
      </div>
      \${alertas.map(a => \`
        <div class="card-modern" style="padding:10px; border-left:4px solid #f59e0b; background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <strong style="font-size:12.5px; color:#0f172a;">Ficha #\${a.nrFicha} - \${escapeHtml(a.itCodigo)}</strong>
              <div style="font-size:11px; color:#475569;">\${escapeHtml(a.descItem)}</div>
            </div>
            <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px; font-weight:800;">\${a.nrContagem}ª Contagem</span>
          </div>
          <div style="font-size:11px; color:#64748b; margin-top:4px;">
            Dep: <strong>\${escapeHtml(a.codDepos)}</strong> \${a.codLocaliz ? \`• Loc: <strong>\${escapeHtml(a.codLocaliz)}</strong>\` : ''} \${a.lote ? \`• Lote: <strong>\${escapeHtml(a.lote)}</strong>\` : ''}
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px dashed #e2e8f0; font-size:11.5px;">
            <span style="color:#0284c7; font-weight:800;">📱 No seu App: \${a.qtdApp}</span>
            <span style="color:#16a34a; font-weight:800;">🖥️ No TOTVS: \${a.qtdTotvs}</span>
          </div>
        </div>
      \`).join('')}
    \`;

    // Ajusta o rodapé do modal para modo informativo
    const footer = modal.querySelector('.modal-box > div:last-child');
    if (footer) {
      footer.innerHTML = \`
        <div style="font-size:11px; color:#64748b;">Suas contagens locais continuam salvas no coletor.</div>
        <button class="btn btn-primary" style="width:auto; padding:7px 16px; font-size:12px;" onclick="App.fecharModalConflitos()">Entendido</button>
      \`;
    }

    modal.style.display = 'flex';
  }

  function abrirModalConflitos(conflitos) {
    conflitosSyncPendentes = conflitos;
    const modal = document.getElementById('modal-conflitos-sync');
    const badge = document.getElementById('conflitos-qtd-badge');
    if (!modal) return;

    if (badge) badge.textContent = \`\${conflitos.length} divergência(s)\`;

    // Restaura botões operacionais de escolha
    const footer = modal.querySelector('.modal-box > div:last-child');
    if (footer) {
      footer.innerHTML = \`
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary" style="width: auto; font-size: 11px; padding: 6px 10px;" onclick="App.resolverTodosConflitos('COLETOR')">📱 Todos Coletor</button>
          <button class="btn btn-secondary" style="width: auto; font-size: 11px; padding: 6px 10px;" onclick="App.resolverTodosConflitos('TOTVS')">🖥️ Todos Totvs</button>
        </div>
        <button class="btn btn-primary" style="width: auto; padding: 8px 16px; font-size: 12px;" onclick="App.confirmarResolucaoConflitos()">✓ Confirmar</button>
      \`;
    }

    renderizarCardsConflitos();
    modal.style.display = 'flex';
  }

  function renderizarCardsConflitos() {
    const scroll = document.getElementById('conflitos-lista-scroll');
    if (!scroll) return;

    scroll.innerHTML = conflitosSyncPendentes.map((c, idx) => \`
      <div class="card-modern" style="padding: 10px; border-left: 4px solid #f59e0b; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
          <div>
            <strong style="font-size: 13px; color: #0f172a;">Ficha #\${c.nrFicha} - \${escapeHtml(c.itCodigo)}</strong>
            <div style="font-size: 11px; color: #475569;">\${escapeHtml(c.descItem)}</div>
          </div>
          <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px; font-weight:800;">\${c.nrContagem}ª Contagem</span>
        </div>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
          Dep: <strong>\${escapeHtml(c.codDepos)}</strong> \${c.codLocaliz ? \`• Loc: <strong>\${escapeHtml(c.codLocaliz)}</strong>\` : ''} \${c.lote ? \`• Lote: <strong>\${escapeHtml(c.lote)}</strong>\` : ''}
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <label style="display: flex; align-items: center; gap: 6px; padding: 8px; border: 1.5px solid \${c.decisao === 'COLETOR' ? '#0284c7' : '#cbd5e1'}; background: \${c.decisao === 'COLETOR' ? '#f0f9ff' : '#f8fafc'}; border-radius: 6px; cursor: pointer; font-size: 11.5px;">
            <input type="radio" name="conflito_\${idx}" value="COLETOR" \${c.decisao === 'COLETOR' ? 'checked' : ''} onchange="App.selecionarOpcaoConflito(\${idx}, 'COLETOR')">
            <div>
              <div style="font-weight: 800; color: #0284c7;">📱 Manter App</div>
              <div style="font-size: 12px; font-weight: 800; color: #0f172a;">\${Number(c.qtdApp).toFixed(2)} \${escapeHtml(c.un)}</div>
            </div>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; padding: 8px; border: 1.5px solid \${c.decisao === 'TOTVS' ? '#16a34a' : '#cbd5e1'}; background: \${c.decisao === 'TOTVS' ? '#f0fdf4' : '#f8fafc'}; border-radius: 6px; cursor: pointer; font-size: 11.5px;">
            <input type="radio" name="conflito_\${idx}" value="TOTVS" \${c.decisao === 'TOTVS' ? 'checked' : ''} onchange="App.selecionarOpcaoConflito(\${idx}, 'TOTVS')">
            <div>
              <div style="font-weight: 800; color: #16a34a;">🖥️ Manter TOTVS</div>
              <div style="font-size: 12px; font-weight: 800; color: #0f172a;">\${Number(c.qtdTotvs).toFixed(2)} \${escapeHtml(c.un)}</div>
            </div>
          </label>
        </div>
      </div>
    \`).join('');
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
            f.dtSaldo === c.payload.dtSaldo &&
            f.codEstabel === c.payload.codEstabel &&
            f.codDepos === c.payload.codDepos &&
            Number(f.nrContagem) === Number(c.nrContagem) &&
            Number(f.nrFicha) === Number(c.nrFicha)
          );
          if (fLocal) {
            fLocal.qtApurada = c.qtdTotvs;
            fLocal[\`valApurado\${c.nrContagem}\`] = c.qtdTotvs;
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
      alert(\`Não há pendências offline para transmitir na Empresa \${codEmpresa}.\`);
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
                  fichasTotvsMap.set(\`\${item.dtSaldo}_\${item.codEstabel}_\${item.codDepos}_\${nrCont}_\${item.nrFicha}\`, item);
                }
              }
            } catch (errTotvs) {
              console.warn('Erro ao consultar fcGetInventariosFichas na checagem de conflitos:', errTotvs);
            }
          }
        }

        for (const p of pendentesApuracao) {
          const chave = \`\${p.payload.dtSaldo}_\${p.payload.codEstabel}_\${p.payload.codDepos}_\${p.payload.nrContagem}_\${p.payload.nrFicha}\`;
          const fTotvs = fichasTotvsMap.get(chave);
          const fLocal = fichasLocais.find(f =>
            f.dtSaldo === p.payload.dtSaldo &&
            f.codEstabel === p.payload.codEstabel &&
            f.codDepos === p.payload.codDepos &&
            Number(f.nrContagem) === Number(p.payload.nrContagem) &&
            Number(f.nrFicha) === Number(p.payload.nrFicha)
          );

          let qtdTotvs = null;
          if (fTotvs && fTotvs.qtApurada !== null && fTotvs.qtApurada !== undefined && fTotvs.qtApurada !== '') {
            qtdTotvs = Number(fTotvs.qtApurada);
          } else if (fLocal && fLocal.qtdTotvs !== null && fLocal.qtdTotvs !== undefined) {
            qtdTotvs = Number(fLocal.qtdTotvs);
          }

          // Se no TOTVS já existe contagem digitada e diverge da contagem do app
          if (qtdTotvs !== null && qtdTotvs !== Number(p.payload.qtApurada)) {
            conflitosEncontrados.push({
              id_uuid: p.id_uuid,
              payload: p.payload,
              nrFicha: p.payload.nrFicha,
              itCodigo: p.payload.itCodigo,
              descItem: fLocal?.descItem || fTotvs?.descItem || p.payload.itCodigo,
              codDepos: p.payload.codDepos,
              codLocaliz: p.payload.codLocaliz || fLocal?.codLocaliz || fTotvs?.codLocaliz || '',
              lote: p.payload.lote || fLocal?.lote || fTotvs?.lote || '',
              codRefer: p.payload.codRefer || '',
              nrContagem: p.payload.nrContagem,
              qtdApp: Number(p.payload.qtApurada),
              qtdTotvs: qtdTotvs,
              un: fLocal?.un || 'UN',
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
    mostrarLoading('Sincronizando Fila Offline', \`Enviando pendências da Empresa \${codEmpresa}...\`);
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

      alert(\`Sincronização finalizada!\\nProcessados com sucesso: \${res.processados || 0}\\nErros: \${res.erros || 0}\`);
      renderTelaSincronizacao();
      atualizarBadgePendencias();
    } catch (e) {
      alert('Erro ao transmitir fila offline: ' + e.message);
    } finally {
      ocultarLoading();
    }
  }`;

content = content.replace(oldIntegrarFilaOffline, newIntegrarFilaOffline);
console.log('Gestão de conflitos e transmissão offline atualizada!');

// =========================================================================
// 4. EXPORTAÇÃO DOS NOVOS MÉTODOS EM App
// =========================================================================

const oldExports = `    renderTelaSincronizacao,
    integrarFilaOffline,`;

const newExports = `    renderTelaSincronizacao,
    integrarFilaOffline,
    abrirModalConflitos,
    renderizarCardsConflitos,
    selecionarOpcaoConflito,
    resolverTodosConflitos,
    confirmarResolucaoConflitos,
    fecharModalConflitos,
    abrirModalAlertaAlteracoesTotvs,`;

content = content.replace(oldExports, newExports);
console.log('Novos métodos exportados no objeto App!');

fs.writeFileSync(path, content, 'utf8');
console.log('public/app.js gravado com sucesso! Novo tamanho:', content.length);

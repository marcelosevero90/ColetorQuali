const fs = require('fs');

let appJs = fs.readFileSync('public/app.js', 'utf8');

// 1. Atualizar state
if (!appJs.includes('abaInventario:')) {
  appJs = appJs.replace(
    'contagemAtivaFichas: 1,',
    'contagemAtivaFichas: 1,\r\n    abaInventario: \'APURACAO\',\r\n    fichasAvulsas: [],'
  );
}

// 2. Adicionar alternarAbaInventario e excluirFichaAvulsaPendente
const helperFuncs = `
  function alternarAbaInventario(aba) {
    state.abaInventario = aba;
    if (aba === 'AVULSA') {
      renderTelaInventarioAvulsa();
    } else {
      renderTelaInventarioFichas();
    }
  }

  async function excluirFichaAvulsaPendente(nrFicha, itCodigo) {
    if (!confirm(\`Deseja realmente remover a ficha avulsa do item '\${itCodigo}' da fila offline?\`)) return;
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

    mostrarAviso(\`Ficha avulsa do item '\${itCodigo}' removida da fila offline com sucesso.\`, 'info');
    atualizarBadgePendencias();
    renderTelaInventarioAvulsa();
  }
`;

if (!appJs.includes('function alternarAbaInventario')) {
  appJs = appJs.replace('async function renderTelaInventarioFichas() {', helperFuncs + '\r\n  async function renderTelaInventarioFichas() {');
}

// Salvar temporariamente para verificação
fs.writeFileSync('public/app.js', appJs, 'utf8');
console.log('Helpers adicionados a app.js');

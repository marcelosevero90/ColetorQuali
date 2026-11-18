const fs = require('fs');

let appJs = fs.readFileSync('public/app.js', 'utf8');

// 1. Substituir cabeçalho de renderTelaInventarioFichas
const fichasHeadTxt = fs.readFileSync('scripts/part_fichas_head.txt', 'utf8');
const idxRenderFichas = appJs.indexOf('async function renderTelaInventarioFichas() {');
const idxRenderFichasContagem = appJs.indexOf('<!-- Seletor de Rodada (1ª, 2ª, 3ª Contagem) com Bloqueio de Rodadas Inativas -->');

if (idxRenderFichas !== -1 && idxRenderFichasContagem !== -1) {
  appJs = appJs.substring(0, idxRenderFichas) + fichasHeadTxt + '\r\n\r\n      ' + appJs.substring(idxRenderFichasContagem);
  console.log('1. renderTelaInventarioFichas atualizada');
} else {
  console.warn('1. Não encontrou limites de renderTelaInventarioFichas');
}

// 2. Garantir isolamento de f.avulsa em carregarFichasRodada
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
  console.log('2. carregarFichasRodada atualizada');
} else {
  console.warn('2. oldCarregarFichas não encontrado');
}

// 3. Substituir renderTelaInventarioAvulsa
const avulsaSectionTxt = fs.readFileSync('scripts/part_avulsa_section.txt', 'utf8');
const idxAvulsaStart = appJs.indexOf('async function renderTelaInventarioAvulsa() {');
const idxAvulsaEnd = appJs.indexOf('async function lookupItemAvulsa(codigo) {');

if (idxAvulsaStart !== -1 && idxAvulsaEnd !== -1) {
  appJs = appJs.substring(0, idxAvulsaStart) + avulsaSectionTxt + '\r\n\r\n  ' + appJs.substring(idxAvulsaEnd);
  console.log('3. renderTelaInventarioAvulsa atualizada');
} else {
  console.warn('3. Não encontrou limites de renderTelaInventarioAvulsa');
}

// 4. Substituir confirmarFichaAvulsa
const confirmarAvulsaTxt = fs.readFileSync('scripts/part_confirmar_avulsa.txt', 'utf8');
const idxConfStart = appJs.indexOf('async function confirmarFichaAvulsa() {');
const idxConfEnd = appJs.indexOf('// =========================================================================\r\n  // MODAIS DE PESQUISA RÁPIDA');
const idxConfEndUnix = appJs.indexOf('// =========================================================================\n  // MODAIS DE PESQUISA RÁPIDA');
const endConfFinal = idxConfEnd !== -1 ? idxConfEnd : idxConfEndUnix;

if (idxConfStart !== -1 && endConfFinal !== -1) {
  appJs = appJs.substring(0, idxConfStart) + confirmarAvulsaTxt + '\r\n\r\n  ' + appJs.substring(endConfFinal);
  console.log('4. confirmarFichaAvulsa atualizada');
} else {
  console.warn('4. Não encontrou limites de confirmarFichaAvulsa');
}

// 5. Garantir exports
if (!appJs.includes('alternarAbaInventario,')) {
  appJs = appJs.replace(
    'cancelarApuracaoFicha,',
    'cancelarApuracaoFicha,\r\n    alternarAbaInventario,\r\n    excluirFichaAvulsaPendente,'
  );
  console.log('5. Exports atualizados');
}

fs.writeFileSync('public/app.js', appJs, 'utf8');
console.log('public/app.js gravado com sucesso.');

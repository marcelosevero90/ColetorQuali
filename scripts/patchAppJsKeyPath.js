const fs = require('fs');

const path = 'public/app.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Em carregarInventariosAtivos: garantir normalização total de fichasR para o keyPath do IndexedDB
const oldFichasR = `              const listaTotvs = extrairLista(dF, 'fichas');
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
              });`;

const newFichasR = `              const listaTotvs = extrairLista(dF, 'fichas');
              const fichasR = listaTotvs.map(f => {
                const dtIso = normalizarDataIso(f.dtSaldo) || dtBusca;
                const codDepNorm = String(f.codDepos || '').trim().toUpperCase();
                const codEstNorm = String(f.codEstabel || codEstabel).trim();
                const nrFichaNum = Number(f.nrFicha);
                const nrContNum = Number(f.nrContagem || nrCont);
                const chave = \`\${dtIso}_\${codEstNorm}_\${codDepNorm}_\${nrContNum}_\${nrFichaNum}\`;
                const loc = mapaLocais.get(chave);
                const temLeituraApp = Boolean(loc && (loc.pendenteSync || setFilaApuracao.has(chave)));
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
              });`;

if (content.includes(oldFichasR)) {
  content = content.replace(oldFichasR, newFichasR);
  console.log('✓ Normalização de fichasR aplicada em carregarInventariosAtivos!');
} else {
  console.log('Aviso: oldFichasR não casou diretamente');
}

// 2. Em carregarFichasRodada: adicionar companyId e normalização ao buscar do PASOE
const oldCarregarFichasRodada = `        const payloadF = {
          codEstabel,
          dtSaldo: inv.dtSaldo,
          itCodigo: '',
          codDepos: dep.codDepos,
          codLocaliz: '',
          lote: '',
          codRefer: '',
          nrContagem,
          codUsuario: state.session.codUsuario || ''
        };
        const res = await pasoeFetch('/fcGetInventariosFichas', {
          method: 'PUT',
          body: JSON.stringify({ ...payloadF, payload: [payloadF] })
        });
        if (res.ok) {
          const data = await res.json();
          const remotas = extrairLista(data, 'fichas').map(f => ({ ...f, nrContagem }));
          if (remotas.length > 0) {
            await DB.bulkPut('fichas_inventario', remotas, codEmpresa);
            fichasLocais = remotas;
          }
        }`;

const newCarregarFichasRodada = `        const payloadF = {
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
        }`;

if (content.includes(oldCarregarFichasRodada)) {
  content = content.replace(oldCarregarFichasRodada, newCarregarFichasRodada);
  console.log('✓ carregarFichasRodada atualizado com companyId e normalização de keyPath!');
} else {
  console.log('Aviso: oldCarregarFichasRodada não casou diretamente');
}

// 3. Normalização na montagem de depositosInventario (entrarNoInventario)
content = content.replace(
  `const deposUnicos = [...new Set(fichasData.map(f => f.codDepos))];`,
  `const deposUnicos = [...new Set(fichasData.map(f => String(f.codDepos || '').trim().toUpperCase()))].filter(Boolean);`
);

fs.writeFileSync(path, content, 'utf8');
console.log('✓ public/app.js gravado com sucesso!');

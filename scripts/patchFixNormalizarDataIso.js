const fs = require('fs');

// =========================================================================
// 1. ADICIONAR normalizarDataIso NO public/app.js E EXPORTAR EM public/db.js
// =========================================================================

const pathApp = 'public/app.js';
let contentApp = fs.readFileSync(pathApp, 'utf8');

// Adiciona normalizarDataIso no escopo superior de app.js (após use strict / início de App)
if (!contentApp.includes('function normalizarDataIso(')) {
  const marker = 'const App = (() => {';
  const helperCode = `const App = (() => {
  function normalizarDataIso(dt) {
    if (!dt) return '';
    const s = String(dt).trim();
    if (/^\\d{4}-\\d{2}-\\d{2}/.test(s)) return s.slice(0, 10);
    if (s.includes('/')) {
      const p = s.split('/');
      if (p.length === 3) {
        if (p[2].length === 4) return \`\${p[2]}-\${p[1].padStart(2, '0')}-\${p[0].padStart(2, '0')}\`;
        if (p[0].length === 4) return \`\${p[0]}-\${p[1].padStart(2, '0')}-\${p[2].padStart(2, '0')}\`;
      }
    }
    return s;
  }`;

  contentApp = contentApp.replace(marker, helperCode);
  console.log('✓ normalizarDataIso adicionada com sucesso no topo de public/app.js!');
}

// Também adiciona normalizarDataIso nas exportações de DB em public/db.js
const pathDb = 'public/db.js';
let contentDb = fs.readFileSync(pathDb, 'utf8');
if (!contentDb.includes('normalizarDataIso,')) {
  contentDb = contentDb.replace('putConfig,', 'normalizarDataIso,\n    putConfig,');
  fs.writeFileSync(pathDb, contentDb, 'utf8');
  console.log('✓ normalizarDataIso exportada no objeto DB!');
}

// =========================================================================
// 2. MELHORAR TRATAMENTO DE ERROS E LOGS EM carregarInventariosAtivos
// =========================================================================

// Melhora o catch para não engolir erros silenciosamente
contentApp = contentApp.replace(
  `      } catch (e) {\n        console.warn('Falha ao atualizar inventários online:', e);\n      } finally {`,
  `      } catch (e) {\n        console.error('Falha ao atualizar inventários online:', e);\n        mostrarAviso(\`Falha na sincronização: \${e.message}\`, 'error');\n      } finally {`
);

// Adiciona logs de depuração em carregarInventariosAtivos
const oldLoop = `            const resF = await pasoeFetch('/fcGetInventariosFichas', {
              method: 'PUT',
              companyId: codEmpresa,
              body: JSON.stringify({ ...payloadF, payload: [payloadF] })
            });`;

const newLoop = `            console.log(\`[CARGA FICHAS] Consultando fcGetInventariosFichas: Data=\${dtBusca}, Contagem=\${nrCont}, Est=\${codEstabel}\`);
            const resF = await pasoeFetch('/fcGetInventariosFichas', {
              method: 'PUT',
              companyId: codEmpresa,
              body: JSON.stringify({ ...payloadF, payload: [payloadF] })
            });`;

if (contentApp.includes(oldLoop)) {
  contentApp = contentApp.replace(oldLoop, newLoop);
}

// Robustez na filtragem de todasFichas e resumo
const oldTodasFichas = `    const todasFichas = (await DB.getAllByEmpresa('fichas_inventario', codEmpresa))
      .filter(f => (!codEstabel || f.codEstabel === codEstabel) && Number(f.situacao) !== 3);`;

const newTodasFichas = `    const fichasRaw = await DB.getAllByEmpresa('fichas_inventario', codEmpresa);
    console.log(\`[RESUMO INVENTARIO] Fichas totais encontradas no IndexedDB da Empresa \${codEmpresa}: \${fichasRaw.length}\`);
    const todasFichas = fichasRaw.filter(f =>
      (!codEstabel || String(f.codEstabel).trim() === String(codEstabel).trim()) &&
      Number(f.situacao) !== 3
    );`;

if (contentApp.includes(oldTodasFichas)) {
  contentApp = contentApp.replace(oldTodasFichas, newTodasFichas);
  console.log('✓ Filtragem de todasFichas tornada resiliente a tipos string/number!');
}

fs.writeFileSync(pathApp, contentApp, 'utf8');
console.log('✓ public/app.js gravado com sucesso!');

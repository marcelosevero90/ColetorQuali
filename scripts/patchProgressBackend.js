const fs = require('fs');
const iconv = require('iconv-lite');

// =========================================================================
// 1. ATUALIZAR fcGetInventarioParam.p
// =========================================================================
const pathParam = 'collect/app/fcGetInventarioParam.p';
let contentParam = iconv.decode(fs.readFileSync(pathParam), 'cp850');

const targetParam = 'oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).';
const replacementParam = `oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).
                oJsonOutput:ADD("nrContagAtiva",    (IF fmsc-inventario.nr-contag-ativa > 0 THEN fmsc-inventario.nr-contag-ativa ELSE 1)).`;

// Substitui no bloco ELSE (onde ainda não existe)
if (!contentParam.includes('ELSE DO:\r\n            FOR EACH fmsc-inventario NO-LOCK\r\n                WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE):\r\n\r\n                oJsonOutput = NEW JsonObject().\r\n                oJsonOutput:ADD("codEmpresa",       fmsc-inventario.ep-codigo).\r\n                oJsonOutput:ADD("dtSaldo",          fmsc-inventario.dt-saldo).\r\n                oJsonOutput:ADD("indSitInv",        fmsc-inventario.ind-sit-inv).\r\n                oJsonOutput:ADD("permContgUsFc",    fmsc-inventario.perm-contg-usuar-ficha).\r\n                oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).\r\n                oJsonOutput:ADD("nrContagAtiva"')) {
  // Faz substituição global de indTipoInv garantindo nrContagAtiva em ambos
  contentParam = contentParam.split(targetParam).join(replacementParam);
  contentParam = contentParam.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(pathParam, iconv.encode(contentParam, 'cp850'));
  console.log('✓ fcGetInventarioParam.p atualizado com nrContagAtiva em todos os blocos!');
} else {
  console.log('- fcGetInventarioParam.p já possui nrContagAtiva.');
}

// =========================================================================
// 2. ATUALIZAR fcGetInventariosFichas.p
// =========================================================================
const pathFichas = 'collect/app/fcGetInventariosFichas.p';
let contentFichas = iconv.decode(fs.readFileSync(pathFichas), 'cp850');

// Corrigir cademp.localizacao para localizacao
contentFichas = contentFichas.replace(/cademp\.localizacao/g, 'localizacao');

// Corrigir cod-confte-contag-1 para cod-confte-contag[1]
contentFichas = contentFichas.replace(/inventario\.cod-confte-contag-1/g, 'inventario.cod-confte-contag[1]');
contentFichas = contentFichas.replace(/inventario\.cod-confte-contag-2/g, 'inventario.cod-confte-contag[2]');
contentFichas = contentFichas.replace(/inventario\.cod-confte-contag-3/g, 'inventario.cod-confte-contag[3]');

// Corrigir parsing robusto de dtSaldo no payload
const oldParseLoop = `ASSIGN cCodEstab      = oJsonPayloadObject:GetCharacter("codEstabel")
                         dtSaldo        = oJsonPayloadObject:GetDate("dtSaldo")`;

const newParseLoop = `ASSIGN cCodEstab      = oJsonPayloadObject:GetCharacter("codEstabel")
                         cDtSaldoStr    = oJsonPayloadObject:GetCharacter("dtSaldo") NO-ERROR.
                  IF cDtSaldoStr <> "" AND cDtSaldoStr <> ? THEN DO:
                      IF INDEX(cDtSaldoStr, "-") > 0 THEN
                          ASSIGN dtSaldo = DATE(INTEGER(ENTRY(2, cDtSaldoStr, "-")),
                                                INTEGER(ENTRY(3, cDtSaldoStr, "-")),
                                                INTEGER(ENTRY(1, cDtSaldoStr, "-"))) NO-ERROR.
                      ELSE IF INDEX(cDtSaldoStr, "/") > 0 THEN
                          ASSIGN dtSaldo = DATE(INTEGER(ENTRY(2, cDtSaldoStr, "/")),
                                                INTEGER(ENTRY(1, cDtSaldoStr, "/")),
                                                INTEGER(ENTRY(3, cDtSaldoStr, "/"))) NO-ERROR.
                      ELSE
                          ASSIGN dtSaldo = DATE(cDtSaldoStr) NO-ERROR.
                  END.
                  ELSE ASSIGN dtSaldo = ?.`;

if (contentFichas.includes(oldParseLoop)) {
  contentFichas = contentFichas.replace(oldParseLoop, newParseLoop);
}

// Parsing fora do array
const oldParseSingle = `ASSIGN cCodEstab      = jsonInput:GetCharacter("codEstabel")
                    dtSaldo        = jsonInput:GetDate("dtSaldo")`;

const newParseSingle = `ASSIGN cCodEstab      = jsonInput:GetCharacter("codEstabel")
                    cDtSaldoStr    = jsonInput:GetCharacter("dtSaldo") NO-ERROR.
             IF cDtSaldoStr <> "" AND cDtSaldoStr <> ? THEN DO:
                 IF INDEX(cDtSaldoStr, "-") > 0 THEN
                     ASSIGN dtSaldo = DATE(INTEGER(ENTRY(2, cDtSaldoStr, "-")),
                                           INTEGER(ENTRY(3, cDtSaldoStr, "-")),
                                           INTEGER(ENTRY(1, cDtSaldoStr, "-"))) NO-ERROR.
                 ELSE IF INDEX(cDtSaldoStr, "/") > 0 THEN
                     ASSIGN dtSaldo = DATE(INTEGER(ENTRY(2, cDtSaldoStr, "/")),
                                           INTEGER(ENTRY(1, cDtSaldoStr, "/")),
                                           INTEGER(ENTRY(3, cDtSaldoStr, "/"))) NO-ERROR.
                 ELSE
                     ASSIGN dtSaldo = DATE(cDtSaldoStr) NO-ERROR.
             END.
             ELSE ASSIGN dtSaldo = ?.`;

if (contentFichas.includes(oldParseSingle)) {
  contentFichas = contentFichas.replace(oldParseSingle, newParseSingle);
}

// Declarar variável cDtSaldoStr se não existir
if (!contentFichas.includes('cDtSaldoStr')) {
  contentFichas = contentFichas.replace(
    'DEFINE VAR dtSaldo            AS DATE      NO-UNDO.',
    'DEFINE VAR dtSaldo            AS DATE      NO-UNDO.\r\n    DEFINE VAR cDtSaldoStr         AS CHARACTER NO-UNDO.'
  );
}

// Corrigir FOR EACH inventario para não depender de FIRST ITEM OF inventario
const oldJoinItem = `FIRST ITEM OF inventario NO-LOCK:

            FIND FIRST deposito OF inventario NO-LOCK NO-ERROR.`;

const newJoinItem = `:

            FIND FIRST ITEM WHERE ITEM.it-codigo = inventario.it-codigo NO-LOCK NO-ERROR.
            FIND FIRST deposito WHERE deposito.cod-depos = inventario.cod-depos NO-LOCK NO-ERROR.`;

if (contentFichas.includes(oldJoinItem)) {
  contentFichas = contentFichas.replace(oldJoinItem, newJoinItem);
  console.log('✓ Removido FIRST ITEM OF inventario para FIND FIRST seguro!');
}

// Tratamento de ITEM e UN no JSON
contentFichas = contentFichas.replace(
  'oJsonOutput:ADD("descItem",     fn-free-accent(ITEM.desc-item)).',
  'oJsonOutput:ADD("descItem",     IF AVAIL ITEM THEN fn-free-accent(ITEM.desc-item) ELSE inventario.it-codigo).'
);
contentFichas = contentFichas.replace(
  'oJsonOutput:ADD("un",           ITEM.un).',
  'oJsonOutput:ADD("un",           IF AVAIL ITEM THEN ITEM.un ELSE "UN").'
);

contentFichas = contentFichas.replace(/\r?\n/g, '\r\n');
fs.writeFileSync(pathFichas, iconv.encode(contentFichas, 'cp850'));
console.log('✓ fcGetInventariosFichas.p corrigido e salvo em CP850 / CRLF!');

// =========================================================================
// 3. ATUALIZAR public/app.js (corrigir escopo de params e datasAtivas)
// =========================================================================
const pathApp = 'public/app.js';
let contentApp = fs.readFileSync(pathApp, 'utf8');

const oldAppBlock = `    if (deveBuscarOnline) {
      mostrarLoading('Consultando TOTVS', \`Buscando parâmetros e fichas de inventário da Empresa \${codEmpresa}...\`);
      let houveRespostaWebservice = false;
      let totalFichasRecebidas = 0;
      let qtdParamRecebidos = 0;

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
          const params = extrairLista(dP);
          houveRespostaWebservice = true;
          qtdParamRecebidos = params.length;
          if (params.length > 0) {
            await DB.bulkPut('fmsc_inventario', params, codEmpresa);
          } else {
            await DB.clearEmpresa('fmsc_inventario', codEmpresa);
          }
        }

        // 2. Fichas de inventário (1ª, 2ª e 3ª contagens) com Detecção de Atualizações Externas no TOTVS
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
        const datasParaBuscar = datasAtivas.length > 0 ? datasAtivas : [''];`;

const newAppBlock = `    if (deveBuscarOnline) {
      mostrarLoading('Consultando TOTVS', \`Buscando parâmetros e fichas de inventário da Empresa \${codEmpresa}...\`);
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
          if (params.length > 0) {
            await DB.bulkPut('fmsc_inventario', params, codEmpresa);
          } else {
            await DB.clearEmpresa('fmsc_inventario', codEmpresa);
          }
        }

        // Se params veio vazio da API, tenta obter do banco local
        if (params.length === 0) {
          params = await DB.getAllByEmpresa('fmsc_inventario', codEmpresa);
        }

        datasAtivas = [...new Set(params.map(p => normalizarDataIso(p.dtSaldo)).filter(Boolean))];

        // 2. Fichas de inventário (1ª, 2ª e 3ª contagens) com Detecção de Atualizações Externas no TOTVS
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
        const datasParaBuscar = datasAtivas.length > 0 ? datasAtivas : [''];`;

if (contentApp.includes(oldAppBlock)) {
  contentApp = contentApp.replace(oldAppBlock, newAppBlock);
  console.log('✓ Escopo de params e datasAtivas corrigido em public/app.js!');
  fs.writeFileSync(pathApp, contentApp, 'utf8');
} else {
  console.log('Aviso: oldAppBlock não casou em public/app.js!');
}

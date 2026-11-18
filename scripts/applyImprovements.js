const fs = require('fs');
const path = require('path');

// -------------------------------------------------------------------------
// 1. Atualizar collect/fms002.df
// -------------------------------------------------------------------------
const dfPath = path.resolve(__dirname, '..', 'collect', 'fms002.df');
let dfContent = fs.readFileSync(dfPath, 'latin1');

const novoCampoDF = [
  'ADD FIELD "nr-contag-ativa" OF "fmsc-inventario" AS integer ',
  '  DESCRIPTION "Num Contagem"',
  '  FORMAT ">>9"',
  '  INITIAL "1"',
  '  LABEL "Num Contagem"',
  '  POSITION 17',
  '  MAX-WIDTH 4',
  '  COLUMN-LABEL "Num Contagem"',
  '  ORDER 150',
  '',
  ''
].join('\r\n');

if (!dfContent.includes('nr-contag-ativa')) {
  dfContent = dfContent.replace('ADD INDEX "ch-ph"', novoCampoDF + 'ADD INDEX "ch-ph"');
  fs.writeFileSync(dfPath, Buffer.from(dfContent, 'latin1'));
  console.log('[OK] collect/fms002.df atualizado com nr-contag-ativa.');
} else {
  console.log('[INFO] collect/fms002.df já contém nr-contag-ativa.');
}

// -------------------------------------------------------------------------
// 2. Atualizar fcGetInventarioParam.p para retornar nrContagAtiva
// -------------------------------------------------------------------------
const paramPath = path.resolve(__dirname, '..', 'collect', 'app', 'fcGetInventarioParam.p');
let paramContent = fs.readFileSync(paramPath, 'latin1');

if (!paramContent.includes('nrContagAtiva')) {
  // Bloco 1: quando busca por dt-Invent específico
  paramContent = paramContent.replace(
    'oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).',
    'oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).\r\n                oJsonOutput:ADD("nrContagAtiva",    (IF fmsc-inventario.nr-contag-ativa > 0 THEN fmsc-inventario.nr-contag-ativa ELSE 1)).'
  );
  // Bloco 2: quando lista todos os inventários abertos da empresa
  paramContent = paramContent.replace(
    'oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).\r\n            \r\n            oJsonArray :ADD(oJsonOutput).',
    'oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).\r\n            oJsonOutput:ADD("nrContagAtiva",    (IF fmsc-inventario.nr-contag-ativa > 0 THEN fmsc-inventario.nr-contag-ativa ELSE 1)).\r\n            \r\n            oJsonArray :ADD(oJsonOutput).'
  );
  fs.writeFileSync(paramPath, Buffer.from(paramContent.replace(/\r?\n/g, '\r\n'), 'latin1'));
  console.log('[OK] collect/app/fcGetInventarioParam.p atualizado com nrContagAtiva.');
}

// -------------------------------------------------------------------------
// 3. Atualizar old_fcGetInventarioParam.p
// -------------------------------------------------------------------------
const oldParamPath = path.resolve(__dirname, '..', 'collect', 'app', 'old_fcGetInventarioParam.p');
let oldParamContent = fs.readFileSync(oldParamPath, 'latin1');

if (!oldParamContent.includes('nrContagAtiva')) {
  oldParamContent = oldParamContent.replace(
    'oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).',
    'oJsonOutput:ADD("indTipoInv",       fmsc-inventario.ind-tipo-inv).\r\n            oJsonOutput:ADD("nrContagAtiva",    (IF fmsc-inventario.nr-contag-ativa > 0 THEN fmsc-inventario.nr-contag-ativa ELSE 1)).'
  );
  fs.writeFileSync(oldParamPath, Buffer.from(oldParamContent.replace(/\r?\n/g, '\r\n'), 'latin1'));
  console.log('[OK] collect/app/old_fcGetInventarioParam.p atualizado com nrContagAtiva.');
}

// -------------------------------------------------------------------------
// 4. Validar nr-contag-ativa em fcSetInventarioApuracaoFicha.p
// -------------------------------------------------------------------------
const apurPath = path.resolve(__dirname, '..', 'collect', 'app', 'fcSetInventarioApuracaoFicha.p');
let apurContent = fs.readFileSync(apurPath, 'latin1');

if (!apurContent.includes('nr-contag-ativa')) {
  const findInv = 'FIND FIRST inventario NO-LOCK\r\n            WHERE inventario.dt-saldo       = dtSaldo';
  const validacaoContagem = [
    '/* Valida situacao e contagem ativa em fmsc-inventario */',
    '        FIND FIRST fmsc-inventario NO-LOCK',
    '             WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)',
    '               AND fmsc-inventario.dt-saldo  = dtSaldo NO-ERROR.',
    '        IF AVAIL fmsc-inventario THEN DO:',
    '            IF fmsc-inventario.nr-contag-ativa = 4 THEN DO:',
    '                RUN setErrorResponse(\'Inventario Concluido (Contagem 4). Nao e permitido apurar fichas.\', OUTPUT jsonOutput).',
    '                RETURN \'NOK\'.',
    '            END.',
    '            IF fmsc-inventario.nr-contag-ativa > 0 AND i-nrContagem <> fmsc-inventario.nr-contag-ativa THEN DO:',
    '                RUN setErrorResponse(SUBSTITUTE(\'Contagem bloqueada. A contagem ativa e a &1a contagem.\', fmsc-inventario.nr-contag-ativa), OUTPUT jsonOutput).',
    '                RETURN \'NOK\'.',
    '            END.',
    '        END.',
    '',
    '        ' + findInv
  ].join('\r\n');

  apurContent = apurContent.replace(findInv, validacaoContagem);
  fs.writeFileSync(apurPath, Buffer.from(apurContent.replace(/\r?\n/g, '\r\n'), 'latin1'));
  console.log('[OK] collect/app/fcSetInventarioApuracaoFicha.p atualizado com validacao de nr-contag-ativa.');
}

// -------------------------------------------------------------------------
// 5. Validar nr-contag-ativa em fcSetInventarioNovaFicha.p
// -------------------------------------------------------------------------
const novaFichaPath = path.resolve(__dirname, '..', 'collect', 'app', 'fcSetInventarioNovaFicha.p');
let novaFichaContent = fs.readFileSync(novaFichaPath, 'latin1');

if (!novaFichaContent.includes('nr-contag-ativa')) {
  const findInv2 = 'FIND FIRST inventario NO-LOCK\r\n            WHERE inventario.dt-saldo       = dtSaldo NO-ERROR.';
  const validacaoContagem2 = [
    '/* Valida situacao e contagem ativa em fmsc-inventario */',
    '        FIND FIRST fmsc-inventario NO-LOCK',
    '             WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)',
    '               AND fmsc-inventario.dt-saldo  = dtSaldo NO-ERROR.',
    '        IF AVAIL fmsc-inventario THEN DO:',
    '            IF fmsc-inventario.nr-contag-ativa = 4 THEN DO:',
    '                RUN setErrorResponse(\'Inventario Concluido (Contagem 4). Nao e permitido incluir fichas avulsas.\', OUTPUT jsonOutput).',
    '                RETURN \'NOK\'.',
    '            END.',
    '            IF fmsc-inventario.nr-contag-ativa > 0 AND i-nrContagem <> fmsc-inventario.nr-contag-ativa THEN DO:',
    '                RUN setErrorResponse(SUBSTITUTE(\'Inclusao bloqueada. A contagem ativa e a &1a contagem.\', fmsc-inventario.nr-contag-ativa), OUTPUT jsonOutput).',
    '                RETURN \'NOK\'.',
    '            END.',
    '        END.',
    '',
    '        ' + findInv2
  ].join('\r\n');

  novaFichaContent = novaFichaContent.replace(findInv2, validacaoContagem2);
  fs.writeFileSync(novaFichaPath, Buffer.from(novaFichaContent.replace(/\r?\n/g, '\r\n'), 'latin1'));
  console.log('[OK] collect/app/fcSetInventarioNovaFicha.p atualizado com validacao de nr-contag-ativa.');
}

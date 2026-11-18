const fs = require('fs');
const path = require('path');

// =========================================================================
// SCRIPT DE CORREÇÃO SINTÁTICA DOS FONTES PROGRESS ABL (CP850 / ibm850 + CRLF)
// =========================================================================

function fixFile(filePath, fixerFn) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  const buf = fs.readFileSync(fullPath);
  // Lê como latin1 para preservar cada byte exatamente (1:1 com CP850)
  const originalStr = buf.toString('latin1');
  const updatedStr = fixerFn(originalStr);
  
  // Assegura CRLF consistente
  const crlfStr = updatedStr.replace(/\r?\n/g, '\r\n');
  
  fs.writeFileSync(fullPath, Buffer.from(crlfStr, 'latin1'));
  console.log(`[CORRIGIDO COM SUCESSO] ${filePath}`);
}

// -------------------------------------------------------------------------
// 1. fcSetInventarioApuracaoFicha.p
// -------------------------------------------------------------------------
fixFile('collect/app/fcSetInventarioApuracaoFicha.p', (src) => {
  let lines = src.split(/\r?\n/);

  // 1. Garante que c-ep-codigo está declarado
  const hasDef = lines.some(l => /define\s+(var|variable)\s+c-ep-codigo/i.test(l));
  if (!hasDef) {
    const idxDt = lines.findIndex(l => /DEFINE VAR dtSaldo/i.test(l));
    if (idxDt !== -1) {
      lines.splice(idxDt, 0, '    DEFINE VAR c-ep-codigo          AS CHAR         NO-UNDO.');
    }
  }

  // 2. Garante que c-ep-codigo é lido de jsonInput antes do loop se ainda não estiver
  const idxLoop = lines.findIndex(l => l.includes('DO iContPayload = 1 TO aJsonPayloadArray:LENGTH'));
  const hasRootRead = lines.some(l => l.includes('ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa")'));
  if (idxLoop !== -1 && !hasRootRead) {
    lines.splice(idxLoop, 0,
      '        ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa") NO-ERROR.',
      '        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
      '            ASSIGN c-ep-codigo = jsonInput:GetCharacter("epCodigo") NO-ERROR.',
      ''
    );
  }

  // 3. Remove c-ep-codigo com NO-ERROR de dentro do ASSIGN e move para depois
  for (let i = 0; i < lines.length; i++) {
    if (/ASSIGN\s+c-ep-codigo\s*=\s*oJsonPayloadObject:GetCharacter\("codEmpresa"\)\s*NO-ERROR/i.test(lines[i])) {
      lines[i] = '            ASSIGN dtSaldo          = oJsonPayloadObject:GetDate("dtSaldo")';
      // Localiza o fim do ASSIGN (linha que termina com ponto)
      for (let j = i + 1; j < lines.length && j < i + 20; j++) {
        if (lines[j].trim().endsWith('.')) {
          lines.splice(j + 1, 0,
            '',
            '            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
            '                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.',
            '            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
            '                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.'
          );
          break;
        }
      }
      break;
    }
  }

  return lines.join('\r\n');
});

// -------------------------------------------------------------------------
// 2. fcSetInventarioNovaFicha.p
// -------------------------------------------------------------------------
fixFile('collect/app/fcSetInventarioNovaFicha.p', (src) => {
  let lines = src.split(/\r?\n/);

  // 1. Garante que c-ep-codigo está declarado
  const hasDef = lines.some(l => /define\s+(var|variable)\s+c-ep-codigo/i.test(l));
  if (!hasDef) {
    const idxDt = lines.findIndex(l => /DEFINE VAR dtSaldo/i.test(l));
    if (idxDt !== -1) {
      lines.splice(idxDt, 0, '    DEFINE VAR c-ep-codigo          AS CHAR         NO-UNDO.');
    }
  }

  // 2. Garante que c-ep-codigo é lido de jsonInput antes do loop se ainda não estiver
  const idxLoop = lines.findIndex(l => l.includes('DO iContPayload = 1 TO aJsonPayloadArray:LENGTH'));
  const hasRootRead = lines.some(l => l.includes('ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa")'));
  if (idxLoop !== -1 && !hasRootRead) {
    lines.splice(idxLoop, 0,
      '        ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa") NO-ERROR.',
      '        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
      '            ASSIGN c-ep-codigo = jsonInput:GetCharacter("epCodigo") NO-ERROR.',
      ''
    );
  }

  // 3. Remove c-ep-codigo com NO-ERROR de dentro do ASSIGN e move para depois
  for (let i = 0; i < lines.length; i++) {
    if (/ASSIGN\s+c-ep-codigo\s*=\s*oJsonPayloadObject:GetCharacter\("codEmpresa"\)\s*NO-ERROR/i.test(lines[i])) {
      lines[i] = '            ASSIGN dtSaldo          = oJsonPayloadObject:GetDate("dtSaldo")';
      for (let j = i + 1; j < lines.length && j < i + 25; j++) {
        if (lines[j].trim().endsWith('.')) {
          lines.splice(j + 1, 0,
            '',
            '            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
            '                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.',
            '            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
            '                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.'
          );
          break;
        }
      }
      break;
    }
  }

  return lines.join('\r\n');
});

// -------------------------------------------------------------------------
// 3. fcGetInventariosFichas.p
// -------------------------------------------------------------------------
fixFile('collect/app/fcGetInventariosFichas.p', (src) => {
  let lines = src.split(/\r?\n/);

  // Remove NO-ERROR de cada linha intermediária nos blocos de ASSIGN
  // Linhas 59-67 e 77-85
  let inAssign = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^assign\b/i.test(trimmed)) {
      inAssign = true;
    }
    if (inAssign) {
      // Se não termina com ponto (isto é, linha intermediária do assign)
      if (!trimmed.endsWith('.')) {
        // Remove NO-ERROR desta linha
        if (/NO-ERROR/i.test(lines[i])) {
          lines[i] = lines[i].replace(/\s+NO-ERROR/gi, '');
        }
      } else {
        // Fim do assign
        inAssign = false;
      }
    }
  }

  return lines.join('\r\n');
});

// -------------------------------------------------------------------------
// 4. fcGetInventarioParam.p
// -------------------------------------------------------------------------
fixFile('collect/app/fcGetInventarioParam.p', (src) => {
  let lines = src.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ASSIGN dt-Invent   = ?')) {
      lines[i] = '        ASSIGN dt-Invent   = ?.';
    }
    if (lines[i].includes('c-ep-codigo = jsonInput:GetCharacter("codEmpresa") NO-ERROR.')) {
      lines[i] = '        ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa") NO-ERROR.';
    }
  }

  return lines.join('\r\n');
});

console.log('Todos os arquivos foram processados!');

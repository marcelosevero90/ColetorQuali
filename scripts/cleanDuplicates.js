const fs = require('fs');
const path = require('path');

function cleanFile(filePath, cleanerFn) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  const buf = fs.readFileSync(fullPath);
  const originalStr = buf.toString('latin1');
  const cleanedStr = cleanerFn(originalStr);
  const crlfStr = cleanedStr.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(fullPath, Buffer.from(crlfStr, 'latin1'));
  console.log(`[LIMPO COM SUCESSO] ${filePath}`);
}

// 1. fcSetInventarioApuracaoFicha.p
cleanFile('collect/app/fcSetInventarioApuracaoFicha.p', (src) => {
  let lines = src.split(/\r?\n/);
  // Remove linhas duplicadas residuais
  const idxStart = lines.findIndex(l => l.includes('i-nrContagem     = oJsonPayloadObject:GetInteger("nrContagem").'));
  const idxEnd = lines.findIndex(l => l.includes('END.                                            '));
  if (idxStart !== -1 && idxEnd !== -1 && idxEnd > idxStart) {
    const newMiddle = [
      '            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
      '                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.',
      '            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
      '                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.'
    ];
    lines.splice(idxStart + 1, idxEnd - idxStart - 1, ...newMiddle);
  }
  return lines.join('\r\n');
});

// 2. fcSetInventarioNovaFicha.p
cleanFile('collect/app/fcSetInventarioNovaFicha.p', (src) => {
  let lines = src.split(/\r?\n/);
  const idxStart = lines.findIndex(l => l.includes('d-vlGgf          = oJsonPayloadObject:GetDecimal("vlGgf").'));
  const idxEnd = lines.findIndex(l => l.includes('END.                                            '));
  if (idxStart !== -1 && idxEnd !== -1 && idxEnd > idxStart) {
    const newMiddle = [
      '            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
      '                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.',
      '            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN',
      '                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.'
    ];
    lines.splice(idxStart + 1, idxEnd - idxStart - 1, ...newMiddle);
  }
  return lines.join('\r\n');
});

console.log('Limpeza de duplicações concluída.');

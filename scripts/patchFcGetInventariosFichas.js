const fs = require('fs');
const iconv = require('iconv-lite');

const path = 'collect/app/fcGetInventariosFichas.p';
let content = iconv.decode(fs.readFileSync(path), 'cp850');

console.log('Tamanho inicial:', content.length);

// 1. Variável lApenasPendentes
if (!content.includes('lApenasPendentes')) {
  content = content.replace(
    'DEFINE VAR cUsuario           AS CHARACTER NO-UNDO.',
    'DEFINE VAR cUsuario           AS CHARACTER NO-UNDO.\r\n    DEFINE VAR lApenasPendentes   AS LOGICAL   NO-UNDO INITIAL NO.'
  );
  content = content.replace(
    'ASSIGN cUsuario       = oJsonPayloadObject:GetCharacter("codUsuario") NO-ERROR.',
    'ASSIGN cUsuario       = oJsonPayloadObject:GetCharacter("codUsuario") NO-ERROR.\r\n                         lApenasPendentes = oJsonPayloadObject:GetLogical("apenasPendentes") NO-ERROR.'
  );
  content = content.replace(
    'ASSIGN cCodEstab      = jsonInput:GetCharacter("codEstabel")',
    'ASSIGN lApenasPendentes = jsonInput:GetLogical("apenasPendentes") NO-ERROR.\r\n            ASSIGN cCodEstab      = jsonInput:GetCharacter("codEstabel")'
  );
}

// 2. Ajuste do WHERE para permitir trazer todas as fichas quando lApenasPendentes = NO
const patternWhere = /AND\s*\(IF\s*iNrContagem\s*=\s*1\s*THEN\s*inventario\.val-apurado\[1\]\s*=\s*\?[\s\S]*?ELSE\s*TRUE\),/;
const newWhere = `AND (IF lApenasPendentes THEN
                    (IF iNrContagem = 1 THEN inventario.val-apurado[1] = ?
                     ELSE IF iNrContagem = 2 THEN inventario.val-apurado[2] = ?
                     ELSE IF iNrContagem = 3 THEN inventario.val-apurado[3] = ?
                     ELSE TRUE)
                  ELSE TRUE),`;

if (patternWhere.test(content)) {
  content = content.replace(patternWhere, newWhere);
  console.log('WHERE atualizado com sucesso!');
} else {
  console.log('Aviso: patternWhere não casou!');
}

// 3. Adicionar campos detalhados de apuração no JSON de retorno
const targetJson = 'oJsonOutput:ADD("qtApurada",    inventario.val-apurado[iNrContagem]).';
const newJson = `oJsonOutput:ADD("qtApurada",        inventario.val-apurado[iNrContagem]).
            oJsonOutput:ADD("valApurado1",      inventario.val-apurado[1]).
            oJsonOutput:ADD("valApurado2",      inventario.val-apurado[2]).
            oJsonOutput:ADD("valApurado3",      inventario.val-apurado[3]).
            oJsonOutput:ADD("codConfteContag1", inventario.cod-confte-contag[1]).
            oJsonOutput:ADD("codConfteContag2", inventario.cod-confte-contag[2]).
            oJsonOutput:ADD("codConfteContag3", inventario.cod-confte-contag[3]).`;

if (content.includes(targetJson)) {
  content = content.replace(targetJson, newJson);
  console.log('Campos JSON atualizados com sucesso!');
} else {
  console.log('Aviso: targetJson não encontrado!');
}

// Normaliza quebras de linha para CRLF
content = content.replace(/\r?\n/g, '\r\n');

fs.writeFileSync(path, iconv.encode(content, 'cp850'));
console.log('Arquivo salvo com sucesso em CP850 / CRLF!');

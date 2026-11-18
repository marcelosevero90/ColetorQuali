const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const filePath = path.resolve(__dirname, '..', 'collect', 'app', 'fcGetLote.p');
let content = iconv.decode(fs.readFileSync(filePath), 'cp850');

content = content.replace(
  'define var cItCodigo            AS CHAR         NO-UNDO.',
  'define var cItCodigo            AS CHAR         NO-UNDO.\r\n    define var cCodDepos            AS CHAR         NO-UNDO.'
);

content = content.replace(
  'cItCodigo            = oJsonPayloadObject:GetCharacter("itCodigo").',
  'cItCodigo            = oJsonPayloadObject:GetCharacter("itCodigo").\r\n            IF oJsonPayloadObject:Has("codDepos") THEN\r\n                ASSIGN cCodDepos = oJsonPayloadObject:GetCharacter("codDepos") NO-ERROR.'
);

content = content.replace(
  'AND (IF cItCodigo <> "" AND cItCodigo <> ? THEN saldo-estoq.it-codigo = cItCodigo ELSE TRUE) \r\n              AND saldo-estoq.qtidade-atu',
  'AND (IF cItCodigo <> "" AND cItCodigo <> ? THEN saldo-estoq.it-codigo = cItCodigo ELSE TRUE)\r\n              AND (IF cCodDepos <> "" AND cCodDepos <> ? THEN saldo-estoq.cod-depos = cCodDepos ELSE TRUE)\r\n              AND saldo-estoq.lote <> ""\r\n              AND saldo-estoq.qtidade-atu'
);

content = content.replace(
  'AND (IF cItCodigo <> "" AND cItCodigo <> ? THEN saldo-estoq.it-codigo = cItCodigo ELSE TRUE)\r\n              AND saldo-estoq.qtidade-atu',
  'AND (IF cItCodigo <> "" AND cItCodigo <> ? THEN saldo-estoq.it-codigo = cItCodigo ELSE TRUE)\r\n              AND (IF cCodDepos <> "" AND cCodDepos <> ? THEN saldo-estoq.cod-depos = cCodDepos ELSE TRUE)\r\n              AND saldo-estoq.lote <> ""\r\n              AND saldo-estoq.qtidade-atu'
);

fs.writeFileSync(filePath, iconv.encode(content.replace(/\r?\n/g, '\r\n'), 'cp850'));
console.log('[OK] collect/app/fcGetLote.p atualizado com filtro de lote preenchido e cCodDepos opcional.');

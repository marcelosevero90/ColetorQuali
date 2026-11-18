const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// 1. Atualizar fcGetLocalizacao.p
const locPath = path.resolve(__dirname, '..', 'collect', 'app', 'fcGetLocalizacao.p');
let loc = iconv.decode(fs.readFileSync(locPath), 'cp850');

const targetLoc = 'WHERE localizacao.cod-estabel   = cCodEstab';
const replLoc = 'WHERE (IF cCodEstab <> "" AND cCodEstab <> ? THEN localizacao.cod-estabel = cCodEstab ELSE TRUE)';

if (loc.includes(targetLoc)) {
  loc = loc.replace(targetLoc, replLoc);
  fs.writeFileSync(locPath, iconv.encode(loc.replace(/\r?\n/g, '\r\n'), 'cp850'));
  console.log('[OK] fcGetLocalizacao.p atualizado com sucesso!');
} else {
  console.log('[INFO] fcGetLocalizacao.p já estava atualizado ou target não encontrado');
}

// 2. Atualizar fcGetLote.p
const lotePath = path.resolve(__dirname, '..', 'collect', 'app', 'fcGetLote.p');
let lote = iconv.decode(fs.readFileSync(lotePath), 'cp850');

const targetLote1 = 'WHERE saldo-estoq.cod-estabel   = cEstab \r\n              AND saldo-estoq.it-codigo     = cItCodigo';
const targetLote2 = 'WHERE saldo-estoq.cod-estabel   = cEstab\r\n              AND saldo-estoq.it-codigo     = cItCodigo';
const targetLote3 = 'WHERE saldo-estoq.cod-estabel   = cEstab \n              AND saldo-estoq.it-codigo     = cItCodigo';
const targetLote4 = 'WHERE saldo-estoq.cod-estabel   = cEstab\n              AND saldo-estoq.it-codigo     = cItCodigo';

const replLote = 'WHERE (IF cEstab <> "" AND cEstab <> ? THEN saldo-estoq.cod-estabel = cEstab ELSE TRUE)\r\n              AND (IF cItCodigo <> "" AND cItCodigo <> ? THEN saldo-estoq.it-codigo = cItCodigo ELSE TRUE)';

if (lote.includes('saldo-estoq.cod-estabel   = cEstab')) {
  lote = lote.replace(/WHERE\s+saldo-estoq\.cod-estabel\s*=\s*cEstab\s+AND\s+saldo-estoq\.it-codigo\s*=\s*cItCodigo/i, replLote);
  fs.writeFileSync(lotePath, iconv.encode(lote.replace(/\r?\n/g, '\r\n'), 'cp850'));
  console.log('[OK] fcGetLote.p atualizado com sucesso!');
} else {
  console.log('[INFO] fcGetLote.p já estava atualizado ou target não encontrado');
}

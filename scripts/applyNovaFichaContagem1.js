const fs = require('fs');
const iconv = require('iconv-lite');

let txt = iconv.decode(fs.readFileSync('collect/app/fcSetInventarioNovaFicha.p'), 'cp850');

const pStart = txt.indexOf('IF oJsonPayloadObject:Has("nrContagem") THEN');
const pEnd = txt.indexOf('FIND FIRST inventario NO-LOCK');

if (pStart !== -1 && pEnd !== -1) {
  const replacement = `/* Inclusao de nova ficha avulsa e sempre gravada na 1a contagem */
        ASSIGN i-nrContagem = 1.

        /* Valida se inventario esta concluido em fmsc-inventario */
        FIND FIRST fmsc-inventario NO-LOCK
             WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
               AND fmsc-inventario.dt-saldo  = dtSaldo NO-ERROR.
        IF AVAIL fmsc-inventario THEN DO:
            IF fmsc-inventario.nr-contag-ativa = 4 THEN DO:
                RUN setErrorResponse('Inventario Concluido (Contagem 4). Nao e permitido incluir fichas avulsas.', OUTPUT jsonOutput).
                RETURN 'NOK'.
            END.
        END.

        `;

  txt = txt.substring(0, pStart) + replacement + txt.substring(pEnd);
  fs.writeFileSync('collect/app/fcSetInventarioNovaFicha.p', iconv.encode(txt.replace(/\r?\n/g, '\r\n'), 'cp850'));
  console.log('fcSetInventarioNovaFicha.p atualizado com contagem 1 com sucesso!');
} else {
  console.error('Marcadores não encontrados');
}

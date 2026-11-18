const fs = require('fs');
const iconv = require('iconv-lite');

let txt = iconv.decode(fs.readFileSync('collect/app/fcSetInventarioNovaFicha.p'), 'cp850');

const oldBlock = `        IF oJsonPayloadObject:Has("nrContagem") THEN
            ASSIGN i-nrContagem = oJsonPayloadObject:GetInteger("nrContagem") NO-ERROR.

        /* Valida situacao e contagem ativa em fmsc-inventario */
        FIND FIRST fmsc-inventario NO-LOCK
             WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
               AND fmsc-inventario.dt-saldo  = dtSaldo NO-ERROR.
        IF AVAIL fmsc-inventario THEN DO:
            IF fmsc-inventario.nr-contag-ativa = 4 THEN DO:
                RUN setErrorResponse('Inventario Concluido (Contagem 4). Nao e permitido incluir fichas avulsas.', OUTPUT jsonOutput).
                RETURN 'NOK'.
            END.
            IF i-nrContagem = 0 OR i-nrContagem = ? THEN
                ASSIGN i-nrContagem = (IF fmsc-inventario.nr-contag-ativa > 0 THEN fmsc-inventario.nr-contag-ativa ELSE 1).
            ELSE IF fmsc-inventario.nr-contag-ativa > 0 AND i-nrContagem <> fmsc-inventario.nr-contag-ativa THEN DO:
                RUN setErrorResponse(SUBSTITUTE('Inclusao bloqueada. A contagem ativa e a &1a contagem.', fmsc-inventario.nr-contag-ativa), OUTPUT jsonOutput).
                RETURN 'NOK'.
            END.
        END.
        ELSE DO:
            IF i-nrContagem = 0 OR i-nrContagem = ? THEN ASSIGN i-nrContagem = 1.
        END.`;

const newBlock = `        /* Inclusao de nova ficha avulsa e sempre gravada na 1a contagem */
        ASSIGN i-nrContagem = 1.

        /* Valida situacao em fmsc-inventario */
        FIND FIRST fmsc-inventario NO-LOCK
             WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
               AND fmsc-inventario.dt-saldo  = dtSaldo NO-ERROR.
        IF AVAIL fmsc-inventario THEN DO:
            IF fmsc-inventario.nr-contag-ativa = 4 THEN DO:
                RUN setErrorResponse('Inventario Concluido (Contagem 4). Nao e permitido incluir fichas avulsas.', OUTPUT jsonOutput).
                RETURN 'NOK'.
            END.
        END.`;

if (txt.includes(oldBlock)) {
  txt = txt.replace(oldBlock, newBlock);
  fs.writeFileSync('collect/app/fcSetInventarioNovaFicha.p', iconv.encode(txt.replace(/\r?\n/g, '\r\n'), 'cp850'));
  console.log('fcSetInventarioNovaFicha.p atualizado com contagem = 1 fixa com sucesso.');
} else {
  console.error('oldBlock não encontrado em fcSetInventarioNovaFicha.p');
}

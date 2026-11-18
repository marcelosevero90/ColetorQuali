const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const filePath = path.resolve(__dirname, '..', 'collect', 'app', 'fcSetInventarioNovaFicha.p');
let content = iconv.decode(fs.readFileSync(filePath), 'cp850');

const targetStr = `        /* Valida situacao e contagem ativa em fmsc-inventario */
        FIND FIRST fmsc-inventario NO-LOCK
             WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
               AND fmsc-inventario.dt-saldo  = dtSaldo NO-ERROR.
        IF AVAIL fmsc-inventario THEN DO:
            IF fmsc-inventario.nr-contag-ativa = 4 THEN DO:
                RUN setErrorResponse('Inventario Concluido (Contagem 4). Nao e permitido incluir fichas avulsas.', OUTPUT jsonOutput).
                RETURN 'NOK'.
            END.
            IF fmsc-inventario.nr-contag-ativa > 0 AND i-nrContagem <> fmsc-inventario.nr-contag-ativa THEN DO:
                RUN setErrorResponse(SUBSTITUTE('Inclusao bloqueada. A contagem ativa e a &1a contagem.', fmsc-inventario.nr-contag-ativa), OUTPUT jsonOutput).
                RETURN 'NOK'.
            END.
        END.`;

const replStr = `        IF oJsonPayloadObject:Has("nrContagem") THEN
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

content = content.replace(/\r?\n/g, '\n');
const targetNorm = targetStr.replace(/\r?\n/g, '\n');
const replNorm = replStr.replace(/\r?\n/g, '\r\n');

if (content.includes(targetNorm)) {
  content = content.replace(targetNorm, replNorm);
  fs.writeFileSync(filePath, iconv.encode(content.replace(/\r?\n/g, '\r\n'), 'cp850'));
  console.log('[OK] fcSetInventarioNovaFicha.p atualizado com leitura flexivel de nrContagem!');
} else {
  console.log('[WARN] targetStr não encontrado em fcSetInventarioNovaFicha.p');
}

const fs = require('fs');
const iconv = require('iconv-lite');

// Lê o arquivo original em binary
let fc = fs.readFileSync('collect/app/fcSetInventarioNovaFicha.p', 'binary');

// 1. Variáveis adicionais
if (!fc.includes('DEFINE VAR dtValiLote')) {
  fc = fc.replace(
    'DEFINE VAR d-vlGgf              AS DEC          NO-UNDO.',
    'DEFINE VAR d-vlGgf              AS DEC          NO-UNDO.\r\n    DEFINE VAR dtValiLote           AS DATE         NO-UNDO.\r\n    DEFINE VAR cDtValiLote          AS CHAR         NO-UNDO.\r\n    DEFINE VAR cDtSaldo             AS CHAR         NO-UNDO.'
  );
}

// 2. Leitura segura de dtSaldo e dtValiLote
const oldRead = 'ASSIGN dtSaldo          = oJsonPayloadObject:GetDate("dtSaldo")';
const newRead = `ASSIGN cDtSaldo = oJsonPayloadObject:GetCharacter("dtSaldo") NO-ERROR.
            IF cDtSaldo <> "" AND cDtSaldo <> ? THEN DO:
                IF INDEX(cDtSaldo, "-") > 0 THEN
                    ASSIGN dtSaldo = DATE(INTEGER(ENTRY(2, cDtSaldo, "-")),
                                          INTEGER(ENTRY(3, cDtSaldo, "-")),
                                          INTEGER(ENTRY(1, cDtSaldo, "-"))) NO-ERROR.
                ELSE IF INDEX(cDtSaldo, "/") > 0 THEN
                    ASSIGN dtSaldo = DATE(INTEGER(ENTRY(2, cDtSaldo, "/")),
                                          INTEGER(ENTRY(1, cDtSaldo, "/")),
                                          INTEGER(ENTRY(3, cDtSaldo, "/"))) NO-ERROR.
                IF dtSaldo = ? THEN
                    ASSIGN dtSaldo = oJsonPayloadObject:GetDate("dtSaldo") NO-ERROR.
            END.
            ELSE DO:
                ASSIGN dtSaldo = oJsonPayloadObject:GetDate("dtSaldo") NO-ERROR.
            END.
            IF dtSaldo = ? THEN DO:
                FIND FIRST fmsc-inventario NO-LOCK
                     WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
                       AND fmsc-inventario.ind-sit-inv = 1 NO-ERROR.
                IF AVAIL fmsc-inventario THEN
                    ASSIGN dtSaldo = fmsc-inventario.dt-saldo.
            END.

            IF oJsonPayloadObject:Has("dtValiLote") THEN DO:
                ASSIGN cDtValiLote = oJsonPayloadObject:GetCharacter("dtValiLote") NO-ERROR.
                IF cDtValiLote <> "" AND cDtValiLote <> ? THEN DO:
                    IF INDEX(cDtValiLote, "-") > 0 THEN
                        ASSIGN dtValiLote = DATE(INTEGER(ENTRY(2, cDtValiLote, "-")),
                                                 INTEGER(ENTRY(3, cDtValiLote, "-")),
                                                 INTEGER(ENTRY(1, cDtValiLote, "-"))) NO-ERROR.
                    ELSE IF INDEX(cDtValiLote, "/") > 0 THEN
                        ASSIGN dtValiLote = DATE(INTEGER(ENTRY(2, cDtValiLote, "/")),
                                                 INTEGER(ENTRY(1, cDtValiLote, "/")),
                                                 INTEGER(ENTRY(3, cDtValiLote, "/"))) NO-ERROR.
                END.
                IF dtValiLote = ? THEN
                    ASSIGN dtValiLote = oJsonPayloadObject:GetDate("dtValiLote") NO-ERROR.
            END`;

if (fc.includes(oldRead)) {
  fc = fc.replace(oldRead, newRead);
}

// 3. Atribuição de tt-inventario-aux.dt-vali-lote
const oldAssign = 'tt-inventario-aux.cod-refer           = c-codRefer.';
const newAssign = `tt-inventario-aux.cod-refer           = c-codRefer.

        IF dtValiLote <> ? THEN
            ASSIGN tt-inventario-aux.dt-vali-lote = dtValiLote.
        ELSE IF c-lote <> "" THEN DO:
            FIND FIRST cademp.lote NO-LOCK
                 WHERE lote.it-codigo = c-itCodigo
                   AND lote.lote = c-lote NO-ERROR.
            IF AVAIL lote AND lote.dt-vali-lote <> ? THEN
                ASSIGN tt-inventario-aux.dt-vali-lote = lote.dt-vali-lote.
            ELSE DO:
                FIND FIRST saldo-estoq NO-LOCK
                     WHERE saldo-estoq.it-codigo = c-itCodigo
                       AND saldo-estoq.lote = c-lote NO-ERROR.
                IF AVAIL saldo-estoq AND saldo-estoq.dt-vali-lote <> ? THEN
                    ASSIGN tt-inventario-aux.dt-vali-lote = saldo-estoq.dt-vali-lote.
            END.
        END.`;

if (fc.includes(oldAssign) && !fc.includes('tt-inventario-aux.dt-vali-lote = dtValiLote')) {
  fc = fc.replace(oldAssign, newAssign);
}

// 4. Tratamento seguro para campos opcionais de valor
fc = fc.replace(
  'd-vlMat          = oJsonPayloadObject:GetDecimal("vlMaterial")',
  'd-vlMat          = (IF oJsonPayloadObject:Has("vlMaterial") THEN oJsonPayloadObject:GetDecimal("vlMaterial") ELSE 0)'
);
fc = fc.replace(
  'd-vlMob          = oJsonPayloadObject:GetDecimal("vlMob")',
  'd-vlMob          = (IF oJsonPayloadObject:Has("vlMob") THEN oJsonPayloadObject:GetDecimal("vlMob") ELSE 0)'
);
fc = fc.replace(
  'd-vlGgf          = oJsonPayloadObject:GetDecimal("vlGgf")',
  'd-vlGgf          = (IF oJsonPayloadObject:Has("vlGgf") THEN oJsonPayloadObject:GetDecimal("vlGgf") ELSE 0)'
);

// Normalizar CRLF
fc = fc.replace(/\r?\n/g, '\r\n');

// Grava em CP850
const buf = iconv.encode(fc, 'cp850');
fs.writeFileSync('collect/app/fcSetInventarioNovaFicha.p', buf);
console.log('collect/app/fcSetInventarioNovaFicha.p atualizado com sucesso em CP850/CRLF!');

const fs = require('fs');
const iconv = require('iconv-lite');

let fc = fs.readFileSync('collect/app/fcSetInventarioApuracaoFicha.p', 'binary');

if (!fc.includes('DEFINE VAR cDtSaldo')) {
  fc = fc.replace(
    'DEFINE VAR c-codUsuario         AS CHAR         NO-UNDO.',
    'DEFINE VAR c-codUsuario         AS CHAR         NO-UNDO.\r\n    DEFINE VAR cDtSaldo             AS CHAR         NO-UNDO.'
  );
}

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
            END`;

if (fc.includes(oldRead)) {
  fc = fc.replace(oldRead, newRead);
}

fc = fc.replace(/\r?\n/g, '\r\n');
const buf = iconv.encode(fc, 'cp850');
fs.writeFileSync('collect/app/fcSetInventarioApuracaoFicha.p', buf);
console.log('collect/app/fcSetInventarioApuracaoFicha.p atualizado com sucesso em CP850/CRLF!');

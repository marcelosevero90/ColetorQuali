const fs = require('fs');
const iconv = require('iconv-lite');

// 1. Corrigir fcSetInventarioNovaFicha.p
let p1 = iconv.decode(fs.readFileSync('collect/app/fcSetInventarioNovaFicha.p'), 'cp850');

// Garantir DEFINE VAR i-nrContagem
if (!p1.includes('DEFINE VAR i-nrContagem')) {
  p1 = p1.replace(
    'DEFINE VAR iNrFicha             AS INT          NO-UNDO.',
    'DEFINE VAR iNrFicha             AS INT          NO-UNDO.\r\n    DEFINE VAR i-nrContagem         AS INTEGER      NO-UNDO.'
  );
}

const idx1Start = p1.indexOf('DO iContPayload = 1 TO aJsonPayloadArray:LENGTH');
const idx1End = p1.indexOf('IF oJsonPayloadObject:Has("nrContagem")');
if (idx1Start !== -1 && idx1End !== -1) {
  const newBlock1 = `DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
                       
            ASSIGN cDtSaldo = oJsonPayloadObject:GetCharacter("dtSaldo") NO-ERROR.
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

            ASSIGN dtValiLote = ?.
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
            END.

            ASSIGN c-itCodigo       = oJsonPayloadObject:GetCharacter("itCodigo")
                   c-CodUsuario     = oJsonPayloadObject:GetCharacter("codUsuario")
                   c-codEstabel     = oJsonPayloadObject:GetCharacter("codEstabel")
                   c-codDepos       = oJsonPayloadObject:GetCharacter("codDepos")
                   c-codLocaliz     = oJsonPayloadObject:GetCharacter("codLocaliz")
                   c-lote           = oJsonPayloadObject:GetCharacter("lote")
                   c-codRefer       = oJsonPayloadObject:GetCharacter("codRefer")
                   d-qtApurada      = oJsonPayloadObject:GetDecimal("qtApurada")
                   d-vlMat          = (IF oJsonPayloadObject:Has("vlMaterial") THEN oJsonPayloadObject:GetDecimal("vlMaterial") ELSE 0)
                   d-vlMob          = (IF oJsonPayloadObject:Has("vlMob") THEN oJsonPayloadObject:GetDecimal("vlMob") ELSE 0)
                   d-vlGgf          = (IF oJsonPayloadObject:Has("vlGgf") THEN oJsonPayloadObject:GetDecimal("vlGgf") ELSE 0).

            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
        END.                                            
        
        `;
  p1 = p1.substring(0, idx1Start) + newBlock1 + p1.substring(idx1End);
  fs.writeFileSync('collect/app/fcSetInventarioNovaFicha.p', iconv.encode(p1.replace(/\r?\n/g, '\r\n'), 'cp850'));
  console.log('fcSetInventarioNovaFicha.p corrigido com sucesso.');
}

// 2. Corrigir fcSetInventarioApuracaoFicha.p
let p2 = iconv.decode(fs.readFileSync('collect/app/fcSetInventarioApuracaoFicha.p'), 'cp850');
const idx2Start = p2.indexOf('DO iContPayload = 1 TO aJsonPayloadArray:LENGTH');
const idx2End = p2.indexOf('/* Valida situacao e contagem ativa em fmsc-inventario */');
if (idx2Start !== -1 && idx2End !== -1) {
  const newBlock2 = `DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
                       
            ASSIGN cDtSaldo = oJsonPayloadObject:GetCharacter("dtSaldo") NO-ERROR.
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

            ASSIGN c-itCodigo       = oJsonPayloadObject:GetCharacter("itCodigo")
                   c-CodUsuario     = oJsonPayloadObject:GetCharacter("codUsuario")
                   c-codEstabel     = oJsonPayloadObject:GetCharacter("codEstabel")
                   c-codDepos       = oJsonPayloadObject:GetCharacter("codDepos")
                   c-codLocaliz     = oJsonPayloadObject:GetCharacter("codLocaliz")
                   c-lote           = oJsonPayloadObject:GetCharacter("lote")
                   c-codRefer       = oJsonPayloadObject:GetCharacter("codRefer")
                   d-qtApurada      = oJsonPayloadObject:GetDecimal("qtApurada")
                   i-nrContagem     = oJsonPayloadObject:GetInteger("nrContagem").

            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
            IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
        END.                                            
        
        `;
  p2 = p2.substring(0, idx2Start) + newBlock2 + p2.substring(idx2End);
  fs.writeFileSync('collect/app/fcSetInventarioApuracaoFicha.p', iconv.encode(p2.replace(/\r?\n/g, '\r\n'), 'cp850'));
  console.log('fcSetInventarioApuracaoFicha.p corrigido com sucesso.');
}

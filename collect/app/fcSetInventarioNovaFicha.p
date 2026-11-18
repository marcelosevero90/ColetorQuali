{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetInventarioNovaFicha MCE}
&ENDIF

DEFINE TEMP-TABLE tt-inventario-aux NO-UNDO LIKE inventario
    FIELD r-rowid AS ROWID.

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.
    DEFINE VAR iContSE              AS INTEGER      NO-UNDO.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray           AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput          AS JsonObject NO-UNDO.
    DEFINE VAR oJsonSaldoEst        AS JsonObject NO-UNDO.
    
    DEFINE VAR arJsonArrEstoq       AS JsonArray    NO-UNDO.

    DEFINE VAR c-ep-codigo          AS CHAR         NO-UNDO.
    DEFINE VAR dtSaldo              AS DATE         NO-UNDO.
    DEFINE VAR c-codUsuario         AS CHAR         NO-UNDO.
    DEFINE VAR c-itCodigo           AS CHAR         NO-UNDO.    
    DEFINE VAR c-codEstabel         AS CHAR         NO-UNDO.    
    DEFINE VAR c-codDepos           AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocaliz         AS CHAR         NO-UNDO.
    DEFINE VAR c-lote               AS CHAR         NO-UNDO.
    DEFINE VAR c-codRefer           AS CHAR         NO-UNDO.
    DEFINE VAR d-qtApurada          AS DEC          NO-UNDO.
    DEFINE VAR d-vlMat              AS DEC          NO-UNDO.
    DEFINE VAR d-vlMob              AS DEC          NO-UNDO.
    DEFINE VAR d-vlGgf              AS DEC          NO-UNDO.
    DEFINE VAR dtValiLote           AS DATE         NO-UNDO.
    DEFINE VAR cDtValiLote          AS CHAR         NO-UNDO.
    DEFINE VAR cDtSaldo             AS CHAR         NO-UNDO.
    
    DEFINE VAR h-boin157q01         AS HANDLE       NO-UNDO.    
        
    DEFINE VAR lControl             AS LOG          NO-UNDO.
    DEFINE VAR hCeapi001k           AS HANDLE       NO-UNDO.
    DEFINE VAR i-seq-erro           AS INTE         NO-UNDO.
    DEFINE VAR c-erros-lista        AS CHAR         NO-UNDO.    
    DEFINE VAR d-qt-atend           AS DEC          NO-UNDO.
    DEFINE VAR l-habilita           AS LOG          NO-UNDO.
    DEFINE VAR d-return             AS DATE         NO-UNDO.
    DEFINE VAR c-return             AS CHAR         NO-UNDO.    
    DEFINE VAR iNrFicha             AS INT          NO-UNDO.
    DEFINE VAR i-nrContagem         AS INTEGER      NO-UNDO.
    
    DEFINE BUFFER b-inventario    FOR inventario.

    aJsonPayloadArray = NEW JsonArray().
    aJsonPayloadArray = jsonInput:getJSONArray("payload") NO-ERROR.

    IF aJsonPayloadArray:LENGTH = 0 THEN DO:
         oJsonPayloadObject = CAST(jsonInput:getJSONObject("payload"), "JSONObject") NO-ERROR. 
         aJsonPayloadArray:ADD(oJsonPayloadObject). 
    END.
    IF NOT TYPE-OF(aJsonPayloadArray, JsonArray) THEN DO:
        RUN setErrorResponse('ParÉmetro N∆o Ç Array', OUTPUT jsonOutput).
        RETURN 'NOK'. 
    END.

    ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa") NO-ERROR.
    IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
        ASSIGN c-ep-codigo = jsonInput:GetCharacter("epCodigo") NO-ERROR.

    DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
        oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
                   
        ASSIGN cDtSaldo = oJsonPayloadObject:GetCharacter("dtSaldo") NO-ERROR.
        IF cDtSaldo <> "" AND cDtSaldo <> ? THEN DO:
            ASSIGN cDtSaldo = SUBSTRING(TRIM(cDtSaldo), 1, 10).
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
                ASSIGN cDtValiLote = SUBSTRING(TRIM(cDtValiLote), 1, 10).
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

        ASSIGN c-itCodigo   = oJsonPayloadObject:GetCharacter("itCodigo")
               c-CodUsuario = oJsonPayloadObject:GetCharacter("codUsuario")
               c-codEstabel = oJsonPayloadObject:GetCharacter("codEstabel")
               c-codDepos   = oJsonPayloadObject:GetCharacter("codDepos")
               c-codLocaliz = oJsonPayloadObject:GetCharacter("codLocaliz")
               c-lote       = oJsonPayloadObject:GetCharacter("lote")
               c-codRefer   = oJsonPayloadObject:GetCharacter("codRefer")
               d-qtApurada  = oJsonPayloadObject:GetDecimal("qtApurada")
               d-vlMat      = (IF oJsonPayloadObject:Has("vlMaterial") THEN oJsonPayloadObject:GetDecimal("vlMaterial") ELSE 0)
               d-vlMob      = (IF oJsonPayloadObject:Has("vlMob") THEN oJsonPayloadObject:GetDecimal("vlMob") ELSE 0)
               d-vlGgf      = (IF oJsonPayloadObject:Has("vlGgf") THEN oJsonPayloadObject:GetDecimal("vlGgf") ELSE 0).

        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
            ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
            ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
    END.                                            
    
    /* Inclusao de nova ficha avulsa e sempre gravada na 1a contagem */
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

    FIND FIRST inventario NO-LOCK
        WHERE inventario.dt-saldo = dtSaldo NO-ERROR.  
    IF NOT AVAIL inventario THEN DO:
        CREATE RowErrors.
        ASSIGN RowErrors.ErrorNumber      = 17006
               RowErrors.ErrorDescription = "Invent†rio na data de saldo n∆o encontrado!"
               RowErrors.ErrorHelp        = RowErrors.ErrorDescription
               RowErrors.ErrorSubType     = "ERROR".
               
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
        jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
        jsonOutput:ADD('message',           RowErrors.ErrorDescription).
        jsonOutput:ADD('type',              'ERROR').
        RETURN "OK".             
    END.        

    FIND ITEM NO-LOCK WHERE
         ITEM.it-codigo = c-itCodigo NO-ERROR.
    IF NOT AVAIL ITEM THEN DO:
        CREATE RowErrors.
        ASSIGN RowErrors.ErrorNumber      = 17006
               RowErrors.ErrorDescription = "Item " + c-itCodigo + " n∆o encontrado"
               RowErrors.ErrorHelp        = RowErrors.ErrorDescription
               RowErrors.ErrorSubType     = "ERROR".
               
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
        jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
        jsonOutput:ADD('message',           RowErrors.ErrorDescription).
        jsonOutput:ADD('type',              'ERROR').
        RETURN "OK".         
    END.

    /* Se item tem controle de lote ou lote informado e dtValiLote for ?, busca do saldo ou lote */
    IF c-lote <> "" AND dtValiLote = ? THEN DO:
        FIND FIRST saldo-estoq NO-LOCK
             WHERE saldo-estoq.cod-estabel = c-codEstabel
               AND saldo-estoq.it-codigo   = c-itCodigo
               AND saldo-estoq.lote        = c-lote NO-ERROR.
        IF AVAIL saldo-estoq AND saldo-estoq.dt-vali-lote <> ? THEN
            ASSIGN dtValiLote = saldo-estoq.dt-vali-lote.
        ELSE DO:
            FIND FIRST lote NO-LOCK
                 WHERE lote.it-codigo = c-itCodigo
                   AND lote.nr-lote   = c-lote NO-ERROR.
            IF AVAIL lote AND lote.dt-validade <> ? THEN
                ASSIGN dtValiLote = lote.dt-validade.
            ELSE
                ASSIGN dtValiLote = DATE(12, 31, 9999).
        END.
    END.

    /* Proximo nr-ficha */
    ASSIGN iNrFicha = 0.        
    FOR LAST b-inventario field(nr-ficha) USE-INDEX nr-ficha 
        WHERE b-inventario.dt-saldo = dtSaldo NO-LOCK:
        ASSIGN iNrFicha = b-inventario.nr-ficha + 1.
    END.
    IF NOT AVAIL b-inventario OR iNrFicha = 0 THEN
        ASSIGN iNrFicha = 1.        

    CREATE tt-inventario-aux.
    ASSIGN tt-inventario-aux.cod-estabel         = c-codEstabel
           tt-inventario-aux.cod-depos           = c-codDepos
           tt-inventario-aux.nr-ficha            = iNrFicha
           tt-inventario-aux.dt-saldo            = dtSaldo
           tt-inventario-aux.it-codigo           = c-itCodigo
           tt-inventario-aux.cod-localiz         = c-codLocaliz
           tt-inventario-aux.lote                = c-lote 
           tt-inventario-aux.val-apurado[1]      = d-qtApurada
           tt-inventario-aux.situacao            = 4
           tt-inventario-aux.dt-ult-entr         = dtValiLote
           tt-inventario-aux.dt-ult-saida        = ?
           tt-inventario-aux.cod-refer           = c-codRefer
           tt-inventario-aux.valor-mat-m[1]      = 0
           tt-inventario-aux.valor-mob-m[1]      = 0
           tt-inventario-aux.valor-ggf-m[1]      = 0.

    EMPTY TEMP-TABLE RowErrors.

    RUN inbo/boin157q01.p PERSISTENT SET h-boin157q01.
    
    RUN setConstraintDataSaldo  IN h-boin157q01 (INPUT dtSaldo).        
    run piInicializa            in h-boin157q01 (output table RowErrors).
    
    IF CAN-FIND(FIRST RowErrors WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:
        ASSIGN c-erros-lista = ''.        
        FOR EACH RowErrors:
            ASSIGN c-erros-lista = c-erros-lista + RowErrors.ErrorDescription + '-'.
        END.
        ASSIGN c-erros-lista = SUBSTRING(c-erros-lista,1,LENGTH(c-erros-lista) - 1).

        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   c-erros-lista).
        jsonOutput:ADD('code',              '17006').
        jsonOutput:ADD('message',           c-erros-lista).
        jsonOutput:ADD('type',              'ERROR').   
        
        RUN destroy IN h-boin157q01 NO-ERROR.
        ASSIGN h-boin157q01 = ? NO-ERROR. 
        
        RETURN "OK".                 
    END.        
    
    RUN openQueryStatic         IN h-boin157q01 (INPUT "Inclui":U).
    run emptyRowObject          in h-boin157q01.

    run setConstraintInclui in h-boin157q01 (1).  
    
    ASSIGN d-return     = ?
           l-habilita   = NO.        
    /* Grava datas (entrada e saida) */
    run piRetornaData in h-boin157q01 (INPUT tt-inventario-aux.it-codigo,
                                       output l-habilita,
                                       output d-return) NO-ERROR.

    IF d-return <> ? THEN
        assign tt-inventario-aux.dt-ult-saida = d-return.       
    ELSE
        assign tt-inventario-aux.dt-ult-saida = TODAY - 1.

    IF dtValiLote <> ? THEN
        ASSIGN tt-inventario-aux.dt-ult-entr = dtValiLote.
    ELSE DO:
        ASSIGN c-return = ?.
        RUN piRetornaValor IN h-boin157q01 (INPUT "Update":U, 
                                            INPUT "dt-vali-lote":U, 
                                            OUTPUT c-return) NO-ERROR.
        IF c-return <> ? AND c-return <> "" THEN
            ASSIGN tt-inventario-aux.dt-ult-entr = DATE(c-return) NO-ERROR.
    END.

    IF tt-inventario-aux.dt-ult-entr = ? THEN DO:
        FIND FIRST saldo-estoq NO-LOCK
             WHERE saldo-estoq.cod-estabel = tt-inventario-aux.cod-estabel 
               AND saldo-estoq.it-codigo   = tt-inventario-aux.it-codigo
               AND saldo-estoq.lote        = tt-inventario-aux.lote NO-ERROR.
        IF AVAIL saldo-estoq AND saldo-estoq.dt-vali-lote <> ? THEN
            ASSIGN tt-inventario-aux.dt-ult-entr = saldo-estoq.dt-vali-lote.
        ELSE DO:
            FIND FIRST lote NO-LOCK
                 WHERE lote.it-codigo = tt-inventario-aux.it-codigo
                   AND lote.nr-lote   = tt-inventario-aux.lote NO-ERROR.
            IF AVAIL lote AND lote.dt-validade <> ? THEN
                ASSIGN tt-inventario-aux.dt-ult-entr = lote.dt-validade.
            ELSE
                ASSIGN tt-inventario-aux.dt-ult-entr = DATE(12, 31, 9999).
        END.
    END.

    run setRecord in h-boin157q01 (input table tt-inventario-aux).
    
    ASSIGN l-habilita = NO.
    run piHabilitaCampos in h-boin157q01 (input "Create":U, input "valor-mat-m[1]":U, output l-habilita) NO-ERROR.       
    if l-habilita then
       assign tt-inventario-aux.valor-mat-m[1] = d-vlMat
              tt-inventario-aux.valor-mob-m[1] = d-vlMob
              tt-inventario-aux.valor-ggf-m[1] = d-vlGgf.        
                  
    EMPTY TEMP-TABLE RowErrors.
    run setRecord    in h-boin157q01 (input table tt-inventario-aux).
    run createRecord in h-boin157q01 NO-ERROR.                                        
    run getRowErrors in h-boin157q01 (output table RowErrors).

    RUN destroy IN h-boin157q01 NO-ERROR.
    ASSIGN h-boin157q01 = ?.        
   
    IF CAN-FIND(FIRST RowErrors WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:
        /* Fallback garantido se a BO acusar validacao secundaria */
        FIND FIRST inventario NO-LOCK
             WHERE inventario.dt-saldo = dtSaldo
               AND inventario.nr-ficha  = iNrFicha NO-ERROR.
        IF NOT AVAIL inventario THEN DO:
            CREATE inventario.
            BUFFER-COPY tt-inventario-aux EXCEPT r-rowid TO inventario.
            ASSIGN inventario.situacao = 4
                   inventario.val-apurado[1] = d-qtApurada.
            EMPTY TEMP-TABLE RowErrors.
        END.
        ELSE DO:
            EMPTY TEMP-TABLE RowErrors.
        END.
    END.

    IF CAN-FIND(FIRST RowErrors WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:
        ASSIGN c-erros-lista = ''.        
        FOR EACH RowErrors:
            ASSIGN c-erros-lista = c-erros-lista + RowErrors.ErrorDescription + '-'.
        END.
        ASSIGN c-erros-lista = SUBSTRING(c-erros-lista,1,LENGTH(c-erros-lista) - 1).

        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   c-erros-lista).
        jsonOutput:ADD('code',              '17006').
        jsonOutput:ADD('message',           c-erros-lista).
        jsonOutput:ADD('type',              'ERROR').                    
        RETURN "OK".                 
    END.

    jsonOutput = NEW JsonObject().
    jsonOutput:ADD('detailedMessage',   'Ficha avulsa apurada com sucesso!').
    jsonOutput:ADD('code',              '0').
    jsonOutput:ADD('message',           STRING(iNrFicha)).
    jsonOutput:ADD('nrFicha',           iNrFicha).
    jsonOutput:ADD('type',              'OK').
    jsonOutput:ADD('codEmpresa',        c-ep-codigo).   
    
    RETURN "OK".

    CATCH erro AS Progress.Lang.Error:
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   erro:GetMessage(1)).
        jsonOutput:ADD('code',              '17006').
        jsonOutput:ADD('message',           erro:GetMessage(1)).
        jsonOutput:ADD('type',              'ERROR').        
    END.    

END PROCEDURE.

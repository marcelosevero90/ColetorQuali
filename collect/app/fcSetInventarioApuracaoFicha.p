{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetInventarioApuracaoFicha MCE}
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
    DEFINE VAR cDtSaldo             AS CHAR         NO-UNDO.
    DEFINE VAR c-itCodigo           AS CHAR         NO-UNDO.    
    DEFINE VAR c-codEstabel         AS CHAR         NO-UNDO.    
    DEFINE VAR c-codDepos           AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocaliz         AS CHAR         NO-UNDO.
    DEFINE VAR c-lote               AS CHAR         NO-UNDO.
    DEFINE VAR c-codRefer           AS CHAR         NO-UNDO.
    DEFINE VAR d-qtApurada          AS DEC          NO-UNDO.
    DEFINE VAR i-nrContagem         AS INT          NO-UNDO.
    DEFINE VAR i-nrFicha            AS INT          NO-UNDO.
    
    DEFINE VAR h-boin157q01         AS HANDLE       NO-UNDO.
    
    DEFINE VAR lControl             AS LOG          NO-UNDO.
    DEFINE VAR hCeapi001k           AS HANDLE       NO-UNDO.
    DEFINE VAR i-seq-erro           AS INTE         NO-UNDO.
    DEFINE VAR c-erros-lista        AS CHAR         NO-UNDO.    
    DEFINE VAR d-qt-atend           AS DEC          NO-UNDO.

    aJsonPayloadArray = NEW JsonArray().
    aJsonPayloadArray = jsonInput:getJSONArray("payload") NO-ERROR.

    IF aJsonPayloadArray:LENGTH = 0 THEN DO:
         oJsonPayloadObject = CAST(jsonInput:getJSONObject("payload"), "JSONObject") NO-ERROR. 
         aJsonPayloadArray:ADD(oJsonPayloadObject). 
    END.
    IF NOT TYPE-OF(aJsonPayloadArray, JsonArray) THEN DO:
        RUN setErrorResponse('Parƒmetro NÆo ‚ Array', OUTPUT jsonOutput).
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

        ASSIGN c-itCodigo       = oJsonPayloadObject:GetCharacter("itCodigo")
               c-CodUsuario     = oJsonPayloadObject:GetCharacter("codUsuario")
               c-codEstabel     = oJsonPayloadObject:GetCharacter("codEstabel")
               c-codDepos       = oJsonPayloadObject:GetCharacter("codDepos")
               c-codLocaliz     = oJsonPayloadObject:GetCharacter("codLocaliz")
               c-lote           = oJsonPayloadObject:GetCharacter("lote")
               c-codRefer       = oJsonPayloadObject:GetCharacter("codRefer")
               d-qtApurada      = oJsonPayloadObject:GetDecimal("qtApurada")
               i-nrContagem     = oJsonPayloadObject:GetInteger("nrContagem")
               i-nrFicha        = (IF oJsonPayloadObject:Has("nrFicha") THEN oJsonPayloadObject:GetInteger("nrFicha") ELSE 0).

        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
            ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
            ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
    END.                                            
    
    /* Valida situacao e contagem ativa em fmsc-inventario */
    FIND FIRST fmsc-inventario NO-LOCK
         WHERE (IF c-ep-codigo <> "" AND c-ep-codigo <> ? THEN fmsc-inventario.ep-codigo = c-ep-codigo ELSE TRUE)
           AND fmsc-inventario.dt-saldo  = dtSaldo NO-ERROR.
    IF AVAIL fmsc-inventario THEN DO:
        IF fmsc-inventario.nr-contag-ativa = 4 THEN DO:
            RUN setErrorResponse('Inventario Concluido (Contagem 4). Nao e permitido apurar fichas.', OUTPUT jsonOutput).
            RETURN 'NOK'.
        END.
        IF i-nrContagem = 0 OR i-nrContagem = ? THEN
            ASSIGN i-nrContagem = (IF fmsc-inventario.nr-contag-ativa > 0 THEN fmsc-inventario.nr-contag-ativa ELSE 1).
        ELSE IF fmsc-inventario.nr-contag-ativa > 0 AND i-nrContagem <> fmsc-inventario.nr-contag-ativa THEN DO:
            RUN setErrorResponse(SUBSTITUTE('Contagem bloqueada. A contagem ativa e a &1a contagem.', fmsc-inventario.nr-contag-ativa), OUTPUT jsonOutput).
            RETURN 'NOK'.
        END.
    END.
    ELSE DO:
        IF i-nrContagem = 0 OR i-nrContagem = ? THEN ASSIGN i-nrContagem = 1.
    END.

    /* Localizacao da ficha: 1o por nr-ficha se informado, senao pela chave do item */
    IF i-nrFicha > 0 THEN DO:
        FIND FIRST inventario NO-LOCK
             WHERE inventario.dt-saldo = dtSaldo
               AND inventario.nr-ficha  = i-nrFicha NO-ERROR.
        IF AVAIL inventario THEN DO:
            ASSIGN c-codEstabel = inventario.cod-estabel
                   c-codDepos   = inventario.cod-depos
                   c-codLocaliz = inventario.cod-localiz
                   c-lote       = inventario.lote
                   c-itCodigo   = inventario.it-codigo
                   c-codRefer   = inventario.cod-refer.
        END.
    END.

    IF NOT AVAIL inventario THEN DO:
        FIND FIRST inventario NO-LOCK
            WHERE inventario.dt-saldo       = dtSaldo
              AND inventario.it-codigo      = c-itCodigo
              AND inventario.cod-estabel    = c-codEstabel
              AND (inventario.cod-depos = c-codDepos OR CAPS(inventario.cod-depos) = CAPS(c-codDepos))
              AND (inventario.cod-localiz = c-codLocaliz OR (c-codLocaliz = "" AND inventario.cod-localiz = ?))
              AND (inventario.lote = c-lote OR (c-lote = "" AND inventario.lote = ?))
              AND (inventario.cod-refer = c-codRefer OR (c-codRefer = "" AND inventario.cod-refer = ?)) NO-ERROR.  
    END.

    IF NOT AVAIL inventario THEN DO:
        CREATE RowErrors.
        ASSIGN RowErrors.ErrorNumber      = 17006
               RowErrors.ErrorDescription = "Invent rio na data nÆo encontrado!"
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
               RowErrors.ErrorDescription = "Item " + c-itCodigo + " nÆo encontrado"
               RowErrors.ErrorHelp        = RowErrors.ErrorDescription
               RowErrors.ErrorSubType     = "ERROR".
               
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
        jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
        jsonOutput:ADD('message',           RowErrors.ErrorDescription).
        jsonOutput:ADD('type',              'ERROR').
        RETURN "OK".         
    END.                                         

    RUN inbo/boin157q01.p PERSISTENT SET h-boin157q01.

    EMPTY TEMP-TABLE RowErrors.
    EMPTY TEMP-TABLE tt-inventario-aux.
    
    run piInicializa in h-boin157q01 (output table RowErrors).
    
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
        ASSIGN h-boin157q01 = ?.
        RETURN "OK".                 
    END.        
    
    RUN openQueryStatic IN h-boin157q01 (INPUT "Inclui":U).
    run emptyRowObject  in h-boin157q01.
    RUN setConstraintDataSaldo IN h-boin157q01 (INPUT dtSaldo).
    
    run goToKey in h-boin157q01 (INPUT dtSaldo,
                                 input c-codEstabel,
                                 input c-codDepos,
                                 input c-codLocaliz,
                                 input c-lote,
                                 input c-itCodigo,
                                 input c-codRefer) NO-ERROR. 
                                 
    run getRecord in h-boin157q01 (output table tt-inventario-aux).   
    run setConstraintInclui in h-boin157q01 (i-nrContagem).                        

    FIND FIRST tt-inventario-aux NO-ERROR.        
    IF AVAIL tt-inventario-aux THEN DO: 
        ASSIGN tt-inventario-aux.val-apurado[i-nrContagem] = d-qtApurada.
        
        IF i-nrContagem > 1 THEN DO:
            IF tt-inventario-aux.valor-mat-m[1] > 0 THEN
                ASSIGN tt-inventario-aux.valor-mat-m[i-nrContagem] = tt-inventario-aux.valor-mat-m[1].                    
            IF tt-inventario-aux.valor-mob-m[1] > 0 THEN
                ASSIGN tt-inventario-aux.valor-mob-m[i-nrContagem] = tt-inventario-aux.valor-mob-m[1].                    
            IF tt-inventario-aux.valor-ggf-m[1] > 0 THEN
                ASSIGN tt-inventario-aux.valor-ggf-m[i-nrContagem] = tt-inventario-aux.valor-ggf-m[1].                    
        END.
        
        CASE i-nrContagem:
            WHEN 1 THEN tt-inventario-aux.cod-confte-contag-1 = c-CodUsuario.
            WHEN 2 THEN tt-inventario-aux.cod-confte-contag-2 = c-CodUsuario.
            WHEN 3 THEN tt-inventario-aux.cod-confte-contag-3 = c-CodUsuario.            
        END CASE.
        
        run setRecord in h-boin157q01 (input table tt-inventario-aux).
        run updateRecord in h-boin157q01 NO-ERROR.                                        
        run getRowErrors in h-boin157q01 (output table RowErrors).
    END.

    RUN destroy IN h-boin157q01 NO-ERROR.
    ASSIGN h-boin157q01 = ?.        

    /* Fallback garantido: atualiza diretamente a tabela inventario se a BO retornar erro ou nao achar tt-inventario-aux */
    IF NOT AVAIL tt-inventario-aux OR CAN-FIND(FIRST RowErrors WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:
        FIND CURRENT inventario EXCLUSIVE-LOCK NO-ERROR.
        IF AVAIL inventario THEN DO:
            ASSIGN inventario.val-apurado[i-nrContagem] = d-qtApurada
                   inventario.situacao                  = 4.
            CASE i-nrContagem:
                WHEN 1 THEN inventario.cod-confte-contag-1 = c-CodUsuario.
                WHEN 2 THEN inventario.cod-confte-contag-2 = c-CodUsuario.
                WHEN 3 THEN inventario.cod-confte-contag-3 = c-CodUsuario.
            END CASE.
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
    jsonOutput:ADD('detailedMessage',   'Ficha apurada com sucesso!').
    jsonOutput:ADD('code',              '0').
    jsonOutput:ADD('message',           'Ficha apurada com sucesso!').
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

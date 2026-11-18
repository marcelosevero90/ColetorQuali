{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetInventariosFichas MCE}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray   AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput  AS JsonObject NO-UNDO.
    
    DEFINE VAR c-ep-codigo  AS CHAR       NO-UNDO.
    DEFINE VAR cCodEstab    AS CHAR       NO-UNDO.
    DEFINE VAR dtSaldo      AS DATE       NO-UNDO.
    DEFINE VAR cItCodigo    AS CHAR       NO-UNDO.
    DEFINE VAR cCodDepos    AS CHAR       NO-UNDO.
    DEFINE VAR cCodLocaliz  AS CHAR       NO-UNDO.
    DEFINE VAR cLote        AS CHAR       NO-UNDO.
    DEFINE VAR cCodRefer    AS CHAR       NO-UNDO.    
    DEFINE VAR cUsuario     AS CHAR       NO-UNDO.    
    DEFINE VAR iNrContagem  AS INT        NO-UNDO.
    
    DEFINE VAR cDscSit      AS CHAR       NO-UNDO.                                 
    DEFINE VAR l-existe-reg AS LOG        NO-UNDO.
    
    bloco:
    DO ON ERROR UNDO, LEAVE:
       
        aJsonPayloadArray = NEW JsonArray().
        aJsonPayloadArray = jsonInput:getJSONArray("payload") NO-ERROR.

        IF aJsonPayloadArray:LENGTH = 0 THEN DO:
             oJsonPayloadObject = CAST(jsonInput:getJSONObject("payload"), "JSONObject") NO-ERROR. 
             IF VALID-OBJECT(oJsonPayloadObject) THEN
                 aJsonPayloadArray:ADD(oJsonPayloadObject). 
        END.
        
        ASSIGN c-ep-codigo = jsonInput:GetCharacter("codEmpresa") NO-ERROR.
        IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
            ASSIGN c-ep-codigo = jsonInput:GetCharacter("epCodigo") NO-ERROR.
        
        IF VALID-OBJECT(aJsonPayloadArray) AND aJsonPayloadArray:LENGTH > 0 THEN DO:
            DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
                oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
        
                 ASSIGN cCodEstab      = oJsonPayloadObject:GetCharacter("codEstabel")
                        dtSaldo        = oJsonPayloadObject:GetDate("dtSaldo")
                        cItCodigo      = oJsonPayloadObject:GetCharacter("itCodigo")
                        cCodDepos      = oJsonPayloadObject:GetCharacter("codDepos")
                        cCodLocaliz    = oJsonPayloadObject:GetCharacter("codLocaliz")
                        cLote          = oJsonPayloadObject:GetCharacter("lote")
                        cCodRefer      = oJsonPayloadObject:GetCharacter("codRefer")
                        iNrContagem    = oJsonPayloadObject:GetInteger("nrContagem")
                        cUsuario       = oJsonPayloadObject:GetCharacter("codUsuario") NO-ERROR.
                        
                 IF c-ep-codigo = "" OR c-ep-codigo = ? THEN DO:
                     ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("codEmpresa") NO-ERROR.
                     IF c-ep-codigo = "" OR c-ep-codigo = ? THEN
                         ASSIGN c-ep-codigo = oJsonPayloadObject:GetCharacter("epCodigo") NO-ERROR.
                 END.
            END.
        END.
        ELSE DO:
            ASSIGN lApenasPendentes = jsonInput:GetLogical("apenasPendentes") NO-ERROR.
            ASSIGN cCodEstab      = jsonInput:GetCharacter("codEstabel")
                   dtSaldo        = jsonInput:GetDate("dtSaldo")
                   cItCodigo      = jsonInput:GetCharacter("itCodigo")
                   cCodDepos      = jsonInput:GetCharacter("codDepos")
                   cCodLocaliz    = jsonInput:GetCharacter("codLocaliz")
                   cLote          = jsonInput:GetCharacter("lote")
                   cCodRefer      = jsonInput:GetCharacter("codRefer")
                   iNrContagem    = jsonInput:GetInteger("nrContagem")
                   cUsuario       = jsonInput:GetCharacter("codUsuario") NO-ERROR.
        END.

        IF iNrContagem = 0 OR iNrContagem = ? THEN
            ASSIGN iNrContagem = 1.
        
        FIND FIRST param-estoq NO-LOCK NO-ERROR.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FOR EACH inventario NO-LOCK
           WHERE (IF dtSaldo <> ? THEN inventario.dt-saldo = dtSaldo ELSE TRUE)
             AND (IF cCodEstab <> '' AND cCodEstab <> ? THEN inventario.cod-estabel = cCodEstab ELSE TRUE)
             AND inventario.situacao <> 3
             AND (IF cItCodigo <> '' AND cItCodigo <> ? THEN inventario.it-codigo = cItCodigo ELSE TRUE)
             AND (IF cCodDepos <> '' AND cCodDepos <> ? THEN inventario.cod-depos = cCodDepos ELSE TRUE)
             AND (IF cCodLocaliz <> '' AND cCodLocaliz <> ? THEN inventario.cod-localiz = cCodLocaliz ELSE TRUE)
             AND (IF cLote <> '' AND cLote <> ? THEN inventario.lote = cLote ELSE TRUE)
             AND (IF cCodRefer <> '' AND cCodRefer <> ? THEN inventario.cod-refer = cCodRefer ELSE TRUE)
             AND (IF lApenasPendentes THEN
                    (IF iNrContagem = 1 THEN inventario.val-apurado[1] = ?
                     ELSE IF iNrContagem = 2 THEN inventario.val-apurado[2] = ?
                     ELSE IF iNrContagem = 3 THEN inventario.val-apurado[3] = ?
                     ELSE TRUE)
                  ELSE TRUE),
            FIRST ITEM OF inventario NO-LOCK:

            FIND FIRST deposito OF inventario NO-LOCK NO-ERROR.
            FIND FIRST localizacao WHERE localizacao.cod-estabel = inventario.cod-estabel
                                     AND localizacao.cod-depos   = inventario.cod-depos
                                     AND localizacao.cod-localiz = inventario.cod-localiz NO-LOCK NO-ERROR.
            FIND FIRST saldo-estoq OF inventario NO-LOCK NO-ERROR.
            
            ASSIGN l-existe-reg = YES.
            
            IF iNrContagem > 1 THEN DO:
                /* Se a contagem 1 ‚ igual ao saldo de estoque e cons-invent = 1, nÆo mostra */
                IF AVAIL param-estoq AND param-estoq.cons-invent = 1 AND inventario.val-apurado[1] = inventario.qtidade-atu THEN 
                    NEXT.
                
                /* Se contagem 1, 2 e 3 sÆo iguais e situacao = 4, nÆo considera mais */
                IF inventario.situacao = 4 
                   AND inventario.val-apurado[2] = inventario.val-apurado[1] 
                   AND inventario.val-apurado[3] = inventario.val-apurado[1] THEN 
                    NEXT.
                    
                /* Segrega‡Æo por usu rio */
                IF inventario.cod-confte-contag[1] = cUsuario 
                   OR inventario.cod-confte-contag[2] = cUsuario THEN 
                    NEXT.
            END.

            IF iNrContagem > 2 AND inventario.val-apurado[1] = inventario.val-apurado[2] THEN
                NEXT.

            ASSIGN cDscSit = ''.
            CASE inventario.situacao:
                WHEN 1 THEN cDscSit = 'Atualiza'.
                WHEN 2 THEN cDscSit = 'Nao Atualiza'.
                WHEN 3 THEN cDscSit = 'Inventario OK'.
                WHEN 4 THEN cDscSit = 'OK p/Inventario'.
            END CASE.

            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("codEmpresa",   c-ep-codigo).
            oJsonOutput:ADD("nrFicha",      inventario.nr-ficha).
            oJsonOutput:ADD("dtSaldo",      inventario.dt-saldo).
            oJsonOutput:ADD("codEstabel",   inventario.cod-estabel).
            oJsonOutput:ADD("codDepos",     inventario.cod-depos).
            oJsonOutput:ADD("codLocaliz",   inventario.cod-localiz).
            oJsonOutput:ADD("lote",         inventario.lote).
            oJsonOutput:ADD("codRefer",     inventario.cod-refer).
            oJsonOutput:ADD("itCodigo",     inventario.it-codigo).
            oJsonOutput:ADD("qtApurada",        inventario.val-apurado[iNrContagem]).
            oJsonOutput:ADD("valApurado1",      inventario.val-apurado[1]).
            oJsonOutput:ADD("valApurado2",      inventario.val-apurado[2]).
            oJsonOutput:ADD("valApurado3",      inventario.val-apurado[3]).
            oJsonOutput:ADD("codConfteContag1", inventario.cod-confte-contag[1]).
            oJsonOutput:ADD("codConfteContag2", inventario.cod-confte-contag[2]).
            oJsonOutput:ADD("codConfteContag3", inventario.cod-confte-contag[3]).
            oJsonOutput:ADD("nrContagem",   iNrContagem).
            oJsonOutput:ADD("situacao",     inventario.situacao).
            oJsonOutput:ADD("descItem",     fn-free-accent(ITEM.desc-item)).
            oJsonOutput:ADD("cdnAgrup",     inventario.cdn-agrup).
            oJsonOutput:ADD("nomeDepos",    IF AVAIL deposito THEN fn-free-accent(deposito.nome) ELSE inventario.cod-depos).
            oJsonOutput:ADD("descLocaliz",  IF AVAIL localizacao THEN fn-free-accent(localizacao.descricao) ELSE "").
            oJsonOutput:ADD("dtValiLote",   IF AVAIL saldo-estoq AND saldo-estoq.dt-vali-lote <> ? THEN saldo-estoq.dt-vali-lote ELSE 12/31/9999).
            oJsonOutput:ADD("dscSituacao",  cDscSit).
            oJsonOutput:ADD("un",           ITEM.un).

            oJsonArray:ADD(oJsonOutput).
        END.
        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 

    END. /* bloco */
    
    CATCH erro AS Progress.Lang.Error:
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD("detailedMessage", erro:GetMessage(1)).
        jsonOutput:ADD("code",            "17006").
        jsonOutput:ADD("message",         erro:GetMessage(1)).
        jsonOutput:ADD("type",            "ERROR").
    END.

    RETURN 'OK':U.

END PROCEDURE.
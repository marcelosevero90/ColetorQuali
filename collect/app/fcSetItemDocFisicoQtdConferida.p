{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetItemDocFisicoQtdConferida MCE}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var c-nro-docto          AS CHAR         NO-UNDO.
    define var c-serie-docto        AS CHAR         NO-UNDO.
    define var i-cod-emit           AS INT          NO-UNDO.
    define var i-tp-nota            AS INT          NO-UNDO.
    define var i-sequencia          AS INT          NO-UNDO.
    define var i-cont-rat-lote      AS INT          NO-UNDO.
    define var d-qt-conf            AS DEC          NO-UNDO.
    define var de-qtd-rat-lote      AS DEC          NO-UNDO.
    define var de-qtd-rat-ordem     AS DEC          NO-UNDO.
    define var de-qtd-aux           AS DEC          NO-UNDO.     

    // Criacao do Retorno 
    DEFINE VAR oJsonArray   AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput  AS JsonObject NO-UNDO.
                                    
    
    /*bloco:
    DO ON ERROR UNDO, RETURN 'NOK'
       ON STOP  UNDO, RETURN 'NOK'.*/

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
        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
            
            ASSIGN c-nro-docto         = oJsonPayloadObject:GetCharacter("nroDocto")
                   c-serie-docto       = oJsonPayloadObject:GetCharacter("serieDocto") 
                   i-cod-emit          = oJsonPayloadObject:GetInteger("codEmitente") 
                   i-tp-nota           = oJsonPayloadObject:GetInteger("tipoNota") 
                   i-sequencia         = oJsonPayloadObject:GetInteger("sequencia") 
                   d-qt-conf           = oJsonPayloadObject:GetDecimal("quantConf") 
                   .                                   
        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().

        FIND FIRST it-doc-fisico NO-LOCK
            WHERE it-doc-fisico.serie-docto    = c-serie-docto
              AND it-doc-fisico.nro-docto      = c-nro-docto
              AND it-doc-fisico.cod-emitente   = i-cod-emit
              AND it-doc-fisico.tipo-nota      = i-tp-nota 
              AND it-doc-fisico.sequencia      = i-sequencia               
              NO-ERROR.
        IF NOT AVAIL it-doc-fisico THEN DO:
        
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 15921
                   RowErrors.ErrorDescription = "Item Doc Fisico " + STRING(c-nro-docto) 
                                              + ' - ' + c-serie-docto + ' - ' + STRING(i-cod-emit) + ' nÆo encontrado!'                 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".
                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
                   
            RETURN "OK".  
        END.
        
        ASSIGN de-qtd-rat-lote = 0
               i-cont-rat-lote = 0.  
        FOR EACH rat-lote NO-LOCK
            WHERE rat-lote.nro-docto    = it-doc-fisico.nro-docto
              AND rat-lote.serie-docto  = it-doc-fisico.serie-docto
              AND rat-lote.cod-emitente = it-doc-fisico.cod-emitente
              AND rat-lote.nat-operacao = ""
              AND rat-lote.sequencia    = it-doc-fisico.sequencia
              AND rat-lote.tipo-nota    = it-doc-fisico.tipo-nota
              AND rat-lote.int-2        <> 3:
        
            ASSIGN de-qtd-rat-lote = de-qtd-rat-lote + rat-lote.quantidade
                   i-cont-rat-lote = i-cont-rat-lote + 1.                    
        END.
        
        assign de-qtd-rat-ordem = 0.
        for each rat-ordem where
            rat-ordem.cod-emitente = it-doc-fisico.cod-emitente    and
            rat-ordem.serie-docto  = it-doc-fisico.serie-docto     and
            rat-ordem.nro-docto    = it-doc-fisico.nro-docto       and
            rat-ordem.nat-operacao = ""                            and
            rat-ordem.tipo-nota    = it-doc-fisico.tipo-nota and
            rat-ordem.sequencia    = it-doc-fisico.sequencia no-lock:

            assign de-qtd-rat-ordem = de-qtd-rat-ordem + rat-ordem.quantidade.
        end. 
        
        //se for somente um dep¢sito, atualiza automaticamente a quantidade
        IF i-cont-rat-lote = 1 THEN DO:            
            ASSIGN de-qtd-rat-lote = d-qt-conf.
        END.

        if  d-qt-conf <> de-qtd-rat-lote then do:
        
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17341
                   RowErrors.ErrorDescription = "Quantidade estoque " + STRING(de-qtd-rat-lote) + " diferente da quantidade contada " + STRING(d-qt-conf)
                   RowErrors.ErrorSubType     = "ERROR".
                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
                   
            RETURN "OK".                        
        END.        
        if  d-qt-conf < de-qtd-rat-ordem then do:
        
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17342
                   RowErrors.ErrorDescription = "Quantidade das ordens de compra maior que quantidade contada!"
                   RowErrors.ErrorSubType     = "ERROR".
                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
                   
            RETURN "OK".                        
        END. 
        if  it-doc-fisico.tipo-nota = 7             /* Fat Consig */
        or  it-doc-fisico.tipo-nota = 8 then do:    /* Dev Consig */

            for first saldo-terc fields (quantidade)
                where saldo-terc.cod-emitente = it-doc-fisico.cod-emitente 
                and   saldo-terc.serie-docto  = it-doc-fisico.serie-comp 
                and   saldo-terc.nro-docto    = it-doc-fisico.nro-comp
                and   saldo-terc.nat-operacao = it-doc-fisico.nat-comp 
                and   saldo-terc.it-codigo    = it-doc-fisico.it-codigo
                and   saldo-terc.cod-refer    = it-doc-fisico.cod-refer 
                and   saldo-terc.sequencia    = it-doc-fisico.seq-comp no-lock: end.
            if  avail saldo-terc 
            and d-qt-conf > saldo-terc.quantidade then do:
            
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = 29838
                       RowErrors.ErrorDescription = "Quantidade contada maior que quantidade em poder de terceiros!"
                       RowErrors.ErrorSubType     = "ERROR".
                       
                jsonOutput = NEW JsonObject().
                jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
                jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
                jsonOutput:ADD('message',           RowErrors.ErrorDescription).
                jsonOutput:ADD('type',              'ERROR').
                       
                RETURN "OK". 
            end.
        end.
        
        FIND CURRENT it-doc-fisico EXCLUSIVE-LOCK NO-ERROR.

        ASSIGN de-qtd-aux = if  it-doc-fisico.quant-conf <> 0 then 
                                it-doc-fisico.quant-conf 
                            else 
                                it-doc-fisico.quantidade.

        assign it-doc-fisico.quant-conf = d-qt-conf.
        
        //se for somente um dep¢sito, atualiza automaticamente a quantidade
        IF i-cont-rat-lote = 1 THEN DO:                       
            FOR FIRST rat-lote EXCLUSIVE-LOCK
                WHERE rat-lote.nro-docto    = it-doc-fisico.nro-docto
                  AND rat-lote.serie-docto  = it-doc-fisico.serie-docto
                  AND rat-lote.cod-emitente = it-doc-fisico.cod-emitente
                  AND rat-lote.nat-operacao = ""
                  AND rat-lote.sequencia    = it-doc-fisico.sequencia
                  AND rat-lote.tipo-nota    = it-doc-fisico.tipo-nota
                  AND rat-lote.int-2        <> 3:
            
                ASSIGN rat-lote.quantidade = d-qt-conf.
            END.
            RELEASE rat-lote NO-ERROR.
        END.
        
        
        FIND CURRENT it-doc-fisico NO-LOCK NO-ERROR.
        
        if  it-doc-fisico.numero-ordem <> 0 then do:
            find prazo-compra 
                where prazo-compra.numero-ordem = it-doc-fisico.numero-ordem
                  and prazo-compra.parcela      = it-doc-fisico.parcela
                no-lock no-error.
            if  avail prazo-compra then do:
                run pi-aloca-ordem-cc ( no, de-qtd-aux, rowid(prazo-compra) ).

                run pi-aloca-ordem-cc ( yes, it-doc-fisico.quant-conf, rowid(prazo-compra) ).
            end.                
        end.         
        
        /* Alocacao do Saldo em Poder de Terceiros */
        if  it-doc-fisico.tipo-nota = 7             /* Fat Consig */
        or  it-doc-fisico.tipo-nota = 8 then do:    /* Dev Consig */

            find saldo-terc 
                where saldo-terc.cod-emitente = it-doc-fisico.cod-emitente 
                  and saldo-terc.serie-docto  = it-doc-fisico.serie-comp 
                  and saldo-terc.nro-docto    = it-doc-fisico.nro-comp
                  and saldo-terc.nat-operacao = it-doc-fisico.nat-comp 
                  and saldo-terc.it-codigo    = it-doc-fisico.it-codigo
                  and saldo-terc.cod-refer    = it-doc-fisico.cod-refer 
                  and saldo-terc.sequencia    = it-doc-fisico.seq-comp 
                exclusive-lock no-error.

            if  avail saldo-terc THEN
                assign saldo-terc.dec-1 = saldo-terc.dec-1 - de-qtd-aux + it-doc-fisico.quant-conf
                       saldo-terc.dec-1 = if  saldo-terc.dec-1 < 0 then 0 
                                          else saldo-terc.dec-1.
        end. 

        RELEASE saldo-terc NO-ERROR.
        
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Processo realizado com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Quantidade atualizada com sucesso no Datasul!').
        jsonOutput:ADD('type',              'OK').   
        
        RETURN "OK".        
        
    //END.
    
    //RETURN "OK".

    CATCH erro AS Progress.Lang.Error:
        //RUN setErrorResponse(erro:GetMessage(1), OUTPUT jsonOutput).
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   erro:GetMessage(1)).
        jsonOutput:ADD('code',              '17006').
        jsonOutput:ADD('message',           erro:GetMessage(1)).
        jsonOutput:ADD('type',              'ERROR').        
    END. 

END PROCEDURE.


procedure pi-aloca-ordem-cc:
    /**************************************************************
    **      Aloca / Desaloca Ordens de Compra
    **      Parametros.: 1 - Aloca / Desaloca
    **                   2 - Quantidade
    **                   3 - Rowid Prazo-Compra
    ***************************************************************/
    def input param l-aloca         as logical  no-undo.
    def input param de-quant-cc     as decimal  no-undo.
    def input param rw-prazo        as rowid    no-undo.
    
    def buffer pi-prazo-compra      for prazo-compra.    

    find pi-prazo-compra 
        where rowid(pi-prazo-compra) = rw-prazo exclusive-lock no-error.
        
    if  avail pi-prazo-compra then do:
        if  l-aloca then 
            assign pi-prazo-compra.dec-1 = pi-prazo-compra.dec-1 + de-quant-cc.
        else 
            assign pi-prazo-compra.dec-1 = pi-prazo-compra.dec-1 - de-quant-cc.
            
        if  pi-prazo-compra.dec-1 < 0 then 
            assign pi-prazo-compra.dec-1 = 0.        
    end.
    RELEASE PI-PRAZO-COMPRA NO-ERROR.        
end.


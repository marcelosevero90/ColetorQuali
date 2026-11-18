{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetItemRatLoteDocFisicoQtdConferida MCE}
&ENDIF

{include/i-freeac.i}

DEFINE TEMP-TABLE tt-rat-lote-integra NO-UNDO
    FIELD nroDocto          AS CHAR
    FIELD serieDocto        AS CHAR
    FIELD codEmitente       AS INT
    FIELD tipoNota          AS INT
    FIELD sequencia         AS INT
    FIELD codDepos          AS CHAR
    FIELD lote              AS CHAR
    FIELD dtValiLote        AS DATE
    FIELD codLocaliz        AS CHAR
    FIELD codRefer          AS CHAR
    FIELD quantidade        AS DEC
    FIELD quantConf         AS DEC.

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var c-aux        AS CHAR         NO-UNDO.
    define var c-erros      AS CHAR         NO-UNDO.
    
    /*define var c-nro-docto          AS CHAR         NO-UNDO.
    define var c-serie-docto        AS CHAR         NO-UNDO.
    define var i-cod-emit           AS INT          NO-UNDO.
    define var i-tp-nota            AS INT          NO-UNDO.
    define var i-sequencia          AS INT          NO-UNDO.
    define var i-cont-rat-lote      AS INT          NO-UNDO.*/
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

       
        EMPTY TEMP-TABLE tt-rat-lote-integra.
        EMPTY TEMP-TABLE RowErrors.
       
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
        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).            
                           
            CREATE tt-rat-lote-integra.
            ASSIGN tt-rat-lote-integra.nroDocto          = oJsonPayloadObject:GetCharacter("nroDocto")
                   tt-rat-lote-integra.serieDocto        = oJsonPayloadObject:GetCharacter("serieDocto")
                   tt-rat-lote-integra.codEmitente       = oJsonPayloadObject:GetInteger("codEmitente")
                   tt-rat-lote-integra.tipoNota          = oJsonPayloadObject:GetInteger("tipoNota")
                   tt-rat-lote-integra.sequencia         = oJsonPayloadObject:GetInteger("sequencia")
                   tt-rat-lote-integra.codDepos          = oJsonPayloadObject:GetCharacter("codDepos")
                   tt-rat-lote-integra.lote              = oJsonPayloadObject:GetCharacter("lote")
                   tt-rat-lote-integra.dtValiLote        = oJsonPayloadObject:GetDate("dtValiLote")
                   tt-rat-lote-integra.codLocaliz        = oJsonPayloadObject:GetCharacter("codLocaliz")
                   tt-rat-lote-integra.quantidade        = oJsonPayloadObject:GetDecimal("quantidade")
                   tt-rat-lote-integra.quantConf         = oJsonPayloadObject:GetDecimal("quantConf").                   
        END.
        
        /*jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'teste').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           c-aux).
        jsonOutput:ADD('type',              'OK').           */
        
        
        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().        
        
        FOR EACH tt-rat-lote-integra:        
        
            FIND FIRST doc-fisico NO-LOCK
                WHERE doc-fisico.serie-docto    = tt-rat-lote-integra.serieDocto
                  AND doc-fisico.nro-docto      = tt-rat-lote-integra.nroDocto
                  AND doc-fisico.cod-emitente   = tt-rat-lote-integra.codEmitente
                  AND doc-fisico.tipo-nota      = tt-rat-lote-integra.tipoNota               
                  NO-ERROR.
            IF NOT AVAIL doc-fisico THEN DO:        
        
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = 17006
                       RowErrors.ErrorDescription = "Doc Fisico " + STRING(tt-rat-lote-integra.nroDocto) 
                                                  + ' - ' + tt-rat-lote-integra.serieDocto + ' - ' + STRING(tt-rat-lote-integra.codEmitente) + ' n∆o encontrado!' 
                       RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                       RowErrors.ErrorSubType     = "ERROR".
                                                     
            END.        
        
            FIND FIRST it-doc-fisico NO-LOCK
                WHERE it-doc-fisico.serie-docto    = tt-rat-lote-integra.serieDocto
                  AND it-doc-fisico.nro-docto      = tt-rat-lote-integra.nroDocto
                  AND it-doc-fisico.cod-emitente   = tt-rat-lote-integra.codEmitente
                  AND it-doc-fisico.tipo-nota      = tt-rat-lote-integra.tipoNota 
                  AND it-doc-fisico.sequencia      = tt-rat-lote-integra.sequencia               
                  NO-ERROR.
            IF NOT AVAIL it-doc-fisico THEN DO:        
        
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = 17006
                       RowErrors.ErrorDescription = "Item Doc Fisico " + STRING(tt-rat-lote-integra.nroDocto) 
                                                  + ' - ' + tt-rat-lote-integra.serieDocto + ' - ' + STRING(tt-rat-lote-integra.codEmitente) + ' - Seq: ' + STRING(tt-rat-lote-integra.sequencia) + ' n∆o encontrado!' 
                       RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                       RowErrors.ErrorSubType     = "ERROR".
                                                     
            END.
            ELSE DO:
            
                FIND FIRST ITEM NO-LOCK
                    WHERE ITEM.it-codigo = it-doc-fisico.it-codigo NO-ERROR.
                IF AVAIL ITEM THEN DO:
                    IF ITEM.tipo-con-est <> 3 THEN DO:
                        ASSIGN tt-rat-lote-integra.lote         = ''
                               tt-rat-lote-integra.dtValiLote   = ?.                                
                    END.
                END.
            END.
            
            FIND FIRST deposito NO-LOCK
                WHERE deposito.cod-depos    = tt-rat-lote-integra.codDepos NO-ERROR.
            IF NOT AVAIL deposito THEN DO:
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = 17006
                       RowErrors.ErrorDescription = "Dep¢sito " + tt-rat-lote-integra.codDepos + ' n∆o encontrado!' 
                       RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                       RowErrors.ErrorSubType     = "ERROR".                
            END.
            
            FIND FIRST cademp.localizacao NO-LOCK
                WHERE localizacao.cod-estabel   = doc-fisico.cod-estabel
                  AND localizacao.cod-depos     = tt-rat-lote-integra.codDepos 
                  AND localizacao.cod-localiz   = tt-rat-lote-integra.codLocaliz                   
                  NO-ERROR.
            IF NOT AVAIL localizacao THEN DO:                
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = 17006
                       RowErrors.ErrorDescription = "Localizaá∆o " + tt-rat-lote-integra.codLocaliz + '/' + tt-rat-lote-integra.codDepos + '/' + doc-fisico.cod-estabel + ' n∆o encontrado!' 
                       RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                       RowErrors.ErrorSubType     = "ERROR".                
            END.            
            
        END.
        
        IF CAN-FIND(FIRST RowErrors) THEN DO:
            ASSIGN c-erros = ''.
            FOR EACH RowErrors:
                ASSIGN c-erros = c-erros + RowErrors.ErrorDescription + '|'. 
            END.
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           c-erros).
            jsonOutput:ADD('type',              'ERROR').                   
            RETURN "OK".             
        END.
        
        DO ON ERROR UNDO, RETURN 'NOK'
           ON STOP  UNDO, RETURN 'NOK'.        
        
              
            FOR EACH rat-lote EXCLUSIVE-LOCK
                WHERE rat-lote.nro-docto    = it-doc-fisico.nro-docto
                  AND rat-lote.serie-docto  = it-doc-fisico.serie-docto
                  AND rat-lote.cod-emitente = it-doc-fisico.cod-emitente
                  AND rat-lote.nat-operacao = ""
                  AND rat-lote.sequencia    = it-doc-fisico.sequencia
                  AND rat-lote.tipo-nota    = it-doc-fisico.tipo-nota
                  AND rat-lote.int-2        <> 3:            
                DELETE rat-lote.                                    
            END.         

            ASSIGN de-qtd-rat-lote = 0.
            FOR EACH tt-rat-lote-integra:                
            
                CREATE rat-lote.
                ASSIGN rat-lote.nro-docto    = tt-rat-lote-integra.nroDocto
                       rat-lote.serie-docto  = tt-rat-lote-integra.serieDocto
                       rat-lote.cod-emitente = tt-rat-lote-integra.codEmitente
                       rat-lote.nat-operacao = ""
                       rat-lote.sequencia    = tt-rat-lote-integra.sequencia
                       rat-lote.tipo-nota    = tt-rat-lote-integra.tipoNota                
                       rat-lote.cod-depos    = tt-rat-lote-integra.codDepos
                       rat-lote.cod-localiz  = tt-rat-lote-integra.codLocaliz
                       rat-lote.lote         = tt-rat-lote-integra.lote   
                       rat-lote.dt-vali-lote = tt-rat-lote-integra.dtValiLote
                       rat-lote.cod-refer    = tt-rat-lote-integra.codRefer
                       rat-lote.quantidade   = round(tt-rat-lote-integra.quantidade,4).                       
                        
                ASSIGN de-qtd-rat-lote = de-qtd-rat-lote + rat-lote.quantidade.            
            END.
            
            FOR FIRST tt-rat-lote-integra:
            
                ASSIGN de-qtd-aux = 0.
                FIND FIRST it-doc-fisico EXCLUSIVE-LOCK
                    WHERE it-doc-fisico.serie-docto    = tt-rat-lote-integra.serieDocto
                      AND it-doc-fisico.nro-docto      = tt-rat-lote-integra.nroDocto
                      AND it-doc-fisico.cod-emitente   = tt-rat-lote-integra.codEmitente
                      AND it-doc-fisico.tipo-nota      = tt-rat-lote-integra.tipoNota 
                      AND it-doc-fisico.sequencia      = tt-rat-lote-integra.sequencia               
                      NO-ERROR.
                IF AVAIL it-doc-fisico THEN DO: 
                                    
                    ASSIGN de-qtd-aux = if  it-doc-fisico.quant-conf <> 0 then 
                                            it-doc-fisico.quant-conf 
                                        else 
                                            it-doc-fisico.quantidade.

                    assign it-doc-fisico.quant-conf = ROUND(de-qtd-rat-lote,4). //tt-rat-lote-integra.quantConf.   
                    
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
                END.            
            END.                  
        END.
        

        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Processo realizado com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Quantidade atualizada com sucesso no Datasul!').
        jsonOutput:ADD('type',              'OK').   
        
        RETURN "OK".          


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


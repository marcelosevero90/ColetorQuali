{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetRatLoteDocFisico MCE}
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



    // Criacao do Retorno 
    DEFINE VAR oJsonArray   AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput  AS JsonObject NO-UNDO.
                                    
    
    bloco:
    DO ON ERROR UNDO, RETURN 'NOK'
       ON STOP  UNDO, RETURN 'NOK'.

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
            
                        
        FOR EACH rat-lote NO-LOCK
            WHERE rat-lote.nro-docto    = it-doc-fisico.nro-docto
              AND rat-lote.serie-docto  = it-doc-fisico.serie-docto
              AND rat-lote.cod-emitente = it-doc-fisico.cod-emitente
              AND rat-lote.nat-operacao = ""
              AND rat-lote.sequencia    = it-doc-fisico.sequencia
              AND rat-lote.tipo-nota    = it-doc-fisico.tipo-nota
              AND rat-lote.int-2        <> 3,
              FIRST ITEM OF rat-lote NO-LOCK,
              FIRST deposito OF rat-lote NO-LOCK.
                          
            oJsonOutput = NEW JsonObject().
            oJsonOutput:ADD("nroDocto" ,        it-doc-fisico.nro-docto        ).
            oJsonOutput:ADD("serieDocto" ,      it-doc-fisico.serie-docto      ).
            oJsonOutput:ADD("codEmitente"     , it-doc-fisico.cod-emitente     ).
            oJsonOutput:ADD("tipoNota"     ,    it-doc-fisico.tipo-nota        ).
            oJsonOutput:ADD("sequencia"     ,   it-doc-fisico.sequencia        ).            
            oJsonOutput:ADD("itCodigo"     ,    it-doc-fisico.it-codigo        ).
            oJsonOutput:ADD("descItem"     ,    fn-free-accent(ITEM.desc-item) ).
            oJsonOutput:ADD("unItem"     ,      ITEM.un                        ).
            
            oJsonOutput:ADD("codDepos"     ,    rat-lote.cod-depos                         ).
            oJsonOutput:ADD("nomeDepos"     ,   deposito.nome                         ).
            oJsonOutput:ADD("codLocaliz"     ,  rat-lote.cod-localiz                          ).
            oJsonOutput:ADD("lote"     ,        rat-lote.lote                     ).
            oJsonOutput:ADD("dtValiLote"     ,  rat-lote.dt-vali-lote                          ).
            oJsonOutput:ADD("quantidade"     ,  rat-lote.quantidade                          ).
            oJsonOutput:ADD("codRefer"     ,    rat-lote.cod-refer                         ).
            oJsonOutput:ADD("datFabriccLote" ,  rat-lote.dat-fabricc-lote                          ).
            
            oJsonArray :ADD(oJsonOutput).
        END.
        jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 
        

    END.
    
    RETURN 'OK':U.
    
    CATCH erro AS Progress.Lang.Error:
        //RUN setErrorResponse(erro:GetMessage(1), OUTPUT jsonOutput).
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   erro:GetMessage(1)).
        jsonOutput:ADD('code',              '17006').
        jsonOutput:ADD('message',           erro:GetMessage(1)).
        jsonOutput:ADD('type',              'ERROR').        
    END.     

    

END PROCEDURE.


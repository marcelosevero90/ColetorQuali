{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetTransfMaterial MCE}
&ENDIF

{cdp/cd0666.i}
{cep/ceapi001k.i} /*tabela tt-movto*/


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

    DEFINE VAR c-itCodigo           AS CHAR         NO-UNDO.
    DEFINE VAR c-codEstabel         AS CHAR         NO-UNDO.
    DEFINE VAR c-usuario            AS CHAR         NO-UNDO.
    DEFINE VAR dt-transf            AS DATE         NO-UNDO.
    DEFINE VAR c-nroDocto           AS CHAR         NO-UNDO.
    DEFINE VAR c-serie              AS CHAR         NO-UNDO.
    DEFINE VAR d-quantidade         AS DEC          NO-UNDO.
    
    DEFINE VAR c-codDeposSai        AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocalizSai      AS CHAR         NO-UNDO.
    DEFINE VAR c-LoteSai            AS CHAR         NO-UNDO.
    DEFINE VAR c-codReferSai        AS CHAR         NO-UNDO.
    
    DEFINE VAR c-codDeposEnt        AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocalizEnt      AS CHAR         NO-UNDO.
    DEFINE VAR c-LoteEnt            AS CHAR         NO-UNDO.
    DEFINE VAR c-codReferEnt        AS CHAR         NO-UNDO.   
    
    DEFINE VAR hCeapi001k           AS HANDLE       NO-UNDO. 
    DEFINE VAR c-erros-lista        AS CHAR         NO-UNDO.   

    
    DEFINE BUFFER b-saldo-estoq-ent FOR saldo-estoq.

    EMPTY TEMP-TABLE tt-erro.
    EMPTY TEMP-TABLE RowErrors.
    
   // bloco:
   // DO ON ERROR UNDO, RETURN 'NOK'
   //    ON STOP  UNDO, RETURN 'NOK'.

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
                       
            ASSIGN c-itCodigo    = oJsonPayloadObject:GetCharacter("itCodigo")
                   c-codEstabel  = oJsonPayloadObject:GetCharacter("codEstabel")
                   c-usuario     = oJsonPayloadObject:GetCharacter("codUsuario")
                   dt-transf     = oJsonPayloadObject:GetDate("dtTransf") 
                   c-nroDocto    = oJsonPayloadObject:GetCharacter("nroDocto")
                   c-serie       = oJsonPayloadObject:GetCharacter("serie")
                   d-quantidade  = oJsonPayloadObject:GetDecimal("quantidade")
                   
                   . 
   
            ASSIGN c-codDeposSai    = oJsonPayloadObject:GetCharacter("codDeposSai")
                   c-codLocalizSai  = oJsonPayloadObject:GetCharacter("codLocalizSai")
                   c-loteSai        = oJsonPayloadObject:GetCharacter("loteSai") 
                   c-codReferSai    = oJsonPayloadObject:GetCharacter("codReferSai").  
                   
            ASSIGN c-codDeposEnt    = oJsonPayloadObject:GetCharacter("codDeposEnt")
                   c-codLocalizEnt  = oJsonPayloadObject:GetCharacter("codLocalizEnt")
                   c-loteEnt        = oJsonPayloadObject:GetCharacter("loteEnt") 
                   c-codReferEnt    = oJsonPayloadObject:GetCharacter("codReferEnt").                      
                                                
        END.                                            
        
        
        /*jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   c-itCodigo + " - " + c-codDeposSai + " - " +  c-codLocalizSai).
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           '').
        jsonOutput:ADD('type',              'ERROR').
        
        RETURN. */
    
        
        FIND FIRST param-estoq NO-LOCK NO-ERROR.
        
        
        FIND ITEM NO-LOCK 
            WHERE ITEM.it-codigo = c-itCodigo NO-ERROR.
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

        FOR FIRST saldo-estoq FIELDS(dt-vali-lote) NO-LOCK
            WHERE saldo-estoq.cod-estabel   = c-codEstabel
              AND saldo-estoq.cod-depos     = c-codDeposSai
              AND saldo-estoq.cod-localiz   = c-codLocalizSai
              AND saldo-estoq.cod-refer     = c-codReferSai
              AND saldo-estoq.it-codigo     = ITEM.it-codigo
              AND saldo-estoq.lote          = c-loteSai.            
        END.        
        
       
        CREATE tt-movto.
        ASSIGN tt-movto.cod-versao-integracao = 1
               tt-movto.usuario               = c-usuario
               tt-movto.cod-depos             = c-codDeposSai
               tt-movto.cod-estabel           = c-codEstabel
               tt-movto.dt-trans              = TODAY
               tt-movto.ct-codigo             = param-estoq.ct-tr-transf
               tt-movto.sc-codigo             = param-estoq.sc-tr-transf
               tt-movto.it-codigo             = ITEM.it-codigo
               tt-movto.esp-docto             = 33 /* TRA */
               tt-movto.cod-localiz           = c-codLocalizSai
               tt-movto.lote                  = c-loteSai
               tt-movto.serie-docto           = c-serie
               tt-movto.nro-docto             = c-nroDocto
               tt-movto.cod-refer             = c-codReferSai
               tt-movto.un                    = ITEM.un
               tt-movto.tipo-trans            = 2 /* Saida */
               tt-movto.tipo-valor            = 1
               tt-movto.quantidade            = d-quantidade
               tt-movto.descricao-db          = "Transferˆncia Mobile"
               tt-movto.cod-prog-orig         = "fmscollector"   
               tt-movto.dt-vali-lote          = IF AVAIL saldo-estoq THEN saldo-estoq.dt-vali-lote ELSE ?.
    
    
        FOR FIRST b-saldo-estoq-ent FIELDS(dt-vali-lote) NO-LOCK
            WHERE b-saldo-estoq-ent.cod-estabel   = c-codEstabel
              AND b-saldo-estoq-ent.cod-depos     = c-codDeposSai
              AND b-saldo-estoq-ent.cod-localiz   = c-codLocalizSai
              AND b-saldo-estoq-ent.cod-refer     = c-codReferSai
              AND b-saldo-estoq-ent.it-codigo     = ITEM.it-codigo
              AND b-saldo-estoq-ent.lote          = c-loteSai.            
        END.        
    
         /* ENTRADA NO DEP…SITO DESTINO */  
         CREATE tt-movto.
         ASSIGN tt-movto.cod-versao-integracao  = 1
                tt-movto.usuario                = c-usuario
                tt-movto.cod-depos              = c-codDeposEnt
                tt-movto.cod-estabel            = c-codEstabel
                tt-movto.ct-codigo              = param-estoq.ct-tr-transf
                tt-movto.sc-codigo              = param-estoq.sc-tr-transf
                tt-movto.dt-trans               = TODAY
                tt-movto.esp-docto              = 33 /* TRA */
                tt-movto.it-codigo              = ITEM.it-codigo
                tt-movto.cod-localiz            = c-codLocalizEnt
                tt-movto.lote                   = c-loteEnt
                tt-movto.serie-docto            = c-serie
                tt-movto.nro-docto              = c-nroDocto
                tt-movto.cod-refer              = c-codReferEnt
                tt-movto.un                     = ITEM.un
                tt-movto.tipo-trans             = 1 /*entrada*/
                tt-movto.tipo-valor             = 1
                tt-movto.quantidade             = d-quantidade
                tt-movto.descricao-db          = "Transferˆncia Mobile"
                tt-movto.cod-prog-orig         = "fmscollector"
                tt-movto.dt-vali-lote           = IF AVAIL b-saldo-estoq-ent THEN b-saldo-estoq-ent.dt-vali-lote ELSE ?.       
          
        RUN 'cep/ceapi001k.r' PERSISTENT SET hCeapi001k NO-ERROR.        
        
        
       /* jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   'p1 = ' + SEARCH('cep/ceapi001k.r') + ' - ' + ERROR-STATUS:GET-MESSAGE(1)).
            jsonOutput:ADD('code',              '00').
            jsonOutput:ADD('message',           '1111').
            jsonOutput:ADD('type',              'ERROR').
            RETURN "OK".         */
        
        RUN pi-execute IN hCeapi001k (INPUT-OUTPUT TABLE tt-movto,
                                      INPUT-OUTPUT TABLE tt-erro,
                                      INPUT YES). 
        DELETE PROCEDURE hCeapi001k NO-ERROR.
        ASSIGN hCeapi001k = ?.

        IF TEMP-TABLE tt-erro:HAS-RECORDS THEN DO:
            
            FOR EACH tt-erro NO-LOCK,
                FIRST cadast_msg NO-LOCK
                WHERE cadast_msg.cdn_msg        = tt-erro.cd-erro
                  AND cadast_msg.idi_tip_msg    = 1. // tipo erro
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = tt-erro.cd-erro
                       RowErrors.ErrorDescription = tt-erro.mensagem
                       RowErrors.ErrorHelp        = tt-erro.mensagem
                       RowErrors.ErrorSubType     = "ERROR".
            END.            
        END.    
        
        IF CAN-FIND(FIRST RowErrors
                    WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:

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
        jsonOutput:ADD('detailedMessage',   'Processo realizado com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Transferˆncia efetuada com sucesso no Datasul!').
        jsonOutput:ADD('type',              'OK').   
        
        RETURN "OK".
        
              
    //END.
    
    CATCH erro AS Progress.Lang.Error:
        //RUN setErrorResponse(erro:GetMessage(1), OUTPUT jsonOutput).
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   erro:GetMessage(1)).
        jsonOutput:ADD('code',              '17006').
        jsonOutput:ADD('message',           erro:GetMessage(1)).
        jsonOutput:ADD('type',              'ERROR').        
    END.    

    //RETURN 'OK':U.

END PROCEDURE.




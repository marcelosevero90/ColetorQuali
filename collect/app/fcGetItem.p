{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetItem MCE}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var cCodEstabel          AS CHAR         NO-UNDO.
    define var cItCodigo            AS CHAR         NO-UNDO.
    define var cDescItem            AS CHAR         NO-UNDO.


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
            
            ASSIGN cCodEstabel   = oJsonPayloadObject:GetCharacter("codEstabel")
                   cItCodigo     = oJsonPayloadObject:GetCharacter("itCodigo")
                   cDescItem     = oJsonPayloadObject:GetCharacter("descItem").
        END.

        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().
               
        FIND FIRST ITEM NO-LOCK
            WHERE ITEM.it-codigo = cItCodigo AND ITEM.it-codigo <> "" NO-ERROR.
        IF AVAIL ITEM THEN DO:
        
            FIND FIRST deposito NO-LOCK
                WHERE deposito.cod-depos = ITEM.deposito-pad NO-ERROR.
                
            FIND FIRST cademp.localizacao NO-LOCK
                WHERE localizacao.cod-estabel   = cCodEstabel
                  AND localizacao.cod-depos     = (IF AVAIL deposito THEN deposito.cod-depos ELSE "")
                  AND localizacao.cod-localiz   = ITEM.cod-localiz NO-ERROR.
                
            oJsonOutput = NEW JsonObject().            
            oJsonOutput:ADD("itCodigo" ,            ITEM.it-codigo).
            oJsonOutput:ADD("descItem" ,            fn-free-accent(ITEM.desc-item)).
            oJsonOutput:ADD("tipoConEst",           ITEM.tipo-con-est).
            oJsonOutput:ADD("locUnica",             ITEM.loc-unica).        
            oJsonOutput:ADD("depositoPad",          ITEM.deposito-pad).
            oJsonOutput:ADD("nomeDeposito",         IF AVAIL deposito THEN fn-free-accent(deposito.nome) ELSE "").
            oJsonOutput:ADD("codLocaliz",           ITEM.cod-localiz).
            oJsonOutput:ADD("descricaoLocaliz",     IF AVAIL localizacao THEN fn-free-accent(localizacao.descricao) ELSE "").
            oJsonOutput:ADD("un",                   ITEM.un).
            
            oJsonArray :ADD(oJsonOutput).
            jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE).
            
        END.
        ELSE DO:          
        
            IF cItCodigo <> "" AND cDescItem = "" THEN
            DO:           
            
                FOR EACH ITEM NO-LOCK
                    WHERE ITEM.it-codigo BEGINS cItCodigo.

                    //oJsonOutput = NEW JsonObject().

                    FIND FIRST deposito NO-LOCK
                        WHERE deposito.cod-depos = ITEM.deposito-pad NO-ERROR.
                        
                    FIND FIRST cademp.localizacao NO-LOCK
                        WHERE localizacao.cod-estabel   = cCodEstabel
                          AND localizacao.cod-depos     = (IF AVAIL deposito THEN deposito.cod-depos ELSE "")
                          AND localizacao.cod-localiz   = ITEM.cod-localiz NO-ERROR.
                        
                    oJsonOutput = NEW JsonObject().            
                    oJsonOutput:ADD("itCodigo" ,            ITEM.it-codigo).
                    oJsonOutput:ADD("descItem" ,            fn-free-accent(ITEM.desc-item)).
                    oJsonOutput:ADD("tipoConEst",           ITEM.tipo-con-est).
                    oJsonOutput:ADD("locUnica",             ITEM.loc-unica).        
                    oJsonOutput:ADD("depositoPad",          ITEM.deposito-pad).
                    oJsonOutput:ADD("nomeDeposito",         IF AVAIL deposito THEN fn-free-accent(deposito.nome) ELSE "").
                    oJsonOutput:ADD("codLocaliz",           ITEM.cod-localiz).
                    oJsonOutput:ADD("descricaoLocaliz",     IF AVAIL localizacao THEN fn-free-accent(localizacao.descricao) ELSE "").
                    oJsonOutput:ADD("un",                   ITEM.un).                               
                    
                    oJsonArray :ADD(oJsonOutput).
                END.
                jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE).             
            
                
            END.
            ELSE DO:
            
                IF cItCodigo = "" AND cDescItem <> "" THEN
                DO: 
                
                    ASSIGN cDescItem = '*' + cDescItem + '*'.
                
                    FOR EACH ITEM USE-INDEX descricao NO-LOCK
                        WHERE ITEM.desc-item MATCHES cDescItem.

                        //oJsonOutput = NEW JsonObject().

                        FIND FIRST deposito NO-LOCK
                            WHERE deposito.cod-depos = ITEM.deposito-pad NO-ERROR.
                            
                        FIND FIRST cademp.localizacao NO-LOCK
                            WHERE localizacao.cod-estabel   = cCodEstabel
                              AND localizacao.cod-depos     = (IF AVAIL deposito THEN deposito.cod-depos ELSE "")
                              AND localizacao.cod-localiz   = ITEM.cod-localiz NO-ERROR.
                            
                        oJsonOutput = NEW JsonObject().            
                        oJsonOutput:ADD("itCodigo" ,            ITEM.it-codigo).
                        oJsonOutput:ADD("descItem" ,            fn-free-accent(ITEM.desc-item)).
                        oJsonOutput:ADD("tipoConEst",           ITEM.tipo-con-est).
                        oJsonOutput:ADD("locUnica",             ITEM.loc-unica).        
                        oJsonOutput:ADD("depositoPad",          ITEM.deposito-pad).
                        oJsonOutput:ADD("nomeDeposito",         IF AVAIL deposito THEN fn-free-accent(deposito.nome) ELSE "").
                        oJsonOutput:ADD("codLocaliz",           ITEM.cod-localiz).
                        oJsonOutput:ADD("descricaoLocaliz",     IF AVAIL localizacao THEN fn-free-accent(localizacao.descricao) ELSE "").
                        oJsonOutput:ADD("un",                   ITEM.un).                               
                        
                        oJsonArray :ADD(oJsonOutput).
                    END.
                    jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE).             
                
                    
                END.
                ELSE DO:
                
                    ASSIGN //cItCodigo = '*' + cItCodigo + '*'
                           cDescItem = '*' + cDescItem + '*' .
                
                    FOR EACH ITEM NO-LOCK
                        WHERE ITEM.it-codigo BEGINS cItCodigo
                           OR ITEM.desc-item MATCHES cDescItem.

                        //oJsonOutput = NEW JsonObject().

                        FIND FIRST deposito NO-LOCK
                            WHERE deposito.cod-depos = ITEM.deposito-pad NO-ERROR.
                            
                        FIND FIRST cademp.localizacao NO-LOCK
                            WHERE localizacao.cod-estabel   = cCodEstabel
                              AND localizacao.cod-depos     = (IF AVAIL deposito THEN deposito.cod-depos ELSE "")
                              AND localizacao.cod-localiz   = ITEM.cod-localiz NO-ERROR.
                            
                        oJsonOutput = NEW JsonObject().            
                        oJsonOutput:ADD("itCodigo" ,            ITEM.it-codigo).
                        oJsonOutput:ADD("descItem" ,            fn-free-accent(ITEM.desc-item)).
                        oJsonOutput:ADD("tipoConEst",           ITEM.tipo-con-est).
                        oJsonOutput:ADD("locUnica",             ITEM.loc-unica).        
                        oJsonOutput:ADD("depositoPad",          ITEM.deposito-pad).
                        oJsonOutput:ADD("nomeDeposito",         IF AVAIL deposito THEN fn-free-accent(deposito.nome) ELSE "").
                        oJsonOutput:ADD("codLocaliz",           ITEM.cod-localiz).
                        oJsonOutput:ADD("descricaoLocaliz",     IF AVAIL localizacao THEN fn-free-accent(localizacao.descricao) ELSE "").
                        oJsonOutput:ADD("un",                   ITEM.un).                               
                        
                        oJsonArray :ADD(oJsonOutput).
                    END.
                    jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 
                                    
                
                END.
            
            END.
       
        END.
        
    END.

    RETURN 'OK':U.

END PROCEDURE.



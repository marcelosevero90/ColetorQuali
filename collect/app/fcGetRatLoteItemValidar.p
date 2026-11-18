{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcGetRatLoteItemValidar MCE}
&ENDIF

{include/i-freeac.i}

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.

    define var c-erros              AS CHAR         NO-UNDO.
    define var c-it-codigo          AS CHAR         NO-UNDO.
    define var c-cod-estabel        AS CHAR         NO-UNDO.
    define var c-cod-depos          AS CHAR         NO-UNDO.
    define var c-cod-localiz        AS CHAR         NO-UNDO.
    define var c-lote               AS CHAR         NO-UNDO.
    define var dt-vali-lote         AS DATE         NO-UNDO.
    define var dt-fabric            AS DATE         NO-UNDO.
    define var de-quantidade        AS DEC          NO-UNDO.    
    
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
            RUN setErrorResponse('ParÉmetro N∆o Ç Array', OUTPUT jsonOutput).
            RETURN 'NOK'. 
        END.
        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
                   
            ASSIGN c-it-codigo         = oJsonPayloadObject:GetCharacter("itCodigo")
                   c-cod-estabel       = oJsonPayloadObject:GetCharacter("codEstabel")
                   c-cod-depos         = oJsonPayloadObject:GetCharacter("codDepos")
                   c-cod-localiz       = oJsonPayloadObject:GetCharacter("codLocaliz")
                   c-lote              = oJsonPayloadObject:GetCharacter("lote")
                   dt-vali-lote        = oJsonPayloadObject:GetDate("dtValiLote")
                   dt-fabric           = oJsonPayloadObject:GetDate("dtFabric")
                   de-quantidade       = oJsonPayloadObject:GetDecimal("quantidade").                                      
        END.
        
        ASSIGN oJsonArray  = NEW JsonArray()
               oJsonOutput = NEW JsonObject().
               
        FIND FIRST ITEM NO-LOCK
            WHERE ITEM.it-codigo = c-it-codigo NO-ERROR.
        IF NOT AVAIL ITEM THEN DO:    
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Item "  +  c-it-codigo + " n∆o encontrado!"
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".         
        
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').                   
            RETURN "OK".             
        END.
               
        IF ITEM.tipo-con-est = 3 THEN DO:        
        
            IF c-lote <> "" THEN DO:
                IF dt-vali-lote = ? OR dt-fabric = ? THEN DO:               
                    CREATE RowErrors.
                    ASSIGN RowErrors.ErrorNumber      = 17006
                           RowErrors.ErrorDescription = "Data de validade e data de fabricaá∆o do Lote devem ser informados!" 
                           RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                           RowErrors.ErrorSubType     = "ERROR".                                
                END.  
                ELSE DO:                               
                    FIND FIRST saldo-estoq NO-LOCK
                        WHERE saldo-estoq.cod-estabel   = c-cod-estabel
                          AND saldo-estoq.it-codigo     = c-it-codigo
                          AND saldo-estoq.lote          = c-lote NO-ERROR.
                    IF AVAIL saldo-estoq THEN DO:
                        IF dt-vali-lote <> saldo-estoq.dt-vali-lote THEN DO:
                            ASSIGN dt-vali-lote = saldo-estoq.dt-vali-lote.                    
                        END.                
                    END.    
                END.
            END.
            ELSE DO:            
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = 17006
                       RowErrors.ErrorDescription = "Item Ç controlado por lote mas lote n∆o foi informado!" 
                       RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                       RowErrors.ErrorSubType     = "ERROR".                                    
            END.
        END.
        
        IF ITEM.loc-unica THEN DO:            
            IF ITEM.cod-localiz <> c-cod-localiz THEN DO:
                CREATE RowErrors.
                ASSIGN RowErrors.ErrorNumber      = 17006
                       RowErrors.ErrorDescription = "Item Ç em localizaá∆o £nica, n∆o pode ser diferente do cadastro!" 
                       RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                       RowErrors.ErrorSubType     = "ERROR".                 
            END.            
        END.
         

        IF de-quantidade <= 0 THEN DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Quantidade deve ser maior que zero!" 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".                                            
        END.
                                                  
        FIND FIRST deposito NO-LOCK
            WHERE deposito.cod-depos    = c-cod-depos NO-ERROR.
        IF NOT AVAIL deposito THEN DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Dep¢sito " + c-cod-depos + ' n∆o encontrado!' 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".                
        END.
        
        FIND FIRST cademp.localizacao NO-LOCK
            WHERE localizacao.cod-estabel   = c-cod-estabel
              AND localizacao.cod-depos     = c-cod-depos 
              AND localizacao.cod-localiz   = c-cod-localiz                   
              NO-ERROR.
        IF NOT AVAIL localizacao THEN DO:                
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Localizaá∆o " + c-cod-localiz + '/' + c-cod-depos + '/' + c-cod-estabel + ' n∆o encontrado!' 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".                
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
        
        oJsonOutput = NEW JsonObject().
        oJsonOutput:ADD("itCodigo" ,        ITEM.it-codigo).
        oJsonOutput:ADD("descItem" ,        ITEM.desc-item).
        oJsonOutput:ADD("unItem" ,          ITEM.un).
        oJsonOutput:ADD("nomeDepos" ,       deposito.nome).  
        oJsonOutput:ADD("valLoteSE" ,       dt-vali-lote ).          
        oJsonArray :ADD(oJsonOutput).
        
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   "OK").
        jsonOutput:ADD('code',              "0").
        jsonOutput:ADD('message',           oJsonArray:GetJsonText()).
        jsonOutput:ADD('type',              'OK').                   
        //RETURN "OK".         
                
        //jsonOutput = JsonAPIResponseBuilder:OK(oJsonArray, FALSE). 
        
    END.

    RETURN 'OK':U.

END PROCEDURE.



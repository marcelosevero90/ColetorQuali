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

    DEFINE VAR dtSaldo              AS DATE         NO-UNDO.
    DEFINE VAR c-codUsuario         AS CHAR         NO-UNDO.
    DEFINE VAR c-itCodigo           AS CHAR         NO-UNDO.    
    DEFINE VAR c-codEstabel         AS CHAR         NO-UNDO.    
    DEFINE VAR c-codDepos           AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocaliz         AS CHAR         NO-UNDO.
    DEFINE VAR c-lote               AS CHAR         NO-UNDO.
    DEFINE VAR c-codRefer           AS CHAR         NO-UNDO.
    DEFINE VAR d-qtApurada          AS DEC          NO-UNDO.
    
    
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
    
    
    DEFINE BUFFER b-inventario    FOR inventario.
             
    
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
            RUN setErrorResponse('ParÉmetro N∆o Ç Array', OUTPUT jsonOutput).
            RETURN 'NOK'. 
        END.

        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).
                       
            ASSIGN dtSaldo          = oJsonPayloadObject:GetDate("dtSaldo")
                   c-itCodigo       = oJsonPayloadObject:GetCharacter("itCodigo")
                   c-CodUsuario     = oJsonPayloadObject:GetCharacter("codUsuario")
                   
                   c-codEstabel     = oJsonPayloadObject:GetCharacter("codEstabel")
                   c-codDepos       = oJsonPayloadObject:GetCharacter("codDepos")
                   c-codLocaliz     = oJsonPayloadObject:GetCharacter("codLocaliz")
                   c-lote           = oJsonPayloadObject:GetCharacter("lote")
                   c-codRefer       = oJsonPayloadObject:GetCharacter("codRefer")
                   d-qtApurada      = oJsonPayloadObject:GetDecimal("qtApurada").                                     
                                                                                   
        END.                                            
        
        
        FIND FIRST inventario NO-LOCK
            WHERE inventario.dt-saldo       = dtSaldo NO-ERROR.  
        IF NOT AVAIL inventario THEN
        DO:
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

        /*
        jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   'p1 = ' + SEARCH('cep/ceapi001k.r')).
            jsonOutput:ADD('code',              '00').
            jsonOutput:ADD('message',           '1111').
            jsonOutput:ADD('type',              'ERROR').
            RETURN "OK".                 
            */
               

        EMPTY TEMP-TABLE RowErrors.
        EMPTY TEMP-TABLE tt-inventario-aux.

        RUN inbo/boin157q01.p PERSISTENT SET h-boin157q01.   
        
        
        RUN setConstraintDataSaldo  IN h-boin157q01 (INPUT dtSaldo) NO-ERROR.
        RUN openQueryStatic         IN h-boin157q01 (INPUT "Inclui":U).
        run emptyRowObject          in h-boin157q01.
        
        run piInicializa            in h-boin157q01 (output table RowErrors).
        
        IF CAN-FIND(FIRST RowErrors
                    WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:

            ASSIGN c-erros-lista = ''.        
            FOR EACH RowErrors:
                ASSIGN c-erros-lista = c-erros-lista + RowErrors.ErrorDescription + '-'.
            END.
            ASSIGN c-erros-lista = SUBSTRING(c-erros-lista,1,LENGTH(c-erros-lista) - 1).
   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros-lista).
            jsonOutput:ADD('code',              '170062').
            jsonOutput:ADD('message',           c-erros-lista).
            jsonOutput:ADD('type',              'ERROR').   
            
            RUN destroy IN h-boin157q01 NO-ERROR.
            ASSIGN h-boin157q01 = ? NO-ERROR. 
            
            RETURN "OK".                 
        END.             

        ASSIGN iNrFicha = 0.        
        FOR LAST b-inventario field(nr-ficha) USE-INDEX nr-ficha 
            WHERE b-inventario.dt-saldo = dtSaldo NO-LOCK:
            ASSIGN iNrFicha = b-inventario.nr-ficha + 1.
        END.
        IF NOT AVAIL b-inventario THEN
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
               tt-inventario-aux.dt-ult-entra        = ?
               tt-inventario-aux.dt-ult-saida        = ?
               tt-inventario-aux.cod-refer           = c-codRefer.         
       
        
       
        //RUN setConstraintDataSaldo  IN h-boin157q01 (INPUT dtSaldo).        
        run setConstraintInclui in h-boin157q01 (1).                 

        run setRecord               in h-boin157q01 (input table tt-inventario-aux).
        
        
        ASSIGN l-habilita = NO.
        run piHabilitaCampos in h-boin157q01 (input "Create":U, input "valor-mat-m[1]":U, output l-habilita).       
                
    
        RUN destroy IN h-boin157q01 NO-ERROR.
        ASSIGN h-boin157q01 = ?.        
       
        IF CAN-FIND(FIRST RowErrors
                    WHERE RowErrors.ErrorSubType = "ERROR") THEN DO:

            ASSIGN c-erros-lista = ''.        
            FOR EACH RowErrors:
                ASSIGN c-erros-lista = c-erros-lista + RowErrors.ErrorDescription + '-'.
            END.
            ASSIGN c-erros-lista = SUBSTRING(c-erros-lista,1,LENGTH(c-erros-lista) - 1).
   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   c-erros-lista).
            jsonOutput:ADD('code',              '170061').
            jsonOutput:ADD('message',           c-erros-lista).
            jsonOutput:ADD('type',              'ERROR').                    
            RETURN "OK".                 
        END.

        
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Item OK!').
        jsonOutput:ADD('code',              '0').
        
        if l-habilita then
            jsonOutput:ADD('message',           'YES').
        ELSE    
            jsonOutput:ADD('message',           'NO').
            
        jsonOutput:ADD('type',              'OK').   
        
        RETURN "OK".
        
        
        /*FINALLY:
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   ERROR-STATUS:GET-MESSAGE(1)).
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Requisiá∆o efetuada com sucesso no Datasul!').
        jsonOutput:ADD('type',              'OK').           
        END FINALLY.*/
              
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




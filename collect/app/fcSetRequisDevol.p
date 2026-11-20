{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetRequisDevol MCE}
&ENDIF

{cdp/cd0666.i}
{cep/ceapi001k.i} /*tabela tt-movto*/

DEFINE TEMP-TABLE tt-saldo-estoq NO-UNDO
    FIELD cod-estabel   AS CHAR
    FIELD cod-depos     AS CHAR
    FIELD cod-localiz   AS CHAR
    FIELD lote          AS CHAR
    FIELD cod-refer     AS CHAR
    FIELD it-codigo     AS CHAR
    FIELD qt-a-atender  AS DEC.

PROCEDURE pi-find:
    
    DEFINE INPUT  PARAM jsonInput   AS JsonObject   NO-UNDO.
    DEFINE OUTPUT PARAM jsonOutput  AS JsonObject   NO-UNDO.

    DEFINE VAR oJsonPayloadObject   AS JsonObject   NO-UNDO.
    DEFINE VAR aJsonPayloadArray    AS JsonArray    NO-UNDO.
    DEFINE VAR aSubPayload          AS JsonArray    NO-UNDO.
    DEFINE VAR iContPayload         AS INTEGER      NO-UNDO.
    DEFINE VAR iContSE              AS INTEGER      NO-UNDO.

    // Criacao do Retorno 
    DEFINE VAR oJsonArray           AS JsonArray  NO-UNDO.
    DEFINE VAR oJsonOutput          AS JsonObject NO-UNDO.
    DEFINE VAR oJsonSaldoEst        AS JsonObject NO-UNDO.
    
    DEFINE VAR arJsonArrEstoq       AS JsonArray    NO-UNDO.

    DEFINE VAR i-nrRequis           AS INT          NO-UNDO.
    DEFINE VAR c-itCodigo           AS CHAR         NO-UNDO.
    DEFINE VAR i-Sequencia          AS INT          NO-UNDO.
    DEFINE VAR c-CodUsuario         AS CHAR         NO-UNDO.
    DEFINE VAR lControl             AS LOG          NO-UNDO.
    DEFINE VAR hCeapi001k           AS HANDLE       NO-UNDO.
    DEFINE VAR i-seq-erro           AS INTE         NO-UNDO.
    DEFINE VAR c-erros-lista        AS CHAR         NO-UNDO.    
    DEFINE VAR d-qtDevol            AS DEC          NO-UNDO.
    
    DEFINE VAR c-codDeposEnt        AS CHAR         NO-UNDO.
    DEFINE VAR c-codLocalizEnt      AS CHAR         NO-UNDO.
    DEFINE VAR c-LoteEnt            AS CHAR         NO-UNDO.
    DEFINE VAR c-codReferEnt        AS CHAR         NO-UNDO.       
    DEFINE VAR c-codEstabel         AS CHAR         NO-UNDO.       
    
    DEFINE VAR dt-devol             AS DATE         NO-UNDO. 
    
    DEFINE VAR c-doc-format         AS CHAR         NO-UNDO.    
    
    
    DEFINE BUFFER b-it-requisicao FOR it-requisicao.
    
    EMPTY TEMP-TABLE tt-saldo-estoq.
    EMPTY TEMP-TABLE tt-erro.
    EMPTY TEMP-TABLE RowErrors.
    EMPTY TEMP-TABLE tt-movto.
    
    //bloco:
    //DO ON ERROR UNDO, RETURN 'NOK'
      // ON STOP  UNDO, RETURN 'NOK'.

        aJsonPayloadArray = NEW JsonArray().
        IF jsonInput:Has("payload") THEN DO:
            aJsonPayloadArray = jsonInput:getJSONArray("payload") NO-ERROR.
            IF aJsonPayloadArray = ? OR aJsonPayloadArray:LENGTH = 0 THEN DO:
                oJsonPayloadObject = jsonInput:getJSONObject("payload") NO-ERROR.
                IF VALID-OBJECT(oJsonPayloadObject) THEN DO:
                    aJsonPayloadArray = NEW JsonArray().
                    aJsonPayloadArray:ADD(oJsonPayloadObject).
                END.
            END.
        END.
        ELSE DO:
            aJsonPayloadArray:ADD(jsonInput).
        END.

        IF NOT TYPE-OF(aJsonPayloadArray, JsonArray) OR aJsonPayloadArray:LENGTH = 0 THEN DO:
            RUN setErrorResponse('Parametro Nao e Array', OUTPUT jsonOutput).
            RETURN 'NOK'. 
        END.

        DO iContPayload = 1 TO aJsonPayloadArray:LENGTH ON ERROR UNDO, LEAVE:
            //-- Cabecalho
            oJsonPayloadObject = aJsonPayloadArray:GetJsonObject(iContPayload).

            IF VALID-OBJECT(oJsonPayloadObject) AND oJsonPayloadObject:Has("payload") THEN DO:
                aSubPayload = oJsonPayloadObject:GetJsonArray("payload") NO-ERROR.
                IF VALID-OBJECT(aSubPayload) AND aSubPayload:LENGTH > 0 THEN
                    oJsonPayloadObject = aSubPayload:GetJsonObject(1).
            END.

            IF NOT VALID-OBJECT(oJsonPayloadObject) THEN NEXT.

            IF oJsonPayloadObject:Has("nrRequisicao") THEN DO:
                ASSIGN i-nrRequis = oJsonPayloadObject:GetInteger("nrRequisicao") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-nrRequis = 0 THEN
                    ASSIGN i-nrRequis = INTEGER(oJsonPayloadObject:GetCharacter("nrRequisicao")) NO-ERROR.
            END.
            ELSE IF oJsonPayloadObject:Has("nr-requis") THEN DO:
                ASSIGN i-nrRequis = oJsonPayloadObject:GetInteger("nr-requis") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-nrRequis = 0 THEN
                    ASSIGN i-nrRequis = INTEGER(oJsonPayloadObject:GetCharacter("nr-requis")) NO-ERROR.
            END.

            IF oJsonPayloadObject:Has("itCodigo") THEN
                ASSIGN c-itCodigo = TRIM(oJsonPayloadObject:GetCharacter("itCodigo")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("it-codigo") THEN
                ASSIGN c-itCodigo = TRIM(oJsonPayloadObject:GetCharacter("it-codigo")) NO-ERROR.

            IF oJsonPayloadObject:Has("sequencia") THEN DO:
                ASSIGN i-Sequencia = oJsonPayloadObject:GetInteger("sequencia") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-Sequencia = 0 THEN
                    ASSIGN i-Sequencia = INTEGER(oJsonPayloadObject:GetCharacter("sequencia")) NO-ERROR.
            END.
            ELSE IF oJsonPayloadObject:Has("Sequencia") THEN DO:
                ASSIGN i-Sequencia = oJsonPayloadObject:GetInteger("Sequencia") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-Sequencia = 0 THEN
                    ASSIGN i-Sequencia = INTEGER(oJsonPayloadObject:GetCharacter("Sequencia")) NO-ERROR.
            END.
            ELSE IF oJsonPayloadObject:Has("nrSequencia") THEN DO:
                ASSIGN i-Sequencia = oJsonPayloadObject:GetInteger("nrSequencia") NO-ERROR.
                IF ERROR-STATUS:ERROR OR i-Sequencia = 0 THEN
                    ASSIGN i-Sequencia = INTEGER(oJsonPayloadObject:GetCharacter("nrSequencia")) NO-ERROR.
            END.

            IF oJsonPayloadObject:Has("codUsuario") THEN
                ASSIGN c-CodUsuario = TRIM(oJsonPayloadObject:GetCharacter("codUsuario")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("usuario") THEN
                ASSIGN c-CodUsuario = TRIM(oJsonPayloadObject:GetCharacter("usuario")) NO-ERROR.
            IF c-CodUsuario = "" OR c-CodUsuario = ? THEN
                ASSIGN c-CodUsuario = "operador".

            IF oJsonPayloadObject:Has("codEstabel") THEN
                ASSIGN c-codEstabel = TRIM(oJsonPayloadObject:GetCharacter("codEstabel")) NO-ERROR.

            IF oJsonPayloadObject:Has("qtDevol") THEN DO:
                ASSIGN d-qtDevol = oJsonPayloadObject:GetDecimal("qtDevol") NO-ERROR.
                IF ERROR-STATUS:ERROR OR d-qtDevol = 0 THEN
                    ASSIGN d-qtDevol = DECIMAL(oJsonPayloadObject:GetCharacter("qtDevol")) NO-ERROR.
            END.
            ELSE IF oJsonPayloadObject:Has("quantidade") THEN DO:
                ASSIGN d-qtDevol = oJsonPayloadObject:GetDecimal("quantidade") NO-ERROR.
                IF ERROR-STATUS:ERROR OR d-qtDevol = 0 THEN
                    ASSIGN d-qtDevol = DECIMAL(oJsonPayloadObject:GetCharacter("quantidade")) NO-ERROR.
            END.

            IF oJsonPayloadObject:Has("dtDevol") THEN DO:
                ASSIGN dt-devol = oJsonPayloadObject:GetDate("dtDevol") NO-ERROR.
                IF dt-devol = ? THEN
                    ASSIGN dt-devol = DATE(oJsonPayloadObject:GetCharacter("dtDevol")) NO-ERROR.
            END.

            IF oJsonPayloadObject:Has("codDeposEnt") THEN
                ASSIGN c-codDeposEnt = TRIM(oJsonPayloadObject:GetCharacter("codDeposEnt")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("codDepos") THEN
                ASSIGN c-codDeposEnt = TRIM(oJsonPayloadObject:GetCharacter("codDepos")) NO-ERROR.

            IF oJsonPayloadObject:Has("codLocalizEnt") THEN
                ASSIGN c-codLocalizEnt = TRIM(oJsonPayloadObject:GetCharacter("codLocalizEnt")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("codLocaliz") THEN
                ASSIGN c-codLocalizEnt = TRIM(oJsonPayloadObject:GetCharacter("codLocaliz")) NO-ERROR.
            IF c-codLocalizEnt = "BRANCO" OR c-codLocalizEnt = "(EM BRANCO)" OR c-codLocalizEnt = "EM BRANCO" OR c-codLocalizEnt = "-" THEN
                ASSIGN c-codLocalizEnt = "".

            IF oJsonPayloadObject:Has("loteEnt") THEN
                ASSIGN c-loteEnt = TRIM(oJsonPayloadObject:GetCharacter("loteEnt")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("lote") THEN
                ASSIGN c-loteEnt = TRIM(oJsonPayloadObject:GetCharacter("lote")) NO-ERROR.

            IF oJsonPayloadObject:Has("codReferEnt") THEN
                ASSIGN c-codReferEnt = TRIM(oJsonPayloadObject:GetCharacter("codReferEnt")) NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("codRefer") THEN
                ASSIGN c-codReferEnt = TRIM(oJsonPayloadObject:GetCharacter("codRefer")) NO-ERROR.
        END.
        END. 
        
        IF dt-devol = ? THEN
        DO:            
            ASSIGN dt-devol = TODAY.
        END.
        
        
        IF NOT CAN-FIND(FIRST it-requisicao NO-LOCK
                        WHERE it-requisicao.nr-requis   = i-nrRequis
                          AND it-requisicao.it-codigo   = c-itCodigo
                          AND it-requisicao.sequencia   = i-Sequencia) THEN DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Item da Requisiá∆o " + STRING(i-nrRequis) 
                                              + ' - ' + c-itCodigo + ' - ' + STRING(i-Sequencia) + ' n∆o encontrada!'                 
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
        
        
        FIND FIRST it-requisicao NO-LOCK
            WHERE it-requisicao.nr-requis   = i-nrRequis
              AND it-requisicao.it-codigo   = c-itCodigo
              AND it-requisicao.sequencia   = i-Sequencia NO-ERROR.  
              
                      
        IF it-requisicao.estado = 2 then do:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 15921
                   RowErrors.ErrorDescription = "Item da Requisiá∆o " + STRING(i-nrRequis) 
                                              + ' - ' + c-itCodigo + ' - ' + STRING(i-Sequencia) + ' n∆o Aprovada!'                 
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

        

        
        FOR FIRST saldo-estoq  NO-LOCK
            WHERE saldo-estoq.cod-estabel   = c-codEstabel
              AND saldo-estoq.cod-depos     = c-codDeposEnt
              AND saldo-estoq.cod-localiz   = c-codLocalizEnt
              AND saldo-estoq.cod-refer     = c-codReferEnt
              AND saldo-estoq.it-codigo     = c-itCodigo
              AND saldo-estoq.lote          = c-loteEnt.            
        END.
        IF NOT AVAIL saldo-estoq THEN
        DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 15921
                   RowErrors.ErrorDescription = "Saldo Estoq para " + STRING(i-nrRequis) 
                                              + ' - ' + c-itCodigo + ' - ' + STRING(i-Sequencia) + ' n∆o encontrado!'                 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".
                   
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
                   
            RETURN "OK".         
            
        END.
        
        ASSIGN c-doc-format = string(it-requisicao.nr-requisicao).
        IF LENGTH(c-doc-format) < 9 THEN DO:
        
            ASSIGN c-doc-format = FILL('0',9 - LENGTH(c-doc-format) ) + c-doc-format.
            ASSIGN c-doc-format = SUBSTRING(c-doc-format,1,3) + '.' 
                                + SUBSTRING(c-doc-format,4,3) + '.' 
                                + SUBSTRING(c-doc-format,7,3) .                                            
        END.
        ELSE
        IF LENGTH(c-doc-format) = 9 THEN DO:
        
            ASSIGN c-doc-format = FILL('0',9 - LENGTH(c-doc-format) ) + c-doc-format.
            ASSIGN c-doc-format = SUBSTRING(c-doc-format,1,3) + '.' 
                                + SUBSTRING(c-doc-format,4,3) + '.' 
                                + SUBSTRING(c-doc-format,7,3) .                                            
        END.        
    
            
        CREATE tt-movto.
        ASSIGN tt-movto.cod-versao-integracao = 1
            tt-movto.usuario               = c-CodUsuario
            tt-movto.cod-depos             = saldo-estoq.cod-depos
            tt-movto.cod-estabel           = saldo-estoq.cod-estabel
            tt-movto.dt-trans              = dt-devol
            tt-movto.ct-codigo             = it-requisicao.ct-codigo
            tt-movto.sc-codigo             = it-requisicao.sc-codigo
            tt-movto.it-codigo             = it-requisicao.it-codigo
            tt-movto.esp-docto             = 7 /* DRM */
            tt-movto.cod-localiz           = saldo-estoq.cod-localiz
            tt-movto.lote                  = saldo-estoq.lote
            tt-movto.cod-refer             = saldo-estoq.cod-refer
            tt-movto.referencia            = ""
            tt-movto.serie-docto           = ""
            tt-movto.numero-ordem          = 0
            tt-movto.peso-liquido          = 0
            tt-movto.tipo-preco            = 0
            tt-movto.nro-docto             = c-doc-format //string(it-requisicao.nr-requisicao)                                                          
            tt-movto.cod-emitente          = 0
            tt-movto.dt-nf-saida           = ?
            tt-movto.i-sequen              = it-requisicao.sequencia
            tt-movto.num-sequen            = it-requisicao.sequencia
            tt-movto.sequen-nf             = it-requisicao.sequencia
            tt-movto.un                    = ITEM.un
            tt-movto.tipo-trans            = 1 //entrada 
            tt-movto.tipo-valor            = 2 /* valorizado */
            tt-movto.quantidade            = d-qtDevol
            tt-movto.descricao-db          = "Devoluá∆o Requisiá∆o Mobile"
            tt-movto.dt-vali-lote          = IF AVAIL saldo-estoq THEN saldo-estoq.dt-vali-lote ELSE ?
            tt-movto.cod-prog-orig         = "fmscollector"
            tt-movto.num-ord-inv           = it-requisicao.num-ord-inv
            tt-movto.cod-unid-negoc        = it-requisicao.cod-unid-negoc.                                       
    
          
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
        
        FIND CURRENT it-requisicao EXCLUSIVE-LOCK NO-ERROR.
        IF AVAIL it-requisicao THEN 
        DO:
            FIND requisicao EXCLUSIVE-LOCK WHERE 
                 requisicao.nr-requisicao = it-requisicao.nr-requisicao NO-ERROR.

            IF AVAIL requisicao THEN
               ASSIGN requisicao.dt-devol = dt-devol.

            ASSIGN it-requisicao.qt-atendida   = it-requisicao.qt-atendida   - d-qtDevol 
                   it-requisicao.qt-a-atender  = it-requisicao.qt-a-atender  + d-qtDevol 
                   it-requisicao.qt-a-devolver = it-requisicao.qt-a-devolver - d-qtDevol                        
                   it-requisicao.qt-devolvida  = it-requisicao.qt-devolvida  + d-qtDevol
                   it-requisicao.val-item      = it-requisicao.qt-a-atender  * it-requisicao.preco-unit.
                                                  
           IF it-requisicao.qt-devolvida < 0 THEN
              ASSIGN it-requisicao.qt-devolvida = 0.

           if  it-requisicao.qt-a-atender > 0 then
              assign it-requisicao.situacao = 1
                     requisicao.situacao    = 1.
            

        END. /* AVAIL it-requisicao */
        FIND CURRENT it-requisicao NO-LOCK NO-ERROR.
        
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Processo realizado com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Requisiá∆o efetuada com sucesso no Datasul!').
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




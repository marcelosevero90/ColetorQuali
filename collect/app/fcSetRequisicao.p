{utp/ut-api.i}
{utp/ut-api-utils.i}
{utp/ut-api-action.i pi-find PUT /~*}
{utp/ut-api-notfound.i}

&IF "{&EMSFND_VERSION}" >= "1.00" &THEN
    {include/i-license-manager.i fcSetRequisicao MCE}
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
    DEFINE VAR d-qt-atend           AS DEC          NO-UNDO.
    DEFINE VAR c-doc-format         AS CHAR         NO-UNDO.    
    
    DEFINE BUFFER b-it-requisicao FOR it-requisicao.
    
    EMPTY TEMP-TABLE tt-saldo-estoq.
    EMPTY TEMP-TABLE tt-erro.
    EMPTY TEMP-TABLE RowErrors.
    
    bloco:
    DO ON ERROR UNDO, RETURN 'NOK'
       ON STOP  UNDO, RETURN 'NOK'.

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

            IF oJsonPayloadObject:Has("estoque") THEN
                ASSIGN arJsonArrEstoq = oJsonPayloadObject:GetJsonArray("estoque") NO-ERROR.
            ELSE IF oJsonPayloadObject:Has("saldosEstoque") THEN
                ASSIGN arJsonArrEstoq = oJsonPayloadObject:GetJsonArray("saldosEstoque") NO-ERROR.

            IF arJsonArrEstoq = ? THEN
                NEXT.

            IF arJsonArrEstoq:LENGTH <= 0 THEN
                NEXT.     
                         
            DO iContSE = 1 TO arJsonArrEstoq:LENGTH:
                oJsonSaldoEst = arJsonArrEstoq:GetJsonObject(iContSE) NO-ERROR.
                IF NOT VALID-OBJECT(oJsonSaldoEst) THEN NEXT.
                
                CREATE tt-saldo-estoq.
                IF oJsonSaldoEst:Has("codEstabel") THEN
                    ASSIGN tt-saldo-estoq.cod-estabel = TRIM(oJsonSaldoEst:GetCharacter("codEstabel")) NO-ERROR.
                IF oJsonSaldoEst:Has("codDepos") THEN
                    ASSIGN tt-saldo-estoq.cod-depos = TRIM(oJsonSaldoEst:GetCharacter("codDepos")) NO-ERROR.
                IF oJsonSaldoEst:Has("codLocaliz") THEN DO:
                    ASSIGN tt-saldo-estoq.cod-localiz = TRIM(oJsonSaldoEst:GetCharacter("codLocaliz")) NO-ERROR.
                    IF tt-saldo-estoq.cod-localiz = "BRANCO" OR tt-saldo-estoq.cod-localiz = "(EM BRANCO)" OR tt-saldo-estoq.cod-localiz = "EM BRANCO" OR tt-saldo-estoq.cod-localiz = "-" THEN
                        ASSIGN tt-saldo-estoq.cod-localiz = "".
                END.
                IF oJsonSaldoEst:Has("lote") THEN
                    ASSIGN tt-saldo-estoq.lote = TRIM(oJsonSaldoEst:GetCharacter("lote")) NO-ERROR.
                IF oJsonSaldoEst:Has("codRefer") THEN
                    ASSIGN tt-saldo-estoq.cod-refer = TRIM(oJsonSaldoEst:GetCharacter("codRefer")) NO-ERROR.
                IF oJsonSaldoEst:Has("itCodigo") THEN
                    ASSIGN tt-saldo-estoq.it-codigo = TRIM(oJsonSaldoEst:GetCharacter("itCodigo")) NO-ERROR.
                IF tt-saldo-estoq.it-codigo = "" THEN
                    ASSIGN tt-saldo-estoq.it-codigo = c-itCodigo.

                IF oJsonSaldoEst:Has("qtAAtender") THEN DO:
                    ASSIGN tt-saldo-estoq.qt-a-atender = oJsonSaldoEst:GetDecimal("qtAAtender") NO-ERROR.
                    IF ERROR-STATUS:ERROR OR tt-saldo-estoq.qt-a-atender = 0 THEN
                        ASSIGN tt-saldo-estoq.qt-a-atender = DECIMAL(oJsonSaldoEst:GetCharacter("qtAAtender")) NO-ERROR.
                END.
                ELSE IF oJsonSaldoEst:Has("quantidade") THEN DO:
                    ASSIGN tt-saldo-estoq.qt-a-atender = oJsonSaldoEst:GetDecimal("quantidade") NO-ERROR.
                    IF ERROR-STATUS:ERROR OR tt-saldo-estoq.qt-a-atender = 0 THEN
                        ASSIGN tt-saldo-estoq.qt-a-atender = DECIMAL(oJsonSaldoEst:GetCharacter("quantidade")) NO-ERROR.
                END.
            END.                   
        END.                                            
        
        
        IF NOT CAN-FIND(FIRST it-requisicao NO-LOCK
                        WHERE it-requisicao.nr-requis   = i-nrRequis
                          AND it-requisicao.it-codigo   = c-itCodigo
                          AND it-requisicao.sequencia   = i-Sequencia) THEN DO:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Item da Requisi‡Æo " + STRING(i-nrRequis) 
                                              + ' - ' + c-itCodigo + ' - ' + STRING(i-Sequencia) + ' nÆo encontrada!'                 
                   RowErrors.ErrorHelp        = RowErrors.ErrorDescription
                   RowErrors.ErrorSubType     = "ERROR".
                        
            jsonOutput = NEW JsonObject().
            jsonOutput:ADD('detailedMessage',   RowErrors.ErrorDescription).
            jsonOutput:ADD('code',              STRING(RowErrors.ErrorNumber)).
            jsonOutput:ADD('message',           RowErrors.ErrorDescription).
            jsonOutput:ADD('type',              'ERROR').
            
            RETURN "OK".              
        END.

        IF NOT CAN-FIND(FIRST tt-saldo-estoq) THEN DO:            
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 17006
                   RowErrors.ErrorDescription = "Estoque para retirada nÆo foi encontrado!"
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
        
        
        FIND FIRST it-requisicao NO-LOCK
            WHERE it-requisicao.nr-requis   = i-nrRequis
              AND it-requisicao.it-codigo   = c-itCodigo
              AND it-requisicao.sequencia   = i-Sequencia NO-ERROR.  
              
                      
        IF it-requisicao.estado = 2 then do:
            CREATE RowErrors.
            ASSIGN RowErrors.ErrorNumber      = 15921
                   RowErrors.ErrorDescription = "Item da Requisi‡Æo " + STRING(i-nrRequis) 
                                              + ' - ' + c-itCodigo + ' - ' + STRING(i-Sequencia) + ' nÆo Aprovada!'                 
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

        
        ASSIGN d-qt-atend = 0.
        FOR EACH tt-saldo-estoq:
        
            FOR FIRST saldo-estoq FIELDS(dt-vali-lote) NO-LOCK
                WHERE saldo-estoq.cod-estabel   = tt-saldo-estoq.cod-estabel
                  AND saldo-estoq.cod-depos     = tt-saldo-estoq.cod-depos
                  AND saldo-estoq.cod-localiz   = tt-saldo-estoq.cod-localiz
                  AND saldo-estoq.cod-refer     = tt-saldo-estoq.cod-refer
                  AND saldo-estoq.it-codigo     = tt-saldo-estoq.it-codigo
                  AND saldo-estoq.lote          = tt-saldo-estoq.lote.            
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
                tt-movto.cod-depos             = tt-saldo-estoq.cod-depos
                tt-movto.cod-estabel           = tt-saldo-estoq.cod-estabel
                tt-movto.dt-trans              = TODAY
                tt-movto.ct-codigo             = it-requisicao.ct-codigo
                tt-movto.sc-codigo             = it-requisicao.sc-codigo
                tt-movto.it-codigo             = it-requisicao.it-codigo
                tt-movto.esp-docto             = 30 /* RM */
                tt-movto.cod-localiz           = tt-saldo-estoq.cod-localiz
                tt-movto.lote                  = tt-saldo-estoq.lote
                tt-movto.cod-refer             = tt-saldo-estoq.cod-refer
                tt-movto.referencia            = ""
                tt-movto.serie-docto           = ""
                tt-movto.numero-ordem          = 0
                tt-movto.peso-liquido          = 0
                tt-movto.tipo-preco            = 0
                tt-movto.nro-docto             = c-doc-format                                                          
                tt-movto.cod-emitente          = 0
                tt-movto.dt-nf-saida           = ?
                tt-movto.i-sequen              = it-requisicao.sequencia
                tt-movto.num-sequen            = it-requisicao.sequencia
                tt-movto.sequen-nf             = it-requisicao.sequencia
                tt-movto.un                    = ITEM.un
                tt-movto.tipo-trans            = 2 /* Saida */
                tt-movto.tipo-valor            = 2 /* valorizado */
                tt-movto.quantidade            = tt-saldo-estoq.qt-a-atender
                tt-movto.descricao-db          = "Atendimento Requisi‡Æo Mobile"
                tt-movto.dt-vali-lote          = IF AVAIL saldo-estoq THEN saldo-estoq.dt-vali-lote ELSE 12/31/9999
                tt-movto.cod-prog-orig         = "fmscollector"
                tt-movto.num-ord-inv           = it-requisicao.num-ord-inv
                tt-movto.cod-unid-negoc        = it-requisicao.cod-unid-negoc.                 
                
                
            ASSIGN d-qt-atend = d-qt-atend + tt-saldo-estoq.qt-a-atender. 
        END.
          
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
            FIND requisicao EXCLUSIVE-LOCK 
                WHERE requisicao.nr-requisicao = it-requisicao.nr-requisicao NO-ERROR.

            IF AVAIL requisicao THEN
               ASSIGN requisicao.dt-atend = TODAY.

            ASSIGN it-requisicao.qt-atendida   = it-requisicao.qt-atendida   + d-qt-atend 
                   it-requisicao.qt-a-atender  = it-requisicao.qt-a-atender  - d-qt-atend 
                   it-requisicao.qt-a-devolver = it-requisicao.qt-a-devolver + d-qt-atend 
                   it-requisicao.dt-atend      = TODAY.
            
            IF it-requisicao.qt-devolvida > 0 THEN 
            DO:
               ASSIGN it-requisicao.qt-devolvida = it-requisicao.qt-devolvida - d-qt-atend.
                                                  
               IF it-requisicao.qt-devolvida < 0 THEN
                  ASSIGN it-requisicao.qt-devolvida = 0.
            END.

            IF it-requisicao.qt-a-atender = 0 THEN DO:
                            
                ASSIGN it-requisicao.situacao = 2.
                
                FIND FIRST b-it-requisicao NO-LOCK
                     WHERE b-it-requisicao.nr-requisicao = it-requisicao.nr-requisicao
                       AND b-it-requisicao.situacao      = 1 NO-ERROR.
                IF NOT AVAIL b-it-requisicao AND AVAIL requisicao THEN
                    ASSIGN requisicao.situacao = 2.
            END.

        END. /* AVAIL it-requisicao */
        FIND CURRENT it-requisicao NO-LOCK NO-ERROR.
        
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   'Processo realizado com sucesso!').
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Requisi‡Æo efetuada com sucesso no Datasul!').
        jsonOutput:ADD('type',              'OK').   
        
        RETURN "OK".
        
        
        /*FINALLY:
        jsonOutput = NEW JsonObject().
        jsonOutput:ADD('detailedMessage',   ERROR-STATUS:GET-MESSAGE(1)).
        jsonOutput:ADD('code',              '0').
        jsonOutput:ADD('message',           'Requisi‡Æo efetuada com sucesso no Datasul!').
        jsonOutput:ADD('type',              'OK').           
        END FINALLY.*/
              
    END.
    
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



